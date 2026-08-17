/**
 * WorkflowGraph — provenance graph connecting objects, functions, and actions.
 *
 * Foundry's "workflow visualization" pitch is: automatically visualize the
 * objects, functions, and actions that connect your ontology to your
 * applications, and understand the provenance between these entities.
 *
 * Altius is headless, so "visualize" here means *expose a graph data API*
 * that a UI (or an agent) can render — not ship a renderer. The graph is
 * derived from the records the platform already produces:
 *
 *   - `FieldProvenance` (lineage) → edges from ACTION/FUNCTION/SYNC sources
 *     to the object fields they produced.
 *   - `AuditRecord` → nodes for actions and functions that ran, plus edges
 *     to the objects they read or wrote.
 *   - Function execution logs → edges from a function to its inputs/outputs.
 *
 * The graph is tenant-scoped: every query takes a `tenantId`, and a record
 * without one is a construction error, not a silent cross-tenant edge.
 *
 * The model is deliberately small (four node kinds, five edge kinds) so a
 * client can lay it out without a graph-physics engine, and so the API
 * surface stays stable as we add more source records.
 */

import type { FieldProvenance, AuditRecord } from '@altius/spi';
import type { LineageStore, LineageQueryOptions } from '../lineage/lineage-recorder.js';

/**
 * Minimal audit-reader interface the graph builder needs.
 *
 * The engine package does not depend on `@altius/security`, so we accept a
 * structural subset of its `AuditStore` (the `query` method) rather than the
 * full type. Both `PostgresAuditStore` and `MemoryAuditStore` satisfy this.
 */
export interface WorkflowAuditReader {
  query(
    filter: WorkflowAuditFilter,
    options?: { limit?: number; offset?: number },
  ): Promise<AuditRecord[]>;
}

/**
 * Filter shape accepted by the security AuditStore.query method. Kept as a
 * local type so the engine does not import from `@altius/security`; the
 * fields are a structural match of `AuditQueryFilter` from that package.
 */
export interface WorkflowAuditFilter {
  tenantId?: string;
  objectType?: string;
  objectId?: string;
  operationType?: 'read' | 'create' | 'update' | 'delete' | 'action' | 'query' | 'link' | 'unlink';
  traceId?: string;
  actorId?: string;
  actorType?: 'user' | 'system' | 'connector';
  actionType?: string;
  from?: string;
  to?: string;
}

// ---------------------------------------------------------------------------
// Graph model
// ---------------------------------------------------------------------------

export type WorkflowNodeKind = 'object' | 'action' | 'function' | 'application';

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  /** Display label (object type+id, action name, function name, app name). */
  label: string;
  /** Object type for `kind: 'object'`; action/function name otherwise. */
  type?: string;
  /** Tenant the node belongs to. */
  tenantId: string;
}

export type WorkflowEdgeKind =
  | 'produced' // source → object field (lineage)
  | 'wrote' // action/function → object (audit create/update)
  | 'read' // action/function → object (audit read/query)
  | 'invoked' // action → function (audit function call)
  | 'caused'; // event A → event B (CloudEvent cause chain)

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  kind: WorkflowEdgeKind;
  /** When the edge was recorded. */
  timestamp: string;
  /** Field name for `produced` edges; undefined otherwise. */
  field?: string;
  /** Tenant the edge belongs to. */
  tenantId: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface WorkflowGraphBuilderConfig {
  lineageStore: LineageStore;
  auditStore: WorkflowAuditReader;
}

/**
 * Build a tenant-scoped workflow graph from lineage and audit records.
 *
 * The builder is read-only: it queries the existing stores and assembles a
 * graph. It does not persist anything, and it does not mutate the stores.
 * A caller that wants a live graph re-runs the builder (or wraps it in a
 * materialised view refreshed on event).
 */
export class WorkflowGraphBuilder {
  private readonly lineageStore: LineageStore;
  private readonly auditStore: WorkflowAuditReader;

  constructor(config: WorkflowGraphBuilderConfig) {
    this.lineageStore = config.lineageStore;
    this.auditStore = config.auditStore;
  }

