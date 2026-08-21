/**
 * AgentGateway — platform side of agent-based data connection.
 *
 * Owns the registry of enrolled Data Connection Agents and the lease
 * assignment of runtime-AGENT datasources to them. All traffic is
 * agent-initiated (the gateway never dials out to an agent):
 *
 *   enroll    → verify shared enrollment secret, mint per-agent bearer token
 *   heartbeat → record liveness, (re)assign leases, return this agent's grants
 *   upload    → verify lease held, feed records through the same
 *               RecordMapper → ChangeApplier pipeline the in-process
 *               scheduler uses, persist the checkpoint
 *
 * Handlers are framework-agnostic ({ status, body } results) so the HTTP
 * layer stays a thin adapter — same pattern as the webhook ingest handler.
 *
 * Liveness is computed on read (lastSeenAt vs livenessTimeoutMs) rather than
 * by a reaper timer: a lease held by a stale agent is reassigned the moment
 * another eligible agent heartbeats, and an upload from a stale-but-returned
 * agent that still holds the lease is accepted — the source of truth is the
 * assignment, not the timer.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createLogger } from "@altius/observability";
import type { Checkpoint, SourceRecord } from "../connectors/connector.js";
import type { DatasourceMappingConfig } from "../mapping/mapping-parser.js";
import { CdcConsumer, type ChangeApplier, type CheckpointStore } from "../cdc/cdc-consumer.js";
import { InMemoryCheckpointStore, parseInterval } from "../scheduler/sync-scheduler.js";
import type {
  AgentEnrollRequest,
  AgentEnrollResponse,
  AgentErrorResponse,
  AgentHeartbeatRequest,
  AgentHeartbeatResponse,
  AgentLeaseGrant,
  AgentLeaseStatus,
  AgentUploadRequest,
  AgentUploadResponse,
  WireSourceRecord,
} from "./protocol.js";

const logger = createLogger("agent-gateway");

// ── Result / status shapes ───────────────────────────────────────────

/** Framework-agnostic handler result. */
export interface GatewayResult<T> {
  status: number;
  body: T | AgentErrorResponse;
}

/** One enrolled agent, as reported by status(). */
export interface AgentStatusView {
  agentId: string;
  agentName: string;
  agentVersion: string | null;
  connectors: string[];
  live: boolean;
  lastSeenAt: string | null;
  leases: string[];
  reportedLeases: AgentLeaseStatus[];
}

/** One AGENT-runtime datasource, as reported by status(). */
export interface DatasourceStatusView {
  datasource: string;
  connector: string;
  pinnedAgent: string | null;
  assignedAgent: string | null;
  recordsProcessed: number;
  recordsFailed: number;
  lastProcessedAt: string | null;
  checkpoint: Checkpoint | null;
}

export interface AgentGatewayStatus {
  agents: AgentStatusView[];
  datasources: DatasourceStatusView[];
}

// ── Config ───────────────────────────────────────────────────────────

export interface AgentGatewayConfig {
  /** Shared secret agents present at enrollment (X-Enrollment-Secret). */
  enrollmentSecret: string;
  /** Runtime-AGENT datasources this gateway leases out. */
  datasources: DatasourceMappingConfig[];
  /** Builds the ontology-write applier for one datasource (same contract as the scheduler's). */
  changeApplierFactory: (config: DatasourceMappingConfig) => ChangeApplier;
  /** Checkpoint persistence (default: in-memory — see InMemoryCheckpointStore's caveat). */
  checkpointStore?: CheckpointStore;
  /** Interval agents are told to heartbeat at. Default 15s. */
  heartbeatIntervalMs?: number;
  /** Silence after which an agent is dead and its leases reassignable. Default 3× heartbeat. */
  livenessTimeoutMs?: number;
  /** Hard cap on records per upload call. Default 10,000. */
  maxRecordsPerUpload?: number;
  /** Per-tick capture bound sent in every lease grant. Default 10,000. */
  maxRecordsPerTick?: number;
  /** Poll interval sent when a datasource declares none. Default 30s. */
  defaultIntervalMs?: number;
}

