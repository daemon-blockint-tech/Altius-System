/**
 * Filter chips are untrusted input, and a saved filter must mean the same thing
 * on both storage providers.
 *
 * FilterChip.operator was typed `string`, so a chip could carry an operator no
 * provider implements. That is not a type-safety nit: the memory provider
 * ignores an unknown operator and matches everything, while Postgres builds no
 * clause for it — the same saved view returns different rows per backend, with
 * no error on either.
 *
 * And `combine` used to compute the right FilterExpression for UNION /
 * INTERSECT / DIFFERENCE, discard it, and save the concatenated chips in every
 * case — so all three operations produced an identical state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryObjectSetFilterStore } from '../in-memory-object-set-filter.js';
import type { FilterChip, RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'user-1', traceId: 'trace' };

function chip(over: Partial<FilterChip> = {}): FilterChip {
  return { id: 'c-1', field: 'status', operator: 'eq', value: 'active', ...over } as FilterChip;
}

describe('filter chip operator validation', () => {
  let store: InMemoryObjectSetFilterStore;

  beforeEach(() => {
    store = new InMemoryObjectSetFilterStore();
  });

  it('builds an AND-combined predicate list from valid chips', async () => {
    const { filter } = await store.applyFilter(CTX, 'os-1', [
      chip(),
      chip({ id: 'c-2', field: 'age', operator: 'gte', value: 40 }),
    ]);
    expect(filter).toEqual({
      and: [
        { field: 'status', operator: 'eq', value: 'active' },
        { field: 'age', operator: 'gte', value: 40 },
      ],
    });
  });

  it('returns a match-all filter for no chips', async () => {
    const { filter } = await store.applyFilter(CTX, 'os-1', []);
    expect(filter).toEqual({ and: [] });
  });

  it('refuses an operator no provider implements rather than matching everything', async () => {
    await expect(
      store.applyFilter(CTX, 'os-1', [chip({ operator: 'regex' as never })]),
    ).rejects.toThrow(/not supported/);
  });

  it('accepts the geo operators the predicate union declares', async () => {
    const { filter } = await store.applyFilter(CTX, 'os-1', [
      chip({ field: 'location', operator: 'near', value: { lat: 51, lng: 0, radiusMeters: 100 } }),
    ]);
    expect((filter as { and: { operator: string }[] }).and[0]!.operator).toBe('near');
  });
});

describe('combine', () => {
  let store: InMemoryObjectSetFilterStore;

  beforeEach(() => {
    store = new InMemoryObjectSetFilterStore();
  });

  async function twoStates() {
    const left = await store.saveFilterState(CTX, 'os-left', { name: 'left', chips: [chip()] });
    const right = await store.saveFilterState(CTX, 'os-right', {
      name: 'right',
      chips: [chip({ id: 'c-2', field: 'age', operator: 'gte', value: 40 })],
    });
    return { left, right };
  }

  it('INTERSECT concatenates the chip lists — which is what an AND list means', async () => {
    const { left, right } = await twoStates();
    const combined = await store.combine(CTX, 'os-out', left.id, right.id, 'INTERSECT', 'both');
    expect(combined.chips.map(c => c.field)).toEqual(['status', 'age']);
  });

  it.each(['UNION', 'DIFFERENCE'] as const)(
    'refuses %s instead of silently saving an INTERSECT',
    async (op) => {
      const { left, right } = await twoStates();
      await expect(store.combine(CTX, 'os-out', left.id, right.id, op, 'x')).rejects.toThrow(/not representable/);
    },
  );

  it('refuses when either side does not exist', async () => {
    const { left } = await twoStates();
    await expect(store.combine(CTX, 'os-out', left.id, 'missing', 'INTERSECT', 'x')).rejects.toThrow(/not found/);
  });

  it('does not reach across tenants for either side', async () => {
    const { left, right } = await twoStates();
    const otherTenant: RequestContext = { ...CTX, tenantId: 't2' };
    await expect(
      store.combine(otherTenant, 'os-out', left.id, right.id, 'INTERSECT', 'x'),
    ).rejects.toThrow(/not found/);
  });
});
