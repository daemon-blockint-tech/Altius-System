/**
 * Cross-application command exchange — declared commands, drag-drop payloads,
 * and app pairing events.
 */

import type { RequestContext } from './ontology.js';

// ── Declared commands ───────────────────────────────────────────────────

/** A declared cross-app command with a client-deliverable schema. */
export interface DeclaredCommand {
  id: string;
  tenantId: string;
  /** Human-readable command name. */
  name: string;
  /** Command description. */
  description: string;
  /** Source app that declares the command. */
  sourceAppId: string;
  /** Target apps that can receive the command. */
  targetAppIds: string[];
  /** JSON-Schema for the command payload. */
  inputSchema: Record<string, unknown>;
  /** JSON-Schema for the command result. */
  outputSchema?: Record<string, unknown>;
  /** Whether the command is exposed as an MCP/AIP tool. */
  availableAsTool: boolean;
  /** Whether the command can be chained. */
  chainable: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who declared the command. */
  createdBy: string;
}

/** Input for declaring a command. */
export interface DeclareCommandInput {
  name: string;
  description?: string;
  sourceAppId: string;
  targetAppIds?: string[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  availableAsTool?: boolean;
  chainable?: boolean;
}

/** A command execution record. */
export interface CommandExecution {
  id: string;
  tenantId: string;
  /** Declared command ID (if known). */
  commandId?: string;
  /** Source app ID. */
  sourceAppId: string;
  /** Target app ID. */
  targetAppId: string;
  /** Command name. */
  command: string;
  /** Input payload. */
  input: Record<string, unknown>;
  /** Output payload (after processing). */
  output?: unknown;
  /** Execution status. */
  status: 'pending' | 'delivered' | 'processed' | 'failed';
  /** Error message, if failed. */
  error?: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Who executed the command. */
  createdBy: string;
}

// ── Drag-and-drop events ────────────────────────────────────────────────

/** A drag-and-drop payload exchange between apps. */
export interface DragDropEvent {
  id: string;
  tenantId: string;
  /** Source app ID. */
  sourceAppId: string;
  /** Target app ID, if dropped. */
  targetAppId?: string;
  /** Media type of the payload. */
  mediaType: string;
  /** Payload data. */
  payload: Record<string, unknown>;
  /** Whether the drop completed. */
  completed: boolean;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

/** Input for recording a drag-drop event. */
export interface RecordDragDropInput {
  sourceAppId: string;
  targetAppId?: string;
  mediaType: string;
  payload: Record<string, unknown>;
  completed?: boolean;
}

/** An app-pairing shared-state sync record. */
export interface PairSyncEvent {
  id: string;
  tenantId: string;
  /** First app in the pair. */
  appAId: string;
  /** Second app in the pair. */
  appBId: string;
  /** Shared state keys. */
  sharedKeys: string[];
  /** Whether sync is bidirectional. */
  bidirectional: boolean;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** Who created the pairing. */
  createdBy: string;
}

/** Input for recording an app pairing sync. */
export interface RecordPairInput {
  appAId: string;
  appBId: string;
  sharedKeys?: string[];
  bidirectional?: boolean;
}

// ── Service ─────────────────────────────────────────────────────────────

/**
 * CommandExchangeService — declared cross-app commands, drag-drop payloads,
 * and app pairing events.
 */
export interface CommandExchangeService {
  // Declared commands
  declareCommand(ctx: RequestContext, input: DeclareCommandInput): Promise<DeclaredCommand>;
  listDeclaredCommands(ctx: RequestContext, sourceAppId?: string): Promise<DeclaredCommand[]>;
  getDeclaredCommand(ctx: RequestContext, id: string): Promise<DeclaredCommand | null>;
  executeCommand(
    ctx: RequestContext,
    id: string,
    input: { targetAppId: string; payload: Record<string, unknown> },
  ): Promise<CommandExecution>;

  // Drag-and-drop
  recordDragDrop(ctx: RequestContext, input: RecordDragDropInput): Promise<DragDropEvent>;
  listDragDrops(ctx: RequestContext, appId?: string): Promise<DragDropEvent[]>;

  // Pairing
  recordPair(ctx: RequestContext, input: RecordPairInput): Promise<PairSyncEvent>;
  listPairs(ctx: RequestContext, appId?: string): Promise<PairSyncEvent[]>;
}
