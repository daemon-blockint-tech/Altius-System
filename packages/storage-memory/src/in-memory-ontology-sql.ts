/**
 * In-memory ontology SQL service.
 *
 * Translates a SQL subset over object types into in-memory reads.
 * Supports: SELECT, WHERE, JOIN, GROUP BY, ORDER BY, LIMIT.
 */

import { randomUUID } from 'node:crypto';
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

// ── SQL parser (simplified) ───────────────────────────────────────────

interface ParsedSql {
  select: string[];
  from: string;
  joins: Array<{ type: string; table: string; on: string }>;
  where?: Array<{ field: string; op: string; value: string }>;
  groupBy?: string[];
  orderBy?: Array<{ field: string; direction: 'ASC' | 'DESC' }>;
  limit?: number;
}

function parseSql(sql: string): ParsedSql {
  const upper = sql.trim().replace(/;$/, '');
  const selectMatch = upper.match(/^select\s+(.+?)\s+from\s+(\w+)/i);
  if (!selectMatch) throw new Error('SQL must start with SELECT ... FROM <table>');
  const selectCols = selectMatch[1]!.split(',').map(s => s.trim());
  const fromTable = selectMatch[2]!;
  const result: ParsedSql = { select: selectCols, from: fromTable, joins: [] };
  // Parse JOIN
  const joinMatches = [...upper.matchAll(/(inner|left|right|outer)?\s*join\s+(\w+)\s+on\s+(\S+\s*=\s*\S+)/gi)];
  for (const m of joinMatches) {
    result.joins.push({ type: (m[1] ?? 'inner').toLowerCase(), table: m[2]!, on: m[3]!.trim() });
  }
  // Parse WHERE
  const whereMatch = upper.match(/where\s+(.+?)(?:\s+(?:group by|order by|limit)|$)/i);
  if (whereMatch) {
    const clauses = whereMatch[1]!.split(/\s+and\s+/i);
    result.where = clauses.map(c => {
      const cm = c.match(/(\S+)\s*(=|!=|<>|>=|<=|>|<|like)\s*(.+)/i);
      if (cm) return { field: cm[1]!, op: cm[2]!, value: cm[3]!.replace(/^['"]|['"]$/g, '') };
      return { field: c, op: '=', value: '' };
    });
  }
  // Parse GROUP BY
  const groupMatch = upper.match(/group by\s+(.+?)(?:\s+order by|\s+limit|$)/i);
  if (groupMatch) result.groupBy = groupMatch[1]!.split(',').map(s => s.trim());
  // Parse ORDER BY
  const orderMatch = upper.match(/order by\s+(.+?)(?:\s+limit|$)/i);
  if (orderMatch) {
    result.orderBy = orderMatch[1]!.split(',').map(s => {
      const parts = s.trim().split(/\s+/);
      return { field: parts[0]!, direction: (parts[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC' };
    });
  }
  // Parse LIMIT
  const limitMatch = upper.match(/limit\s+(\d+)/i);
  if (limitMatch) result.limit = parseInt(limitMatch[1]!, 10);
  return result;
}

function detectObjectTypes(parsed: ParsedSql): string[] {
  const types = new Set<string>([parsed.from]);
  for (const j of parsed.joins) types.add(j.table);
  return Array.from(types);
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
    const objectTypes = detectObjectTypes(parsed);
    const limit = options?.limit ?? parsed.limit ?? 1000;

    if (!this.objectReader) {
      return { columns: [], rows: [], totalRowCount: 0, truncated: false, executionTimeMs: Date.now() - start, accessedObjectTypes: objectTypes };
    }

    // Load objects from all referenced types
    const objectsByType = new Map<string, Array<{ id: string; properties: Record<string, unknown> }>>();
    for (const ot of objectTypes) {
      objectsByType.set(ot, await this.objectReader(ctx, ot));
    }

    // Build the base result set from the FROM table
    let rows: Array<Record<string, unknown>> = objectsByType.get(parsed.from)!.map(obj => ({
      ...obj.properties,
      _id: obj.id,
      _type: parsed.from,
    }));

    // Apply JOINs (nested loop — in-memory only)
    for (const join of parsed.joins) {
      const joinObjects = objectsByType.get(join.table) ?? [];
      const [leftPart, rightPart] = join.on.split('=').map(s => s.trim());
      const [leftTable, leftField] = leftPart!.split('.');
      const [, rightField] = rightPart!.split('.');
      const joined: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        // Look up the join field: try direct, then _id fallback, then table-qualified
        const leftValue = (leftTable === parsed.from || leftTable === join.type)
          ? (row[leftField!] ?? row['_id'])
          : row[`${leftTable}.${leftField}`];
        for (const joinObj of joinObjects) {
          const rightValue = joinObj.properties[rightField!] ?? joinObj.id;
          if (leftValue === rightValue) {
            joined.push({ ...row, ...Object.fromEntries(Object.entries(joinObj.properties).map(([k, v]) => [`${join.table}.${k}`, v])) });
          }
        }
      }
      rows = joined;
    }

    // Apply WHERE
    if (parsed.where) {
      rows = rows.filter(row => {
        return parsed.where!.every(w => {
          const val = row[w.field];
          const cmp = String(val);
          switch (w.op) {
            case '=': return cmp === w.value;
            case '!=': case '<>': return cmp !== w.value;
            case '>': return Number(val) > Number(w.value);
            case '>=': return Number(val) >= Number(w.value);
            case '<': return Number(val) < Number(w.value);
            case '<=': return Number(val) <= Number(w.value);
            case 'like': return new RegExp(w.value.replace(/%/g, '.*').replace(/_/g, '.')).test(cmp);
            default: return true;
          }
        });
      });
    }

    const totalRowCount = rows.length;

    // Apply GROUP BY with aggregations
    if (parsed.groupBy) {
      const groupBy = parsed.groupBy;
      const groups = new Map<string, Array<Record<string, unknown>>>();
      for (const row of rows) {
        const key = groupBy.map(g => String(row[g])).join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }
      rows = Array.from(groups.entries()).map(([key, groupRows]) => {
        const result: Record<string, unknown> = {};
        const keyParts = key.split('|');
        groupBy.forEach((g, i) => { result[g] = keyParts[i]; });
        // Apply aggregate functions in SELECT
        for (const col of parsed.select) {
          const aggMatch = col.match(/(count|sum|avg|min|max)\s*\(\s*(\*|\S+)\s*\)/i);
          if (aggMatch) {
            const fn = aggMatch[1]!.toLowerCase();
            const field = aggMatch[2]!;
            if (fn === 'count') result[col] = groupRows.length;
            else if (field === '*') result[col] = groupRows.length;
            else {
              const values = groupRows.map(r => Number(r[field])).filter(n => !isNaN(n));
              if (fn === 'sum') result[col] = values.reduce((a, b) => a + b, 0);
              else if (fn === 'avg') result[col] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
              else if (fn === 'min') result[col] = values.length > 0 ? Math.min(...values) : null;
              else if (fn === 'max') result[col] = values.length > 0 ? Math.max(...values) : null;
            }
          }
        }
        return result;
      });
    }

    // Apply ORDER BY
    if (parsed.orderBy) {
      for (const ob of parsed.orderBy) {
        rows.sort((a, b) => {
          const av = String(a[ob.field] ?? ''), bv = String(b[ob.field] ?? '');
          if (av === bv) return 0;
          const cmp = av < bv ? -1 : 1;
          return ob.direction === 'DESC' ? -cmp : cmp;
        });
      }
    }

    // Apply LIMIT
    const truncated = rows.length > limit;
    rows = rows.slice(0, limit);

    // Build columns from SELECT (or all columns if *)
    const columns = parsed.select[0] === '*'
      ? (rows[0] ? Object.keys(rows[0]).map(k => ({ name: k, type: 'string' })) : [])
      : parsed.select.map(c => ({ name: c, type: 'string' }));

    return { columns, rows: rows.map(r => [r]), totalRowCount, truncated, executionTimeMs: Date.now() - start, accessedObjectTypes: objectTypes };
  }

  async explain(_ctx: RequestContext, sql: string): Promise<SqlQueryExplanation> {
    const parsed = parseSql(sql);
    const objectTypes = detectObjectTypes(parsed);
    return {
      parsed: {
        select: parsed.select,
        from: [parsed.from],
        joins: parsed.joins,
        where: parsed.where?.map(w => `${w.field} ${w.op} ${w.value}`).join(' AND '),
        groupBy: parsed.groupBy,
        orderBy: parsed.orderBy,
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
      if (parsed.select.length === 0) errors.push('SELECT list is empty');
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
