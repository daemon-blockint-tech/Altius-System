/**
 * Two-sided proof that the marking definitions admin API works.
 *
 * The gap: markings were configured via MarkingPolicyConfig at boot only —
 * no runtime admin endpoint for creating/managing marking definitions and
 * categories. The fix: MarkingDefinitionStore SPI + REST routes + MarkingPolicy
 * mutation methods (addDefinition/addCategory/removeDefinition).
 *
 * This test proves:
 * 1. The in-memory store implements the SPI contract (create/list/get/delete).
 * 2. The MarkingPolicy mutation methods work (addDefinition makes a marking
 *    enforceable immediately, removeDefinition removes it).
 * 3. Tenant isolation: definitions are scoped per tenant.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryMarkingDefinitionStore } from '@altius/storage-memory';
import { MarkingPolicy } from '@altius/security';
import type { MarkingDefinition, MarkingCategoryDefinition } from '@altius/security';

describe('MarkingDefinitionStore (in-memory)', () => {
  it('creates and lists definitions, scoped per tenant', async () => {
    const store = new InMemoryMarkingDefinitionStore();
    await store.createDefinition('tenant-a', { name: 'CONFIDENTIAL' }, 'admin-1');
    await store.createDefinition('tenant-a', { name: 'PII', category: 'sensitivity' }, 'admin-1');
    await store.createDefinition('tenant-b', { name: 'SECRET' }, 'admin-2');

    const a = await store.listDefinitions('tenant-a');
    const b = await store.listDefinitions('tenant-b');
    expect(a.map(d => d.name)).toEqual(['CONFIDENTIAL', 'PII']);
    expect(b.map(d => d.name)).toEqual(['SECRET']);
  });

  it('gets a specific definition by name', async () => {
    const store = new InMemoryMarkingDefinitionStore();
    await store.createDefinition('t1', { name: 'PII', category: 'sensitivity', rank: 2 }, 'admin');
    const def = await store.getDefinition('t1', 'PII');
    expect(def).not.toBeNull();
    expect(def!.name).toBe('PII');
    expect(def!.category).toBe('sensitivity');
    expect(def!.rank).toBe(2);
    expect(def!.createdBy).toBe('admin');
  });

  it('returns null for a non-existent definition', async () => {
    const store = new InMemoryMarkingDefinitionStore();
    expect(await store.getDefinition('t1', 'NOPE')).toBeNull();
  });

  it('deletes a definition and returns false on second delete', async () => {
    const store = new InMemoryMarkingDefinitionStore();
    await store.createDefinition('t1', { name: 'PII' }, 'admin');
    expect(await store.deleteDefinition('t1', 'PII')).toBe(true);
    expect(await store.deleteDefinition('t1', 'PII')).toBe(false);
    expect(await store.getDefinition('t1', 'PII')).toBeNull();
  });

  it('creates and lists categories, scoped per tenant', async () => {
    const store = new InMemoryMarkingDefinitionStore();
    await store.createCategory('tenant-a', { name: 'sensitivity', mode: 'CONJUNCTIVE' }, 'admin-1');
    await store.createCategory('tenant-a', { name: 'releasability', mode: 'DISJUNCTIVE' }, 'admin-1');
    await store.createCategory('tenant-b', { name: 'sensitivity', mode: 'CONJUNCTIVE' }, 'admin-2');

    const a = await store.listCategories('tenant-a');
    const b = await store.listCategories('tenant-b');
    expect(a).toHaveLength(2);
    expect(a[0]!.name).toBe('releasability');
    expect(a[0]!.mode).toBe('DISJUNCTIVE');
    expect(b).toHaveLength(1);
  });

  it('re-creating a definition updates metadata (idempotent)', async () => {
    const store = new InMemoryMarkingDefinitionStore();
    await store.createDefinition('t1', { name: 'PII' }, 'admin-1');
    await store.createDefinition('t1', { name: 'PII', category: 'sensitivity', rank: 3 }, 'admin-2');
    const def = await store.getDefinition('t1', 'PII');
    expect(def!.category).toBe('sensitivity');
    expect(def!.rank).toBe(3);
    expect(def!.createdBy).toBe('admin-2');
  });
});

describe('MarkingPolicy mutation (addDefinition/addCategory/removeDefinition)', () => {
  it('addDefinition makes a marking enforceable for rank-based satisfaction', () => {
    const policy = new MarkingPolicy({ markings: [], byObjectType: { Patient: ['PII'] } });
    // Exact match works even without a definition (held.has(required) is checked first)
    expect(policy.check(['PII'], ['PII']).allowed).toBe(true);
    // But a different held marking cannot satisfy PII without a definition
    expect(policy.check(['OTHER'], ['PII']).allowed).toBe(false);

    // Adding the definition with a rank enables hierarchical satisfaction
    policy.addDefinition({ name: 'PII', category: 'sensitivity', rank: 1 });
    policy.addDefinition({ name: 'HIGH_SENSITIVITY', category: 'sensitivity', rank: 2 });
    policy.addCategory({ name: 'sensitivity', mode: 'CONJUNCTIVE' });
    // HIGH_SENSITIVITY (rank 2) satisfies PII (rank 1) via hierarchy
    expect(policy.check(['HIGH_SENSITIVITY'], ['PII']).allowed).toBe(true);
    // A non-held marking still cannot satisfy
    expect(policy.check([], ['PII']).allowed).toBe(false);
  });

  it('addCategory makes a disjunctive category enforceable', () => {
    const policy = new MarkingPolicy({
      markings: [
        { name: 'GBR', category: 'releasability' },
        { name: 'CAN', category: 'releasability' },
      ],
      byObjectType: { Document: ['GBR', 'CAN'] },
    });
    // Without the category definition, both are required (conjunctive default)
    expect(policy.check(['GBR'], ['GBR', 'CAN']).allowed).toBe(false);

    // Adding the disjunctive category makes either one sufficient
    policy.addCategory({ name: 'releasability', mode: 'DISJUNCTIVE' });
    expect(policy.check(['GBR'], ['GBR', 'CAN']).allowed).toBe(true);
    expect(policy.check(['CAN'], ['GBR', 'CAN']).allowed).toBe(true);
    expect(policy.check(['USA'], ['GBR', 'CAN']).allowed).toBe(false);
  });

  it('addDefinition with rank enables hierarchical satisfaction', () => {
    const policy = new MarkingPolicy({
      markings: [],
      byObjectType: { Doc: ['SECRET'] },
    });
    policy.addCategory({ name: 'classification', mode: 'CONJUNCTIVE' });
    policy.addDefinition({ name: 'CONFIDENTIAL', category: 'classification', rank: 1 });
    policy.addDefinition({ name: 'SECRET', category: 'classification', rank: 2 });
    policy.addDefinition({ name: 'TOP_SECRET', category: 'classification', rank: 3 });

    // TOP_SECRET satisfies SECRET (higher rank)
    expect(policy.check(['TOP_SECRET'], ['SECRET']).allowed).toBe(true);
    // CONFIDENTIAL does not satisfy SECRET (lower rank)
    expect(policy.check(['CONFIDENTIAL'], ['SECRET']).allowed).toBe(false);
  });

  it('removeDefinition removes rank-based satisfaction but keeps exact match', () => {
    const policy = new MarkingPolicy({
      markings: [{ name: 'PII', category: 'sensitivity', rank: 1 }],
      categories: [{ name: 'sensitivity', mode: 'CONJUNCTIVE' }],
      byObjectType: { Patient: ['PII'] },
    });
    // Exact match always works
    expect(policy.check(['PII'], ['PII']).allowed).toBe(true);

    expect(policy.removeDefinition('PII')).toBe(true);
    // Exact match still works after definition removal
    expect(policy.check(['PII'], ['PII']).allowed).toBe(true);
    // But rank-based satisfaction no longer works (no definition to resolve rank)
    expect(policy.check(['HIGH_SENSITIVITY'], ['PII']).allowed).toBe(false);
    expect(policy.removeDefinition('NOPE')).toBe(false);
  });

  it('listDefinitions includes runtime-added definitions', () => {
    const policy = new MarkingPolicy({ markings: [{ name: 'PII' }] });
    expect(policy.listDefinitions()).toHaveLength(1);

    policy.addDefinition({ name: 'PHI', category: 'sensitivity' });
    const defs = policy.listDefinitions();
    expect(defs).toHaveLength(2);
    expect(defs.some(d => d.name === 'PHI')).toBe(true);
  });
});
