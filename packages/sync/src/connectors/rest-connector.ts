/**
 * REST Connector for HTTP/REST API source systems (Section 6.1).
 *
 * Pull-based extraction over HTTP with three pagination styles, four auth
 * schemes, and checkpoint-driven incremental extraction.
 *
 * Configuration lives in ConnectorConfig.properties so pack connector YAML can
 * declare it without a schema change:
 *
 *   url        base URL; the table name is appended as a path segment unless
 *              `path` overrides it
 *   properties:
 *     path            override path (default: `/${table}`)
 *     auth            { type: 'bearer' | 'basic' | 'oauth2' | 'none', ... }
 *     pagination      { style: 'offset' | 'page' | 'cursor', ... }
 *     recordsPath     dotted path to the record array (default: auto-detect)
 *     keyField        record field forming SourceRecord.key (default: 'id')
 *     timestampField  record field carrying the row's mtime (default: 'updated_at')
 *     sinceParam      query param for incremental extraction (default: 'updated_since')
 *     headers         extra static headers
 *
 * OAuth2 is client-credentials only, which is the grant a server-to-server
 * connector can complete unattended; interactive grants need a human and do not
 * belong in a sync loop.
 */

import type { HealthStatus, DateTime } from "@altius/spi";
import type {
  Connector,
  ConnectorConfig,
  Checkpoint,
  ExtractOptions,
  SourceRecord,
  SourceSchema,
} from "./connector.js";
import type { ConnectorPlugin } from "./connector-registry.js";

/** Subset of the fetch contract this connector needs; injectable for tests. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export type RestAuth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "oauth2"; tokenUrl: string; clientId: string; clientSecret: string; scope?: string };

export type RestPagination =
  | { style: "offset"; limitParam?: string; offsetParam?: string; pageSize?: number }
  | { style: "page"; pageParam?: string; sizeParam?: string; pageSize?: number; firstPage?: number }
  | { style: "cursor"; cursorParam?: string; cursorPath?: string; pageSize?: number; sizeParam?: string };

const DEFAULT_PAGE_SIZE = 100;
/** Stop rather than loop for ever if a source keeps returning a full page. */
const MAX_PAGES = 10_000;

interface RestProperties {
  path?: string;
  auth?: RestAuth;
  pagination?: RestPagination;
  recordsPath?: string;
  keyField?: string;
  timestampField?: string;
  sinceParam?: string;
  headers?: Record<string, string>;
}

/** Read a dotted path out of a JSON body. */
function readPath(body: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined), body);
}

/**
 * Locate the record array in a response body.
 *
 * An explicit recordsPath always wins. Otherwise accept a bare array, then the
 * conventional envelope keys — guessing beyond that would silently extract the
 * wrong field, so anything else is an error the operator must resolve.
 */
function extractRecords(body: unknown, recordsPath?: string): Record<string, unknown>[] {
  if (recordsPath) {
    const found = readPath(body, recordsPath);
    if (!Array.isArray(found)) {
      throw new Error(`REST connector: recordsPath '${recordsPath}' did not resolve to an array`);
    }
    return found as Record<string, unknown>[];
  }
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  for (const key of ["data", "items", "results", "records"]) {
    const candidate = (body as Record<string, unknown> | null)?.[key];
    if (Array.isArray(candidate)) return candidate as Record<string, unknown>[];
  }
  throw new Error(
    "REST connector: could not locate a record array in the response; set properties.recordsPath",
  );
}

export class RestConnector implements Connector {
  readonly name = "rest";
  readonly version = "1.0.0";

  private config: ConnectorConfig | null = null;
  private healthy = false;
  private paused = false;
  private pauseResolvers: (() => void)[] = [];
  private readonly fetchImpl: FetchLike;
  /** Cached client-credentials token, with the epoch ms it stops being valid. */
  private token: { value: string; expiresAt: number } | null = null;

