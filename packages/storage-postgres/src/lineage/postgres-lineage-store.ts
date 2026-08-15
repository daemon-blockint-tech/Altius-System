/**
 * Postgres-backed field provenance store (Section 4.6).
 *
 * `lineage.field_provenance` has been created by the DDL since the schema
 * builder shipped, and nothing ever wrote to it: `LineageRecorder` is the only
 * producer and it needs a `LineageStore`, of which the sole implementation was
 * in-memory. So the table existed, was indexed, and stayed empty in production.
 *
 * Provenance is what lets a later reader answer "who last wrote this field" —
 * the question sync conflict resolution asks before deciding whether an
 * incoming source value may overwrite an action's edit. Without a producer,
 * both declarable strategies (SOURCE_PRIORITY, ACTION_PRIORITY) have no input
 * and sync silently clobbers user edits.
 *
 * Writes are append-only: a field's history is the ordered set of rows for it,
 * newest first. Nothing updates or deletes a row.
 */

import type { Pool } from 'pg';
import type { FieldProvenance, DateTime } from '@altius/spi';
import type { LineageStore, LineageQueryOptions } from '@altius/engine';

/** Rows are ordered newest-first; without a cap a hot field returns unboundedly. */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

interface ProvenanceRow {
  tenant_id: string;
  object_type: string;
  object_id: string;
  field: string;
  value_hash: string;
  produced_at: Date;
  source: FieldProvenance['source'];
}

function toProvenance(row: ProvenanceRow): FieldProvenance {
  return {
    tenantId: row.tenant_id,
    objectType: row.object_type,
    objectId: row.object_id,
    field: row.field,
    valueHash: row.value_hash,
    producedAt: row.produced_at.toISOString() as DateTime,
    source: row.source,
  };
}

function clampLimit(options?: LineageQueryOptions): number {
  const requested = options?.limit;
  if (typeof requested !== 'number' || !Number.isInteger(requested) || requested <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(requested, MAX_LIMIT);
}

export class PostgresLineageStore implements LineageStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async write(provenance: FieldProvenance): Promise<void> {
    await this.pool.query(
      `INSERT INTO "lineage"."field_provenance"
         ("tenant_id", "object_type", "object_id", "field", "value_hash", "produced_at", "source")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        provenance.tenantId,
        provenance.objectType,
        provenance.objectId,
        provenance.field,
        provenance.valueHash,
        provenance.producedAt,
        // `source` is a discriminated union; JSONB keeps it whole rather than
        // flattening it into columns that only fit one of its three shapes.
        JSON.stringify(provenance.source),
      ],
    );
  }

  async query(
    tenantId: string,
    objectType: string,
    objectId: string,
    field: string,
    options?: LineageQueryOptions,
  ): Promise<FieldProvenance[]> {
    const result = await this.pool.query<ProvenanceRow>(
      `SELECT "tenant_id", "object_type", "object_id", "field", "value_hash", "produced_at", "source"
         FROM "lineage"."field_provenance"
        WHERE "tenant_id" = $1 AND "object_type" = $2 AND "object_id" = $3 AND "field" = $4
        ORDER BY "produced_at" DESC
        LIMIT $5`,
      [tenantId, objectType, objectId, field, clampLimit(options)],
    );
    return result.rows.map(toProvenance);
  }

  async queryByObject(
    tenantId: string,
    objectType: string,
    objectId: string,
    options?: LineageQueryOptions,
  ): Promise<FieldProvenance[]> {
    const result = await this.pool.query<ProvenanceRow>(
      `SELECT "tenant_id", "object_type", "object_id", "field", "value_hash", "produced_at", "source"
         FROM "lineage"."field_provenance"
        WHERE "tenant_id" = $1 AND "object_type" = $2 AND "object_id" = $3
        ORDER BY "produced_at" DESC
        LIMIT $4`,
      [tenantId, objectType, objectId, clampLimit(options)],
    );
    return result.rows.map(toProvenance);
  }
}