// ── Internal state ───────────────────────────────────────────────────

interface AgentEntry {
  agentId: string;
  agentName: string;
  agentVersion: string | null;
  tokenHash: Buffer;
  connectors: Set<string>;
  lastSeenAt: number;
  reportedLeases: AgentLeaseStatus[];
}

interface DatasourceEntry {
  config: DatasourceMappingConfig;
  consumer: CdcConsumer;
  intervalMs: number;
  assignedAgentId: string | null;
  /** Serialises uploads so two batches for one datasource never interleave. */
  uploadChain: Promise<void>;
}

const AGENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const OPERATIONS = new Set(["INSERT", "UPDATE", "DELETE"]);

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time string comparison via digest comparison. */
function secretEquals(presented: string, expected: string): boolean {
  return timingSafeEqual(sha256(presented), sha256(expected));
}

// ── Gateway ──────────────────────────────────────────────────────────

export class AgentGateway {
  private readonly enrollmentSecret: string;
  private readonly checkpointStore: CheckpointStore;
  private readonly heartbeatIntervalMs: number;
  private readonly livenessTimeoutMs: number;
  private readonly maxRecordsPerUpload: number;
  private readonly maxRecordsPerTick: number;
  private readonly agents = new Map<string, AgentEntry>();
  private readonly datasources = new Map<string, DatasourceEntry>();

  constructor(config: AgentGatewayConfig) {
    if (!config.enrollmentSecret) {
      throw new Error("AgentGateway requires a non-empty enrollmentSecret");
    }
    this.enrollmentSecret = config.enrollmentSecret;
    this.checkpointStore = config.checkpointStore ?? new InMemoryCheckpointStore();
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 15_000;
    this.livenessTimeoutMs = config.livenessTimeoutMs ?? this.heartbeatIntervalMs * 3;
    this.maxRecordsPerUpload = config.maxRecordsPerUpload ?? 10_000;
    this.maxRecordsPerTick = config.maxRecordsPerTick ?? 10_000;
    const defaultIntervalMs = config.defaultIntervalMs ?? 30_000;

    for (const ds of config.datasources) {
      if (ds.runtime !== "AGENT") {
        throw new Error(
          `Datasource ${ds.datasource} has runtime ${ds.runtime} — the agent gateway leases only runtime-AGENT datasources`,
        );
      }
      this.datasources.set(ds.datasource, {
        config: ds,
        consumer: new CdcConsumer({
          mappingConfig: ds,
          changeApplier: config.changeApplierFactory(ds),
          checkpointStore: this.checkpointStore,
        }),
        intervalMs: parseInterval(ds.sync.interval) ?? defaultIntervalMs,
        assignedAgentId: null,
        uploadChain: Promise.resolve(),
      });
    }
  }

  // ── Enrollment ─────────────────────────────────────────────────────

  enroll(presentedSecret: string | undefined, req: AgentEnrollRequest): GatewayResult<AgentEnrollResponse> {
    if (!presentedSecret || !secretEquals(presentedSecret, this.enrollmentSecret)) {
      return { status: 401, body: { error: "Unauthorized: invalid or missing enrollment secret" } };
    }
    if (typeof req?.agentName !== "string" || !AGENT_NAME_PATTERN.test(req.agentName)) {
      return { status: 400, body: { error: "agentName must match " + String(AGENT_NAME_PATTERN) } };
    }
    if (!Array.isArray(req.connectors) || req.connectors.some((c) => typeof c !== "string")) {
      return { status: 400, body: { error: "connectors must be an array of plugin names" } };
    }

    // Re-enrollment under the same name replaces the prior registration —
    // the normal path after an agent host restart. The old token dies with it.
    for (const [id, agent] of this.agents) {
      if (agent.agentName === req.agentName) {
        this.agents.delete(id);
        this.releaseLeases(id);
      }
    }

    const agentId = randomUUID();
    const agentToken = randomBytes(32).toString("hex");
    this.agents.set(agentId, {
      agentId,
      agentName: req.agentName,
      agentVersion: typeof req.agentVersion === "string" ? req.agentVersion : null,
      tokenHash: sha256(agentToken),
      connectors: new Set(req.connectors),
      lastSeenAt: Date.now(),
      reportedLeases: [],
    });
    logger.info(
      { agentName: req.agentName, agentId, connectors: req.connectors },
      "Data connection agent enrolled",
    );
    return { status: 200, body: { agentId, agentToken, heartbeatIntervalMs: this.heartbeatIntervalMs } };
  }

