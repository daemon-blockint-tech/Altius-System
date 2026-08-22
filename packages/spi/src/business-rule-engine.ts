/**
 * Business rule execution and validation — shared by every provider.
 *
 * A rule is a DAG of logic nodes, and running it is a pure function of the
 * rule and the input data: no storage is involved once the rule has been
 * loaded. That makes it contract, not implementation detail — two providers
 * that stored the same rule and then disagreed about what it produced would be
 * a far worse defect than one that lost the rule, because nothing would look
 * broken.
 *
 * So the engine lives here and both the in-memory and Postgres services call
 * it. They differ only in where the rule is read from.
 */

import type { BusinessRule, RuleNode, FilterCondition, RuleExecutionResult } from './business-rules.js';

/**
 * Execute a rule's DAG against input data keyed by source target type.
 *
 * Failures are returned as `success: false` with the message rather than
 * thrown: a rule that cannot run is a result about the rule, not an error in
 * the caller, and the node stats collected so far are worth returning.
 */
export function executeBusinessRule(
  rule: BusinessRule,
  data: Map<string, Record<string, unknown>[]>,
  now: () => number = Date.now,
): RuleExecutionResult {
  const start = now();
  const ruleId = rule.id;
  try {
    const nodeStats: RuleExecutionResult['nodeStats'] = [];
    const nodeOutputs = new Map<string, Record<string, unknown>[]>();

    // Topological execution: repeatedly run whichever node has all of its
    // inputs satisfied. A pass that places nothing means the remaining nodes
    // depend on each other.
    const executed = new Set<string>();
    const pending = [...rule.nodes];

    while (pending.length > 0) {
      let progress = false;
      for (let i = 0; i < pending.length; i++) {
        const node = pending[i]!;
        if (node.inputs.every(id => executed.has(id) || !rule.nodes.find(n => n.id === id))) {
          const inputRows = node.inputs.length > 0
            ? node.inputs.flatMap(id => nodeOutputs.get(id) ?? [])
            : getSourceData(node, data);

          const outputRows = executeNode(node, inputRows, nodeOutputs);
          nodeOutputs.set(node.id, outputRows);
          nodeStats.push({ nodeId: node.id, nodeName: node.name, rowsIn: inputRows.length, rowsOut: outputRows.length });
          executed.add(node.id);
          pending.splice(i, 1);
          progress = true;
          break;
        }
      }
      if (!progress) throw new Error('Cycle detected in rule DAG');
    }

    // Output comes from the explicit output nodes, or the last node when the
    // rule declares none.
    const outputNodes = rule.nodes.filter(n => n.type === 'output');
    const outputRows = outputNodes.length > 0
      ? outputNodes.flatMap(n => nodeOutputs.get(n.id) ?? [])
      : (rule.nodes.length > 0 ? nodeOutputs.get(rule.nodes[rule.nodes.length - 1]!.id) ?? [] : []);

    return {
      ruleId, success: true,
      outputRows,
      rowsProcessed: nodeStats.reduce((s, n) => s + n.rowsIn, 0),
      rowsOutput: outputRows.length,
      executedAt: new Date().toISOString(),
      durationMs: now() - start,
      nodeStats,
    };
  } catch (err) {
    return {
      ruleId, success: false,
      outputRows: [],
      rowsProcessed: 0, rowsOutput: 0,
      executedAt: new Date().toISOString(),
      durationMs: now() - start,
      errorMessage: err instanceof Error ? err.message : 'Execution failed',
      nodeStats: [],
    };
  }
}

