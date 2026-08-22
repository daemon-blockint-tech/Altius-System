/**
 * Postgres-backed Workshop platform service — durable apps, pages, widgets,
 * variables, modules and object views, so operator-built apps survive restart
 * and are shared across replicas. All semantics live in the shared
 * DocStoreWorkshopPlatformService; this file supplies a JSONB-backed document
 * store keyed by (tenant, collection, key) and seeds the shared widget catalog.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { DocStoreWorkshopPlatformService, DEFAULT_WIDGET_CATALOG } from '@altius/spi';
import type { WorkshopDocStore } from '@altius/spi';

class PostgresWorkshopDocStore implements WorkshopDocStore {
  constructor(private readonly pool: Pool) {}

  async get(tenantId: string, collection: string, key: string): Promise<unknown | null> {
    const r = await this.pool.query(
      `SELECT "doc" FROM "workshop"."documents" WHERE "tenant_id"=$1 AND "collection"=$2 AND "key"=$3`,
      [tenantId, collection, key],
    );
    return r.rows[0] ? r.rows[0].doc : null;
  }

  async put(tenantId: string, collection: string, key: string, doc: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO "workshop"."documents" ("tenant_id","collection","key","doc")
       VALUES ($1,$2,$3,$4)
       ON CONFLICT ("tenant_id","collection","key") DO UPDATE SET "doc" = EXCLUDED."doc"`,
      [tenantId, collection, key, JSON.stringify(doc)],
    );
  }

  async delete(tenantId: string, collection: string, key: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "workshop"."documents" WHERE "tenant_id"=$1 AND "collection"=$2 AND "key"=$3`,
      [tenantId, collection, key],
    );
  }

  async list(tenantId: string, collection: string): Promise<unknown[]> {
    const r = await this.pool.query(
      `SELECT "doc" FROM "workshop"."documents" WHERE "tenant_id"=$1 AND "collection"=$2`,
      [tenantId, collection],
    );
    return r.rows.map(row => row.doc);
  }
}

export class PostgresWorkshopPlatformService extends DocStoreWorkshopPlatformService {
  constructor(pool: Pool) {
    super(new PostgresWorkshopDocStore(pool), {
      idGenerator: randomUUID,
      defaultWidgets: DEFAULT_WIDGET_CATALOG,
    });
  }
}
