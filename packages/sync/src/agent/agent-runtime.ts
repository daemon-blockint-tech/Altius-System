/**
 * DataConnectionAgent — the customer-network side of agent-based data
 * connection.
 *
 * Runs on an isolated server/VM inside the customer network, next to the
 * source systems the platform cannot reach. Egress-only by construction:
 * the agent opens no listening socket and makes exactly one kind of network
 * call — outbound HTTPS to the platform gateway (TLS is refused only for
 * explicitly-opted-in dev/test setups). Lease assignments arrive on the
 * heartbeat *response*, so the customer firewall needs nothing but outbound
 * 443.
 *
 * Per leased datasource the agent runs the connector from its LOCAL plugin
 * registry, resolves `${ENV_VAR}` placeholders in the connection URL from
 * its LOCAL environment (source credentials never leave the network), and
 * uploads captured records in bounded batches. Mapping to ontology objects
 * happens platform-side — the agent moves raw source records only.
 */

import { hostname } from "node:os";
import { createLogger } from "@altius/observability";
import type { Checkpoint, Connector, SourceRecord } from "../connectors/connector.js";
import type { ConnectorRegistry } from "../connectors/connector-registry.js";
import type {
  AgentEnrollRequest,
  AgentEnrollResponse,
  AgentHeartbeatRequest,
  AgentHeartbeatResponse,
  AgentLeaseGrant,
  AgentLeaseStatus,
  AgentUploadRequest,
  AgentUploadResponse,
} from "./protocol.js";

const logger = createLogger("data-connection-agent");

const ENV_PLACEHOLDER = /\$\{([A-Z][A-Z0-9_]*)\}/g;

/**
 * Resolve ${ENV_VAR} placeholders from the AGENT host's environment.
 * Throws on an unset/empty variable — a half-resolved connection URL must
 * never reach a connector. (Agent-side twin of the api-gateway's resolver:
 * for AGENT datasources the variable lives here, not on the platform.)
 */
export function resolveAgentEnvPlaceholders(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(ENV_PLACEHOLDER, (_match, name: string) => {
    const resolved = env[name];
    if (resolved === undefined || resolved === "") {
      throw new Error(`environment variable ${name} is not set on the agent host`);
    }
    return resolved;
  });
}

// ── Config ───────────────────────────────────────────────────────────

export interface DataConnectionAgentConfig {
  /** Platform gateway base URL, e.g. https://altius.example.com — must be https. */
  platformUrl: string;
  /** Shared enrollment secret (X-Enrollment-Secret). */
  enrollmentSecret: string;
  /** Stable agent name; datasources can pin to it via `agent:`. Default: host name. */
  agentName?: string;
  /** Local connector plugin registry — determines which leases this agent is eligible for. */
  registry: ConnectorRegistry;
  agentVersion?: string;
  /**
   * Permit an http:// platformUrl. Dev/test only: a production agent moving
   * customer data refuses a cleartext channel.
   */
  allowInsecureHttp?: boolean;
  /** Environment used for ${ENV_VAR} resolution. Default: process.env. */
  env?: NodeJS.ProcessEnv;
  /** fetch implementation, injectable for tests. Default: global fetch. */
  fetchImpl?: typeof fetch;
  /** Records per upload call. Default 500. */
  uploadBatchSize?: number;
  /** Abort budget per HTTP call. Default 30s. */
  requestTimeoutMs?: number;
  /** Retry budget for enrollment before start() rejects. Default 5 attempts. */
  maxEnrollAttempts?: number;
}

// ── Internal state ───────────────────────────────────────────────────

interface LeaseEntry {
  grant: AgentLeaseGrant;
  connector: Connector | null;
  checkpoint: Checkpoint | null;
  timer: NodeJS.Timeout | null;
  currentTick: Promise<void> | null;
  ticks: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastTickAt: string | null;
}

/** Thrown on a 409 upload — the platform reassigned the lease. */
class LeaseRevokedError extends Error {}

