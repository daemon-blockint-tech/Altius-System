/**
 * Dataset SQL execution — one implementation, both providers.
 *
 * Running a SELECT over datasets is a pure function of the SQL text and the
 * rows the dataset service hands back. Nothing about it is storage-specific, so
 * it lives here and each provider supplies only two things: a `DatasetService`
 * to read through, and somewhere to keep the job record.
 *
 * The reason it is not reimplemented per provider is the same one that applies
 * to the parser it calls: two providers that disagreed about what a query meant
 * would return different rows for the same SQL, and neither would look broken.
 * A query engine that is wrong is a bug; two query engines that disagree is a
 * bug you cannot see from either side.
 *
 * ── What this is not ──
 *
 * It is not a SQL engine. Filtering, ordering, projection and LIMIT are pushed
 * down to `DatasetService.read`; the only thing evaluated here is the join, and
 * only the first one, with a single equality condition. GROUP BY is parsed and
 * then ignored — `parseSql` accepts it, and nothing aggregates. That is the
 * behaviour as it stands in both providers; it is written down here rather than
 * discovered from a query that silently returns ungrouped rows.
 */

import type { RequestContext } from './ontology.js';
import type { DatasetService, ReadOptions, SubmitSqlInput } from './datasets.js';
import { parseSql } from './sql-parser.js';

/** The rows a SELECT produced, and the columns they came back under. */
export interface SqlQueryResult {
  rows: Record<string, unknown>[];
  resultColumns: string[];
}

/**
 * Parse `input.sql` and run it against `datasets`.
 *
 * Throws whatever the parser throws on invalid SQL, and whatever the dataset
 * service throws on an unknown table — callers turn that into a `failed` job
 * rather than letting it escape, which is why nothing is caught here.
 */
export async function executeSqlQuery(
  ctx: RequestContext,
  datasets: DatasetService,
  input: SubmitSqlInput,
): Promise<SqlQueryResult> {
  const ast = parseSql(input.sql);

  const readOpts: ReadOptions = {};
  if (ast.where) {
    const filter: Record<string, unknown> = {};
    for (const w of ast.where) filter[w.field] = { [w.op]: w.value };
    readOpts.filter = filter;
  }
  if (ast.orderBy) readOpts.orderBy = ast.orderBy;
  // A LIMIT in the SQL wins over the one on the request: the caller wrote it
  // into the statement, so it is the more specific of the two.
  if (ast.limit !== undefined) readOpts.limit = ast.limit;
  else if (input.limit !== undefined) readOpts.limit = input.limit;
  if (ast.columns !== '*') readOpts.columns = ast.columns;

  const result = await datasets.read(ctx, ast.from, readOpts, input.branch);
  let rows = result.rows;

  if (ast.joins.length > 0) {
    // Only the first join, and only `left.key = right.key`. A second join, or
    // any other condition shape, is parsed and then silently dropped — matched
    // rather than fixed, because widening it is a contract change.
    const join = ast.joins[0]!;
    const onParts = join.on.match(/(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/);
    if (onParts) {
      const leftKey = onParts[2]!;
      const rightKey = onParts[4]!;
      // The right side is read unfiltered: the WHERE clause was pushed down to
      // the left table only.
      const rightResult = await datasets.read(ctx, join.table, undefined, input.branch);
      const rightMap = new Map<string, Record<string, unknown>>();
      for (const r of rightResult.rows) rightMap.set(String(r[rightKey]), r);

      const joined: Record<string, unknown>[] = [];
      for (const l of rows) {
        const r = rightMap.get(String(l[leftKey]));
        // Right-hand fields win on a name collision, in both providers.
        if (r) joined.push({ ...l, ...r });
        else if (join.type === 'left' || join.type === 'outer') joined.push(l);
      }
      if (join.type === 'right' || join.type === 'outer') {
        const leftKeys = new Set(rows.map(l => String(l[leftKey])));
        for (const r of rightResult.rows) {
          if (!leftKeys.has(String(r[rightKey]))) joined.push(r);
        }
      }
      rows = joined;
    }
  }

  // With `SELECT *` the columns are whatever the first row happens to carry, so
  // an empty result reports no columns rather than the dataset's schema.
  const resultColumns = ast.columns === '*' ? (rows[0] ? Object.keys(rows[0]!) : []) : ast.columns;
  return { rows, resultColumns };
}
