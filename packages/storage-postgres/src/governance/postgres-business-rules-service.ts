/**
 * PostgreSQL-backed business rules engine.
 *
 * Persists no-code business rules and executes them in-process with the same
 * topological node engine as the in-memory provider.
 */

import type { Pool } from 'pg';
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

function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJsonb<T>(v: unknown): T {
  if (v === null || v === undefined) {
    return undefined as unknown as T;
  }
  if (typeof v === 'string') {
    return JSON.parse(v) as T;
  }
  return v as T;
}

function mapBusinessRule(row: Record<string, unknown>): BusinessRule {
  const rule: BusinessRule = {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    name: String(row['name'] ?? ''),
    description: String(row['description'] ?? ''),
    state: row['state'] as BusinessRule['state'],
    nodes: parseJsonb<RuleNode[]>(row['nodes']) ?? [],
    isTimeSeriesBoard: row['is_time_series_board'] === true,
    createdAt: toIso(row['created_at'])!,
    updatedAt: toIso(row['updated_at'])!,
    createdBy: String(row['created_by'] ?? ''),
    reviewedBy: row['reviewed_by'] ? String(row['reviewed_by']) : undefined,
    reviewNotes: row['review_notes'] ? String(row['review_notes']) : undefined,
    reviewedAt: toIso(row['reviewed_at']),
  };
  return rule;
}

export class PostgresBusinessRulesService implements BusinessRulesService {
  constructor(private readonly pool: Pool) {}

