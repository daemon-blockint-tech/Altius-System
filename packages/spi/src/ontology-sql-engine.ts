/**
 * Ontology SQL engine — the SELECT-subset evaluator that runs SQL Studio
 * queries over *object types* (virtual tables), not physical database tables.
 *
 * The evaluation is pure: given the already-read ontology rows for each
 * referenced object type, it applies JOIN/WHERE/GROUP BY/ORDER BY/LIMIT and
 * shapes the result. Reading the rows (tenant-scoped, authorized) is the
 * caller's job — every provider passes rows it obtained through the governed
 * ObjectManager, so no provider can reach raw tables or another tenant's data.
 *
 * It lives here, shared, so the in-memory and Postgres services cannot disagree
 * about what a query means — the same reason parseSql and executeSqlQuery do.
 */

import { parseSql, type ParsedSqlAst } from './sql-parser.js';

/** One ontology object as the engine consumes it: its id plus its properties. */
export interface OntologySqlRow {
  id: string;
  properties: Record<string, unknown>;
}

/** The engine's result, before it is wrapped in timing/metadata by a service. */
export interface OntologySqlEvalResult {
  columns: Array<{ name: string; type: string }>;
  rows: Array<[Record<string, unknown>]>;
  totalRowCount: number;
  truncated: boolean;
  accessedObjectTypes: string[];
}

/** Every object type a parsed query reads: the FROM table plus every JOIN. */
export function detectSqlObjectTypes(parsed: ParsedSqlAst): string[] {
  const types = new Set<string>([parsed.from]);
  for (const j of parsed.joins) types.add(j.table);
  return Array.from(types);
}

/**
 * Evaluate a parsed SELECT over already-loaded ontology rows. `objectsByType`
 * must hold an entry (possibly empty) for every type in `detectSqlObjectTypes`.
 */
export function evaluateOntologySql(
  parsed: ParsedSqlAst,
  objectsByType: Map<string, OntologySqlRow[]>,
  limit: number,
): OntologySqlEvalResult {
  const objectTypes = detectSqlObjectTypes(parsed);

  // Base result set from the FROM table.
  let rows: Array<Record<string, unknown>> = (objectsByType.get(parsed.from) ?? []).map(obj => ({
    ...obj.properties,
    _id: obj.id,
    _type: parsed.from,
  }));

  // JOINs — nested loop.
  for (const join of parsed.joins) {
    const joinObjects = objectsByType.get(join.table) ?? [];
    const [leftPart, rightPart] = join.on.split('=').map(s => s.trim());
    const [leftTable, leftField] = leftPart!.split('.');
    const [, rightField] = rightPart!.split('.');
    const joined: Array<Record<string, unknown>> = [];
    for (const row of rows) {
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

  // WHERE.
  if (parsed.where) {
    rows = rows.filter(row => parsed.where!.every(w => {
      const val = row[w.field];
      const cmp = String(val);
      switch (w.op) {
        case '=': case 'eq': return cmp === String(w.value);
        case '!=': case '<>': case 'neq': return cmp !== String(w.value);
        case '>': case 'gt': return Number(val) > Number(w.value);
        case '>=': case 'gte': return Number(val) >= Number(w.value);
        case '<': case 'lt': return Number(val) < Number(w.value);
        case '<=': case 'lte': return Number(val) <= Number(w.value);
        case 'like': return new RegExp(String(w.value).replace(/%/g, '.*').replace(/_/g, '.')).test(cmp);
        default: return true;
      }
    }));
  }

  const totalRowCount = rows.length;

  // GROUP BY with aggregations.
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
      for (const col of parsed.columns === '*' ? [] : parsed.columns) {
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

  // ORDER BY.
  if (parsed.orderBy) {
    for (const ob of parsed.orderBy) {
      rows.sort((a, b) => {
        const av = String(a[ob.field] ?? ''), bv = String(b[ob.field] ?? '');
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return ob.direction === 'desc' ? -cmp : cmp;
      });
    }
  }

  // LIMIT.
  const truncated = rows.length > limit;
  rows = rows.slice(0, limit);

  // Columns from SELECT (or all columns if *).
  const colList = parsed.columns === '*' ? null : parsed.columns;
  const columns = colList === null
    ? (rows[0] ? Object.keys(rows[0]).map(k => ({ name: k, type: 'string' })) : [])
    : colList.map(c => ({ name: c, type: 'string' }));

  return { columns, rows: rows.map(r => [r] as [Record<string, unknown>]), totalRowCount, truncated, accessedObjectTypes: objectTypes };
}

/** Parse then evaluate; convenience for services that hold rows by type. */
export function runOntologySql(
  sql: string,
  objectsByType: Map<string, OntologySqlRow[]>,
  limit?: number,
): OntologySqlEvalResult {
  const parsed = parseSql(sql);
  return evaluateOntologySql(parsed, objectsByType, limit ?? parsed.limit ?? 1000);
}