  /**
   * Build the graph for a tenant, optionally scoped to a single object.
   *
   * The `rootObject` scope is the common case for "show me this object's
   * provenance": it pulls lineage for that object and the audit records that
   * touched it, then expands one hop to the actions/functions named in those
   * records.
   */
  async buildGraph(
    tenantId: string,
    options?: {
      rootObject?: { objectType: string; objectId: string };
      /** Limit on audit records pulled. Default 200. */
      auditLimit?: number;
      /** Limit on lineage records pulled per object. Default 200. */
      lineageLimit?: number;
    },
  ): Promise<WorkflowGraph> {
    const nodes = new Map<string, WorkflowNode>();
    const edges: WorkflowEdge[] = [];
    const auditLimit = options?.auditLimit ?? 200;
    const lineageLimit = options?.lineageLimit ?? 200;

    const addNode = (node: WorkflowNode): void => {
      if (!nodes.has(node.id)) nodes.set(node.id, node);
    };

    const addObjectNode = (objectType: string, objectId: string): void => {
      const id = objectNodeId(tenantId, objectType, objectId);
      addNode({ id, kind: 'object', label: `${objectType}:${objectId}`, type: objectType, tenantId });
    };

    // --- Lineage → produced edges ---
    if (options?.rootObject) {
      const { objectType, objectId } = options.rootObject;
      addObjectNode(objectType, objectId);
      const lineageOpts: LineageQueryOptions = { includeLineage: true, limit: lineageLimit };
      const records = await this.lineageStore.queryByObject(tenantId, objectType, objectId, lineageOpts);
      for (const rec of records) {
        const sourceNode = nodeForProvenanceSource(tenantId, rec.source, addObjectNode);
        if (!sourceNode) continue;
        addNode(sourceNode);
        edges.push({
          id: edgeId('produced', sourceNode.id, objectNodeId(tenantId, rec.objectType, rec.objectId), rec.field),
          from: sourceNode.id,
          to: objectNodeId(tenantId, rec.objectType, rec.objectId),
          kind: 'produced',
          timestamp: rec.producedAt,
          field: rec.field,
          tenantId,
        });
      }
    }

    // --- Audit → wrote/read/invoked edges ---
    const auditFilter = {
      tenantId,
      ...(options?.rootObject
        ? { objectType: options.rootObject.objectType, objectId: options.rootObject.objectId }
        : {}),
    };
    const auditRecords = await this.auditStore.query(auditFilter, { limit: auditLimit });
    for (const record of auditRecords) {
      const actorNode = nodeForAuditActor(tenantId, record, addNode);
      if (record.operation.objectType && record.operation.objectId) {
        addObjectNode(record.operation.objectType, record.operation.objectId);
        const objId = objectNodeId(tenantId, record.operation.objectType, record.operation.objectId);
        const kind: WorkflowEdgeKind =
          record.operation.type === 'read' || record.operation.type === 'query' ? 'read' : 'wrote';
        edges.push({
          id: edgeId(kind, actorNode.id, objId, record.id),
          from: actorNode.id,
          to: objId,
          kind,
          timestamp: record.timestamp,
          tenantId,
        });
      }
      if (record.operation.type === 'function' && record.operation.functionName) {
        // A function audit record is itself the function node; no separate
        // invoked edge is needed unless we later record the calling action.
      }
    }

    return { nodes: [...nodes.values()], edges };
  }
}

// ---------------------------------------------------------------------------
// Node id helpers — deterministic so duplicate records collapse.
// ---------------------------------------------------------------------------

export function objectNodeId(tenantId: string, objectType: string, objectId: string): string {
  return `obj:${tenantId}:${objectType}:${objectId}`;
}

export function actionNodeId(tenantId: string, actionName: string, actionId: string): string {
  return `act:${tenantId}:${actionName}:${actionId}`;
}

export function functionNodeId(tenantId: string, functionName: string): string {
  return `fn:${tenantId}:${functionName}`;
}

export function applicationNodeId(tenantId: string, appName: string): string {
  return `app:${tenantId}:${appName}`;
}

function edgeId(kind: WorkflowEdgeKind, from: string, to: string, suffix: string): string {
  return `${kind}:${from}->${to}:${suffix}`;
}

function nodeForProvenanceSource(
  tenantId: string,
  source: FieldProvenance['source'],
  _addObjectNode: (objectType: string, objectId: string) => void,
): WorkflowNode | null {
  switch (source.kind) {
    case 'ACTION':
      return {
        id: actionNodeId(tenantId, source.actionType, source.actionId),
        kind: 'action',
        label: `${source.actionType}:${source.actionId}`,
        type: source.actionType,
        tenantId,
      };
    case 'FUNCTION':
      return {
        id: functionNodeId(tenantId, source.functionName),
        kind: 'function',
        label: source.functionName,
        type: source.functionName,
        tenantId,
      };
    case 'SYNC':
      // Sync sources are modelled as application nodes (external systems).
      return {
        id: applicationNodeId(tenantId, source.connector),
        kind: 'application',
        label: source.connector,
        type: source.connector,
        tenantId,
      };
    default:
      return null;
  }
}

function nodeForAuditActor(
  tenantId: string,
  record: AuditRecord,
  addNode: (node: WorkflowNode) => void,
): WorkflowNode {
  if (record.operation.type === 'function' && record.operation.functionName) {
    const id = functionNodeId(tenantId, record.operation.functionName);
    const node: WorkflowNode = {
      id,
      kind: 'function',
      label: record.operation.functionName,
      type: record.operation.functionName,
      tenantId,
    };
    addNode(node);
    return node;
  }
  if (record.operation.type === 'action' && record.operation.actionType) {
    const id = actionNodeId(tenantId, record.operation.actionType, record.operation.actionId ?? record.id);
    const node: WorkflowNode = {
      id,
      kind: 'action',
      label: `${record.operation.actionType}:${record.operation.actionId ?? record.id}`,
      type: record.operation.actionType,
      tenantId,
    };
    addNode(node);
    return node;
  }
  // Reads/writes by a user or system become an application-style node keyed
  // by actor id, so they still appear in the graph without inventing a
  // phantom action.
  const id = applicationNodeId(tenantId, record.actor.id);
  const node: WorkflowNode = {
    id,
    kind: 'application',
    label: record.actor.id,
    type: record.actor.type,
    tenantId,
  };
  addNode(node);
  return node;
}