  async create(ctx: RequestContext, input: CreateRuleInput): Promise<BusinessRule> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const nodes: RuleNode[] = input.nodes.map((n) => ({ ...n, id: randomUUID() }));
    const r = await this.pool.query(
      `INSERT INTO "governance"."business_rules"
         ("id","tenant_id","name","description","state","nodes","is_time_series_board","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9)
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        input.name,
        input.description ?? '',
        'draft',
        JSON.stringify(nodes),
        input.isTimeSeriesBoard ?? false,
        now,
        ctx.actorId ?? 'system',
      ],
    );
    return mapBusinessRule(r.rows[0]!);
  }

  async get(ctx: RequestContext, ruleId: string): Promise<BusinessRule | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."business_rules" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, ruleId],
    );
    return r.rows[0] ? mapBusinessRule(r.rows[0]!) : null;
  }

  async list(ctx: RequestContext, state?: BusinessRule['state']): Promise<BusinessRule[]> {
    let sql = `SELECT * FROM "governance"."business_rules" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (state) {
      params.push(state);
      sql += ` AND "state"=$${params.length}`;
    }
    sql += ` ORDER BY "created_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapBusinessRule);
  }

  async update(ctx: RequestContext, ruleId: string, updates: Partial<CreateRuleInput>): Promise<BusinessRule> {
    const current = await this.get(ctx, ruleId);
    if (!current) throw new Error(`Rule not found: ${ruleId}`);

    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      params.push(updates.name);
      sets.push(`"name"=$${params.length}`);
    }
    if (updates.description !== undefined) {
      params.push(updates.description);
      sets.push(`"description"=$${params.length}`);
    }
    if (updates.nodes !== undefined) {
      const oldNodes = current.nodes;
      const nodes: RuleNode[] = updates.nodes.map((n, i) => ({
        ...n,
        id: oldNodes[i]?.id ?? randomUUID(),
      }));
      params.push(JSON.stringify(nodes));
      sets.push(`"nodes"=$${params.length}`);
    }
    if (updates.isTimeSeriesBoard !== undefined) {
      params.push(updates.isTimeSeriesBoard);
      sets.push(`"is_time_series_board"=$${params.length}`);
    }

    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(ruleId, ctx.tenantId);

    const r = await this.pool.query(
      `UPDATE "governance"."business_rules" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`,
      params,
    );
    if (!r.rows[0]) throw new Error(`Rule not found: ${ruleId}`);
    return mapBusinessRule(r.rows[0]!);
  }

  async delete(ctx: RequestContext, ruleId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "governance"."business_rules" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, ruleId],
    );
  }

  async submitForApproval(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'draft', 'proposed');
  }

  async approve(ctx: RequestContext, ruleId: string, reviewerId: string, notes?: string): Promise<BusinessRule> {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."business_rules"
          SET "state"=$3, "reviewed_by"=$4, "review_notes"=$5, "reviewed_at"=$6, "updated_at"=$6
        WHERE "tenant_id"=$1 AND "id"=$2 AND "state"=$7
        RETURNING *`,
      [ctx.tenantId, ruleId, 'approved', reviewerId, notes ?? null, now, 'proposed'],
    );
    if (!r.rows[0]) {
      const current = await this.get(ctx, ruleId);
      if (!current) throw new Error(`Rule not found: ${ruleId}`);
      throw new Error(`Cannot transition from ${current.state} to approved`);
    }
    return mapBusinessRule(r.rows[0]!);
  }

  async reject(ctx: RequestContext, ruleId: string, reviewerId: string, notes: string): Promise<BusinessRule> {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."business_rules"
          SET "state"=$3, "reviewed_by"=$4, "review_notes"=$5, "reviewed_at"=$6, "updated_at"=$6
        WHERE "tenant_id"=$1 AND "id"=$2 AND "state"=$7
        RETURNING *`,
      [ctx.tenantId, ruleId, 'rejected', reviewerId, notes, now, 'proposed'],
    );
    if (!r.rows[0]) {
      const current = await this.get(ctx, ruleId);
      if (!current) throw new Error(`Rule not found: ${ruleId}`);
      throw new Error(`Cannot transition from ${current.state} to rejected`);
    }
    return mapBusinessRule(r.rows[0]!);
  }

  async activate(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'approved', 'active');
  }

  async deactivate(ctx: RequestContext, ruleId: string): Promise<BusinessRule> {
    return this.transition(ctx, ruleId, 'active', 'inactive');
  }

  async execute(ctx: RequestContext, ruleId: string, data: Map<string, Record<string, unknown>[]>): Promise<RuleExecutionResult> {
    const start = Date.now();
    const rule = await this.get(ctx, ruleId);
    if (!rule) {
      return {
        ruleId,
        success: false,
        outputRows: [],
        rowsProcessed: 0,
        rowsOutput: 0,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        errorMessage: `Rule not found: ${ruleId}`,
        nodeStats: [],
      };
    }

    try {
      const nodeStats: RuleExecutionResult['nodeStats'] = [];
      const nodeOutputs = new Map<string, Record<string, unknown>[]>();
      const executed = new Set<string>();
      const pending = [...rule.nodes];

      while (pending.length > 0) {
        let progress = false;
        for (let i = 0; i < pending.length; i++) {
          const node = pending[i]!;
          if (node.inputs.every((id) => executed.has(id) || !rule.nodes.find((n) => n.id === id))) {
            const inputRows = node.inputs.length > 0
              ? node.inputs.flatMap((id) => nodeOutputs.get(id) ?? [])
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

      const outputNodes = rule.nodes.filter((n) => n.type === 'output');
      const outputRows = outputNodes.length > 0
        ? outputNodes.flatMap((n) => nodeOutputs.get(n.id) ?? [])
        : (rule.nodes.length > 0 ? nodeOutputs.get(rule.nodes[rule.nodes.length - 1]!.id) ?? [] : []);

      return {
        ruleId,
        success: true,
        outputRows,
        rowsProcessed: nodeStats.reduce((s, n) => s + n.rowsIn, 0),
        rowsOutput: outputRows.length,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        nodeStats,
      };
    } catch (err) {
      return {
        ruleId,
        success: false,
        outputRows: [],
        rowsProcessed: 0,
        rowsOutput: 0,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        errorMessage: err instanceof Error ? err.message : 'Execution failed',
        nodeStats: [],
      };
    }
  }

  async validate(ctx: RequestContext, ruleId: string): Promise<{ valid: boolean; errors: string[] }> {
    const rule = await this.get(ctx, ruleId);
    if (!rule) return { valid: false, errors: ['Rule not found'] };
    const errors: string[] = [];
    const nodeIds = new Set(rule.nodes.map((n) => n.id));
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
      const node = rule.nodes.find((n) => n.id === nodeId);
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

  // ── Internals ────────────────────────────────────────────────────────────

  private async transition(
    ctx: RequestContext,
    ruleId: string,
    expected: BusinessRule['state'],
    next: BusinessRule['state'],
  ): Promise<BusinessRule> {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."business_rules"
          SET "state"=$3, "updated_at"=$4
        WHERE "tenant_id"=$1 AND "id"=$2 AND "state"=$5
        RETURNING *`,
      [ctx.tenantId, ruleId, next, now, expected],
    );
    if (!r.rows[0]) {
      const current = await this.get(ctx, ruleId);
      if (!current) throw new Error(`Rule not found: ${ruleId}`);
      throw new Error(`Cannot transition from ${current.state} to ${next}`);
    }
    return mapBusinessRule(r.rows[0]!);
  }

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
        return inputRows.filter((row) => this.evaluateConditions(row, node.filter ?? []));

      case 'select':
        return inputRows.map((row) => {
          const projected: Record<string, unknown> = {};
          for (const col of node.select ?? []) projected[col] = row[col];
          return projected;
        });

      case 'expression':
        return inputRows.map((row) => ({
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
    return conditions.every((c) => this.evaluateCondition(row, c));
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
    const operands = expr.operands.map((o) => (o.field ? row[o.field] : o.value));
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
      return operands.map((o) => String(o ?? '')).join('');
    }
    return null;
  }

  private executeAggregate(rows: Record<string, unknown>[], agg: NonNullable<RuleNode['aggregate']>): Record<string, unknown>[] {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const key = agg.groupBy.map((f) => String(row[f] ?? '')).join('|');
      const arr = groups.get(key) ?? [];
      arr.push(row);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).map(([key, groupRows]) => {
      const result: Record<string, unknown> = {};
      const keyParts = key.split('|');
      agg.groupBy.forEach((f, i) => { result[f] = keyParts[i]; });
      for (const m of agg.measures) {
        const values = groupRows.map((r) => r[m.field]).filter((v) => v !== null && v !== undefined);
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
      const matches = right.filter((r) => r[join.rightKey] === l[join.leftKey]);
      if (matches.length > 0) {
        for (const m of matches) results.push({ ...l, ...m });
      } else if (join.joinType === 'left' || join.joinType === 'full') {
        results.push(l);
      }
    }
    if (join.joinType === 'right' || join.joinType === 'full') {
      for (const r of right) {
        if (!left.some((l) => l[join.leftKey] === r[join.rightKey])) results.push(r);
      }
    }
    return results;
  }

  private executeUnion(node: RuleNode, nodeOutputs: Map<string, Record<string, unknown>[]>): Record<string, unknown>[] {
    const union = node.union!;
    return union.sourceIds.flatMap((id) => nodeOutputs.get(id) ?? []);
  }

  private executeWindow(rows: Record<string, unknown>[], win: NonNullable<RuleNode['window']>): Record<string, unknown>[] {
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
      const windowRows = sorted.filter((r) => {
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
}