  // ── Heartbeat ──────────────────────────────────────────────────────

  async heartbeat(
    agentId: string,
    presentedToken: string | undefined,
    req: AgentHeartbeatRequest,
  ): Promise<GatewayResult<AgentHeartbeatResponse>> {
    const agent = this.authenticate(agentId, presentedToken);
    if (!agent) return { status: 401, body: { error: "Unauthorized: unknown agent or bad token" } };

    agent.lastSeenAt = Date.now();
    if (Array.isArray(req?.connectors)) {
      agent.connectors = new Set(req.connectors.filter((c) => typeof c === "string"));
    }
    if (Array.isArray(req?.leases)) agent.reportedLeases = req.leases;

    this.reassignLeases();

    const leases: AgentLeaseGrant[] = [];
    for (const entry of this.datasources.values()) {
      if (entry.assignedAgentId !== agentId) continue;
      leases.push({
        datasource: entry.config.datasource,
        connector: entry.config.connector,
        connection: entry.config.connection,
        // The parser guarantees runtime AGENT never carries mode OVERLAY.
        mode: entry.config.sync.mode as "CDC" | "POLLING" | "BATCH",
        intervalMs: entry.intervalMs,
        checkpoint: await this.checkpointStore.getCheckpoint(entry.config.datasource),
        maxRecordsPerTick: this.maxRecordsPerTick,
      });
    }
    return { status: 200, body: { leases, heartbeatIntervalMs: this.heartbeatIntervalMs } };
  }

  // ── Upload ─────────────────────────────────────────────────────────

  async upload(
    agentId: string,
    presentedToken: string | undefined,
    datasource: string,
    req: AgentUploadRequest,
  ): Promise<GatewayResult<AgentUploadResponse>> {
    const agent = this.authenticate(agentId, presentedToken);
    if (!agent) return { status: 401, body: { error: "Unauthorized: unknown agent or bad token" } };
    agent.lastSeenAt = Date.now();

    const entry = this.datasources.get(datasource);
    if (!entry) return { status: 404, body: { error: `Unknown datasource: ${datasource}` } };
    if (entry.assignedAgentId !== agentId) {
      // Lease was reassigned (or never granted) — the agent drops the lease
      // and picks up its current set on the next heartbeat.
      return { status: 409, body: { error: `Lease for ${datasource} is not held by this agent` } };
    }

    if (!Array.isArray(req?.records)) {
      return { status: 400, body: { error: "records must be an array" } };
    }
    if (req.records.length > this.maxRecordsPerUpload) {
      return {
        status: 413,
        body: { error: `Upload exceeds maxRecordsPerUpload (${this.maxRecordsPerUpload}) — split the batch` },
      };
    }

    const errors: string[] = [];
    const valid: SourceRecord[] = [];
    for (const [i, wire] of req.records.entries()) {
      const problem = validateWireRecord(wire);
      if (problem) {
        errors.push(`records[${i}]: ${problem}`);
      } else {
        valid.push({
          table: wire.table,
          key: wire.key ?? {},
          data: wire.data,
          operation: wire.operation,
          timestamp: wire.timestamp ?? new Date().toISOString(),
          checkpoint: wire.checkpoint,
        });
      }
    }

    // Serialise per datasource: CdcConsumer tracks running state and
    // checkpoints per instance, so interleaved consume() calls would race.
    const run = entry.uploadChain.then(async () => {
      const before = entry.consumer.stats;
      await entry.consumer.consume(arrayAsAsyncIterable(valid));
      const after = entry.consumer.stats;
      return {
        accepted: after.recordsProcessed - before.recordsProcessed,
        rejected: after.recordsFailed - before.recordsFailed,
      };
    });
    entry.uploadChain = run.then(
      () => undefined,
      () => undefined,
    );
    const { accepted, rejected } = await run;

    return {
      status: 200,
      body: {
        accepted,
        rejected: rejected + errors.length,
        errors,
        checkpoint: await this.checkpointStore.getCheckpoint(datasource),
      },
    };
  }

