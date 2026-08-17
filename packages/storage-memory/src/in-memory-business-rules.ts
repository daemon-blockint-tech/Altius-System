/**
 * In-memory business rules engine.
 */

import { randomUUID } from 'node:crypto';
import type {
  BusinessRulesService,
  BusinessRule,
  RuleNode,
  FilterCondition,
  RuleExecutionResult,
  CreateRuleInput,
  RequestContext,
} from '@altius/spi';

export class InMemoryBusinessRulesService implements BusinessRulesService {
  private readonly rules = new Map<string, Map<string, BusinessRule>>();

  async create(ctx: RequestContext, input: CreateRuleInput): Promise<BusinessRule> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const nodes: RuleNode[] = input.nodes.map(n => ({ ...n, id: randomUUID() }));
    const rule: BusinessRule = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description,
      nodes,
      state: 'draft',
      createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
      isTimeSeriesBoard: input.isTimeSeriesBoard ?? false,
    };
    this.getMap(ctx.tenantId).set(id, rule);
    return rule;
  }

  async get(ctx: RequestContext, ruleId: string): Promise<BusinessRule | null> {
    return this.rules.get(ctx.tenantId)?.get(ruleId) ?? null;
  }

  async list(ctx: RequestContext, state?: BusinessRule['state']): Promise<BusinessRule[]> {
    const tenantRules = this.rules.get(ctx.tenantId);
    if (!tenantRules) return [];
    let results = Array.from(tenantRules.values());
    if (state) results = results.filter(r => r.state === state);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(ctx: RequestContext, ruleId: string, updates: Partial<CreateRuleInput>): Promise<BusinessRule> {
    const rule = this.rules.get(ctx.tenantId)?.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    let nodes = rule.nodes;
    if (updates.nodes) {
      // Preserve existing node IDs where possible (match by index)
      const oldNodes = rule.nodes;
      nodes = updates.nodes.map((n, i) => ({
        ...n,
        id: oldNodes[i]?.id ?? randomUUID(),
      }));
    }
    const updated: BusinessRule = {
      ...rule,
      name: updates.name ?? rule.name,
      description: updates.description ?? rule.description,
      nodes,
      isTimeSeriesBoard: updates.isTimeSeriesBoard ?? rule.isTimeSeriesBoard,
      updatedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(ruleId, updated);
    return updated;
  }

  async delete(ctx: RequestContext, ruleId: string): Promise<void> {
    this.rules.get(ctx.tenantId)?.delete(ruleId);
  }

  async submitForApproval(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'draft', 'proposed');
  }

  async approve(ctx: RequestContext, ruleId: string, reviewerId: string, notes?: string): Promise<BusinessRule> {
    const rule = await this.transition(ctx, ruleId, 'proposed', 'approved');
    const updated = { ...rule, reviewedBy: reviewerId, reviewNotes: notes, reviewedAt: new Date().toISOString() };
    this.getMap(ctx.tenantId).set(ruleId, updated);
    return updated;
  }

  async reject(ctx: RequestContext, ruleId: string, reviewerId: string, notes: string): Promise<BusinessRule> {
    const rule = await this.transition(ctx, ruleId, 'proposed', 'rejected');
    const updated = { ...rule, reviewedBy: reviewerId, reviewNotes: notes, reviewedAt: new Date().toISOString() };
    this.getMap(ctx.tenantId).set(ruleId, updated);
    return updated;
  }

  async activate(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'approved', 'active');
  }

  async deactivate(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'active', 'inactive');
  }

  async execute(ctx: RequestContext, ruleId: string, data: Map<string, Record<string, unknown>[]>): Promise<RuleExecutionResult> {
    const start = Date.now();
    const rule = this.rules.get(ctx.tenantId)?.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);

    try {
      const nodeStats: RuleExecutionResult['nodeStats'] = [];
      const nodeOutputs = new Map<string, Record<string, unknown>[]>();

      // Topological execution
      const executed = new Set<string>();
      const pending = [...rule.nodes];

      while (pending.length > 0) {
        let progress = false;
        for (let i = 0; i < pending.length; i++) {
          const node = pending[i]!;
          if (node.inputs.every(id => executed.has(id) || !rule.nodes.find(n => n.id === id))) {
            const inputRows = node.inputs.length > 0
              ? node.inputs.flatMap(id => nodeOutputs.get(id) ?? [])
              : this.getSourceData(node, data);

            const outputRows = this.executeNode(node, inputRows, nodeOutputs);
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

      // Collect output from output nodes (or last node)
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
        durationMs: Date.now() - start,
        nodeStats,
      };
    } catch (err) {
      return {
        ruleId, success: false,
        outputRows: [],
        rowsProcessed: 0, rowsOutput: 0,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        errorMessage: err instanceof Error ? err.message : 'Execution failed',
        nodeStats: [],
      };
    }
  }

  async validate(ctx: RequestContext, ruleId: string): Promise<{ valid: boolean; errors: string[] }> {
    return this.validateRule(ctx, ruleId);
  }

  async validateRule(ctx: RequestContext, ruleId: string): Promise<{ valid: boolean; errors: string[] }> {
    const rule = this.rules.get(ctx.tenantId)?.get(ruleId);
    if (!rule) return { valid: false, errors: ['Rule not found'] };
    const errors: string[] = [];
    const nodeIds = new Set(rule.nodes.map(n => n.id));
    for (const node of rule.nodes) {
      for (const inputId of node.inputs) {
        if (!nodeIds.has(inputId)) errors.push(`Node "${node.name}" references missing input: ${inputId}`);
      }
    }
    // Check for cycles
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

  // ── Private helpers ──

  private getSourceData(node: RuleNode, data: Map<string, Record<string, unknown>[]>): Record<string, unknown>[] {
    if (node.type === 'source' && node.source) {
      return data.get(node.source.targetType) ?? [];
    }
    return [];
  }

  private executeNode(node: RuleNode, inputRows: Record<string, unknown>[], nodeOutputs: Map<string, Record<string, unknown>[]>): Record<string, unknown>[] {
    switch (node.type) {
      case 'source':
        return inputRows;

      case 'filter':
        return inputRows.filter(row => this.evaluateConditions(row, node.filter ?? []));

      case 'select':
        return inputRows.map(row => {
          const projected: Record<string, unknown> = {};
          for (const col of node.select ?? []) projected[col] = row[col];
          return projected;
        });

      case 'expression':
        return inputRows.map(row => ({
          ...row,
          [node.expression!.outputField]: this.evaluateExpression(row, node.expression!),
        }));

      case 'aggregate':
        return this.executeAggregate(inputRows, node.aggregate!);

      case 'join':
        return this.executeJoin(node, nodeOutputs);

      case 'union':
        return this.executeUnion(node, nodeOutputs);

      case 'window':
        return this.executeWindow(inputRows, node.window!);

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

  private evaluateConditions(row: Record<string, unknown>, conditions: FilterCondition[]): boolean {
    return conditions.every(c => this.evaluateCondition(row, c));
  }

  private evaluateCondition(row: Record<string, unknown>, cond: FilterCondition): boolean {
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

  private evaluateExpression(row: Record<string, unknown>, expr: NonNullable<RuleNode['expression']>): unknown {
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

  private executeAggregate(rows: Record<string, unknown>[], agg: NonNullable<RuleNode['aggregate']>): Record<string, unknown>[] {
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

  private executeJoin(node: RuleNode, nodeOutputs: Map<string, Record<string, unknown>[]>): Record<string, unknown>[] {
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

  private executeUnion(node: RuleNode, nodeOutputs: Map<string, Record<string, unknown>[]>): Record<string, unknown>[] {
    const union = node.union!;
    return union.sourceIds.flatMap(id => nodeOutputs.get(id) ?? []);
  }

  private executeWindow(rows: Record<string, unknown>[], win: NonNullable<RuleNode['window']>): Record<string, unknown>[] {
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
      const aggregated = this.executeAggregate(windowRows, {
        groupBy: win.groupBy,
        measures: win.measures,
      });
      for (const a of aggregated) {
        results.push({ ...a, _windowStart: new Date(ws).toISOString(), _windowEnd: new Date(we).toISOString() });
      }
    }
    return results;
  }

  private async transition(ctx: RequestContext, ruleId: string, expected: BusinessRule['state'], next: BusinessRule['state']): Promise<BusinessRule> {
    const rule = this.rules.get(ctx.tenantId)?.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    if (rule.state !== expected) throw new Error(`Cannot transition from ${rule.state} to ${next}`);
    const updated: BusinessRule = { ...rule, state: next, updatedAt: new Date().toISOString() };
    this.getMap(ctx.tenantId).set(ruleId, updated);
    return updated;
  }

  private getMap(tenantId: string): Map<string, BusinessRule> {
    let m = this.rules.get(tenantId);
    if (!m) { m = new Map(); this.rules.set(tenantId, m); }
    return m;
  }
}
