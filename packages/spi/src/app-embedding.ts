/**
 * Embedding and cross-app widgets — app registry, embedding manifests,
 * cross-app commands, and app pairing.
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// App registry
// ===========================================================================

/** A registered platform application that can be embedded or paired. */
export interface RegisteredApp {
  id: string;
  tenantId: string;
  /** App name. */
  name: string;
  description: string;
  /** App kind. */
  kind: 'workshop' | 'quiver' | 'notepad' | 'vertex' | 'custom' | 'external';
  /** URL where the app is hosted. */
  url: string;
  /** Icon URL. */
  iconUrl?: string;
  /** Whether the app can be embedded in iframes. */
  embeddable: boolean;
  /** Allowed embedding origins (CSP frame-src). */
  allowedEmbedOrigins?: string[];
  /** Whether the app supports deep linking. */
  supportsDeepLinks: boolean;
  /** Deep link URL pattern (e.g. /app/{name}/view/{id}). */
  deepLinkPattern?: string;
  /** Whether the app supports cross-app commands. */
  supportsCommands: boolean;
  /** App version. */
  version: string;
  /** Whether the app is enabled. */
  enabled: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the app. */
  createdBy: string;
}

/** Input for registering an app. */
export interface RegisterAppInput {
  name: string;
  description?: string;
  kind: RegisteredApp['kind'];
  url: string;
  iconUrl?: string;
  embeddable?: boolean;
  allowedEmbedOrigins?: string[];
  supportsDeepLinks?: boolean;
  deepLinkPattern?: string;
  supportsCommands?: boolean;
  enabled?: boolean;
}

// ===========================================================================
// Embedding manifests
// ===========================================================================

/** An embedding manifest — describes how an app can be embedded. */
export interface EmbeddingManifest {
  appId: string;
  /** CSP frame-src directives. */
  frameSrc: string[];
  /** Whether framing is allowed. */
  framingAllowed: boolean;
  /** Embedding permissions required. */
  requiredPermissions: string[];
  /** Context parameters the app accepts when embedded. */
  contextParameters: Array<{ name: string; type: string; required: boolean }>;
  /** Events the app emits. */
  emittedEvents: string[];
  /** Commands the app accepts. */
  acceptedCommands: string[];
}

// ===========================================================================
// Cross-app commands
// ===========================================================================

/** A cross-app command — a message sent from one app to another. */
export interface CrossAppCommand {
  id: string;
  tenantId: string;
  /** Source app ID. */
  sourceAppId: string;
  /** Target app ID. */
  targetAppId: string;
  /** Command name. */
  command: string;
  /** Command payload. */
  payload: Record<string, unknown>;
  /** Status. */
  status: 'pending' | 'delivered' | 'processed' | 'failed';
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Result (if processed). */
  result?: unknown;
  /** Error (if failed). */
  error?: string;
}

/** Input for sending a cross-app command. */
export interface SendCommandInput {
  targetAppId: string;
  command: string;
  payload?: Record<string, unknown>;
}

// ===========================================================================
// App pairing
// ===========================================================================

/** An app pairing — two apps linked for shared-state sync. */
export interface AppPairing {
  id: string;
  tenantId: string;
  /** First app in the pair. */
  appAId: string;
  /** Second app in the pair. */
  appBId: string;
  /** Shared state keys. */
  sharedStateKeys: string[];
  /** Whether the pairing is bidirectional. */
  bidirectional: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the pairing. */
  createdBy: string;
  /** Whether the pairing is active. */
  active: boolean;
}

/** Input for creating an app pairing. */
export interface CreateAppPairingInput {
  appAId: string;
  appBId: string;
  sharedStateKeys?: string[];
  bidirectional?: boolean;
  active?: boolean;
}

// ===========================================================================
// Service
// ===========================================================================

/**
 * Embedding and cross-app service — app registry, embedding manifests,
 * cross-app commands, and app pairing.
 */
export interface EmbeddingService {
  // ── App registry ──
  registerApp(ctx: RequestContext, input: RegisterAppInput): Promise<RegisteredApp>;
  getApp(ctx: RequestContext, id: string): Promise<RegisteredApp | null>;
  getAppByName(ctx: RequestContext, name: string): Promise<RegisteredApp | null>;
  listApps(ctx: RequestContext, kind?: RegisteredApp['kind']): Promise<RegisteredApp[]>;
  updateApp(ctx: RequestContext, id: string, updates: Partial<RegisterAppInput>): Promise<RegisteredApp>;
  deleteApp(ctx: RequestContext, id: string): Promise<void>;

  // ── Embedding manifests ──
  getEmbeddingManifest(ctx: RequestContext, appId: string): Promise<EmbeddingManifest | null>;

  // ── Cross-app commands ──
  sendCommand(ctx: RequestContext, sourceAppId: string, input: SendCommandInput): Promise<CrossAppCommand>;
  getCommand(ctx: RequestContext, commandId: string): Promise<CrossAppCommand | null>;
  listCommands(ctx: RequestContext, appId?: string): Promise<CrossAppCommand[]>;
  updateCommandStatus(ctx: RequestContext, commandId: string, status: CrossAppCommand['status'], result?: unknown, error?: string): Promise<CrossAppCommand>;

  // ── App pairing ──
  createPairing(ctx: RequestContext, input: CreateAppPairingInput): Promise<AppPairing>;
  getPairing(ctx: RequestContext, id: string): Promise<AppPairing | null>;
  listPairings(ctx: RequestContext, appId?: string): Promise<AppPairing[]>;
  deletePairing(ctx: RequestContext, id: string): Promise<void>;
  /** Sync shared state between paired apps. */
  syncSharedState(ctx: RequestContext, pairingId: string, key: string, value: unknown): Promise<{ delivered: boolean }>;
}