  constructor(fetchImpl?: FetchLike) {
    this.fetchImpl = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  // -- Lifecycle --

  async initialize(config: ConnectorConfig): Promise<void> {
    this.config = config;
    this.healthy = true;
  }

  async shutdown(): Promise<void> {
    this.config = null;
    this.healthy = false;
    this.paused = false;
    this.token = null;
    for (const resolve of this.pauseResolvers) resolve();
    this.pauseResolvers = [];
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: this.healthy,
      provider: "rest",
      latencyMs: 0,
      details: this.config ? { url: this.config.url } : undefined,
    };
  }

  // -- Discovery --

  /**
   * Infer a schema from one page of records.
   *
   * A REST source rarely publishes a machine-readable schema, so the shape is
   * sampled. Columns are the union of keys seen, typed from the first non-null
   * value; a key that is null in every sampled row is reported as 'unknown'
   * rather than guessed.
   */
  async discoverSchema(): Promise<SourceSchema> {
    const cfg = this.requireConfig();
    const props = this.props();
    const { records } = await this.fetchPage(cfg.table, {}, 0);

    const types = new Map<string, string>();
    for (const record of records) {
      for (const [key, value] of Object.entries(record)) {
        if (value === null || value === undefined) {
          if (!types.has(key)) types.set(key, "unknown");
          continue;
        }
        if (types.get(key) === undefined || types.get(key) === "unknown") {
          types.set(key, Array.isArray(value) ? "array" : typeof value);
        }
      }
    }

    return {
      tables: [
        {
          name: cfg.table,
          columns: [...types.entries()].map(([name, type]) => ({
            name,
            type,
            nullable: true,
          })),
          primaryKey: [props.keyField ?? "id"],
        },
      ],
    };
  }

  // -- Extraction --

  async *fullExtract(table: string, options?: ExtractOptions): AsyncIterable<SourceRecord> {
    yield* this.paginate(table, {}, options?.batchSize);
  }

  async *incrementalExtract(table: string, since: Checkpoint): AsyncIterable<SourceRecord> {
    const props = this.props();
    const sinceParam = props.sinceParam ?? "updated_since";
    // The checkpoint is opaque per the Connector contract; a REST source can
    // only receive it as a scalar query value, so object checkpoints are JSON.
    const value = typeof since === "object" ? JSON.stringify(since) : String(since);
    yield* this.paginate(table, { [sinceParam]: value });
  }

  // -- Backpressure --

  async pause(): Promise<void> {
    this.paused = true;
  }

  async resume(): Promise<void> {
    this.paused = false;
    for (const resolve of this.pauseResolvers) resolve();
    this.pauseResolvers = [];
  }

  // -- Internal --

  private requireConfig(): ConnectorConfig {
    if (!this.config) throw new Error("REST connector: initialize() must be called first");
    return this.config;
  }

  private props(): RestProperties {
    return (this.config?.properties ?? {}) as RestProperties;
  }

  /**
   * Walk pages until one comes back short (or, for cursor style, until the
   * source stops returning a cursor). Checked between pages so a paused
   * connector stops fetching rather than only stops yielding.
   */
  private async *paginate(
    table: string,
    baseQuery: Record<string, string>,
    batchSize?: number,
  ): AsyncIterable<SourceRecord> {
    const props = this.props();
    const pagination: RestPagination = props.pagination ?? { style: "offset" };
    const pageSize = batchSize ?? pagination.pageSize ?? DEFAULT_PAGE_SIZE;

    let offset = 0;
    let page = pagination.style === "page" ? (pagination.firstPage ?? 1) : 0;
    let cursor: string | undefined;

    for (let pageCount = 0; pageCount < MAX_PAGES; pageCount++) {
      await this.waitIfPaused();

      const query: Record<string, string> = { ...baseQuery };
      if (pagination.style === "offset") {
        query[pagination.limitParam ?? "limit"] = String(pageSize);
        query[pagination.offsetParam ?? "offset"] = String(offset);
      } else if (pagination.style === "page") {
        query[pagination.pageParam ?? "page"] = String(page);
        query[pagination.sizeParam ?? "per_page"] = String(pageSize);
      } else {
        query[pagination.sizeParam ?? "limit"] = String(pageSize);
        if (cursor) query[pagination.cursorParam ?? "cursor"] = cursor;
      }

      const { records, body } = await this.fetchPage(table, query, pageCount);
      for (const record of records) yield this.toSourceRecord(table, record);

      if (pagination.style === "cursor") {
        const next = readPath(body, pagination.cursorPath ?? "next_cursor");
        if (typeof next !== "string" || next.length === 0) return;
        cursor = next;
        continue;
      }
      // A short page means the source has no more rows.
      if (records.length < pageSize) return;
      offset += records.length;
      page += 1;
    }
  }

