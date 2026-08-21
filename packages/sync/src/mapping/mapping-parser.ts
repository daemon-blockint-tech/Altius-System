/**
 * YAML mapping config parser (Spec Section 6.3).
 *
 * Parses datasource mapping YAML files that define how source system
 * records map to ontology objects and links.
 */

import { parse as parseYaml } from "yaml";
import { parseTransformExpression, type TransformFn } from "./transforms.js";

// ── Parsed mapping types ──────────────────────────────────────────────

/** Sync mode for datasource extraction. */
export type SyncMode = "OVERLAY" | "CDC" | "POLLING" | "BATCH";

/**
 * Where the connector for this datasource executes.
 *
 * DIRECT — inside the platform (the in-process SyncScheduler), for sources
 * the platform can reach over its own egress: public APIs, cloud object
 * stores, databases with a network path from the cluster.
 *
 * AGENT — on a Data Connection Agent enrolled from inside the customer
 * network, for sources the platform cannot reach (on-prem databases, HDFS,
 * shared drives behind a firewall). The agent captures records locally and
 * uploads them over its outbound-only channel; mapping and ontology writes
 * stay platform-side.
 */
export type SyncRuntime = "DIRECT" | "AGENT";

/** Conflict resolution strategy. */
export type ConflictResolution = "SOURCE_PRIORITY" | "ACTION_PRIORITY";

/** Rate limit configuration. */
export interface RateLimitConfig {
  maxRecordsPerSecond: number;
}

/** Sync configuration section. */
export interface SyncConfig {
  mode: SyncMode;
  interval?: string | null;
  conflictResolution?: ConflictResolution;
  rateLimit?: RateLimitConfig;
  cacheStrategy?: string;
  cacheTTL?: string;
  writeback?: boolean;
}

/** Connection configuration. */
export interface ConnectionConfig {
  url: string;
  table: string;
  properties?: Record<string, unknown>;
}

/** Primary key mapping with transform. */
export interface PrimaryKeyMapping {
  source: string;
  target: string;
  transform?: TransformFn;
  transformExpr?: string;
}

/** Property mapping with optional transform. */
export interface PropertyMapping {
  source: string;
  transform?: TransformFn;
  transformExpr?: string;
}

/** Link key mapping (for toKey). */
export interface LinkKeyMapping {
  source: string;
  target: string;
  transform?: TransformFn;
  transformExpr?: string;
}

/** Link mapping to a related ontology type. */
export interface LinkMapping {
  linkType: string;
  toType: string;
  toKey: LinkKeyMapping;
  properties?: Record<string, PropertyMapping>;
}

/** Full object mapping definition. */
export interface ObjectMapping {
  objectType: string;
  primaryKey: PrimaryKeyMapping;
  properties: Record<string, PropertyMapping>;
  links: LinkMapping[];
}

/** Complete parsed datasource mapping config. */
export interface DatasourceMappingConfig {
  datasource: string;
  connector: string;
  /** Where the connector runs. Default: DIRECT (in-platform). */
  runtime: SyncRuntime;
  /**
   * Name of the enrolled agent this datasource is pinned to. Only meaningful
   * with runtime AGENT; when absent, any live agent whose local registry has
   * the connector plugin is eligible.
   */
  agent?: string;
  connection: ConnectionConfig;
  mapping: ObjectMapping;
  sync: SyncConfig;
}

// ── Raw YAML shape (pre-parse) ────────────────────────────────────────

interface RawPrimaryKey {
  source: string;
  target: string;
  transform?: string;
}

interface RawProperty {
  source: string;
  transform?: string;
}

interface RawLinkKey {
  source: string;
  target: string;
  transform?: string;
}

interface RawLink {
  linkType: string;
  toType: string;
  toKey: RawLinkKey;
  properties?: Record<string, RawProperty>;
}

interface RawMapping {
  objectType: string;
  primaryKey: RawPrimaryKey;
  properties: Record<string, RawProperty>;
  links?: RawLink[];
}

interface RawSync {
  mode: string;
  interval?: string | null;
  conflictResolution?: string;
  rateLimit?: { maxRecordsPerSecond: number };
  cacheStrategy?: string;
  cacheTTL?: string;
  writeback?: boolean;
}

interface RawConfig {
  datasource: string;
  connector: string;
  runtime?: string;
  agent?: string;
  connection: { url: string; table: string; [k: string]: unknown };
  mapping: RawMapping;
  sync: RawSync;
}

// ── Parser ────────────────────────────────────────────────────────────

/**
 * Parse a YAML mapping config string into a DatasourceMappingConfig.
 */
export function parseMappingConfig(yaml: string): DatasourceMappingConfig {
  const raw = parseYaml(yaml) as RawConfig;
  return buildConfig(raw);
}

