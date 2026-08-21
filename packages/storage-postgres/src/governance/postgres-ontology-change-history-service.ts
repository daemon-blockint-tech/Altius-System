/**
 * PostgreSQL ontology change history — the record of who changed the schema.
 *
 * Each record is a version, a migration class, a diff summary, and a full
 * snapshot of the schema at that point. It is an audit trail, and it lived in a
 * `Map`, so #14's gate withheld the service under Postgres and its routes
 * answered 404.
 *
 * ── Two operations that do not do what they say ──
 *
 * `restore(id, objectType)` returns `{ restored: true }` and restores nothing.
 * It reads the record, checks it exists, and reports success. No schema is
 * rolled back, no object type is touched.
 *
 * `applyChange(id)` applies nothing to the ontology. It validates the record,
 * bumps that record's own `version` by one, restamps `appliedAt`, and reports
 * `{ applied: true }`. The schema is untouched.
 *
 * Both are the in-memory service's behaviour, reproduced exactly, because a
 * contract changes in both providers or neither. Being blunt about the
 * consequence: persisting these makes the *claim* durable, not the effect. A
 * stored record saying a change was applied at a given time is evidence that
 * this method ran, and nothing more. That is worth writing down, because a
 * persisted audit trail is more convincing than a transient one — and this one
 * is attesting to work that did not happen.
 *
 * ── One behaviour deliberately narrowed, in BOTH providers ──
 *
 * `saveChange` accepts either a new draft or a full record, and the full-record
 * form carries a `tenantId`. Honouring it here would mean a caller could write
 * a row into another tenant's history, because in a table the tenant is a
 * column rather than a map key — the in-memory service was insulated from that
 * only by keying its map on `ctx.tenantId`, which left the field free to lie.
 * So `tenantId` is taken from the request in both providers now. Matching the
 * old behaviour verbatim was not an option: it would have meant either shipping
 * a cross-tenant write here, or shipping a divergence between the two.
 *
 * No array columns: `snapshot` is JSONB, where JSON.stringify is correct.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  OntologyChangeHistoryService,
  OntologyChangeRecord,
  OntologyChangeHistoryQuery,
  OntologyChangeSave,
  OntologyRestoreResult,
  OntologyChangeValidationResult,
  OntologyChangeApplyResult,
  RequestContext,
} from '@altius/spi';

/** Supplies records from somewhere other than this table (e.g. the schema registry). */
export type SchemaHistoryReader = (ctx: RequestContext) => Promise<OntologyChangeRecord[]>;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function mapRecord(r: Record<string, unknown>): OntologyChangeRecord {
  const snapshot = r['snapshot'];
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    version: Number(r['version'] ?? 1),
    appliedAt: toIso(r['applied_at']),
    appliedBy: String(r['applied_by'] ?? ''),
    migrationClass: String(r['migration_class'] ?? ''),
    diffSummary: String(r['diff_summary'] ?? ''),
    snapshot: (typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot ?? {}) as Record<string, unknown>,
  };
}

/** The objectType filter, kept identical to the in-memory one down to the guards. */
function mentionsObjectType(record: OntologyChangeRecord, objectType: string): boolean {
  const types = record.snapshot['objectTypes'];
  if (!types || !Array.isArray(types)) return false;
  return (types as Array<{ name?: string }>).some(o => o?.name === objectType);
}

export class PostgresOntologyChangeHistoryService implements OntologyChangeHistoryService {
  constructor(
    private readonly pool: Pool,
    private readonly reader?: SchemaHistoryReader,
  ) {}

  async listChanges(ctx: RequestContext, query?: OntologyChangeHistoryQuery): Promise<OntologyChangeRecord[]> {
    const params: unknown[] = [ctx.tenantId];
    let sql = `SELECT * FROM "governance"."ontology_change_history" WHERE "tenant_id"=$1`;
    // The scalar filters push down; the objectType one cannot, because it
    // depends on the shape of the snapshot rather than a column, and doing it
    // in SQL would risk answering differently from the in-memory guard.
    if (query?.migrationClass) { params.push(query.migrationClass); sql += ` AND "migration_class"=$${params.length}`; }
    if (query?.fromVersion !== undefined) { params.push(query.fromVersion); sql += ` AND "version">=$${params.length}`; }
    if (query?.toVersion !== undefined) { params.push(query.toVersion); sql += ` AND "version"<=$${params.length}`; }
    // Highest version first, insertion order breaking ties. Ties are the norm,
    // not the exception: every record is created at version 1, so without
    // `seq` the order of a page of fresh records would be arbitrary — and the
    // in-memory sort is stable, so it returns them oldest-first within a
    // version.
    sql += ` ORDER BY "version" DESC, "seq"`;

    const r = await this.pool.query(sql, params);
    let list = r.rows.map(mapRecord);

    if (this.reader) {
      // Records the reader supplies are merged in, and a record already in the
      // table wins on id — same precedence as the in-memory service.
      const ids = new Set(list.map(x => x.id));
      for (const dynamic of await this.reader(ctx)) {
        if (!ids.has(dynamic.id)) list.push(dynamic);
      }
      list = list.filter(x => this.matchesScalarFilters(x, query));
      list.sort((a, b) => b.version - a.version);
    }

    if (query?.objectType) list = list.filter(x => mentionsObjectType(x, query.objectType!));

    // Paging is applied after filtering, matching the in-memory service — which
    // also means LIMIT cannot be pushed into SQL above without changing what a
    // page contains. For an audit trail that is the right trade; for a table
    // that grows without bound it is a ceiling worth knowing about.
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? 100;
    return list.slice(offset, offset + limit);
  }

