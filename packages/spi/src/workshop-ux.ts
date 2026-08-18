/**
 * Workshop application UX platform features — state saving/sharing,
 * redact mode, performance profiler, and translations/i18n.
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// App state saving/sharing
// ===========================================================================

/** A saved app state — a snapshot of an app's UI state. */
export interface SavedAppState {
  id: string;
  tenantId: string;
  /** App ID this state belongs to. */
  appId: string;
  /** State name. */
  name: string;
  description: string;
  /** The state data (variable values, widget configs, filters, etc.). */
  state: Record<string, unknown>;
  /** Owner user ID. */
  ownerId: string;
  /** Shared with user IDs. */
  sharedWith: string[];
  /** Whether the state is public. */
  isPublic: boolean;
  /** Whether this is the default state. */
  isDefault: boolean;
  /** Version number. */
  version: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** Input for saving app state. */
export interface SaveAppStateInput {
  appId: string;
  name: string;
  description?: string;
  state: Record<string, unknown>;
  isPublic?: boolean;
  isDefault?: boolean;
}

// ===========================================================================
// Redact mode
// ===========================================================================

/** Redact mode configuration — controls which fields are redacted in the UI. */
export interface RedactModeConfig {
  id: string;
  tenantId: string;
  /** Whether redact mode is enabled. */
  enabled: boolean;
  /** Redaction level. */
  level: 'off' | 'partial' | 'full';
  /** Field patterns to redact (glob-style). */
  redactedFields: string[];
  /** Field patterns to always show (overrides redactedFields). */
  allowedFields: string[];
  /** Whether to redact in exports. */
  redactInExports: boolean;
  /** Whether to redact in screenshots. */
  redactInScreenshots: boolean;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  /** Who last updated the config. */
  updatedBy: string;
}

/** Input for updating redact mode. */
export interface UpdateRedactModeInput {
  enabled?: boolean;
  level?: RedactModeConfig['level'];
  redactedFields?: string[];
  allowedFields?: string[];
  redactInExports?: boolean;
  redactInScreenshots?: boolean;
}

// ===========================================================================
// Performance profiler
// ===========================================================================

/** A performance profile — a recorded session of UI performance metrics. */
export interface PerformanceProfile {
  id: string;
  tenantId: string;
  /** App ID. */
  appId: string;
  /** User ID. */
  userId: string;
  /** Profile name. */
  name: string;
  /** Duration of the profile in ms. */
  durationMs: number;
  /** Render metrics. */
  renderMetrics: {
    /** Total render count. */
    renderCount: number;
    /** Average render time in ms. */
    avgRenderMs: number;
    /** P95 render time in ms. */
    p95RenderMs: number;
    /** Slowest component name. */
    slowestComponent?: string;
    /** Slowest component render time in ms. */
    slowestRenderMs?: number;
  };
  /** Network metrics. */
  networkMetrics: {
    /** Total request count. */
    requestCount: number;
    /** Average request time in ms. */
    avgRequestMs: number;
    /** P95 request time in ms. */
    p95RequestMs: number;
    /** Number of failed requests. */
    failedRequests: number;
  };
  /** Memory metrics. */
  memoryMetrics?: {
    /** Heap used in MB. */
    heapUsedMB: number;
    /** Heap total in MB. */
    heapTotalMB: number;
  };
  /** ISO 8601 timestamp. */
  timestamp: string;
}

/** Input for recording a performance profile. */
export interface RecordProfileInput {
  appId: string;
  name: string;
  durationMs: number;
  renderMetrics: PerformanceProfile['renderMetrics'];
  networkMetrics: PerformanceProfile['networkMetrics'];
  memoryMetrics?: PerformanceProfile['memoryMetrics'];
}

// ===========================================================================
// Translations / i18n
// ===========================================================================

/** A translation entry. */
export interface TranslationEntry {
  id: string;
  tenantId: string;
  /** Translation key (e.g. 'patient.table.title'). */
  key: string;
  /** Locale code (e.g. 'en', 'fr', 'es'). */
  locale: string;
  /** Translated value. */
  value: string;
  /** Whether this is an auto-translated value. */
  autoTranslated: boolean;
  /** Translation source. */
  source: 'manual' | 'aip' | 'import';
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** Input for setting a translation. */
export interface SetTranslationInput {
  key: string;
  locale: string;
  value: string;
  source?: TranslationEntry['source'];
}

/** A translation bundle — all translations for a locale. */
export interface TranslationBundle {
  locale: string;
  entries: Record<string, string>;
  /** Number of missing keys compared to the base locale. */
  missingCount: number;
  /** Number of auto-translated keys. */
  autoTranslatedCount: number;
}

// ===========================================================================
// Service
// ===========================================================================

/**
 * Workshop UX platform service — state saving/sharing, redact mode,
 * performance profiler, and translations/i18n.
 */
export interface WorkshopUxService {
  // ── State saving/sharing ──
  saveState(ctx: RequestContext, input: SaveAppStateInput): Promise<SavedAppState>;
  getState(ctx: RequestContext, id: string): Promise<SavedAppState | null>;
  listStates(ctx: RequestContext, appId: string): Promise<SavedAppState[]>;
  updateState(ctx: RequestContext, id: string, updates: Partial<SaveAppStateInput>): Promise<SavedAppState>;
  deleteState(ctx: RequestContext, id: string): Promise<void>;
  shareState(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedAppState>;
  /** Fork a state into a new named copy. */
  forkState(ctx: RequestContext, id: string, newName: string): Promise<SavedAppState>;

  // ── Redact mode ──
  getRedactMode(ctx: RequestContext): Promise<RedactModeConfig>;
  updateRedactMode(ctx: RequestContext, input: UpdateRedactModeInput): Promise<RedactModeConfig>;
  /** Check if a field should be redacted. */
  shouldRedact(ctx: RequestContext, fieldPath: string): Promise<boolean>;

  // ── Performance profiler ──
  recordProfile(ctx: RequestContext, input: RecordProfileInput): Promise<PerformanceProfile>;
  getProfile(ctx: RequestContext, id: string): Promise<PerformanceProfile | null>;
  listProfiles(ctx: RequestContext, appId?: string): Promise<PerformanceProfile[]>;
  deleteProfile(ctx: RequestContext, id: string): Promise<void>;

  // ── Translations / i18n ──
  setTranslation(ctx: RequestContext, input: SetTranslationInput): Promise<TranslationEntry>;
  getTranslation(ctx: RequestContext, key: string, locale: string): Promise<TranslationEntry | null>;
  getBundle(ctx: RequestContext, locale: string): Promise<TranslationBundle>;
  listLocales(ctx: RequestContext): Promise<string[]>;
  /** Auto-translate missing keys using AIP. */
  autoTranslate(ctx: RequestContext, targetLocale: string, baseLocale?: string): Promise<{ translated: number; skipped: number }>;
  deleteTranslation(ctx: RequestContext, key: string, locale: string): Promise<void>;
}
