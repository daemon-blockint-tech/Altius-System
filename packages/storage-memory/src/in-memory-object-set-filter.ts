/**
 * In-memory object-set filter-state store.
 */

import { randomUUID } from 'node:crypto';
import type {
  ObjectSetFilterStore,
  FilterState,
  FilterChip,
  SaveFilterStateInput,
  FilterSetOp,
  RequestContext,
  FilterExpression,
} from '@altius/spi';

export class InMemoryObjectSetFilterStore implements ObjectSetFilterStore {
  private readonly states = new Map<string, Map<string, FilterState>>();

  async getFilterState(ctx: RequestContext, objectSetId: string): Promise<FilterState | null> {
    return this.states.get(ctx.tenantId)?.get(objectSetId) ?? null;
  }

  async saveFilterState(
    ctx: RequestContext,
    objectSetId: string,
    input: SaveFilterStateInput,
  ): Promise<FilterState> {
    const existing = this.states.get(ctx.tenantId)?.get(objectSetId);
    const now = new Date().toISOString();
    const variables = input.variables ?? this.extractFromChips(input.chips);
    const state: FilterState = {
      id: existing?.id ?? randomUUID(),
      tenantId: ctx.tenantId,
      objectSetId,
      name: input.name ?? 'Untitled filter',
      chips: input.chips,
      variables,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.getMap(ctx.tenantId).set(objectSetId, state);
    return state;
  }

  async listFilterStates(ctx: RequestContext, objectSetId?: string): Promise<FilterState[]> {
    const m = this.states.get(ctx.tenantId);
    if (!m) return [];
    const list = Array.from(m.values());
    if (objectSetId) return list.filter(s => s.objectSetId === objectSetId);
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteFilterState(ctx: RequestContext, objectSetId: string, id: string): Promise<void> {
    const m = this.states.get(ctx.tenantId);
    if (!m) return;
    const s = m.get(objectSetId);
    if (s && s.id === id) m.delete(objectSetId);
  }

  async extractVariables(_ctx: RequestContext, _objectSetId: string, chips: FilterChip[]): Promise<Record<string, unknown>> {
    return this.extractFromChips(chips);
  }

  async applyFilter(
    _ctx: RequestContext,
    _objectSetId: string,
    chips: FilterChip[],
  ): Promise<{ filter: FilterExpression; variables: Record<string, unknown> }> {
    const variables = this.extractFromChips(chips);
    const predicates: FilterExpression[] = chips.map(chip => ({
      field: chip.field,
      operator: chip.operator,
      value: chip.value,
    }));
    const filter: FilterExpression = predicates.length > 0 ? { and: predicates } : { and: [] };
    return { filter, variables };
  }

  async combine(
    ctx: RequestContext,
    objectSetId: string,
    leftFilterStateId: string,
    rightFilterStateId: string,
    op: FilterSetOp,
    name: string,
  ): Promise<FilterState> {
    const m = this.states.get(ctx.tenantId);
    const left = m?.get(leftFilterStateId);
    const right = m?.get(rightFilterStateId);
    if (!left || !right) throw new Error('Filter state not found');
    const leftPredicates: FilterExpression[] = left.chips.map(c => ({ field: c.field, operator: c.operator, value: c.value }));
    const rightPredicates: FilterExpression[] = right.chips.map(c => ({ field: c.field, operator: c.operator, value: c.value }));
    const leftFilter: FilterExpression = leftPredicates.length > 0 ? { and: leftPredicates } : { and: [] };
    const rightFilter: FilterExpression = rightPredicates.length > 0 ? { and: rightPredicates } : { and: [] };
    let combined: FilterExpression;
    switch (op) {
      case 'UNION': combined = { or: [leftFilter, rightFilter] }; break;
      case 'INTERSECT': combined = { and: [leftFilter, rightFilter] }; break;
      case 'DIFFERENCE': combined = { and: [leftFilter, { not: rightFilter }] }; break;
      default: throw new Error(`Unknown op: ${op}`);
    }
    // Convert combined filter back into flat chips (best-effort)
    const chips: FilterChip[] = [...left.chips, ...right.chips];
    return this.saveFilterState(ctx, objectSetId, { name, chips });
  }

  private extractFromChips(chips: FilterChip[]): Record<string, unknown> {
    const vars: Record<string, unknown> = {};
    for (const chip of chips) {
      if (chip.variableName) vars[chip.variableName] = chip.value;
      else if (chip.label) vars[chip.label] = chip.value;
    }
    return vars;
  }

  private getMap(t: string) { let m = this.states.get(t); if (!m) { m = new Map(); this.states.set(t, m); } return m; }
}