  // ── Status ─────────────────────────────────────────────────────────

  async status(): Promise<AgentGatewayStatus> {
    const agents: AgentStatusView[] = [...this.agents.values()].map((a) => ({
      agentId: a.agentId,
      agentName: a.agentName,
      agentVersion: a.agentVersion,
      connectors: [...a.connectors],
      live: this.isLive(a),
      lastSeenAt: new Date(a.lastSeenAt).toISOString(),
      leases: [...this.datasources.values()]
        .filter((d) => d.assignedAgentId === a.agentId)
        .map((d) => d.config.datasource),
      reportedLeases: a.reportedLeases,
    }));

    const datasources: DatasourceStatusView[] = [];
    for (const d of this.datasources.values()) {
      const holder = d.assignedAgentId ? this.agents.get(d.assignedAgentId) : undefined;
      const stats = d.consumer.stats;
      datasources.push({
        datasource: d.config.datasource,
        connector: d.config.connector,
        pinnedAgent: d.config.agent ?? null,
        assignedAgent: holder?.agentName ?? null,
        recordsProcessed: stats.recordsProcessed,
        recordsFailed: stats.recordsFailed,
        lastProcessedAt: stats.lastProcessedAt,
        checkpoint: await this.checkpointStore.getCheckpoint(d.config.datasource),
      });
    }
    return { agents, datasources };
  }

  // ── Internals ──────────────────────────────────────────────────────

  private authenticate(agentId: string, presentedToken: string | undefined): AgentEntry | null {
    const agent = this.agents.get(agentId);
    if (!agent || !presentedToken) return null;
    return timingSafeEqual(sha256(presentedToken), agent.tokenHash) ? agent : null;
  }

  private isLive(agent: AgentEntry): boolean {
    return Date.now() - agent.lastSeenAt <= this.livenessTimeoutMs;
  }

  private releaseLeases(agentId: string): void {
    for (const entry of this.datasources.values()) {
      if (entry.assignedAgentId === agentId) entry.assignedAgentId = null;
    }
  }

  /** Drop leases held by dead agents, then grant unheld leases to eligible live agents. */
  private reassignLeases(): void {
    for (const entry of this.datasources.values()) {
      if (entry.assignedAgentId !== null) {
        const holder = this.agents.get(entry.assignedAgentId);
        if (!holder || !this.isLive(holder)) {
          logger.warn(
            { datasource: entry.config.datasource, agent: holder?.agentName ?? entry.assignedAgentId },
            "Lease holder is gone — releasing lease",
          );
          entry.assignedAgentId = null;
        }
      }
      if (entry.assignedAgentId === null) {
        const eligible = [...this.agents.values()].find(
          (a) =>
            this.isLive(a) &&
            a.connectors.has(entry.config.connector) &&
            (entry.config.agent === undefined || entry.config.agent === a.agentName),
        );
        if (eligible) {
          entry.assignedAgentId = eligible.agentId;
          logger.info(
            { datasource: entry.config.datasource, agent: eligible.agentName },
            "Datasource leased to agent",
          );
        }
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function validateWireRecord(wire: WireSourceRecord): string | null {
  if (!wire || typeof wire !== "object") return "must be an object";
  if (typeof wire.table !== "string" || wire.table.length === 0) return "table must be a non-empty string";
  if (!wire.data || typeof wire.data !== "object" || Array.isArray(wire.data)) {
    return "data must be an object";
  }
  if (!OPERATIONS.has(wire.operation)) return `operation must be one of ${[...OPERATIONS].join(", ")}`;
  if (wire.checkpoint === undefined || wire.checkpoint === null) return "checkpoint is required";
  return null;
}

async function* arrayAsAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}
