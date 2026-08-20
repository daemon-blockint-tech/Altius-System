/**
 * PostgreSQL change proposal store — human-in-the-loop governance.
 *
 * When an AI agent wants to change the ontology or the data it submits a
 * proposal instead of executing, and a human approves, rejects, or asks for
 * revisions. The record of who decided what, and when, is the audit trail for
 * every AI-driven change on the platform.
 *
 * That record lived in a `Map`. #14's gate withheld the store under Postgres
 * rather than let it accept approvals it would drop, so the routes answered
 * 404 — honest, and useless. This makes them work.
 *
 * The state machine is the in-memory service's, kept exactly: the same
 * transitions, the same guards, the same refusal messages. Where two providers
 * disagree about whether a transition is legal, the one a deployment happens to
 * be running decides whether a change was approved, which is not a difference
 * any audit trail can survive.
 *
 * `tags` is a genuine TEXT[] and is bound as a JS array. Passing
 * `JSON.stringify` there is the #19 defect: Postgres parses an array parameter
 * with array_in, which rejects `["a"]` as a malformed array literal, so every
 * write fails — and it fails for the empty and absent cases too, which is how
 * that defect took out two stores while their suites stayed green.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  ChangeProposalStore,
  ChangeProposal,
  ProposalChange,
  ProposalState,
  ProposalType,
  CreateProposalInput,
  UpdateProposalInput,
  ProposalQuery,
} from '@altius/spi';

/** TIMESTAMPTZ arrives as a Date; the SPI types every timestamp as an ISO string. */
function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function mapProposal(r: Record<string, unknown>): ChangeProposal {
  const changes = r['changes'];
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    title: String(r['title']),
    description: String(r['description'] ?? ''),
    type: r['type'] as ProposalType,
    changes: (typeof changes === 'string' ? JSON.parse(changes) : changes ?? []) as ProposalChange[],
    state: r['state'] as ProposalState,
    submittedBy: String(r['submitted_by'] ?? ''),
    submittedByAI: r['submitted_by_ai'] === true,
    createdAt: toIso(r['created_at'])!,
    updatedAt: toIso(r['updated_at'])!,
    // Optional fields are omitted rather than set to undefined so a proposal
    // round-trips to the same shape the in-memory store returns.
    ...(toIso(r['submitted_at']) ? { submittedAt: toIso(r['submitted_at'])! } : {}),
    ...(r['reviewer_id'] ? { reviewerId: String(r['reviewer_id']) } : {}),
    ...(r['reviewer_comments'] ? { reviewerComments: String(r['reviewer_comments']) } : {}),
    ...(toIso(r['reviewed_at']) ? { reviewedAt: toIso(r['reviewed_at'])! } : {}),
    ...(toIso(r['applied_at']) ? { appliedAt: toIso(r['applied_at'])! } : {}),
    ...(r['risk_level'] ? { riskLevel: r['risk_level'] as ChangeProposal['riskLevel'] } : {}),
    ...(r['hold_id'] ? { holdId: String(r['hold_id']) } : {}),
    ...(r['tags'] ? { tags: r['tags'] as string[] } : {}),
  };
}

export class PostgresChangeProposalStore implements ChangeProposalStore {
  constructor(private readonly pool: Pool) {}

