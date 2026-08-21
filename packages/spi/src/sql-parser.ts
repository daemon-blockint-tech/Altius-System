/**
 * Shared SQL parser — one implementation for Ontology SQL and Dataset SQL.
 *
 * There used to be two separate parseSql() functions, one per consumer; they
 * were merged into this one. It lives in @altius/spi rather than in a provider
 * because a parser is pure — the same text has to become the same AST whichever
 * provider ends up running the query. Two providers that disagreed about what a
 * WHERE clause meant would return different rows for the same SQL, which is a
 * worse failure than either of them being wrong on its own: neither would look
 * broken.
 */

/** A parsed SQL SELECT statement. */
export interface ParsedSqlAst {
  /** Selected columns, or '*' for all. */
  columns: string[] | '*';
  /** FROM table name. */
  from: string;
  /** Optional table alias. */
  alias?: string;
  /** JOINs. */
  joins: Array<{
    type: 'inner' | 'left' | 'right' | 'outer';
    table: string;
    on: string;
  }>;
  /** WHERE conditions (AND-separated). */
  where?: Array<{ field: string; op: string; value: unknown }>;
  /** GROUP BY columns. */
  groupBy?: string[];
  /** ORDER BY clauses. */
  orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  /** LIMIT. */
  limit?: number;
}

/**
 * Parse a SQL SELECT statement into a structured AST.
 *
 * Supports: SELECT, FROM (with optional alias), JOIN, WHERE, GROUP BY, ORDER BY, LIMIT.
 * Throws on non-SELECT statements.
 */
export function parseSql(sql: string): ParsedSqlAst {
  const s = sql.trim().replace(/;$/, '');
  const upper = s.toUpperCase();
  if (!upper.startsWith('SELECT')) throw new Error('Only SELECT statements supported');

  // ── SELECT ... FROM ──
  const fromIdx = upper.indexOf(' FROM ');
  if (fromIdx < 0) throw new Error('Missing FROM clause');
  const colsPart = s.slice(6, fromIdx).trim();
  const columns: string[] | '*' = colsPart === '*' ? '*' : colsPart.split(',').map(c => c.trim());

  // ── Everything after FROM ──
  const rest = s.slice(fromIdx + 6);

  // ── LIMIT ──
  let limit: number | undefined;
  const limitMatch = rest.match(/\s+LIMIT\s+(\d+)\s*$/i);
  let restNoLimit = rest;
  if (limitMatch) {
    limit = parseInt(limitMatch[1]!, 10);
    restNoLimit = rest.slice(0, limitMatch.index);
  }

  // ── ORDER BY ──
  let orderBy: Array<{ field: string; direction: 'asc' | 'desc' }> | undefined;
  const orderMatch = restNoLimit.match(/\s+ORDER\s+BY\s+(.+)$/i);
  let restNoOrder = restNoLimit;
  if (orderMatch) {
    restNoOrder = restNoLimit.slice(0, orderMatch.index);
    orderBy = orderMatch[1]!.split(',').map(p => {
      const [field, dir] = p.trim().split(/\s+/);
      return { field: field!, direction: (dir?.toUpperCase() === 'DESC' ? 'desc' : 'asc') as 'asc' | 'desc' };
    });
  }

  // ── GROUP BY ──
  let groupBy: string[] | undefined;
  const groupMatch = restNoOrder.match(/\s+GROUP\s+BY\s+(.+?)(?:\s+HAVING|$)/i);
  let restNoGroup = restNoOrder;
  if (groupMatch) {
    restNoGroup = restNoOrder.slice(0, groupMatch.index);
    groupBy = groupMatch[1]!.split(',').map(s => s.trim());
  }

  // ── WHERE ──
  let where: Array<{ field: string; op: string; value: unknown }> | undefined;
  const whereMatch = restNoGroup.match(/\s+WHERE\s+(.+)$/i);
  let restNoWhere = restNoGroup;
  if (whereMatch) {
    restNoWhere = restNoGroup.slice(0, whereMatch.index);
    where = whereMatch[1]!.split(/\s+AND\s+/i).map(cond => {
      const m = cond.match(/^(\S+)\s*(=|!=|<>|<=|>=|<|>|like)\s*(.+)$/i);
      if (!m) throw new Error(`Unsupported WHERE condition: ${cond}`);
      const field = m[1]!;
      const rawOp = m[2]!.toLowerCase();
      const op = rawOp === '=' ? 'eq' : rawOp === '!=' || rawOp === '<>' ? 'neq' : rawOp === '<' ? 'lt' : rawOp === '>' ? 'gt' : rawOp === '<=' ? 'lte' : rawOp === '>=' ? 'gte' : rawOp;
      let value: unknown = m[3]!.replace(/^['"]|['"]$/g, '');
      if (/^-?\d+(\.\d+)?$/.test(value as string)) value = Number(value);
      return { field, op, value };
    });
  }

  // ── FROM + JOIN ──
  let fromTable = restNoWhere.trim();
  let alias: string | undefined;
  let joins: ParsedSqlAst['joins'] = [];

  // Extract JOINs
  const joinMatch = fromTable.match(/^(.+?)\s+(INNER|LEFT|RIGHT|OUTER)?\s*JOIN\s+(\w+)\s+ON\s+(\S+\s*=\s*\S+)$/i);
  if (joinMatch) {
    fromTable = joinMatch[1]!.trim();
    const kindRaw = (joinMatch[2] ?? 'INNER').toUpperCase();
    const type = (kindRaw === 'LEFT' ? 'left' : kindRaw === 'RIGHT' ? 'right' : kindRaw === 'OUTER' ? 'outer' : 'inner') as 'inner' | 'left' | 'right' | 'outer';
    joins = [{ type, table: joinMatch[3]!, on: joinMatch[4]!.trim() }];
  }

  // FROM may have alias: "table a" or "table AS a"
  const fromParts = fromTable.split(/\s+(?:AS\s+)?/i);
  const from = fromParts[0]!;
  alias = fromParts[1];

  return { columns, from, alias, joins, where, groupBy, orderBy, limit };
}
