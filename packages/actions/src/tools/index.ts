/**
 * Tool registry module (Section 5.7).
 *
 * Provides AI agents with discoverable tool descriptors for actions
 * and supports agent execution mode with dry-run and policy guards.
 */

export { ToolRegistry } from './tool-registry.js';
export type { ToolRegistryConfig } from './tool-registry.js';

export type {
  ToolDescriptor,
  ToolKind,
  ToolFilter,
  JsonSchema,
  AgentContext,
  AgentExecutionResult,
  PolicyGuard,
  PolicyGuardResult,
  RiskLevel,
} from './types.js';

// Concrete PolicyGuard implementation with hold/approval workflow
export { HoldApprovePolicyGuard } from './hold-approve-policy-guard.js';
export type {
  HoldRecord,
  HoldStatus,
  HoldApprovePolicyGuardConfig,
} from './hold-approve-policy-guard.js';
