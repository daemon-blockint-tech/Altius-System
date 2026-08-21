/**
 * Postgres-backed FunctionRevisionStore — durable persistence for the function
 * authoring lifecycle, so draft/published revisions survive restart and are
 * shared across replicas. Tenant-scoped throughout (composite PK
 * (tenant_id, id)); the active revision is derived as the single published one.
 */

import type { Pool } from 'pg';
import type { FunctionRevision, FunctionRevisionStore } from '@altius/spi';

export class PostgresFunctionRevisionStore implements FunctionRevisionStore {
  constructor(private readonly pool: Pool) {}

  async create(r: FunctionRevision): Promise<void> {
    await this.pool.query(
      `INSERT INTO "function_lifecycle"."revisions"
         ("id","tenant_id","function_name","revision","status","runtime","entry","source","test_inputs","expected_outputs","created_by","created_at","published_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        r.id, r.tenantId, r.functionName, r.revision, r.status, r.runtime, r.entry,
        r.source ?? null,
        r.testInputs ? JSON.stringify(r.testInputs) : null,
        r.expectedOutputs ? JSON.stringify(r.expectedOutputs) : null,
        r.createdBy, r.createdAt, r.publishedAt ?? null,
      ],
    );
  }

  async get(tenantId: string, id: string): Promise<FunctionRevision | null> {
    const res = await this.pool.query(
      `SELECT * FROM "function_lifecycle"."revisions" WHERE "tenant_id" = $1 AND "id" = $2`,
      [tenantId, id],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async listByFunction(tenantId: string, functionName: string): Promise<FunctionRevision[]> {
    const res = await this.pool.query(
      `SELECT * FROM "function_lifecycle"."revisions"
       WHERE "tenant_id" = $1 AND "function_name" = $2 ORDER BY "revision" ASC`,
      [tenantId, functionName],
    );
    return res.rows.map(mapRow);
  }

  async getActive(tenantId: string, functionName: string): Promise<FunctionRevision | null> {
    const res = await this.pool.query(
      `SELECT * FROM "function_lifecycle"."revisions"
       WHERE "tenant_id" = $1 AND "function_name" = $2 AND "status" = 'published'
       ORDER BY "revision" DESC LIMIT 1`,
      [tenantId, functionName],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async update(r: FunctionRevision): Promise<void> {
    await this.pool.query(
      `UPDATE "function_lifecycle"."revisions"
         SET "status" = $3, "published_at" = $4, "source" = $5, "entry" = $6, "runtime" = $7
       WHERE "tenant_id" = $1 AND "id" = $2`,
      [r.tenantId, r.id, r.status, r.publishedAt ?? null, r.source ?? null, r.entry, r.runtime],
    );
  }
}

function mapRow(row: Record<string, unknown>): FunctionRevision {
  return {
    id: row['id'] as string,
    functionName: row['function_name'] as string,
    revision: row['revision'] as number,
    status: row['status'] as FunctionRevision['status'],
    runtime: row['runtime'] as string,
    entry: row['entry'] as string,
    source: (row['source'] as string | null) ?? undefined,
    // JSONB columns are returned already parsed by the pg driver.
    testInputs: (row['test_inputs'] as Record<string, unknown>[] | null) ?? undefined,
    expectedOutputs: (row['expected_outputs'] as unknown[] | null) ?? undefined,
    tenantId: row['tenant_id'] as string,
    createdBy: row['created_by'] as string,
    createdAt: row['created_at'] as string,
    publishedAt: (row['published_at'] as string | null) ?? undefined,
  };
}
