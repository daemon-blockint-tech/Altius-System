/**
 * Agent-based data connection (Spec Section 6; Foundry-parity:
 * Data Connection Agent).
 *
 * - AgentGateway: platform side — enrollment, heartbeats, lease
 *   assignment, record intake.
 * - DataConnectionAgent: customer-network side — egress-only capture
 *   runtime that runs connectors locally and uploads over outbound HTTPS.
 */

export type {
  AgentEnrollRequest,
  AgentEnrollResponse,
  AgentHeartbeatRequest,
  AgentHeartbeatResponse,
  AgentLeaseGrant,
  AgentLeaseStatus,
  AgentUploadRequest,
  AgentUploadResponse,
  AgentErrorResponse,
  WireSourceRecord,
} from "./protocol.js";

export type {
  AgentGatewayConfig,
  AgentGatewayStatus,
  AgentStatusView,
  DatasourceStatusView,
  GatewayResult,
} from "./agent-gateway.js";
export { AgentGateway } from "./agent-gateway.js";

export type { DataConnectionAgentConfig } from "./agent-runtime.js";
export { DataConnectionAgent, resolveAgentEnvPlaceholders } from "./agent-runtime.js";
