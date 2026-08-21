/**
 * Data Connection wire protocol — the contract between an enrolled
 * Data Connection Agent (customer network) and the platform's agent
 * gateway (Spec Section 6; Foundry-parity: agent-based connectivity).
 *
 * Every exchange is agent-initiated over a single outbound HTTPS channel:
 * enroll once, heartbeat on an interval, upload captured records per lease.
 * The platform never connects to the agent — lease assignments ride the
 * heartbeat *response*, so no inbound firewall rule exists on the customer
 * side. Mapping and ontology writes stay platform-side; the agent sees only
 * connection details for the sources it is leased.
 */

import type { Checkpoint } from "../connectors/connector.js";

// ── Enrollment ───────────────────────────────────────────────────────

/** POST /api/v1/data-connection/enroll — X-Enrollment-Secret header. */
export interface AgentEnrollRequest {
  /** Stable agent name; re-enrolling under the same name replaces the prior registration. */
  agentName: string;
  /** Agent software version, for the operator's status view. */
  agentVersion?: string;
  /** Connector plugin names available in the agent's local registry. */
  connectors: string[];
}

export interface AgentEnrollResponse {
  agentId: string;
  /** Bearer token for every subsequent call. Shown once; stored hashed platform-side. */
  agentToken: string;
  heartbeatIntervalMs: number;
}

// ── Heartbeat / lease assignment ─────────────────────────────────────

/** Agent-side status of one held lease, reported informationally. */
export interface AgentLeaseStatus {
  datasource: string;
  ticks: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastTickAt: string | null;
}

/** POST /api/v1/data-connection/agents/:agentId/heartbeat — Bearer token. */
export interface AgentHeartbeatRequest {
  /** Current local connector plugins (may change across agent restarts). */
  connectors: string[];
  leases?: AgentLeaseStatus[];
}

/**
 * A datasource leased to the agent. Carries everything the agent needs to
 * run the capture locally — and nothing else: no mapping, no ontology
 * schema, no platform credentials.
 */
export interface AgentLeaseGrant {
  datasource: string;
  /** Connector plugin the agent instantiates from its local registry. */
  connector: string;
  /**
   * Connection config for the local connector. `${ENV_VAR}` placeholders
   * resolve on the AGENT host — source credentials live in the customer
   * network and never reach the platform.
   */
  connection: { url: string; table: string; properties?: Record<string, unknown> };
  mode: "CDC" | "POLLING" | "BATCH";
  intervalMs: number;
  /** Last durable server-side checkpoint; null = extract from the beginning. */
  checkpoint: Checkpoint | null;
  /** Hard cap on records the agent may capture per tick. */
  maxRecordsPerTick: number;
}

export interface AgentHeartbeatResponse {
  leases: AgentLeaseGrant[];
  heartbeatIntervalMs: number;
}

// ── Record upload ────────────────────────────────────────────────────

/** JSON-safe SourceRecord as uploaded by the agent. */
export interface WireSourceRecord {
  table: string;
  key: Record<string, unknown>;
  data: Record<string, unknown>;
  operation: "INSERT" | "UPDATE" | "DELETE";
  timestamp: string;
  checkpoint: Checkpoint;
}

/** POST /api/v1/data-connection/agents/:agentId/datasources/:datasource/records — Bearer token. */
export interface AgentUploadRequest {
  records: WireSourceRecord[];
}

export interface AgentUploadResponse {
  accepted: number;
  rejected: number;
  errors: string[];
  /** Checkpoint now durable platform-side; the agent resumes from here. */
  checkpoint: Checkpoint | null;
}

/** Error body for gateway refusals (401/404/409/…). */
export interface AgentErrorResponse {
  error: string;
}