  async getChange(ctx: RequestContext, id: string): Promise<OntologyChangeRecord | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."ontology_change_history" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
    return r.rows[0] ? mapRecord(r.rows[0]) : null;
  }

  async restore(ctx: RequestContext, id: string, objectType: string): Promise<OntologyRestoreResult> {
    const record = await this.getChange(ctx, id);
    if (!record) throw new Error(`Change record not found: ${id}`);
    // Reports success without restoring anything — see the header. Matched, not
    // fixed: making it real is a contract change, not a storage one.
    return {
      restored: true,
      changeId: record.id,
      objectType,
      version: record.version,
      appliedAt: new Date().toISOString(),
    };
  }

  async saveChange(ctx: RequestContext, input: OntologyChangeSave): Promise<OntologyChangeRecord> {
    if ('id' in input) {
      // Overwrite by id. `tenant_id` is bound from the request, never from the
      // record — see the header.
      const r = await this.pool.query(
        `INSERT INTO "governance"."ontology_change_history"
           ("id","tenant_id","version","applied_at","applied_by","migration_class","diff_summary","snapshot")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT ("tenant_id","id") DO UPDATE SET
           "version"=EXCLUDED."version",
           "applied_at"=EXCLUDED."applied_at",
           "applied_by"=EXCLUDED."applied_by",
           "migration_class"=EXCLUDED."migration_class",
           "diff_summary"=EXCLUDED."diff_summary",
           "snapshot"=EXCLUDED."snapshot"
         RETURNING *`,
        [
          input.id, ctx.tenantId, input.version, input.appliedAt,
          input.appliedBy, input.migrationClass, input.diffSummary,
          JSON.stringify(input.snapshot),
        ],
      );
      // The conflict target is (tenant_id, id), so the same id in two tenants is
      // two rows rather than a collision — which is what the in-memory service's
      // per-tenant map gives, and what makes an upsert here an upsert of *this*
      // tenant's record rather than someone else's.
      return mapRecord(r.rows[0]!);
    }

    const r = await this.pool.query(
      `INSERT INTO "governance"."ontology_change_history"
         ("id","tenant_id","version","applied_at","applied_by","migration_class","diff_summary","snapshot")
       VALUES ($1,$2,1,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        randomUUID(), ctx.tenantId, new Date().toISOString(),
        ctx.actorId ?? '', input.migrationClass, input.diffSummary ?? '',
        JSON.stringify(input.snapshot),
      ],
    );
    return mapRecord(r.rows[0]!);
  }

  async validateChange(ctx: RequestContext, id: string): Promise<OntologyChangeValidationResult> {
    const record = await this.getChange(ctx, id);
    // A missing record is invalid rather than an error, matching the in-memory
    // service: validate answers a question, it does not perform an action.
    if (!record) return { valid: false, errors: ['Change record not found'] };
    const errors: string[] = [];
    if (!record.migrationClass) errors.push('migrationClass is required');
    if (!record.snapshot || typeof record.snapshot !== 'object') errors.push('snapshot must be an object');
    return { valid: errors.length === 0, errors };
  }

  async applyChange(ctx: RequestContext, id: string): Promise<OntologyChangeApplyResult> {
    const record = await this.getChange(ctx, id);
    if (!record) throw new Error(`Change record not found: ${id}`);
    const validation = await this.validateChange(ctx, id);
    if (!validation.valid) throw new Error(`Change ${id} is not valid: ${validation.errors.join(', ')}`);
    const appliedAt = new Date().toISOString();
    // Bumps the record's own version and restamps it. The ontology is not
    // touched — see the header.
    const r = await this.pool.query(
      `UPDATE "governance"."ontology_change_history"
          SET "version"="version"+1, "applied_at"=$3
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [ctx.tenantId, id, appliedAt],
    );
    return { applied: true, changeId: id, version: Number(r.rows[0]!['version']), appliedAt };
  }

  private matchesScalarFilters(r: OntologyChangeRecord, query?: OntologyChangeHistoryQuery): boolean {
    if (query?.migrationClass && r.migrationClass !== query.migrationClass) return false;
    if (query?.fromVersion !== undefined && r.version < query.fromVersion) return false;
    if (query?.toVersion !== undefined && r.version > query.toVersion) return false;
    return true;
  }
}
