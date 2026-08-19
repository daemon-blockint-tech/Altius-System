/**
 * In-memory graph visualization service.
 */

import { randomUUID } from 'node:crypto';
import type {
  GraphService,
  GraphNode,
  GraphEdge,
  GraphResult,
  SavedGraphView,
  BuildGraphInput,
  RequestContext,
} from '@altius/spi';

export class InMemoryGraphService implements GraphService {
  private readonly views = new Map<string, Map<string, SavedGraphView>>();

  async buildGraph(
    _ctx: RequestContext,
    rootObjectType: string,
    rootObjectId: string,
    input?: BuildGraphInput,
  ): Promise<GraphResult> {
    const rootNode: GraphNode = {
      id: `${rootObjectType}:${rootObjectId}`,
      label: `${rootObjectType} ${rootObjectId}`,
      objectType: rootObjectType,
      objectId: rootObjectId,
      group: rootObjectType,
    };
    const node2: GraphNode = {
      id: `${rootObjectType}:${rootObjectId}:related`,
      label: 'Related object',
      group: 'related',
    };
    const edge: GraphEdge = {
      id: randomUUID(),
      source: rootNode.id,
      target: node2.id,
      label: input?.linkTypes?.[0] ?? 'related',
    };
    return {
      nodes: [rootNode, node2],
      edges: [edge],
      layout: { algorithm: input?.layout ?? 'force' },
    };
  }

  async saveView(
    ctx: RequestContext,
    input: Omit<SavedGraphView, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
  ): Promise<SavedGraphView> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const view: SavedGraphView = {
      id,
      tenantId: ctx.tenantId,
      name: input.name,
      rootObjectType: input.rootObjectType,
      rootObjectId: input.rootObjectId,
      layout: input.layout,
      selectedNodeIds: input.selectedNodeIds,
      zoom: input.zoom,
      createdAt: now,
      updatedAt: now,
    };
    this.getMap(ctx.tenantId).set(id, view);
    return view;
  }

  async getView(ctx: RequestContext, id: string): Promise<SavedGraphView | null> {
    return this.views.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listViews(ctx: RequestContext, rootObjectType?: string): Promise<SavedGraphView[]> {
    const m = this.views.get(ctx.tenantId);
    if (!m) return [];
    const list = Array.from(m.values());
    if (rootObjectType) return list.filter(v => v.rootObjectType === rootObjectType);
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private getMap(t: string) { let m = this.views.get(t); if (!m) { m = new Map(); this.views.set(t, m); } return m; }
}
