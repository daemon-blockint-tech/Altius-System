/**
 * In-memory ontology change history service.
 */

import type {
  OntologyChangeHistoryService,
  OntologyChangeRecord,
  OntologyChangeHistoryQuery,
  OntologyRestoreResult,
  OntologyChangeInput,
  OntologyChangeValidationResult,
  OntologyChangeApplyResult,
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

  async saveChange(ctx: RequestContext, input: OntologyChangeInput | OntologyChangeRecord): Promise<OntologyChangeRecord> {
    if ('id' in input) {
      this.getMap(ctx.tenantId).set(input.id, input);
      return input;
    }
    const id = randomUUID();
    const record: OntologyChangeRecord = {
      id,
      tenantId: ctx.tenantId,
      version: 1,
      appliedAt: new Date().toISOString(),
      appliedBy: ctx.actorId ?? '',
      migrationClass: input.migrationClass,
      diffSummary: input.diffSummary ?? '',
      snapshot: input.snapshot,
    };
    this.getMap(ctx.tenantId).set(id, record);
    return record;
  }

  async validateChange(_ctx: RequestContext, id: string): Promise<OntologyChangeValidationResult> {
    const record = this.records.get(_ctx.tenantId)?.get(id);
    if (!record) return { valid: false, errors: ['Change record not found'] };
    const errors: string[] = [];
    if (!record.migrationClass) errors.push('migrationClass is required');
    if (!record.snapshot || typeof record.snapshot !== 'object') errors.push('snapshot must be an object');
    return { valid: errors.length === 0, errors };
  }

  async applyChange(ctx: RequestContext, id: string): Promise<OntologyChangeApplyResult> {
    const record = this.records.get(ctx.tenantId)?.get(id);
    if (!record) throw new Error(`Change record not found: ${id}`);
    const validation = await this.validateChange(ctx, id);
    if (!validation.valid) throw new Error(`Change ${id} is not valid: ${validation.errors.join(', ')}`);
    const appliedAt = new Date().toISOString();
    const updated: OntologyChangeRecord = { ...record, appliedAt, version: record.version + 1 };
    this.getMap(ctx.tenantId).set(id, updated);
    return { applied: true, changeId: id, version: updated.version, appliedAt };
  }

  private getMap(t: string): Map<string, OntologyChangeRecord> {
    let m = this.records.get(t);
    if (!m) { m = new Map(); this.records.set(t, m); }
    return m;
  }
}
