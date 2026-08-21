/**
 * PostgreSQL conflict resolution — data conflicts and the tenant's default strategy.
 *
 * A `DataConflict` is a datasource sync and a user edit disagreeing about one
 * field. Two pieces of state live here, and **both fail silently when lost**:
 *
 *   - unresolved conflicts — the queue of disagreements waiting on a decision.
 *     Lose it and the discrepancy is never surfaced: no error, no alert, just
 *     two systems quietly holding different values for the same field.
 *   - the default strategy — `getDefaultStrategy` falls back to
 *     `user_edits_win` when none is stored, so a tenant that chose
 *     `latest_value_wins` and lost it does not get an error after a restart.
 *     It gets the other answer, on every conflict, indefinitely.
 *
 * Both lived in a `Map`, so #14's gate withheld the service under Postgres and
 * its routes answered 404.
 *
 * Choosing the winning value is NOT reimplemented here. It is a pure function
 * of the conflict and the strategy, so it lives in @altius/spi's
 * conflict-resolution and both providers call it. The reason that matters more
 * here than elsewhere: the output of this function is *data*. Two providers
 * disagreeing about `latest_value_wins` would write different values into the
 * same field for the same conflict, and neither would error — the divergence
 * would surface much later, in the data, with nothing to say which deployment
 * produced it.
 *
 * ── JSONB, not TEXT, for the values ──
 *
 * A conflict can be over an object — the `merge` strategy exists precisely for
 * that case — so the three value columns are JSONB. That also keeps "no value"
 * and "the value null" distinguishable, which matters because resolving
 * `manual` without a value is legal and stores nothing.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolveConflictValue, DEFAULT_CONFLICT_STRATEGY } from '@altius/spi';
import type {
  ConflictResolutionService,
  ConflictStrategy,
  DataConflict,
  RequestContext,
} from '@altius/spi';

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

/**
 * A stored value and an absent one are both JS `null` once they come back.
 *
 * `undefined` binds as SQL NULL, and `null` binds as JSON null — and the pg
 * driver parses both to `null`, so the parsed value alone cannot tell "nothing
 * was stored" from "the value stored was null". Every read therefore also asks
 * Postgres `IS NULL` per column, and that boolean is what decides between them.
 *
 * The distinction is not academic here: a conflict resolved manually with no
 * value stores nothing, and a conflict never resolved at all stores nothing
 * either — but a conflict whose user value genuinely *is* null has to round-trip
 * as null rather than vanish.
 *
 * Note also that the driver returns JSONB already parsed. The `JSON.parse` this
 * codebase's other stores apply to a JSONB column is harmless there because
 * those columns only ever hold objects; here a column legitimately holds a bare
 * string, and parsing it a second time throws.
 */
function fromJsonb(value: unknown, isSqlNull: unknown): unknown {
  return isSqlNull === true ? undefined : value;
}

function toJsonb(v: unknown): string | null {
  return v === undefined ? null : JSON.stringify(v);
}

/**
 * Appended to every SELECT and RETURNING so the mapping can tell SQL NULL from
 * a stored JSON null. Kept in one place because forgetting it on one query
 * would silently turn a null value into an absent one.
 */
const NULL_FLAGS =
  `("datasource_value" IS NULL) AS "ds_is_null", ` +
  `("user_value" IS NULL) AS "uv_is_null", ` +
  `("resolved_value" IS NULL) AS "rv_is_null"`;

function mapConflict(r: Record<string, unknown>): DataConflict {
  const resolvedValue = fromJsonb(r['resolved_value'], r['rv_is_null']);
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    objectType: String(r['object_type']),
    objectId: String(r['object_id']),
    field: String(r['field']),
    datasourceValue: fromJsonb(r['datasource_value'], r['ds_is_null']),
    userValue: fromJsonb(r['user_value'], r['uv_is_null']),
    datasourceTimestamp: String(r['datasource_timestamp'] ?? ''),
    userTimestamp: String(r['user_timestamp'] ?? ''),
    // Omitted rather than set to undefined, so a conflict round-trips to the
    // same shape the in-memory service returns.
    ...(resolvedValue === undefined ? {} : { resolvedValue }),
    ...(r['resolved_by'] ? { resolvedBy: r['resolved_by'] as ConflictStrategy } : {}),
    resolved: r['resolved'] === true,
    detectedAt: toIso(r['detected_at']),
    ...(r['resolved_at'] ? { resolvedAt: toIso(r['resolved_at']) } : {}),
  } as DataConflict;
}

export class PostgresConflictResolutionService implements ConflictResolutionService {
  constructor(private readonly pool: Pool) {}

