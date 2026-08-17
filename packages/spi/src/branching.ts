/**
 * Ontology branching store — manages branch lifecycle and merge.
 *
 * A branch is an isolated object graph. Writes on a branch are visible
 * only to reads on that branch until the branch is merged to its parent.
 *
 * The branching model:
 * - `main` is the default branch and always exists.
 * - A branch has a parent (usually `main`) and a base timestamp (the
 *   point at which it was forked).
 * - Writes on a branch create branch-local versions of objects.
 * - Reads on a branch see branch-local writes + parent state for
 *   objects not modified on the branch.
 * - Merge applies branch-local writes to the parent branch.
 *
 * The storage provider is responsible for branch-aware reads/writes.
 * This interface manages branch metadata and the merge workflow.
 */

/** A branch descriptor. */
export interface Branch {
  /** Branch name (unique within a tenant). */
  name: string;
  /** Parent branch name. */
  parent: string;
  /** Tenant ID. */
  tenantId: string;
  /** ISO 8601 timestamp when the branch was created. */
  createdAt: string;
  /** Actor who created the branch. */
  createdBy?: string;
  /** Branch status: open for writes, or merged/closed. */
  status: 'open' | 'merged' | 'abandoned';
  /** Optional description of the branch purpose. */
  description?: string;
  /** ISO 8601 timestamp when the branch was merged (if status is 'merged'). */
  mergedAt?: string;
}

/** A proposal to merge a branch into its parent. */
export interface MergeProposal {
  /** Proposal ID. */
  id: string;
  /** Branch being merged. */
  branchName: string;
  /** Target branch (usually the parent). */
  targetBranch: string;
  /** Tenant ID. */
  tenantId: string;
  /** Proposal status. */
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'merged';
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** Actor who created the proposal. */
  createdBy?: string;
  /** Actor who approved/rejected. */
  reviewedBy?: string;
  /** Review timestamp. */
  reviewedAt?: string;
  /** Review comment. */
  reviewComment?: string;
  /** Summary of changes in the proposal. */
  summary?: string;
}

/** Result of a merge operation. */
export interface MergeResult {
  /** Number of objects updated on the target branch. */
  objectsMerged: number;
  /** Number of links updated on the target branch. */
  linksMerged: number;
  /** Whether the merge was successful. */
  success: boolean;
  /** Error message if the merge failed. */
  error?: string;
}

/**
 * Branch store — manages branch metadata and merge proposals.
 *
 * The actual branch-aware data isolation is handled by the storage
 * provider (which reads `ctx.branch`). This interface manages the
 * branch lifecycle: create, list, merge, abandon.
 */
export interface BranchStore {
  /** Create a new branch. */
  createBranch(branch: Omit<Branch, 'createdAt' | 'status'> & { status?: Branch['status'] }): Promise<Branch>;

  /** Get a branch by name. */
  getBranch(tenantId: string, name: string): Promise<Branch | null>;

  /** List all branches for a tenant. */
  listBranches(tenantId: string): Promise<Branch[]>;

  /** Abandon a branch (marks it as abandoned, does not delete data). */
  abandonBranch(tenantId: string, name: string): Promise<void>;

  /** Merge a branch into its parent. */
  mergeBranch(
    tenantId: string,
    branchName: string,
    actorId?: string,
  ): Promise<MergeResult>;

  /** Create a merge proposal. */
  createProposal(proposal: Omit<MergeProposal, 'id' | 'createdAt' | 'status'> & { status?: MergeProposal['status'] }): Promise<MergeProposal>;

  /** Get a proposal by ID. */
  getProposal(tenantId: string, proposalId: string): Promise<MergeProposal | null>;

  /** List proposals for a tenant, optionally filtered by branch. */
  listProposals(tenantId: string, branchName?: string): Promise<MergeProposal[]>;

  /** Submit a draft proposal for review. */
  submitProposal(tenantId: string, proposalId: string): Promise<void>;

  /** Approve a proposal and merge the branch. */
  approveProposal(tenantId: string, proposalId: string, reviewerId: string, comment?: string): Promise<MergeResult>;

  /** Reject a proposal. */
  rejectProposal(tenantId: string, proposalId: string, reviewerId: string, comment?: string): Promise<void>;
}
