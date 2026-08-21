/**
 * PostgreSQL-backed saved view store.
 *
 * Persists per-user and shared widget view configurations with the same
 * visibility and owner-only mutation rules as the in-memory provider.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { RequestContext, SavedView, SavedViewStore, CreateSavedViewInput } from '@altius/spi';

/** TIMESTAMPTZ arrives as a Date; the SPI types every timestamp as an ISO string. */
function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJsonb<T>(v: unknown): T {
  if (v === null || v === undefined) {
    // Cast through unknown to avoid a direct any assignment while still
    // satisfying the JSON-shaped return types the SPI expects.
    return undefined as unknown as T;
  }
  if (typeof v === 'string') {
    return JSON.parse(v) as T;
  }
  return v as T;
}

function mapSavedView(row: Record<string, unknown>): SavedView {
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    name: String(row['name']),
    description: row['description'] ? String(row['description']) : undefined,
    objectType: row['object_type'] ? String(row['object_type']) : undefined,
    widgetType: row['widget_type'] ? String(row['widget_type']) : undefined,
    appId: row['app_id'] ? String(row['app_id']) : undefined,
    columns: parseJsonb<SavedView['columns']>(row['columns']),
    filter: parseJsonb<SavedView['filter']>(row['filter']),
    orderBy: parseJsonb<SavedView['orderBy']>(row['order_by']),
    density: (row['density'] as SavedView['density']) ?? undefined,
    pageSize: row['page_size'] ? Number(row['page_size']) : undefined,
    widgetConfig: parseJsonb<SavedView['widgetConfig']>(row['widget_config']),
    isPublic: row['is_public'] === true,
    createdBy: String(row['created_by'] ?? ''),
    createdAt: toIso(row['created_at'])!,
    updatedAt: toIso(row['updated_at'])!,
  };
}

export class PostgresSavedViewStore implements SavedViewStore {
  constructor(private readonly pool: Pool) {}

  async create(ctx: RequestContext, input: CreateSavedViewInput): Promise<SavedView> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO "governance"."saved_views"
         ("id","tenant_id","name","description","object_type","widget_type","app_id",
          "columns","filter","order_by","density","page_size","widget_config","is_public",
          "created_by","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        input.name,
        input.description ?? null,
        input.objectType ?? null,
        input.widgetType ?? null,
        input.appId ?? null,
        input.columns !== undefined ? JSON.stringify(input.columns) : null,
        input.filter !== undefined ? JSON.stringify(input.filter) : null,
        input.orderBy !== undefined ? JSON.stringify(input.orderBy) : null,
        input.density ?? null,
        input.pageSize ?? null,
        input.widgetConfig !== undefined ? JSON.stringify(input.widgetConfig) : null,
        input.isPublic ?? false,
        ctx.actorId ?? 'unknown',
        now,
      ],
    );
    return mapSavedView(r.rows[0]!);
  }

  async get(ctx: RequestContext, id: string): Promise<SavedView | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."saved_views"
       WHERE "id"=$1 AND "tenant_id"=$2 AND ("is_public"=true OR "created_by"=$3)`,
      [id, ctx.tenantId, ctx.actorId ?? ''],
    );
    return r.rows[0] ? mapSavedView(r.rows[0]!) : null;
  }

  async list(
    ctx: RequestContext,
    filter?: { objectType?: string; widgetType?: string; appId?: string },
  ): Promise<SavedView[]> {
    let sql = `SELECT * FROM "governance"."saved_views"
               WHERE "tenant_id"=$1 AND ("is_public"=true OR "created_by"=$2)`;
    const params: unknown[] = [ctx.tenantId, ctx.actorId ?? ''];

    if (filter?.objectType) {
      params.push(filter.objectType);
      sql += ` AND "object_type"=$${params.length}`;
    }
    if (filter?.widgetType) {
      params.push(filter.widgetType);
      sql += ` AND "widget_type"=$${params.length}`;
    }
    if (filter?.appId) {
      params.push(filter.appId);
      sql += ` AND "app_id"=$${params.length}`;
    }

    sql += ` ORDER BY "created_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapSavedView);
  }

  async update(
    ctx: RequestContext,
    id: string,
    updates: Partial<CreateSavedViewInput>,
  ): Promise<SavedView> {
    const columnMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      objectType: 'object_type',
      widgetType: 'widget_type',
      appId: 'app_id',
      columns: 'columns',
      filter: 'filter',
      orderBy: 'order_by',
      density: 'density',
      pageSize: 'page_size',
      widgetConfig: 'widget_config',
      isPublic: 'is_public',
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      if (['id', 'tenantId', 'createdAt', 'updatedAt', 'createdBy'].includes(key)) continue;
      const column = columnMap[key];
      if (!column) continue;
      if (key === 'columns' || key === 'filter' || key === 'orderBy' || key === 'widgetConfig') {
        params.push(JSON.stringify(value));
      } else {
        params.push(value);
      }
      sets.push(`"${column}"=$${params.length}`);
    }

    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(id, ctx.tenantId, ctx.actorId ?? '');

    const r = await this.pool.query(
      `UPDATE "governance"."saved_views" SET ${sets.join(', ')}
       WHERE "id"=$${params.length - 2} AND "tenant_id"=$${params.length - 1} AND "created_by"=$${params.length}
       RETURNING *`,
      params,
    );
    if (!r.rows[0]) throw new Error(`Saved view not found or not owner: ${id}`);
    return mapSavedView(r.rows[0]!);
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    const r = await this.pool.query(
      `DELETE FROM "governance"."saved_views" WHERE "id"=$1 AND "tenant_id"=$2 AND "created_by"=$3`,
      [id, ctx.tenantId, ctx.actorId ?? ''],
    );
    if ((r.rowCount ?? 0) === 0) throw new Error(`Saved view not found or not owner: ${id}`);
  }
}
