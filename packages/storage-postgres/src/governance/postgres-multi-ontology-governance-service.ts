/**
 * PostgreSQL multi-ontology governance — spaces, ontologies, cross-org sharing.
 *
 * Three tables, and the third is an access-control surface: a sharing rule says
 * which other org may reach which ontologies in a space, and under which
 * markings. `checkAccess` and `resolveAccessibleOntologies` answer from it.
 *
 * ── What is at stake, stated accurately ──
 *
 * Losing this state is **loud, not silent**, which makes it unusual among the
 * services converted so far. The evaluation fails closed: with no space, no
 * rule, or no matching rule the answer is `allowed: false`. So a lost sharing
 * rule costs a partner org its access rather than handing anyone more. It is
 * still worth persisting — a cross-org arrangement that evaporates on restart
 * takes the record of who granted it with it — but nobody should read this
 * conversion as closing a fail-open hole, because there wasn't one.
 *
 * The decision itself is NOT reimplemented here. Whether a caller may reach an
 * ontology is a pure function of the ontology, its space and the rules on that
 * space, so it lives in @altius/spi's ontology-access and both providers call
 * it. This is the strongest case in the codebase for that pattern: two
 * providers disagreeing about ordering returns rows in a surprising order, but
 * two providers disagreeing about an access check means one deployment granting
 * cross-org access the other denies, with neither looking wrong from where it
 * stands.
 *
 * ── Two shapes matched rather than tightened ──
 *
 * A space's `ontologyIds` is derived here from the ontologies table rather than
 * stored, so there is one source of truth instead of an array that can drift
 * from the rows it names. The in-memory service maintains the array by hand on
 * create and delete, which produces the same set — the difference is only that
 * this one cannot go stale.
 *
 * Space names are not unique, in either provider. `createSpace` does not check,
 * so two spaces can share a name and `getSpaceByName` returns one of them; here
 * that is the most recently created, which is what the in-memory name map also
 * ends up holding. No UNIQUE constraint is added, because a constraint would
 * reject writes the other provider accepts.
 *
 * No array columns: `markings`, `ontology_ids`, `allowed_markings` and
 * `shared_with_orgs` are all JSONB, where JSON.stringify is the correct
 * binding (see #19).
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { evaluateOntologyAccess } from '@altius/spi';
import type {
  MultiOntologyGovernanceService,
  OntologySpace,
  CreateSpaceInput,
  OntologyEntity,
  CreateOntologyInput,
  SharingRule,
  CreateSharingRuleInput,
  OntologyAccessResult,
  RequestContext,
} from '@altius/spi';

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  return (typeof v === 'string' ? JSON.parse(v) : v) as T;
}

function mapOntology(r: Record<string, unknown>): OntologyEntity {
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    name: String(r['name']),
    displayName: String(r['display_name'] ?? ''),
    spaceId: String(r['space_id']),
    schemaVersion: Number(r['schema_version'] ?? 1),
    markings: parseJson<string[]>(r['markings'], []),
    readOnly: r['read_only'] === true,
    orgScope: String(r['org_scope'] ?? ''),
    createdAt: toIso(r['created_at']),
    updatedAt: toIso(r['updated_at']),
    createdBy: String(r['created_by'] ?? ''),
  };
}

function mapRule(r: Record<string, unknown>): SharingRule {
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    sourceSpaceId: String(r['source_space_id']),
    targetOrgScope: String(r['target_org_scope']),
    ontologyIds: parseJson<string[]>(r['ontology_ids'], []),
    allowedMarkings: parseJson<string[]>(r['allowed_markings'], []),
    bidirectional: r['bidirectional'] === true,
    createdAt: toIso(r['created_at']),
    createdBy: String(r['created_by'] ?? ''),
    enabled: r['enabled'] === true,
  };
}

export class PostgresMultiOntologyGovernanceService implements MultiOntologyGovernanceService {
  constructor(private readonly pool: Pool) {}

  // ── Spaces ────────────────────────────────────────────────────────────────

  async createSpace(ctx: RequestContext, input: CreateSpaceInput): Promise<OntologySpace> {
    const r = await this.pool.query(
      `INSERT INTO "governance"."ontology_spaces"
         ("id","tenant_id","name","description","org_scope","shared",
          "shared_with_orgs","default_markings","created_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        randomUUID(), ctx.tenantId, input.name, input.description ?? '',
        input.orgScope, input.shared ?? false,
        input.sharedWithOrgs ? JSON.stringify(input.sharedWithOrgs) : null,
        JSON.stringify(input.defaultMarkings ?? []),
        new Date().toISOString(), ctx.actorId ?? 'system',
      ],
    );
    // A new space owns nothing yet, so the derived list is empty without a read.
    return this.mapSpace(r.rows[0]!, []);
  }

  async getSpace(ctx: RequestContext, id: string): Promise<OntologySpace | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."ontology_spaces" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
    if (!r.rows[0]) return null;
    return this.mapSpace(r.rows[0], await this.ontologyIdsFor(ctx, id));
  }

  async getSpaceByName(ctx: RequestContext, name: string): Promise<OntologySpace | null> {
    // Names are not unique in either provider; the most recent wins, which is
    // what the in-memory name map ends up holding after a second create.
    const r = await this.pool.query(
      `SELECT * FROM "governance"."ontology_spaces"
        WHERE "tenant_id"=$1 AND "name"=$2 ORDER BY "seq" DESC LIMIT 1`,
      [ctx.tenantId, name],
    );
    if (!r.rows[0]) return null;
    return this.mapSpace(r.rows[0], await this.ontologyIdsFor(ctx, String(r.rows[0]['id'])));
  }

  async listSpaces(ctx: RequestContext, orgScope?: string): Promise<OntologySpace[]> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."ontology_spaces" WHERE "tenant_id"=$1 ORDER BY "seq"`,
      [ctx.tenantId],
    );
    const rows = orgScope
      // A space is visible to an org either because it owns it, or because it is
      // shared and names that org. Filtered in JS rather than SQL because the
      // second half reads inside a JSONB array, and doing it here keeps the
      // condition textually identical to the in-memory one.
      ? r.rows.filter((row: Record<string, unknown>) =>
          String(row['org_scope']) === orgScope ||
          (row['shared'] === true && parseJson<string[]>(row['shared_with_orgs'], []).includes(orgScope)))
      : r.rows;
    const out: OntologySpace[] = [];
    for (const row of rows) out.push(this.mapSpace(row, await this.ontologyIdsFor(ctx, String(row['id']))));
    return out;
  }

  async updateSpace(ctx: RequestContext, id: string, updates: Partial<CreateSpaceInput>): Promise<OntologySpace> {
    const current = await this.requireSpace(ctx, id);
    const r = await this.pool.query(
      `UPDATE "governance"."ontology_spaces"
          SET "name"=$3, "description"=$4, "org_scope"=$5, "shared"=$6,
              "shared_with_orgs"=$7, "default_markings"=$8
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [
        ctx.tenantId, id,
        updates.name ?? current.name,
        updates.description ?? current.description,
        updates.orgScope ?? current.orgScope,
        updates.shared ?? current.shared,
        (updates.sharedWithOrgs ?? current.sharedWithOrgs)
          ? JSON.stringify(updates.sharedWithOrgs ?? current.sharedWithOrgs)
          : null,
        JSON.stringify(updates.defaultMarkings ?? current.defaultMarkings),
      ],
    );
    return this.mapSpace(r.rows[0]!, await this.ontologyIdsFor(ctx, id));
  }

  async deleteSpace(ctx: RequestContext, id: string): Promise<void> {
    // Deliberately does NOT cascade to the ontologies in the space, matching the
    // in-memory service. Those ontologies are then orphaned and `checkAccess`
    // throws for them — a sharp edge, reproduced rather than smoothed, because
    // cascading would delete rows the other provider keeps.
    await this.pool.query(
      `DELETE FROM "governance"."ontology_spaces" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
  }

  // ── Ontology entities ─────────────────────────────────────────────────────

  async createOntology(ctx: RequestContext, input: CreateOntologyInput): Promise<OntologyEntity> {
    const space = await this.requireSpace(ctx, input.spaceId);
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO "governance"."ontology_entities"
         ("id","tenant_id","name","display_name","space_id","schema_version",
          "markings","read_only","org_scope","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)
       RETURNING *`,
      [
        randomUUID(), ctx.tenantId, input.name, input.displayName ?? input.name,
        input.spaceId, input.schemaVersion ?? 1,
        // Markings fall back to the space's defaults, so an ontology created
        // without them still inherits the space's classification.
        JSON.stringify(input.markings ?? space.defaultMarkings),
        input.readOnly ?? false,
        // Org scope is inherited from the space and not settable per ontology.
        space.orgScope,
        now, ctx.actorId ?? 'system',
      ],
    );
    return mapOntology(r.rows[0]!);
  }

  async getOntology(ctx: RequestContext, id: string): Promise<OntologyEntity | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."ontology_entities" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
    return r.rows[0] ? mapOntology(r.rows[0]) : null;
  }

  async getOntologyByName(ctx: RequestContext, spaceId: string, name: string): Promise<OntologyEntity | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."ontology_entities"
        WHERE "tenant_id"=$1 AND "space_id"=$2 AND "name"=$3 ORDER BY "seq" LIMIT 1`,
      [ctx.tenantId, spaceId, name],
    );
    return r.rows[0] ? mapOntology(r.rows[0]) : null;
  }

  async listOntologies(ctx: RequestContext, spaceId?: string): Promise<OntologyEntity[]> {
    const params: unknown[] = [ctx.tenantId];
    let sql = `SELECT * FROM "governance"."ontology_entities" WHERE "tenant_id"=$1`;
    if (spaceId) { params.push(spaceId); sql += ` AND "space_id"=$${params.length}`; }
    sql += ` ORDER BY "seq"`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapOntology);
  }

  async updateOntology(ctx: RequestContext, id: string, updates: Partial<CreateOntologyInput>): Promise<OntologyEntity> {
    const current = await this.requireOntology(ctx, id);
    // `spaceId` is not updatable, matching the in-memory service: moving an
    // ontology between spaces would move it between org scopes, which is an
    // access change dressed up as an edit.
    const r = await this.pool.query(
      `UPDATE "governance"."ontology_entities"
          SET "name"=$3, "display_name"=$4, "schema_version"=$5,
              "markings"=$6, "read_only"=$7, "updated_at"=$8
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [
        ctx.tenantId, id,
        updates.name ?? current.name,
        updates.displayName ?? current.displayName,
        updates.schemaVersion ?? current.schemaVersion,
        JSON.stringify(updates.markings ?? current.markings),
        updates.readOnly ?? current.readOnly,
        new Date().toISOString(),
      ],
    );
    return mapOntology(r.rows[0]!);
  }

  async deleteOntology(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "governance"."ontology_entities" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
  }

  // ── Sharing rules ─────────────────────────────────────────────────────────

  async createSharingRule(ctx: RequestContext, input: CreateSharingRuleInput): Promise<SharingRule> {
    const r = await this.pool.query(
      `INSERT INTO "governance"."sharing_rules"
         ("id","tenant_id","source_space_id","target_org_scope","ontology_ids",
          "allowed_markings","bidirectional","enabled","created_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        randomUUID(), ctx.tenantId, input.sourceSpaceId, input.targetOrgScope,
        JSON.stringify(input.ontologyIds ?? []),
        JSON.stringify(input.allowedMarkings ?? []),
        input.bidirectional ?? false,
        // A rule you bothered to write is presumed to be one you want in force.
        input.enabled ?? true,
        new Date().toISOString(), ctx.actorId ?? 'system',
      ],
    );
    return mapRule(r.rows[0]!);
  }

  async getSharingRule(ctx: RequestContext, id: string): Promise<SharingRule | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."sharing_rules" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
    return r.rows[0] ? mapRule(r.rows[0]) : null;
  }

  async listSharingRules(ctx: RequestContext, sourceSpaceId?: string): Promise<SharingRule[]> {
    const params: unknown[] = [ctx.tenantId];
    let sql = `SELECT * FROM "governance"."sharing_rules" WHERE "tenant_id"=$1`;
    if (sourceSpaceId) { params.push(sourceSpaceId); sql += ` AND "source_space_id"=$${params.length}`; }
    // `seq` rather than `created_at`: rules are evaluated in list order and the
    // first match wins, so the order has to be a total one — two rules written
    // in the same millisecond must not swap places between calls and change
    // which rule an access grant is attributed to.
    sql += ` ORDER BY "seq"`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapRule);
  }

  async updateSharingRule(ctx: RequestContext, id: string, updates: Partial<CreateSharingRuleInput>): Promise<SharingRule> {
    const current = await this.requireRule(ctx, id);
    // `sourceSpaceId` is not updatable, matching the in-memory service.
    const r = await this.pool.query(
      `UPDATE "governance"."sharing_rules"
          SET "target_org_scope"=$3, "ontology_ids"=$4, "allowed_markings"=$5,
              "bidirectional"=$6, "enabled"=$7
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [
        ctx.tenantId, id,
        updates.targetOrgScope ?? current.targetOrgScope,
        JSON.stringify(updates.ontologyIds ?? current.ontologyIds),
        JSON.stringify(updates.allowedMarkings ?? current.allowedMarkings),
        updates.bidirectional ?? current.bidirectional,
        updates.enabled ?? current.enabled,
      ],
    );
    return mapRule(r.rows[0]!);
  }

  async deleteSharingRule(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "governance"."sharing_rules" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
  }

  // ── Access checks ─────────────────────────────────────────────────────────

  async checkAccess(ctx: RequestContext, ontologyId: string, callerOrgScope: string): Promise<OntologyAccessResult> {
    const ontology = await this.getOntology(ctx, ontologyId);
    if (!ontology) throw new Error(`Ontology not found: ${ontologyId}`);
    const space = await this.getSpace(ctx, ontology.spaceId);
    if (!space) throw new Error(`Space not found: ${ontology.spaceId}`);
    // Shared with the in-memory provider — see the header.
    return evaluateOntologyAccess(
      ontology,
      space,
      await this.listSharingRules(ctx, space.id),
      callerOrgScope,
    );
  }

  async resolveAccessibleOntologies(ctx: RequestContext, callerOrgScope: string): Promise<OntologyEntity[]> {
    const all = await this.listOntologies(ctx);
    const accessible: OntologyEntity[] = [];
    for (const o of all) {
      // Checked one at a time rather than joined, so this answers identically
      // to calling checkAccess on each — including the throw on an ontology
      // whose space is gone.
      const result = await this.checkAccess(ctx, o.id, callerOrgScope);
      if (result.allowed) accessible.push(o);
    }
    return accessible;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private mapSpace(r: Record<string, unknown>, ontologyIds: string[]): OntologySpace {
    const sharedWith = r['shared_with_orgs'];
    return {
      id: String(r['id']),
      tenantId: String(r['tenant_id']),
      name: String(r['name']),
      description: String(r['description'] ?? ''),
      orgScope: String(r['org_scope']),
      shared: r['shared'] === true,
      // Omitted rather than set to undefined, so a space round-trips to the
      // same shape the in-memory service returns.
      ...(sharedWith === null || sharedWith === undefined
        ? {}
        : { sharedWithOrgs: parseJson<string[]>(sharedWith, []) }),
      ontologyIds,
      defaultMarkings: parseJson<string[]>(r['default_markings'], []),
      createdAt: toIso(r['created_at']),
      createdBy: String(r['created_by'] ?? ''),
    };
  }

  /** Derived rather than stored — one source of truth for what a space holds. */
  private async ontologyIdsFor(ctx: RequestContext, spaceId: string): Promise<string[]> {
    const r = await this.pool.query(
      `SELECT "id" FROM "governance"."ontology_entities"
        WHERE "tenant_id"=$1 AND "space_id"=$2 ORDER BY "seq"`,
      [ctx.tenantId, spaceId],
    );
    return r.rows.map((row: Record<string, unknown>) => String(row['id']));
  }

  private async requireSpace(ctx: RequestContext, id: string): Promise<OntologySpace> {
    const found = await this.getSpace(ctx, id);
    if (!found) throw new Error(`Space not found: ${id}`);
    return found;
  }

  private async requireOntology(ctx: RequestContext, id: string): Promise<OntologyEntity> {
    const found = await this.getOntology(ctx, id);
    if (!found) throw new Error(`Ontology not found: ${id}`);
    return found;
  }

  private async requireRule(ctx: RequestContext, id: string): Promise<SharingRule> {
    const found = await this.getSharingRule(ctx, id);
    if (!found) throw new Error(`Sharing rule not found: ${id}`);
    return found;
  }
}
