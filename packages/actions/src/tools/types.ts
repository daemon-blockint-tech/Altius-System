/**
 * Tool registry types (Section 5.7).
 *
 * Defines the ToolDescriptor structure that AI agents use to discover
 * and invoke actions, plus the agent execution context.
 */

import type { ActionResult } from '../executor/types.js';

// ---------------------------------------------------------------------------
// Tool descriptor (Section 5.7.1)
// ---------------------------------------------------------------------------

export type ToolKind = 'ACTION' | 'QUERY' | 'FUNCTION';

export interface ToolDescriptor {
  /** Action name (e.g., "AdmitPatient"). */
  name: string;
  /** Discriminator for the tool type. */
  kind: ToolKind;
  /** Human-readable description from ActionType doc string. */
  description: string;
  /** JSON Schema for the action's parameters. */
  parameters: JsonSchema;
  /** JSON Schema for the ActionResult return type. */
  returnType: JsonSchema;
  /** Permissions required to execute (from manifest preconditions). */
  requiredPermissions: string[];
  /** Whether this action supports dry-run mode. */
  dryRunSupported: boolean;
  /** Whether this action is reversible (from manifest). */
  reversible: boolean;
}

// ---------------------------------------------------------------------------
// JSON Schema subset (enough for tool parameters)
// ---------------------------------------------------------------------------

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  items?: JsonSchema;
  enum?: string[];
  /** Additional schema annotations. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Tool filter
// ---------------------------------------------------------------------------

export interface ToolFilter {
  /** Filter by tool kind. */
  kind?: ToolKind;
  /** Filter by name pattern (substring match). */
  namePattern?: string;
  /** Only include tools the given roles can access. */
  roles?: string[];
}

// ---------------------------------------------------------------------------
// Agent execution context (Section 5.7.2)
// ---------------------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high';

export interface AgentContext {
  /** The AI agent's identifier. */
  agentId: string;
  /** Conversation or session ID. */
  sessionId?: string;
  /** Whether to run in dry-run mode (validate without committing). */
  dryRun: boolean;
  /** Model identifier for audit. */
  model?: string;
  /**
   * Tenant the agent was acting in when the hold was created. Approval
   * surfaces MUST match this against the reviewer's tenant — a hold without
   * it is invisible to every tenant-scoped reviewer (fail closed).
   */
  tenantId?: string;
}

/**
 * Audit convention for `llm.call` operations (T5.3):
 *
 * When an agent invokes an LLM (e.g. via a Functions runtime `llm.call`),
 * the call should be audited as a single AuditRecord with:
 *   - `operation.type` = `'llm.call'`
 *   - `AuditDetail` entries for token counts:
 *       `{ key: 'promptTokens', value: <number> }`
 *       `{ key: 'completionTokens', value: <number> }`
 *       `{ key: 'totalTokens', value: <number> }`
 *   - `AuditDetail` for the model: `{ key: 'model', value: <string> }`
 *
 * This makes LLM usage tracking a simple query over the existing AuditStore
 * (filter by `operation.type = 'llm.call'`, sum token details) without
 * requiring a separate telemetry pipeline.
 */

export interface PolicyGuardResult {
  /** Whether execution is allowed. */
  allowed: boolean;
  /** If held, the hold ID for later approval. */
  holdId?: string;
  /** Reason for hold/denial. */
  reason?: string;
}

/** Policy guard checks high-risk actions for agent approval. */
export interface PolicyGuard {
  evaluate(
    actionName: string,
    riskLevel: RiskLevel,
    agentContext: AgentContext,
  ): Promise<PolicyGuardResult>;
}

// ---------------------------------------------------------------------------
// Agent execution result
// ---------------------------------------------------------------------------

export interface AgentExecutionResult {
  /** Underlying action result (or dry-run validation result). */
  result: ActionResult;
  /** Whether this was a dry-run. */
  dryRun: boolean;
  /** If held by policy guard. */
  held?: boolean;
  /** Hold ID for approval workflow. */
  holdId?: string;
}
