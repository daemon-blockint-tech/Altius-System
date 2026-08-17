/**
 * Platform governance: approval workflows with ABAC, cross-app commands, and kiosk mode.
 *
 * Three capabilities:
 *   1. Approval/proposal workflows with attribute-based submission criteria
 *   2. Cross-application commands (declared client-side operations, command chains)
 *   3. Kiosk mode (long-lived, read-only, permission-scoped display sessions)
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// 1. Approval workflows with ABAC
// ===========================================================================

/** An attribute condition for ABAC. */
export interface AttributeCondition {
  /** The attribute name (e.g. 'department', 'role', 'clearance'). */
  attribute: string;
  /** The operator. */
  operator: 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists';
  /** The expected value. */
  value?: unknown;
  values?: unknown[];
}

/** A submission criterion — ABAC rules that must be met to submit a proposal. */
export interface SubmissionCriterion {
  id: string;
  name: string;
  description: string;
  /** The action type this criterion applies to. */
  actionType: string;
  /** User attributes that must be met. */
  userAttributes: AttributeCondition[];
  /** Resource attributes that must be met. */
  resourceAttributes: AttributeCondition[];
  /** Environment attributes (time, IP, etc.). */
  environmentAttributes: AttributeCondition[];
  /** Whether all conditions must pass (AND) or any (OR). */
  matchMode: 'all' | 'any';
  /** Whether a second reviewer is required. */
  requiresSecondReviewer: boolean;
  /** Minimum risk level that triggers this criterion. */
  minRiskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

/** An approval workflow. */
export interface ApprovalWorkflow {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  /** The action type this workflow governs. */
  actionType: string;
  /** Submission criteria. */
  criteria: SubmissionCriterion[];
  /** Approver attributes — who can approve. */
  approverAttributes: AttributeCondition[];
  /** Whether multi-step approval is required. */
  multiStep: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  enabled: boolean;
}

/** A submission for approval. */
export interface ApprovalSubmission {
  id: string;
  tenantId: string;
  workflowId: string;
  actionType: string;
  /** The proposed action parameters. */
  parameters: Record<string, unknown>;
  /** The submitter's attributes at time of submission. */
  submitterAttributes: Record<string, unknown>;
  /** The resource attributes. */
  resourceAttributes: Record<string, unknown>;
  /** Risk level. */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Submission state. */
  state: 'pending' | 'approved' | 'rejected' | 'expired' | 'withdrawn';
  /** ISO 8601 submission timestamp. */
  submittedAt: string;
  /** ISO 8601 decision timestamp. */
  decidedAt?: string;
  /** Who submitted. */
  submittedBy: string;
  /** Who approved/rejected. */
  decidedBy?: string;
  /** Decision notes. */
  decisionNotes?: string;
  /** Whether the submission passed ABAC criteria. */
  criteriaPassed: boolean;
  /** Criteria evaluation details. */
  criteriaDetails: Array<{ criterionName: string; passed: boolean; reason: string }>;
}

// ===========================================================================
// 2. Cross-application commands
// ===========================================================================

/** A command — a declared client-side operation. */
export interface AppCommand {
  id: string;
  tenantId: string;
  /** Command name. */
  name: string;
  /** Display label. */
  label: string;
  /** Description. */
  description: string;
  /** The application that declares this command. */
  sourceApp: string;
  /** Command icon (optional). */
  icon?: string;
  /** Input parameter schema (JSON Schema). */
  inputSchema: Record<string, unknown>;
  /** Output schema (JSON Schema). */
  outputSchema: Record<string, unknown>;
  /** Whether this command is available as a chatbot tool. */
  availableAsTool: boolean;
  /** Whether this command can be chained. */
  chainable: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  createdBy: string;
  enabled: boolean;
}

/** A command chain — a sequence of commands to execute. */
export interface CommandChain {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  /** Steps in the chain. */
  steps: Array<{
    commandId: string;
    /** Input mapping from previous step outputs. */
    inputMapping: Record<string, string>;
    /** Static inputs. */
    staticInputs?: Record<string, unknown>;
  }>;
  createdAt: string;
  createdBy: string;
  enabled: boolean;
}

/** The result of executing a command chain. */
export interface CommandChainResult {
  chainId: string;
  success: boolean;
  stepResults: Array<{
    commandId: string;
    success: boolean;
    output?: Record<string, unknown>;
    errorMessage?: string;
  }>;
  finalOutput?: Record<string, unknown>;
  executedAt: string;
  durationMs: number;
}

// ===========================================================================
// 3. Kiosk mode
// ===========================================================================

/** A kiosk session — a long-lived, read-only, permission-scoped display session. */
export interface KioskSession {
  id: string;
  tenantId: string;
  /** The kiosk name/label. */
  name: string;
  /** The display location (e.g. 'lobby-screen-1'). */
  location: string;
  /** The user/identity for the kiosk. */
  kioskUserId: string;
  /** Permission scope — what the kiosk can see. */
  permissions: {
    objectTypes: string[];
    objectIds?: string[];
    filters?: Record<string, unknown>;
    readOnly: true;
  };
  /** Session state. */
  state: 'active' | 'expired' | 'revoked';
  /** ISO 8601 start time. */
  startedAt: string;
  /** ISO 8601 expiry time. */
  expiresAt: string;
  /** ISO 8601 last activity time. */
  lastActivityAt: string;
  /** Whether the kiosk is admin-allowlisted. */
  adminAllowlisted: boolean;
  /** Session launch history. */
  launchHistory: Array<{
    timestamp: string;
    action: 'started' | 'refreshed' | 'expired' | 'revoked';
  }>;
  /** Allowed CORS origins for this kiosk. */
  allowedOrigins?: string[];
}

/** Input for creating a kiosk session. */
export interface CreateKioskInput {
  name: string;
  location: string;
  kioskUserId: string;
  permissions: KioskSession['permissions'];
  /** Duration in seconds until expiry. */
  durationSeconds: number;
  allowedOrigins?: string[];
}

// ===========================================================================
// Service interfaces
// ===========================================================================

/**
 * Approval workflow service — manages ABAC-governed approval workflows.
 */
export interface ApprovalWorkflowService {
  createWorkflow(ctx: RequestContext, input: Omit<ApprovalWorkflow, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<ApprovalWorkflow>;
  getWorkflow(ctx: RequestContext, workflowId: string): Promise<ApprovalWorkflow | null>;
  listWorkflows(ctx: RequestContext, actionType?: string): Promise<ApprovalWorkflow[]>;
  updateWorkflow(ctx: RequestContext, workflowId: string, updates: Partial<ApprovalWorkflow>): Promise<ApprovalWorkflow>;
  deleteWorkflow(ctx: RequestContext, workflowId: string): Promise<void>;

  /** Submit a proposal for approval (evaluates ABAC criteria). */
  submit(ctx: RequestContext, workflowId: string, params: {
    parameters: Record<string, unknown>;
    submitterAttributes: Record<string, unknown>;
    resourceAttributes: Record<string, unknown>;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<ApprovalSubmission>;

  /** Approve a submission. */
  approve(ctx: RequestContext, submissionId: string, notes?: string): Promise<ApprovalSubmission>;

  /** Reject a submission. */
  reject(ctx: RequestContext, submissionId: string, notes: string): Promise<ApprovalSubmission>;

  /** Withdraw a submission. */
  withdraw(ctx: RequestContext, submissionId: string): Promise<ApprovalSubmission>;

  /** List submissions. */
  listSubmissions(ctx: RequestContext, state?: ApprovalSubmission['state']): Promise<ApprovalSubmission[]>;

  /** Get a submission. */
  getSubmission(ctx: RequestContext, submissionId: string): Promise<ApprovalSubmission | null>;
}

/**
 * Cross-application command service.
 */
export interface CommandService {
  registerCommand(ctx: RequestContext, input: Omit<AppCommand, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>): Promise<AppCommand>;
  getCommand(ctx: RequestContext, commandId: string): Promise<AppCommand | null>;
  listCommands(ctx: RequestContext, sourceApp?: string): Promise<AppCommand[]>;
  deleteCommand(ctx: RequestContext, commandId: string): Promise<void>;

  createChain(ctx: RequestContext, input: Omit<CommandChain, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>): Promise<CommandChain>;
  getChain(ctx: RequestContext, chainId: string): Promise<CommandChain | null>;
  listChains(ctx: RequestContext): Promise<CommandChain[]>;
  executeChain(ctx: RequestContext, chainId: string, initialInputs: Record<string, unknown>, executor: (commandId: string, inputs: Record<string, unknown>) => Promise<Record<string, unknown>>): Promise<CommandChainResult>;
  deleteChain(ctx: RequestContext, chainId: string): Promise<void>;
}

/**
 * Kiosk mode service.
 */
export interface KioskService {
  createSession(ctx: RequestContext, input: CreateKioskInput): Promise<KioskSession>;
  getSession(ctx: RequestContext, sessionId: string): Promise<KioskSession | null>;
  listSessions(ctx: RequestContext, state?: KioskSession['state']): Promise<KioskSession[]>;
  revokeSession(ctx: RequestContext, sessionId: string): Promise<void>;
  refreshSession(ctx: RequestContext, sessionId: string): Promise<KioskSession>;
  /** Check if a kiosk session can access an object type. */
  canAccess(ctx: RequestContext, sessionId: string, objectType: string): Promise<boolean>;
  /** Expire sessions that have passed their expiry time. */
  expireStale(ctx: RequestContext): Promise<number>;
}
