/**
 * In-memory ontology SQL service.
 *
 * Translates a SQL subset over object types into in-memory reads.
 * Supports: SELECT, WHERE, JOIN, GROUP BY, ORDER BY, LIMIT.
 */

import { randomUUID } from 'node:crypto';
import { parseSql, evaluateOntologySql, detectSqlObjectTypes } from '@altius/spi';
import type {
  OntologySqlService,
  SavedSqlQuery,
  CreateSavedSqlQueryInput,
  OntologySqlResult,
  SqlExecutionOptions,
  SqlQueryExplanation,
  RequestContext,
} from '@altius/spi';

// Object reader for in-memory execution
export type OntologyObjectReader = (
  ctx: RequestContext,
  objectType: string,
) => Promise<Array<{ id: string; properties: Record<string, unknown> }>>;

function detectObjectTypes(parsed: ReturnType<typeof parseSql>): string[] {
  return detectSqlObjectTypes(parsed);
}

// ── Service ───────────────────────────────────────────────────────────

export class InMemoryOntologySqlService implements OntologySqlService {
  private readonly savedQueries = new Map<string, Map<string, SavedSqlQuery>>();
  private readonly objectReader?: OntologyObjectReader;

  constructor(objectReader?: OntologyObjectReader) {
    this.objectReader = objectReader;
  }

  async execute(ctx: RequestContext, sql: string, options?: SqlExecutionOptions): Promise<OntologySqlResult> {
    const start = Date.now();
    const parsed = parseSql(sql);
    const objectTypes = detectSqlObjectTypes(parsed);
    const limit = options?.limit ?? parsed.limit ?? 1000;

    if (!this.objectReader) {
      return { columns: [], rows: [], totalRowCount: 0, truncated: false, executionTimeMs: Date.now() - start, accessedObjectTypes: objectTypes };
    }

    // Load objects per referenced type through the tenant-scoped reader, then
    // evaluate with the shared engine — no raw SQL touches storage.
    const objectsByType = new Map<string, Array<{ id: string; properties: Record<string, unknown> }>>();
    for (const ot of objectTypes) {
      objectsByType.set(ot, await this.objectReader(ctx, ot));
    }
    const evaluated = evaluateOntologySql(parsed, objectsByType, limit);
    return { ...evaluated, executionTimeMs: Date.now() - start };
  }

  async explain(_ctx: RequestContext, sql: string): Promise<SqlQueryExplanation> {
    const parsed = parseSql(sql);
    const objectTypes = detectObjectTypes(parsed);
    return {
      parsed: {
        select: parsed.columns === '*' ? ['*'] : parsed.columns,
        from: [parsed.from],
        joins: parsed.joins,
        where: parsed.where?.map(w => `${w.field} ${w.op} ${w.value}`).join(' AND '),
        groupBy: parsed.groupBy,
        orderBy: parsed.orderBy?.map(o => ({ field: o.field, direction: (o.direction === 'desc' ? 'DESC' : 'ASC') as 'ASC' | 'DESC' })),
        limit: parsed.limit,
      },
      objectTypes,
      estimatedRows: 100,
      fullScan: !parsed.where,
      warnings: parsed.where ? [] : ['Query has no WHERE clause — will scan all objects'],
    };
  }

  async validate(_ctx: RequestContext, sql: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    try {
      const parsed = parseSql(sql);
      const errors: string[] = [];
      const warnings: string[] = [];
      if (parsed.columns !== '*' && parsed.columns.length === 0) errors.push('SELECT list is empty');
      if (!parsed.from) errors.push('FROM clause is missing');
      if (!parsed.where) warnings.push('No WHERE clause — full scan');
      return { valid: errors.length === 0, errors, warnings };
    } catch (err) {
      return { valid: false, errors: [err instanceof Error ? err.message : 'Parse error'], warnings: [] };
    }
  }

  async createSavedQuery(ctx: RequestContext, input: CreateSavedSqlQueryInput): Promise<SavedSqlQuery> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const parsed = parseSql(input.sql);
    const query: SavedSqlQuery = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      sql: input.sql,
      objectTypes: detectObjectTypes(parsed),
      parameterized: false,
      ownerId: ctx.actorId ?? 'system',
      sharedWith: [],
      isPublic: input.isPublic ?? false,
      tags: input.tags ?? [],
      createdAt: now, updatedAt: now,
    };
    this.getQueryMap(ctx.tenantId).set(id, query);
    return query;
  }

  async getSavedQuery(ctx: RequestContext, id: string): Promise<SavedSqlQuery | null> {
    return this.savedQueries.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listSavedQueries(ctx: RequestContext, tags?: string[]): Promise<SavedSqlQuery[]> {
    const m = this.savedQueries.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (tags && tags.length > 0) list = list.filter(q => tags.some(t => q.tags.includes(t)));
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateSavedQuery(ctx: RequestContext, id: string, updates: Partial<CreateSavedSqlQueryInput>): Promise<SavedSqlQuery> {
    const q = this.savedQueries.get(ctx.tenantId)?.get(id);
    if (!q) throw new Error(`Saved query not found: ${id}`);
    const updated: SavedSqlQuery = {
      ...q,
      name: updates.name ?? q.name,
      description: updates.description ?? q.description,
      sql: updates.sql ?? q.sql,
      isPublic: updates.isPublic ?? q.isPublic,
      tags: updates.tags ?? q.tags,
      updatedAt: new Date().toISOString(),
    };
    if (updates.sql) {
      const parsed = parseSql(updates.sql);
      updated.objectTypes = detectObjectTypes(parsed);
    }
    this.getQueryMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteSavedQuery(ctx: RequestContext, id: string): Promise<void> {
    this.savedQueries.get(ctx.tenantId)?.delete(id);
  }

  async shareSavedQuery(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedSqlQuery> {
    const q = this.savedQueries.get(ctx.tenantId)?.get(id);
    if (!q) throw new Error(`Saved query not found: ${id}`);
    const updated = { ...q, sharedWith: [...new Set([...q.sharedWith, ...userIds])] };
    this.getQueryMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async executeSavedQuery(ctx: RequestContext, id: string, options?: SqlExecutionOptions): Promise<OntologySqlResult> {
    const q = await this.getSavedQuery(ctx, id);
    if (!q) throw new Error(`Saved query not found: ${id}`);
    return this.execute(ctx, q.sql, options);
  }

  async listVirtualTables(_ctx: RequestContext): Promise<Array<{ name: string; columns: Array<{ name: string; type: string }> }>> {
    // In-memory: no schema introspection without a schema reference
    return [];
  }

  async describeVirtualTable(_ctx: RequestContext, _objectType: string): Promise<{ name: string; columns: Array<{ name: string; type: string }> } | null> {
    return null;
  }

  private getQueryMap(tenantId: string): Map<string, SavedSqlQuery> {
    let m = this.savedQueries.get(tenantId);
    if (!m) { m = new Map(); this.savedQueries.set(tenantId, m); }
    return m;
  }
}