// ── Agent ────────────────────────────────────────────────────────────

export class DataConnectionAgent {
  private readonly platformUrl: string;
  private readonly enrollmentSecret: string;
  private readonly agentName: string;
  private readonly agentVersion: string | undefined;
  private readonly registry: ConnectorRegistry;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly uploadBatchSize: number;
  private readonly requestTimeoutMs: number;
  private readonly maxEnrollAttempts: number;

  private agentId: string | null = null;
  private agentToken: string | null = null;
  private heartbeatIntervalMs = 15_000;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly leases = new Map<string, LeaseEntry>();
  private stopped = false;

  constructor(config: DataConnectionAgentConfig) {
    const url = new URL(config.platformUrl);
    if (url.protocol !== "https:" && !config.allowInsecureHttp) {
      throw new Error(
        `platformUrl must be https (got ${url.protocol}//) — set allowInsecureHttp only for dev/test`,
      );
    }
    this.platformUrl = config.platformUrl.replace(/\/+$/, "");
    this.enrollmentSecret = config.enrollmentSecret;
    this.agentName = config.agentName ?? hostname();
    this.agentVersion = config.agentVersion;
    this.registry = config.registry;
    this.env = config.env ?? process.env;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.uploadBatchSize = config.uploadBatchSize ?? 500;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
    this.maxEnrollAttempts = config.maxEnrollAttempts ?? 5;
  }

  /** Enroll with the platform and start the heartbeat/capture loops. */
  async start(): Promise<void> {
    await this.enroll();
    this.scheduleHeartbeat(0);
  }

  /** Stop loops, await in-flight ticks, shut down local connectors. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
    const inFlight: Promise<void>[] = [];
    for (const lease of this.leases.values()) {
      if (lease.timer) clearTimeout(lease.timer);
      lease.timer = null;
      if (lease.currentTick) inFlight.push(lease.currentTick);
    }
    await Promise.allSettled(inFlight);
    await Promise.allSettled(
      [...this.leases.values()].filter((l) => l.connector).map((l) => l.connector!.shutdown()),
    );
    this.leases.clear();
  }

  /** Datasources currently leased to this agent (for operators/tests). */
  heldLeases(): string[] {
    return [...this.leases.keys()];
  }

  // ── Enrollment ─────────────────────────────────────────────────────