  async create(tenantId: string, submittedBy: string, input: CreateProposalInput): Promise<ChangeProposal> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO "governance"."change_proposals"
         ("id","tenant_id","title","description","type","changes","state",
          "submitted_by","submitted_by_ai","created_at","updated_at",
          "risk_level","hold_id","tags")
       VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$9,$10,$11,$12)
       RETURNING *`,
      [
        id, tenantId, input.title, input.description ?? '', input.type,
        JSON.stringify(input.changes ?? []),
        submittedBy, input.submittedByAI ?? false, now,
        input.riskLevel ?? null, input.holdId ?? null,
        // TEXT[] — bound as an array, never JSON.stringify'd. See the header.
        input.tags ?? null,
      ],
    );
    return mapProposal(r.rows[0]!);
  }

  async get(tenantId: string, proposalId: string): Promise<ChangeProposal | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."change_proposals" WHERE "tenant_id"=$1 AND "id"=$2`,
      [tenantId, proposalId],
    );
    return r.rows[0] ? mapProposal(r.rows[0]) : null;
  }

  async list(tenantId: string, query?: ProposalQuery): Promise<{ proposals: ChangeProposal[]; totalCount: number }> {
    const where: string[] = [`"tenant_id"=$1`];
    const params: unknown[] = [tenantId];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace('$?', `$${params.length}`));
    };
    if (query?.state) add(`"state"=$?`, query.state);
    if (query?.type) add(`"type"=$?`, query.type);
    if (query?.submittedBy) add(`"submitted_by"=$?`, query.submittedBy);
    if (query?.reviewerId) add(`"reviewer_id"=$?`, query.reviewerId);
    if (query?.submittedByAI !== undefined) add(`"submitted_by_ai"=$?`, query.submittedByAI);
    if (query?.startTime) add(`"created_at" >= $?`, query.startTime);
    if (query?.endTime) add(`"created_at" <= $?`, query.endTime);
    const clause = where.join(' AND ');

    // totalCount is the size of the filtered set BEFORE paging, so a caller can
    // tell "20 of 300" from "20 of 20".
    const countR = await this.pool.query(
      `SELECT COUNT(*)::int AS c FROM "governance"."change_proposals" WHERE ${clause}`,
      params,
    );

    // `id` breaks ties on updated_at. Without it Postgres is free to return
    // equal-timestamped rows in any order, so a paged read could show one row
    // twice and miss another.
    let sql = `SELECT * FROM "governance"."change_proposals" WHERE ${clause} ORDER BY "updated_at" DESC, "id" DESC`;
    if (query?.offset) { params.push(query.offset); sql += ` OFFSET $${params.length}`; }
    if (query?.limit) { params.push(query.limit); sql += ` LIMIT $${params.length}`; }
    const r = await this.pool.query(sql, params);

    return { proposals: r.rows.map(mapProposal), totalCount: countR.rows[0]?.c ?? 0 };
  }

  async update(tenantId: string, proposalId: string, input: UpdateProposalInput): Promise<ChangeProposal> {
    const current = await this.require(tenantId, proposalId);
    this.assertState(current, ['draft', 'changes_requested'], 'update');
    const r = await this.pool.query(
      `UPDATE "governance"."change_proposals"
          SET "title"=$3, "description"=$4, "changes"=$5, "tags"=$6, "updated_at"=$7
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [
        tenantId, proposalId,
        input.title ?? current.title,
        input.description ?? current.description,
        JSON.stringify(input.changes ?? current.changes),
        input.tags ?? current.tags ?? null,
        new Date().toISOString(),
      ],
    );
    return mapProposal(r.rows[0]!);
  }

  async submit(tenantId: string, proposalId: string): Promise<ChangeProposal> {
    const current = await this.require(tenantId, proposalId);
    this.assertState(current, ['draft', 'changes_requested'], 'submit');
    const now = new Date().toISOString();
    // COALESCE keeps the first submission time across a
    // changes_requested → submitted round trip, matching the in-memory
    // `submittedAt ?? now`.
    const r = await this.pool.query(
      `UPDATE "governance"."change_proposals"
          SET "state"='submitted', "submitted_at"=COALESCE("submitted_at",$3), "updated_at"=$3
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [tenantId, proposalId, now],
    );
    return mapProposal(r.rows[0]!);
  }

  async claimForReview(tenantId: string, proposalId: string, reviewerId: string): Promise<ChangeProposal> {
    const current = await this.require(tenantId, proposalId);
    this.assertState(current, ['submitted'], 'claim');
    const r = await this.pool.query(
      `UPDATE "governance"."change_proposals"
          SET "state"='under_review', "reviewer_id"=$3, "updated_at"=$4
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [tenantId, proposalId, reviewerId, new Date().toISOString()],
    );
    return mapProposal(r.rows[0]!);
  }

  async approve(tenantId: string, proposalId: string, reviewerId: string, comments?: string): Promise<ChangeProposal> {
    return this.decide(tenantId, proposalId, reviewerId, comments, 'approved', 'approve');
  }

  async reject(tenantId: string, proposalId: string, reviewerId: string, comments?: string): Promise<ChangeProposal> {
    return this.decide(tenantId, proposalId, reviewerId, comments, 'rejected', 'reject');
  }

  async requestChanges(tenantId: string, proposalId: string, reviewerId: string, comments: string): Promise<ChangeProposal> {
    return this.decide(tenantId, proposalId, reviewerId, comments, 'changes_requested', 'request changes for');
  }

  async markApplied(tenantId: string, proposalId: string): Promise<ChangeProposal> {
    const current = await this.require(tenantId, proposalId);
    this.assertState(current, ['approved'], 'apply');
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."change_proposals"
          SET "state"='applied', "applied_at"=$3, "updated_at"=$3
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [tenantId, proposalId, now],
    );
    return mapProposal(r.rows[0]!);
  }

  async withdraw(tenantId: string, proposalId: string): Promise<ChangeProposal> {
    const current = await this.require(tenantId, proposalId);
    // Withdraw is the one guard expressed as a denylist rather than an
    // allowlist: anything may be withdrawn except a decision already carried
    // out or refused.
    if (current.state === 'applied' || current.state === 'rejected') {
      throw new Error(`Cannot withdraw proposal in state: ${current.state}`);
    }
    const r = await this.pool.query(
      `UPDATE "governance"."change_proposals"
          SET "state"='withdrawn', "updated_at"=$3
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [tenantId, proposalId, new Date().toISOString()],
    );
    return mapProposal(r.rows[0]!);
  }

  async getPendingReview(tenantId: string, reviewerId: string): Promise<ChangeProposal[]> {
    // Everything awaiting a decision this reviewer could make: unclaimed
    // submissions, plus what they have already claimed. Another reviewer's
    // in-flight review is deliberately not in the list.
    const r = await this.pool.query(
      `SELECT * FROM "governance"."change_proposals"
        WHERE "tenant_id"=$1
          AND ("state"='submitted' OR ("state"='under_review' AND "reviewer_id"=$2))
        ORDER BY "updated_at" DESC, "id" DESC`,
      [tenantId, reviewerId],
    );
    return r.rows.map(mapProposal);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async decide(
    tenantId: string,
    proposalId: string,
    reviewerId: string,
    comments: string | undefined,
    next: ProposalState,
    verb: string,
  ): Promise<ChangeProposal> {
    const current = await this.require(tenantId, proposalId);
    this.assertState(current, ['submitted', 'under_review'], verb);
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."change_proposals"
          SET "state"=$3, "reviewer_id"=$4, "reviewer_comments"=$5,
              "reviewed_at"=$6, "updated_at"=$6
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [tenantId, proposalId, next, reviewerId, comments ?? null, now],
    );
    return mapProposal(r.rows[0]!);
  }

  private async require(tenantId: string, proposalId: string): Promise<ChangeProposal> {
    const found = await this.get(tenantId, proposalId);
    if (!found) throw new Error(`Proposal not found: ${proposalId}`);
    return found;
  }

  private assertState(p: ChangeProposal, allowed: ProposalState[], verb: string): void {
    if (!allowed.includes(p.state)) {
      throw new Error(`Cannot ${verb} proposal in state: ${p.state}`);
    }
  }
}
