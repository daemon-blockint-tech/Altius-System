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

/** Operators a FieldPredicate accepts. Kept as a value so chips from an
 * untrusted request body can be checked at runtime, not just at compile time. */
const CHIP_OPERATORS = new Set<string>([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'startsWith', 'exists',
  'within', 'near', 'withinPolygon',
]);

/**
 * Convert one chip to a FieldPredicate, refusing an operator no provider
 * implements. Silently passing one through is the dangerous case: the memory
 * provider ignores an unknown operator and matches everything, while Postgres
 * builds no clause — the same saved filter returns different rows per backend.
 */
function chipToPredicate(chip: FilterChip): FilterExpression {
  if (!CHIP_OPERATORS.has(chip.operator)) {
    throw new Error(
      `Filter chip operator "${chip.operator}" is not supported. Use one of: ` +
      `${[...CHIP_OPERATORS].join(', ')}.`,
    );
  }
  return { field: chip.field, operator: chip.operator, value: chip.value };
}

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
    const predicates = chips.map(chip => chipToPredicate(chip));
    const filter: FilterExpression = predicates.length > 0 ? { and: predicates } : { and: [] };
    return { filter, variables };
  }

  /**
   * Combine two saved filter states.
   *
   * A FilterState is a FLAT list of chips and applyFilter AND-combines them, so
   * INTERSECT is exactly chip concatenation — and UNION and DIFFERENCE have no
   * representation at all. They used to build the right FilterExpression, throw
   * it away, and save the concatenated chips regardless, which meant all three
   * operations produced an identical state: a wrong answer that looks like a
   * saved view. They are refused until FilterState can carry an expression.
   */
  async combine(
    ctx: RequestContext,
    objectSetId: string,
    leftFilterStateId: string,
    rightFilterStateId: string,
    op: FilterSetOp,
    name: string,
  ): Promise<FilterState> {
    // Look up by filter-state id, not by object-set id. The tenant map is
    // keyed by objectSetId (one current state per set), so `m.get(stateId)`
    // could only ever hit by coincidence — combine() never found either side
    // and always threw 'Filter state not found'.
    const left = this.findById(ctx, leftFilterStateId);
    const right = this.findById(ctx, rightFilterStateId);
    if (!left || !right) throw new Error('Filter state not found');

    if (op !== 'INTERSECT') {
      throw new Error(
        `Filter-state ${op} is not representable: a saved filter state is a flat, ` +
        `AND-combined chip list, which can express INTERSECT only. Combine the ` +
        `underlying object sets instead (POST /api/v1/object-sets/combine).`,
      );
    }

    // INTERSECT: both chip lists apply, which is what an AND-combined flat list
    // means. Chips are validated on the way in so a state saved here cannot
    // carry an operator no provider implements.
    const chips: FilterChip[] = [...left.chips, ...right.chips];
    for (const chip of chips) chipToPredicate(chip);
    return this.saveFilterState(ctx, objectSetId, { name, chips });
  }

  /**
   * Find a saved state by its own id within the caller's tenant.
   *
   * A linear scan: the tenant map holds one state per object set, so this is
   * small, and a second id-keyed index would have to be kept consistent with
   * the objectSetId-keyed one on every save.
   * ponytail: linear scan, add an id index if a tenant ever holds thousands of
   * saved filter states.
   */
  private findById(ctx: RequestContext, id: string): FilterState | undefined {
    const m = this.states.get(ctx.tenantId);
    if (!m) return undefined;
    for (const state of m.values()) {
      if (state.id === id) return state;
    }
    return undefined;
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
