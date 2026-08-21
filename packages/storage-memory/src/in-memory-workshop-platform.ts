/**
 * In-memory Workshop platform service.
 *
 * All 52 methods live in the shared DocStoreWorkshopPlatformService in
 * @altius/spi — this file only supplies the Map-backed document store (and the
 * shared default widget catalog), so the memory and Postgres providers cannot
 * drift on workshop semantics.
 */

import { randomUUID } from 'node:crypto';
import { DocStoreWorkshopPlatformService, DEFAULT_WIDGET_CATALOG } from '@altius/spi';
import type { WorkshopDocStore } from '@altius/spi';

class InMemoryWorkshopDocStore implements WorkshopDocStore {
  // tenant -> collection -> key -> doc
  private readonly docs = new Map<string, Map<string, Map<string, unknown>>>();

  private coll(tenantId: string, collection: string): Map<string, unknown> {
    let t = this.docs.get(tenantId);
    if (!t) { t = new Map(); this.docs.set(tenantId, t); }
    let c = t.get(collection);
    if (!c) { c = new Map(); t.set(collection, c); }
    return c;
  }

  async get(tenantId: string, collection: string, key: string): Promise<unknown | null> {
    return this.coll(tenantId, collection).get(key) ?? null;
  }
  async put(tenantId: string, collection: string, key: string, doc: unknown): Promise<void> {
    this.coll(tenantId, collection).set(key, doc);
  }
  async delete(tenantId: string, collection: string, key: string): Promise<void> {
    this.coll(tenantId, collection).delete(key);
  }
  async list(tenantId: string, collection: string): Promise<unknown[]> {
    return Array.from(this.coll(tenantId, collection).values());
  }
}

export class InMemoryWorkshopPlatformService extends DocStoreWorkshopPlatformService {
  constructor() {
    super(new InMemoryWorkshopDocStore(), {
      idGenerator: randomUUID,
      defaultWidgets: DEFAULT_WIDGET_CATALOG,
    });
  }
}
