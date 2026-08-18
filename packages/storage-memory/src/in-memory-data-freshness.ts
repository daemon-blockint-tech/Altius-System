/**
 * In-memory data freshness service.
 */

import { randomUUID } from 'node:crypto';
import type {
  DataFreshnessService,
  FreshnessRecord,
  FreshnessQuery,
  FreshnessSummary,
  RequestContext,
} from '@altius/spi';

export class InMemoryDataFreshnessService implements DataFreshnessService {
  private readonly records = new Map<string, Map<string, FreshnessRecord>>(); // tenant → key → record

  async recordSync(ctx: RequestContext, input: {
    objectType?: string; datasource?: string; recordCount: number; succeeded: boolean; error?: string; intervalMs?: number;
  }): Promise<FreshnessRecord> {
    const key = input.objectType ?? input.datasource ?? '';
    if (!key) throw new Error('Either objectType or datasource must be provided');
    const now = new Date().toISOString();
    const existing = this.getMap(ctx.tenantId).get(key);
    const record: FreshnessRecord = {
      id: existing?.id ?? randomUUID(),
      tenantId: ctx.tenantId,
      objectType: input.objectType,
      datasource: input.datasource,
      lastSyncedAt: input.succeeded ? now : (existing?.lastSyncedAt ?? now),
      lastAttemptedAt: now,
      lastRecordCount: input.recordCount,
      lastSyncSucceeded: input.succeeded,
      lastError: input.error,
      intervalMs: input.intervalMs ?? existing?.intervalMs,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.getMap(ctx.tenantId).set(key, record);
    return record;
  }

  async getFreshnessForType(ctx: RequestContext, objectType: string): Promise<FreshnessRecord | null> {
    return this.getMap(ctx.tenantId).get(objectType) ?? null;
  }

  async getFreshnessForDatasource(ctx: RequestContext, datasource: string): Promise<FreshnessRecord | null> {
    return this.getMap(ctx.tenantId).get(datasource) ?? null;
  }

  async queryFreshness(ctx: RequestContext, query?: FreshnessQuery): Promise<FreshnessRecord[]> {
    const m = this.records.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (query?.objectType) list = list.filter(r => r.objectType === query.objectType);
    if (query?.datasource) list = list.filter(r => r.datasource === query.datasource);
    const now = Date.now();
    if (query?.maxAgeSeconds !== undefined) {
      list = list.filter(r => (now - new Date(r.lastSyncedAt).getTime()) / 1000 <= query.maxAgeSeconds!);
    }
    if (query?.minAgeSeconds !== undefined) {
      list = list.filter(r => (now - new Date(r.lastSyncedAt).getTime()) / 1000 >= query.minAgeSeconds!);
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSummary(ctx: RequestContext, maxAgeSeconds?: number): Promise<FreshnessSummary> {
    const records = await this.queryFreshness(ctx);
    const now = Date.now();
    const threshold = maxAgeSeconds ?? 3600;
    let fresh = 0, stale = 0, error = 0;
    for (const r of records) {
      if (!r.lastSyncSucceeded) { error++; continue; }
      const ageSec = (now - new Date(r.lastSyncedAt).getTime()) / 1000;
      if (ageSec <= threshold) fresh++; else stale++;
    }
    const types = records.filter(r => r.objectType).length;
    const sources = records.filter(r => r.datasource).length;
    const sorted = [...records].sort((a, b) => a.lastSyncedAt.localeCompare(b.lastSyncedAt));
    return {
      totalTypes: types, totalDatasources: sources,
      freshCount: fresh, staleCount: stale, errorCount: error,
      oldestSync: sorted[0], newestSync: sorted.at(-1),
    };
  }

  async deleteFreshness(ctx: RequestContext, objectType?: string, datasource?: string): Promise<void> {
    const key = objectType ?? datasource;
    if (key) this.getMap(ctx.tenantId).delete(key);
  }

  private getMap(tenantId: string): Map<string, FreshnessRecord> {
    let m = this.records.get(tenantId);
    if (!m) { m = new Map(); this.records.set(tenantId, m); }
    return m;
  }
}