  async detect(
    ctx: RequestContext,
    conflict: Omit<DataConflict, 'id' | 'tenantId' | 'resolved' | 'detectedAt'>,
  ): Promise<DataConflict> {
    const r = await this.pool.query(
      `INSERT INTO "sync"."data_conflicts"
         ("id","tenant_id","object_type","object_id","field",
          "datasource_value","user_value","datasource_timestamp","user_timestamp",
          "resolved","detected_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10)
       RETURNING *, ${NULL_FLAGS}`,
      [
        randomUUID(), ctx.tenantId, conflict.objectType, conflict.objectId, conflict.field,
        toJsonb(conflict.datasourceValue), toJsonb(conflict.userValue),
        conflict.datasourceTimestamp, conflict.userTimestamp,
        new Date().toISOString(),
      ],
    );
    return mapConflict(r.rows[0]!);
  }

  async get(ctx: RequestContext, conflictId: string): Promise<DataConflict | null> {
    const r = await this.pool.query(
      `SELECT *, ${NULL_FLAGS} FROM "sync"."data_conflicts" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, conflictId],
    );
    return r.rows[0] ? mapConflict(r.rows[0]) : null;
  }

  async listUnresolved(ctx: RequestContext, objectType?: string): Promise<DataConflict[]> {
    const params: unknown[] = [ctx.tenantId];
    let sql = `SELECT *, ${NULL_FLAGS} FROM "sync"."data_conflicts" WHERE "tenant_id"=$1 AND "resolved"=FALSE`;
    if (objectType) { params.push(objectType); sql += ` AND "object_type"=$${params.length}`; }
    // Newest first, with `seq` breaking ties: two conflicts can be detected in
    // the same millisecond, and `detected_at` alone is not a total order.
    sql += ` ORDER BY "detected_at" DESC, "seq" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapConflict);
  }

  async resolve(
    ctx: RequestContext,
    conflictId: string,
    strategy: ConflictStrategy,
    manualValue?: unknown,
  ): Promise<DataConflict> {
    const conflict = await this.get(ctx, conflictId);
    if (!conflict) throw new Error(`Conflict not found: ${conflictId}`);
    if (conflict.resolved) throw new Error('Conflict already resolved');

    // Shared with the in-memory provider — see the header.
    const resolvedValue = resolveConflictValue(conflict, strategy, manualValue);

    // `resolved=FALSE` is repeated in the WHERE clause rather than relied upon
    // from the read above: two concurrent resolves of the same conflict would
    // otherwise both succeed, and the second would overwrite the first's
    // decision with a different strategy's answer.
    const r = await this.pool.query(
      `UPDATE "sync"."data_conflicts"
          SET "resolved_value"=$3, "resolved_by"=$4, "resolved"=TRUE, "resolved_at"=$5
        WHERE "tenant_id"=$1 AND "id"=$2 AND "resolved"=FALSE
        RETURNING *, ${NULL_FLAGS}`,
      [ctx.tenantId, conflictId, toJsonb(resolvedValue), strategy, new Date().toISOString()],
    );
    if (!r.rows[0]) throw new Error('Conflict already resolved');
    return mapConflict(r.rows[0]);
  }

  async autoResolve(
    ctx: RequestContext,
    strategy: ConflictStrategy,
  ): Promise<{ resolved: number; conflicts: DataConflict[] }> {
    const unresolved = await this.listUnresolved(ctx);
    const resolved: DataConflict[] = [];
    for (const c of unresolved) {
      resolved.push(await this.resolve(ctx, c.id, strategy));
    }
    return { resolved: resolved.length, conflicts: resolved };
  }

  async setDefaultStrategy(ctx: RequestContext, strategy: ConflictStrategy): Promise<void> {
    await this.pool.query(
      `INSERT INTO "sync"."conflict_settings" ("tenant_id","default_strategy","updated_at")
       VALUES ($1,$2,$3)
       ON CONFLICT ("tenant_id") DO UPDATE SET
         "default_strategy"=EXCLUDED."default_strategy",
         "updated_at"=EXCLUDED."updated_at"`,
      [ctx.tenantId, strategy, new Date().toISOString()],
    );
  }

  async getDefaultStrategy(ctx: RequestContext): Promise<ConflictStrategy> {
    const r = await this.pool.query(
      `SELECT "default_strategy" FROM "sync"."conflict_settings" WHERE "tenant_id"=$1`,
      [ctx.tenantId],
    );
    // The fallback is why losing this row is silent rather than loud: a tenant
    // that chose otherwise does not get an error, it gets the other answer.
    return (r.rows[0]?.['default_strategy'] as ConflictStrategy) ?? DEFAULT_CONFLICT_STRATEGY;
  }
}