/**
 * Build a DatasourceMappingConfig from already-parsed YAML content
 * (e.g. a pack ConnectorManifest's raw config object).
 */
export function parseMappingObject(raw: unknown): DatasourceMappingConfig {
  return buildConfig(raw as RawConfig);
}

function buildConfig(raw: RawConfig): DatasourceMappingConfig {
  validateRequired(raw, ["datasource", "connector", "connection", "mapping", "sync"]);
  validateRequired(raw.connection, ["url", "table"]);
  validateRequired(raw.mapping, ["objectType", "primaryKey", "properties"]);
  validateRequired(raw.sync, ["mode"]);

  const runtime = buildRuntime(raw.runtime);
  const sync = buildSync(raw.sync);
  if (runtime === "AGENT" && sync.mode === "OVERLAY") {
    throw new Error(
      "runtime AGENT cannot be combined with sync.mode OVERLAY: overlay is a " +
        "platform-side read-through cache and never runs on an agent",
    );
  }

  return {
    datasource: raw.datasource,
    connector: raw.connector,
    runtime,
    ...(raw.agent ? { agent: raw.agent } : {}),
    connection: buildConnection(raw.connection),
    mapping: buildMapping(raw.mapping),
    sync,
  };
}

function buildRuntime(raw: string | undefined): SyncRuntime {
  if (raw === undefined || raw === null) return "DIRECT";
  const validRuntimes: SyncRuntime[] = ["DIRECT", "AGENT"];
  if (!validRuntimes.includes(raw as SyncRuntime)) {
    throw new Error(
      `Invalid runtime: ${raw}. Must be one of: ${validRuntimes.join(", ")}`,
    );
  }
  return raw as SyncRuntime;
}

function buildConnection(raw: { url: string; table: string; [k: string]: unknown }): ConnectionConfig {
  const { url, table, ...rest } = raw;
  return {
    url,
    table,
    ...(Object.keys(rest).length > 0 ? { properties: rest } : {}),
  };
}

function buildMapping(raw: RawMapping): ObjectMapping {
  return {
    objectType: raw.objectType,
    primaryKey: buildPrimaryKey(raw.primaryKey),
    properties: buildProperties(raw.properties),
    links: (raw.links ?? []).map(buildLink),
  };
}

function buildPrimaryKey(raw: RawPrimaryKey): PrimaryKeyMapping {
  return {
    source: raw.source,
    target: raw.target,
    ...(raw.transform
      ? {
          transform: parseTransformExpression(raw.transform),
          transformExpr: raw.transform,
        }
      : {}),
  };
}

function buildProperties(
  raw: Record<string, RawProperty>,
): Record<string, PropertyMapping> {
  const result: Record<string, PropertyMapping> = {};

  for (const [name, prop] of Object.entries(raw)) {
    result[name] = {
      source: prop.source,
      ...(prop.transform
        ? {
            transform: parseTransformExpression(prop.transform),
            transformExpr: prop.transform,
          }
        : {}),
    };
  }

  return result;
}

function buildLink(raw: RawLink): LinkMapping {
  return {
    linkType: raw.linkType,
    toType: raw.toType,
    toKey: {
      source: raw.toKey.source,
      target: raw.toKey.target,
      ...(raw.toKey.transform
        ? {
            transform: parseTransformExpression(raw.toKey.transform),
            transformExpr: raw.toKey.transform,
          }
        : {}),
    },
    ...(raw.properties
      ? { properties: buildProperties(raw.properties) }
      : {}),
  };
}

function buildSync(raw: RawSync): SyncConfig {
  const validModes: SyncMode[] = ["OVERLAY", "CDC", "POLLING", "BATCH"];
  if (!validModes.includes(raw.mode as SyncMode)) {
    throw new Error(
      `Invalid sync mode: ${raw.mode}. Must be one of: ${validModes.join(", ")}`,
    );
  }

  return {
    mode: raw.mode as SyncMode,
    ...(raw.interval !== undefined ? { interval: raw.interval } : {}),
    ...(raw.conflictResolution
      ? { conflictResolution: raw.conflictResolution as ConflictResolution }
      : {}),
    ...(raw.rateLimit ? { rateLimit: raw.rateLimit } : {}),
    ...(raw.cacheStrategy ? { cacheStrategy: raw.cacheStrategy } : {}),
    ...(raw.cacheTTL ? { cacheTTL: raw.cacheTTL } : {}),
    ...(raw.writeback !== undefined ? { writeback: raw.writeback } : {}),
  };
}

function validateRequired(
  obj: object,
  fields: string[],
): void {
  const record = obj as Record<string, unknown>;
  for (const field of fields) {
    if (record[field] === undefined || record[field] === null) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
}
