/**
 * In-memory ontology change history service.
 */

import type {
  OntologyChangeHistoryService,
  OntologyChangeRecord,
  OntologyChangeHistoryQuery,
  OntologyRestoreResult,
  RequestContext,
} from '@altius/spi';

export type SchemaHistoryReader = (ctx: RequestContext) => Promise<OntologyChangeRecord[]>;

export class InMemoryOntologyChangeHistoryService implements OntologyChangeHistoryService {
  private readonly records = new Map<string, Map<string, OntologyChangeRecord>>();
  private readonly reader?: SchemaHistoryReader;

  constructor(reader?: SchemaHistoryReader) {
    this.reader = reader;
  }

  async listChanges(ctx: RequestContext, query?: OntologyChangeHistoryQuery): Promise<OntologyChangeRecord[]> {
    const tenantRecords = this.records.get(ctx.tenantId) ?? new Map();
    let list = Array.from(tenantRecords.values());
    if (this.reader) {
      const dynamic = await this.reader(ctx);
      const ids = new Set(list.map(r => r.id));
      for (const r of dynamic) {
        if (!ids.has(r.id)) list.push(r);
      }
    }
    if (query?.objectType) {
      list = list.filter(r => r.snapshot['objectTypes'] && Array.isArray(r.snapshot['objectTypes']) && (r.snapshot['objectTypes'] as Array<{ name: string }>).some((o: { name: string }) => o.name === query.objectType));
    }
    if (query?.migrationClass) list = list.filter(r => r.migrationClass === query.migrationClass);
    if (query?.fromVersion !== undefined) list = list.filter(r => r.version >= query.fromVersion!);
    if (query?.toVersion !== undefined) list = list.filter(r => r.version <= query.toVersion!);
    list.sort((a, b) => b.version - a.version);
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? 100;
    return list.slice(offset, offset + limit);
  }

  async getChange(ctx: RequestContext, id: string): Promise<OntologyChangeRecord | null> {
    return this.records.get(ctx.tenantId)?.get(id) ?? null;
  }

  async restore(ctx: RequestContext, id: string, objectType: string): Promise<OntologyRestoreResult> {
    const record = await this.getChange(ctx, id);
    if (!record) throw new Error(`Change record not found: ${id}`);
    const now = new Date().toISOString();
    return {
      restored: true,
      changeId: record.id,
      objectType,
      version: record.version,
      appliedAt: now,
    };
  }

  /** Bootstrap with seeded records (e.g. from schema registry). */
  seed(ctx: RequestContext, records: OntologyChangeRecord[]): void {
    const m = this.getMap(ctx.tenantId);
    for (const r of records) m.set(r.id, r);
  }

  private getMap(t: string): Map<string, OntologyChangeRecord> {
    let m = this.records.get(t);
    if (!m) { m = new Map(); this.records.set(t, m); }
    return m;
  }
}