/** Check a rule's DAG for missing inputs and cycles. */
export function validateBusinessRule(rule: BusinessRule): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeIds = new Set(rule.nodes.map(n => n.id));
  for (const node of rule.nodes) {
    for (const inputId of node.inputs) {
      if (!nodeIds.has(inputId)) errors.push(`Node "${node.name}" references missing input: ${inputId}`);
    }
  }
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const hasCycle = (nodeId: string): boolean => {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    const node = rule.nodes.find(n => n.id === nodeId);
    if (node) {
      for (const inputId of node.inputs) {
        if (!visited.has(inputId)) {
          if (hasCycle(inputId)) return true;
        } else if (recursionStack.has(inputId)) {
          return true;
        }
      }
    }
    recursionStack.delete(nodeId);
    return false;
  };
  for (const node of rule.nodes) {
    if (!visited.has(node.id) && hasCycle(node.id)) {
      errors.push('Cycle detected in rule DAG');
      break;
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── Node evaluators ────────────────────────────────────────────────────────

function getSourceData(node: RuleNode, data: Map<string, Record<string, unknown>[]>): Record<string, unknown>[] {
  if (node.type === 'source' && node.source) {
    return data.get(node.source.targetType) ?? [];
  }
  return [];
}

function executeNode(node: RuleNode, inputRows: Record<string, unknown>[], nodeOutputs: Map<string, Record<string, unknown>[]>): Record<string, unknown>[] {
  switch (node.type) {
    case 'source':
      return inputRows;

    case 'filter':
      return inputRows.filter(row => evaluateConditions(row, node.filter ?? []));

    case 'select':
      return inputRows.map(row => {
        const projected: Record<string, unknown> = {};
        for (const col of node.select ?? []) projected[col] = row[col];
        return projected;
      });

    case 'expression':
      return inputRows.map(row => ({
        ...row,
        [node.expression!.outputField]: evaluateExpression(row, node.expression!),
      }));

    case 'aggregate':
      return executeAggregate(inputRows, node.aggregate!);

    case 'join':
      return executeJoin(node, nodeOutputs);

    case 'union':
      return executeUnion(node, nodeOutputs);

    case 'window':
      return executeWindow(inputRows, node.window!);

    case 'sort':
      return [...inputRows].sort((a, b) => {
        const av = a[node.sort!.field] as string | number | undefined;
        const bv = b[node.sort!.field] as string | number | undefined;
        if (av === bv) return 0;
        const cmp = (av ?? '') < (bv ?? '') ? -1 : 1;
        return node.sort!.direction === 'asc' ? cmp : -cmp;
      });

    case 'limit':
      return inputRows.slice(0, node.limit ?? inputRows.length);

    case 'output':
      return inputRows;

    default:
      return inputRows;
  }
}

function evaluateConditions(row: Record<string, unknown>, conditions: FilterCondition[]): boolean {
  return conditions.every(c => evaluateCondition(row, c));
}

function evaluateCondition(row: Record<string, unknown>, cond: FilterCondition): boolean {
  const val = row[cond.field];
  switch (cond.operator) {
    case 'eq': return val === cond.value;
    case 'ne': return val !== cond.value;
    case 'gt': return typeof val === 'number' && typeof cond.value === 'number' && val > cond.value;
    case 'gte': return typeof val === 'number' && typeof cond.value === 'number' && val >= cond.value;
    case 'lt': return typeof val === 'number' && typeof cond.value === 'number' && val < cond.value;
    case 'lte': return typeof val === 'number' && typeof cond.value === 'number' && val <= cond.value;
    case 'in': return Array.isArray(cond.values) && cond.values.includes(val);
    case 'not_in': return Array.isArray(cond.values) && !cond.values.includes(val);
    case 'contains': return typeof val === 'string' && typeof cond.value === 'string' && val.includes(cond.value);
    case 'starts_with': return typeof val === 'string' && typeof cond.value === 'string' && val.startsWith(cond.value);
    case 'ends_with': return typeof val === 'string' && typeof cond.value === 'string' && val.endsWith(cond.value);
    case 'is_null': return val === null || val === undefined;
    case 'is_not_null': return val !== null && val !== undefined;
    default: return false;
  }
}

function evaluateExpression(row: Record<string, unknown>, expr: NonNullable<RuleNode['expression']>): unknown {
  const operands = expr.operands.map(o => o.field ? row[o.field] : o.value);
  if (expr.exprType === 'arithmetic') {
    const [a, b] = operands;
    if (typeof a !== 'number' || typeof b !== 'number') return null;
    switch (expr.operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return b !== 0 ? a / b : null;
      default: return null;
    }
  }
  if (expr.exprType === 'string') {
    return operands.map(o => String(o ?? '')).join('');
  }
  return null;
}

function executeAggregate(rows: Record<string, unknown>[], agg: NonNullable<RuleNode['aggregate']>): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = agg.groupBy.map(f => String(row[f] ?? '')).join('|');
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }
  return Array.from(groups.entries()).map(([key, groupRows]) => {
    const result: Record<string, unknown> = {};
    const keyParts = key.split('|');
    agg.groupBy.forEach((f, i) => { result[f] = keyParts[i]; });
    for (const m of agg.measures) {
      const values = groupRows.map(r => r[m.field]).filter(v => v !== null && v !== undefined);
      switch (m.function) {
        case 'count': result[m.outputField] = groupRows.length; break;
        case 'sum': result[m.outputField] = values.reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0); break;
        case 'avg': result[m.outputField] = values.length > 0 ? values.reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0) / values.length : 0; break;
        case 'min': result[m.outputField] = values.length > 0 ? Math.min(...values.filter((v): v is number => typeof v === 'number')) : null; break;
        case 'max': result[m.outputField] = values.length > 0 ? Math.max(...values.filter((v): v is number => typeof v === 'number')) : null; break;
        case 'first': result[m.outputField] = values[0] ?? null; break;
        case 'last': result[m.outputField] = values[values.length - 1] ?? null; break;
      }
    }
    return result;
  });
}

