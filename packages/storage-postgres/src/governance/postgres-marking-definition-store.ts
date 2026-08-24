import type { Pool } from 'pg';
import type {
  MarkingDefinitionStore,
  MarkingDefinitionRecord,
  MarkingCategoryRecord,
  CreateMarkingDefinitionInput,
  CreateMarkingCategoryInput,
} from '@altius/spi';

/**
 * Postgres marking definitions. Tables: governance.marking_definitions,
 * governance.marking_categories. All queries tenant-scoped.
 *
 * DDL is additive (CREATE TABLE IF NOT EXISTS) in ddl-platform.ts.
 */
export class PostgresMarkingDefinitionStore implements MarkingDefinitionStore {
  constructor(private readonly pool: Pool) {}

  async createDefinition(tenantId: string, input: CreateMarkingDefinitionInput, createdBy: string): Promise<MarkingDefinitionRecord> {
    const res = await this.pool.query(
      `INSERT INTO "governance"."marking_definitions" ("tenant_id","name","category","rank","created_by","created_at")
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT ("tenant_id","name")
       DO UPDATE SET "category" = EXCLUDED."category", "rank" = EXCLUDED."rank"
       RETURNING "tenant_id","name","category","rank","created_by","created_at"`,
      [tenantId, input.name, input.category ?? null, input.rank ?? null, createdBy],
    );
    const r = res.rows[0];
    return {
      tenantId: r.tenant_id, name: r.name, category: r.category ?? undefined,
      rank: r.rank ?? undefined, createdBy: r.created_by,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async deleteDefinition(tenantId: string, name: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM "governance"."marking_definitions" WHERE "tenant_id"=$1 AND "name"=$2`,
      [tenantId, name],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listDefinitions(tenantId: string): Promise<MarkingDefinitionRecord[]> {
    const res = await this.pool.query(
      `SELECT "tenant_id","name","category","rank","created_by","created_at"
       FROM "governance"."marking_definitions" WHERE "tenant_id"=$1 ORDER BY "name"`,
      [tenantId],
    );
    return res.rows.map(r => ({
      tenantId: r.tenant_id, name: r.name, category: r.category ?? undefined,
      rank: r.rank ?? undefined, createdBy: r.created_by,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async getDefinition(tenantId: string, name: string): Promise<MarkingDefinitionRecord | null> {
    const res = await this.pool.query(
      `SELECT "tenant_id","name","category","rank","created_by","created_at"
       FROM "governance"."marking_definitions" WHERE "tenant_id"=$1 AND "name"=$2`,
      [tenantId, name],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      tenantId: r.tenant_id, name: r.name, category: r.category ?? undefined,
      rank: r.rank ?? undefined, createdBy: r.created_by,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async createCategory(tenantId: string, input: CreateMarkingCategoryInput, createdBy: string): Promise<MarkingCategoryRecord> {
    const res = await this.pool.query(
      `INSERT INTO "governance"."marking_categories" ("tenant_id","name","mode","created_by","created_at")
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT ("tenant_id","name")
       DO UPDATE SET "mode" = EXCLUDED."mode"
       RETURNING "tenant_id","name","mode","created_by","created_at"`,
      [tenantId, input.name, input.mode, createdBy],
    );
    const r = res.rows[0];
    return {
      tenantId: r.tenant_id, name: r.name, mode: r.mode,
      createdBy: r.created_by, createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async listCategories(tenantId: string): Promise<MarkingCategoryRecord[]> {
    const res = await this.pool.query(
      `SELECT "tenant_id","name","mode","created_by","created_at"
       FROM "governance"."marking_categories" WHERE "tenant_id"=$1 ORDER BY "name"`,
      [tenantId],
    );
    return res.rows.map(r => ({
      tenantId: r.tenant_id, name: r.name, mode: r.mode,
      createdBy: r.created_by, createdAt: new Date(r.created_at).toISOString(),
    }));
  }
}
