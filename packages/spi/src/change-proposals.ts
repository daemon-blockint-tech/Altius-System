/**
 * Human-in-the-loop change proposals for AI-driven modifications.
 *
 * When an AI agent wants to make changes to the ontology or data, it submits
 * a proposal rather than executing directly. A human reviewer can then
 * approve, reject, or request changes before the proposal is applied.
 *
 * This connects the existing PolicyGuard/holdId mechanism to a persistent
 * proposal store with a full approval workflow.
 */

// ---------------------------------------------------------------------------
// Proposal types
// ---------------------------------------------------------------------------

/** The kind of change being proposed. */
export type ProposalType =
  | 'ontology_schema'    // add/modify/remove object types, fields, links
  | 'action_definition'  // add/modify/remove actions
  | 'function_definition' // add/modify/remove functions
  | 'data_modification'  // create/update/delete objects
  | 'permission_change'  // modify roles, relations, markings
  | 'configuration';     // platform configuration changes

/** The lifecycle state of a proposal. */
export type ProposalState =
  | 'draft'        // being composed by the AI
  | 'submitted'    // awaiting human review
  | 'under_review' // a reviewer has claimed it
  | 'changes_requested' // reviewer asked for revisions
  | 'approved'     // approved, ready to apply
  | 'rejected'     // rejected by reviewer
  | 'applied'      // changes have been applied
  | 'withdrawn';   // withdrawn by the proposer

/** A single change operation within a proposal. */
export interface ProposalChange {
  /** Operation type. */
  op: 'create' | 'update' | 'delete';
  /** Resource type being changed (e.g. 'ObjectType', 'Action', 'object'). */
  resourceType: string;
  /** Resource identifier (e.g. type name or object ID). */
  resourceId: string;
  /** The proposed new value (for create/update). */
  value?: unknown;
  /** A human-readable description of this change. */
  description: string;
}

/** A change proposal. */
export interface ChangeProposal {
  /** Proposal ID (UUID). */
  id: string;
  /** Tenant ID. */
  tenantId: string;
  /** Proposal title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** The type of change. */
  type: ProposalType;
  /** The proposed changes. */
  changes: ProposalChange[];
  /** Current state. */
  state: ProposalState;
  /** Who submitted the proposal (AI agent ID or user ID). */
  submittedBy: string;
  /** Whether the submitter is an AI agent. */
  submittedByAI: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 submission timestamp. */
  submittedAt?: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  /** Who is reviewing the proposal. */
  reviewerId?: string;
  /** Reviewer comments. */
  reviewerComments?: string;
  /** ISO 8601 review decision timestamp. */
  reviewedAt?: string;
  /** ISO 8601 application timestamp. */
  appliedAt?: string;
  /** Risk level assessed by the policy guard. */
  riskLevel?: 'low' | 'medium' | 'high';
  /** The hold ID from the policy guard (if applicable). */
  holdId?: string;
  /** Tags for categorization. */
  tags?: string[];
}

/** Input for creating a proposal. */
export interface CreateProposalInput {
  title: string;
  description: string;
  type: ProposalType;
  changes: ProposalChange[];
  submittedByAI?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
  holdId?: string;
  tags?: string[];
}

/** Input for updating a proposal. */
export interface UpdateProposalInput {
  title?: string;
  description?: string;
  changes?: ProposalChange[];
  tags?: string[];
}

/** Query for proposals. */
export interface ProposalQuery {
  state?: ProposalState;
  type?: ProposalType;
  submittedBy?: string;
  reviewerId?: string;
  submittedByAI?: boolean;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

/**
 * Change proposal store — manages the lifecycle of AI-driven change proposals.
 */
export interface ChangeProposalStore {
  /** Create a new proposal in draft state. */
  create(tenantId: string, submittedBy: string, input: CreateProposalInput): Promise<ChangeProposal>;

  /** Get a proposal by ID. */
  get(tenantId: string, proposalId: string): Promise<ChangeProposal | null>;

  /** List proposals with optional filtering. */
  list(tenantId: string, query?: ProposalQuery): Promise<{ proposals: ChangeProposal[]; totalCount: number }>;

  /** Update a draft proposal. */
  update(tenantId: string, proposalId: string, input: UpdateProposalInput): Promise<ChangeProposal>;

  /** Submit a draft proposal for review. */
  submit(tenantId: string, proposalId: string): Promise<ChangeProposal>;

  /** Claim a proposal for review. */
  claimForReview(tenantId: string, proposalId: string, reviewerId: string): Promise<ChangeProposal>;

  /** Approve a proposal. */
  approve(tenantId: string, proposalId: string, reviewerId: string, comments?: string): Promise<ChangeProposal>;

  /** Reject a proposal. */
  reject(tenantId: string, proposalId: string, reviewerId: string, comments?: string): Promise<ChangeProposal>;

  /** Request changes to a proposal. */
  requestChanges(tenantId: string, proposalId: string, reviewerId: string, comments: string): Promise<ChangeProposal>;

  /** Mark a proposal as applied. */
  markApplied(tenantId: string, proposalId: string): Promise<ChangeProposal>;

  /** Withdraw a proposal. */
  withdraw(tenantId: string, proposalId: string): Promise<ChangeProposal>;

  /** Get proposals awaiting review for a reviewer. */
  getPendingReview(tenantId: string, reviewerId: string): Promise<ChangeProposal[]>;
}