  private async enroll(): Promise<void> {
    const request: AgentEnrollRequest = {
      agentName: this.agentName,
      ...(this.agentVersion ? { agentVersion: this.agentVersion } : {}),
      connectors: this.registry.list(),
    };
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxEnrollAttempts; attempt++) {
      if (this.stopped) return;
      try {
        const res = await this.post(`/api/v1/data-connection/enroll`, request, {
          "X-Enrollment-Secret": this.enrollmentSecret,
        });
        if (res.status === 401) {
          // Wrong secret never becomes right by retrying.
          throw new Error("enrollment rejected: invalid enrollment secret");
        }
        if (res.status !== 200) {
          throw new Error(`enrollment failed: HTTP ${res.status}`);
        }
        const body = (await res.json()) as AgentEnrollResponse;
        this.agentId = body.agentId;
        this.agentToken = body.agentToken;
        this.heartbeatIntervalMs = body.heartbeatIntervalMs;
        logger.info(
          { agentName: this.agentName, agentId: this.agentId, heartbeatIntervalMs: this.heartbeatIntervalMs },
          "Enrolled with platform",
        );
        return;
      } catch (err) {
        if (err instanceof Error && err.message.includes("invalid enrollment secret")) throw err;
        lastError = err;
        const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 30_000);
        logger.warn(
          { attempt, backoffMs, err: err instanceof Error ? err.message : String(err) },
          "Enrollment attempt failed",
        );
        await sleep(backoffMs);
      }
    }
    throw new Error(
      `enrollment failed after ${this.maxEnrollAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  // ── Heartbeat loop ─────────────────────────────────────────────────

  private scheduleHeartbeat(delayMs: number): void {
    if (this.stopped) return;
    this.heartbeatTimer = setTimeout(() => {
      void this.heartbeat().finally(() => this.scheduleHeartbeat(this.heartbeatIntervalMs));
    }, delayMs);
    this.heartbeatTimer.unref?.();
  }

  private async heartbeat(): Promise<void> {
    if (this.stopped || !this.agentId) return;
    const request: AgentHeartbeatRequest = {
      connectors: this.registry.list(),
      leases: [...this.leases.values()].map(
        (l): AgentLeaseStatus => ({
          datasource: l.grant.datasource,
          ticks: l.ticks,
          consecutiveFailures: l.consecutiveFailures,
          lastError: l.lastError,
          lastTickAt: l.lastTickAt,
        }),
      ),
    };
    try {
      const res = await this.post(`/api/v1/data-connection/agents/${this.agentId}/heartbeat`, request, this.authHeader());
      if (res.status === 401) {
        // Gateway restarted and lost the registration — enroll again.
        logger.warn("Heartbeat unauthorized — re-enrolling");
        await this.dropAllLeases();
        await this.enroll();
        return;
      }
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as AgentHeartbeatResponse;
      this.heartbeatIntervalMs = body.heartbeatIntervalMs;
      await this.reconcileLeases(body.leases);
    } catch (err) {
      // A missed heartbeat is survivable: capture loops keep their current
      // grants; the platform reassigns only after the liveness timeout.
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Heartbeat failed");
    }
  }

  // ── Lease reconciliation ───────────────────────────────────────────

  private async reconcileLeases(grants: AgentLeaseGrant[]): Promise<void> {
    const granted = new Map(grants.map((g) => [g.datasource, g]));

    // Drop leases the platform no longer grants us.
    for (const [datasource, lease] of this.leases) {
      if (!granted.has(datasource)) await this.dropLease(datasource, lease);
    }

    // Start capture loops for new grants.
    for (const grant of grants) {
      if (this.leases.has(grant.datasource)) {
        // Keep the running loop; adopt the server's checkpoint only when we
        // have none locally (ours is at least as fresh mid-tick).
        const lease = this.leases.get(grant.datasource)!;
        lease.grant = grant;
        if (lease.checkpoint === null) lease.checkpoint = grant.checkpoint;
        continue;
      }
      const lease: LeaseEntry = {
        grant,
        connector: null,
        checkpoint: grant.checkpoint,
        timer: null,
        currentTick: null,
        ticks: 0,
        consecutiveFailures: 0,
        lastError: null,
        lastTickAt: null,
      };
      this.leases.set(grant.datasource, lease);
      logger.info(
        { datasource: grant.datasource, connector: grant.connector, mode: grant.mode, intervalMs: grant.intervalMs },
        "Lease granted — starting local capture loop",
      );
      this.scheduleTick(lease, 0);
    }
  }

  private async dropLease(datasource: string, lease: LeaseEntry): Promise<void> {
    this.leases.delete(datasource);
    if (lease.timer) clearTimeout(lease.timer);
    lease.timer = null;
    if (lease.currentTick) await lease.currentTick.catch(() => {});
    if (lease.connector) await lease.connector.shutdown().catch(() => {});
    logger.info({ datasource }, "Lease dropped");
  }

  private async dropAllLeases(): Promise<void> {
    for (const [datasource, lease] of [...this.leases]) {
      await this.dropLease(datasource, lease);
    }
  }

  // ── Capture loop (per lease) ───────────────────────────────────────

  private scheduleTick(lease: LeaseEntry, delayMs: number): void {
    if (this.stopped) return;
    lease.timer = setTimeout(() => {
      lease.currentTick = this.tick(lease).finally(() => {
        lease.currentTick = null;
        // Still held? (dropLease may have removed us mid-tick.)
        if (!this.leases.has(lease.grant.datasource)) return;
        const backoff = Math.min(
          lease.grant.intervalMs * 2 ** lease.consecutiveFailures,
          lease.grant.intervalMs * 10,
        );
        this.scheduleTick(lease, lease.consecutiveFailures > 0 ? backoff : lease.grant.intervalMs);
      });
    }, delayMs);
    lease.timer.unref?.();
  }

  private async tick(lease: LeaseEntry): Promise<void> {
    const { datasource } = lease.grant;
    lease.lastTickAt = new Date().toISOString();
    lease.ticks++;
    try {
      const connector = await this.ensureConnector(lease);
      const source =
        lease.grant.mode === "BATCH"
          ? connector.fullExtract(lease.grant.connection.table)
          : connector.incrementalExtract(
              lease.grant.connection.table,
              lease.checkpoint ?? "1970-01-01T00:00:00Z",
            );

      let batch: SourceRecord[] = [];
      let sent = 0;
      for await (const record of source) {
        batch.push(record);
        if (batch.length >= this.uploadBatchSize) {
          await this.uploadBatch(lease, batch);
          sent += batch.length;
          batch = [];
        }
        if (sent + batch.length >= lease.grant.maxRecordsPerTick) break;
      }
      if (batch.length > 0) await this.uploadBatch(lease, batch);
      lease.consecutiveFailures = 0;
      lease.lastError = null;
    } catch (err) {
      if (err instanceof LeaseRevokedError) {
        logger.warn({ datasource }, "Lease revoked by platform — dropping");
        const held = this.leases.get(datasource);
        if (held) await this.dropLease(datasource, held);
        return;
      }
      lease.consecutiveFailures++;
      lease.lastError = err instanceof Error ? err.message : String(err);
      logger.error(
        { datasource, err: lease.lastError, consecutiveFailures: lease.consecutiveFailures },
        "Capture tick failed",
      );
    }
  }

  private async ensureConnector(lease: LeaseEntry): Promise<Connector> {
    if (lease.connector) return lease.connector;
    const { grant } = lease;
    const connectorConfig = {
      // Credentials resolve from THIS host's environment, by design.
      url: resolveAgentEnvPlaceholders(grant.connection.url, this.env),
      table: grant.connection.table,
      ...(grant.connection.properties ? { properties: grant.connection.properties } : {}),
    };
    const connector = this.registry.create(grant.connector, connectorConfig);
    await connector.initialize(connectorConfig);
    lease.connector = connector;
    return connector;
  }

  private async uploadBatch(lease: LeaseEntry, records: SourceRecord[]): Promise<void> {
    const { datasource } = lease.grant;
    const request: AgentUploadRequest = {
      records: records.map((r) => ({
        table: r.table,
        key: r.key,
        data: r.data,
        operation: r.operation,
        timestamp: r.timestamp,
        checkpoint: r.checkpoint,
      })),
    };
    const res = await this.post(
      `/api/v1/data-connection/agents/${this.agentId}/datasources/${encodeURIComponent(datasource)}/records`,
      request,
      this.authHeader(),
    );
    if (res.status === 409) throw new LeaseRevokedError(`lease for ${datasource} revoked`);
    if (res.status !== 200) throw new Error(`upload failed: HTTP ${res.status}`);
    const body = (await res.json()) as AgentUploadResponse;
    if (body.checkpoint !== null && body.checkpoint !== undefined) {
      lease.checkpoint = body.checkpoint;
    }
    if (body.rejected > 0) {
      logger.warn(
        { datasource, rejected: body.rejected, errors: body.errors.slice(0, 3) },
        "Platform rejected records from upload",
      );
    }
  }

  // ── HTTP ───────────────────────────────────────────────────────────

  private authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.agentToken}` };
  }

  private async post(path: string, body: unknown, headers: Record<string, string>): Promise<Response> {
    return this.fetchImpl(`${this.platformUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}