function executeJoin(node: RuleNode, nodeOutputs: Map<string, Record<string, unknown>[]>): Record<string, unknown>[] {
  const join = node.join!;
  const left = nodeOutputs.get(join.leftSourceId) ?? [];
  const right = nodeOutputs.get(join.rightSourceId) ?? [];
  const results: Record<string, unknown>[] = [];

  for (const l of left) {
    const matches = right.filter(r => r[join.rightKey] === l[join.leftKey]);
    if (matches.length > 0) {
      for (const m of matches) results.push({ ...l, ...m });
    } else if (join.joinType === 'left' || join.joinType === 'full') {
      results.push(l);
    }
  }
  if (join.joinType === 'right' || join.joinType === 'full') {
    for (const r of right) {
      if (!left.some(l => l[join.leftKey] === r[join.rightKey])) results.push(r);
    }
  }
  return results;
}

function executeUnion(node: RuleNode, nodeOutputs: Map<string, Record<string, unknown>[]>): Record<string, unknown>[] {
  const union = node.union!;
  return union.sourceIds.flatMap(id => nodeOutputs.get(id) ?? []);
}

function executeWindow(rows: Record<string, unknown>[], win: NonNullable<RuleNode['window']>): Record<string, unknown>[] {
  // Sort by timestamp
  const sorted = [...rows].sort((a, b) => {
    const av = a[win.timestampField] as string | undefined;
    const bv = b[win.timestampField] as string | undefined;
    return (av ?? '').localeCompare(bv ?? '');
  });

  const results: Record<string, unknown>[] = [];
  const windowStart = sorted.length > 0 ? new Date(sorted[0]![win.timestampField] as string).getTime() : 0;
  const windowEnd = sorted.length > 0 ? new Date(sorted[sorted.length - 1]![win.timestampField] as string).getTime() : 0;

  for (let ws = windowStart; ws <= windowEnd; ws += win.slideMs ?? win.windowSizeMs) {
    const we = ws + win.windowSizeMs;
    const windowRows = sorted.filter(r => {
      const ts = new Date(r[win.timestampField] as string).getTime();
      return ts >= ws && ts < we;
    });
    if (windowRows.length === 0) continue;
    const aggregated = executeAggregate(windowRows, {
      groupBy: win.groupBy,
      measures: win.measures,
    });
    for (const a of aggregated) {
      results.push({ ...a, _windowStart: new Date(ws).toISOString(), _windowEnd: new Date(we).toISOString() });
    }
  }
  return results;
}