  private async fetchPage(
    table: string,
    query: Record<string, string>,
    _pageIndex: number,
  ): Promise<{ records: Record<string, unknown>[]; body: unknown }> {
    const cfg = this.requireConfig();
    const props = this.props();

    const base = cfg.url.replace(/\/+$/, "");
    const path = props.path ?? `/${table}`;
    const qs = new URLSearchParams(query).toString();
    const url = `${base}${path}${qs ? `?${qs}` : ""}`;

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", ...(props.headers ?? {}), ...(await this.authHeaders()) },
    });

    if (!response.ok) {
      // Include the body: a REST source's error detail is the only diagnostic
      // an operator gets, and swallowing it makes misconfiguration opaque.
      const detail = await response.text().catch(() => "");
      throw new Error(`REST connector: GET ${url} failed with ${response.status}${detail ? ` — ${detail}` : ""}`);
    }

    const body = await response.json();
    return { records: extractRecords(body, props.recordsPath), body };
  }

  private toSourceRecord(table: string, record: Record<string, unknown>): SourceRecord {
    const props = this.props();
    const keyField = props.keyField ?? "id";
    const timestampField = props.timestampField ?? "updated_at";
    const timestamp = record[timestampField];

    return {
      table,
      key: { [keyField]: record[keyField] },
      data: record,
      // A REST page reports current state, not a change log: every row is an
      // upsert. DELETEs are invisible to this connector by construction.
      operation: "INSERT",
      timestamp: (typeof timestamp === "string" ? timestamp : new Date().toISOString()) as DateTime,
      // Checkpoint on the row's own mtime so a resumed extract asks the source
      // for everything after the last row it actually saw.
      checkpoint: (typeof timestamp === "string" ? timestamp : String(record[keyField] ?? "")) as Checkpoint,
    };
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const auth = this.props().auth;
    if (!auth || auth.type === "none") return {};

    if (auth.type === "bearer") return { Authorization: `Bearer ${auth.token}` };

    if (auth.type === "basic") {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }

    return { Authorization: `Bearer ${await this.oauthToken(auth)}` };
  }

  /**
   * Client-credentials token, cached until shortly before it expires.
   *
   * The 30s margin keeps a token from expiring mid-flight on a long extract;
   * without it a multi-page pull can fail on the last page for no visible
   * reason.
   */
  private async oauthToken(auth: Extract<RestAuth, { type: "oauth2" }>): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now) return this.token.value;

    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
    });
    if (auth.scope) params.set("scope", auth.scope);

    const response = await this.fetchImpl(auth.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: params.toString(),
    });
    if (!response.ok) {
      throw new Error(`REST connector: OAuth2 token request failed with ${response.status}`);
    }

    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new Error("REST connector: OAuth2 token response contained no access_token");
    }

    this.token = {
      value: body.access_token,
      expiresAt: now + (body.expires_in ?? 3600) * 1000 - 30_000,
    };
    return this.token.value;
  }

  private async waitIfPaused(): Promise<void> {
    if (!this.paused) return;
    return new Promise<void>((resolve) => {
      this.pauseResolvers.push(resolve);
    });
  }
}

/** REST connector plugin for use with ConnectorRegistry. */
export const restPlugin: ConnectorPlugin = {
  metadata: {
    name: "rest",
    version: "1.0.0",
    description: "REST API connector (offset/page/cursor pagination, bearer/basic/OAuth2 auth)",
  },
  // Config is applied via initialize() per the Connector interface contract.
  factory: (_config) => new RestConnector(),
};
