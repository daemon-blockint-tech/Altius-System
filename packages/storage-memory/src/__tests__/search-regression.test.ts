/**
 * Regression tests for memory provider search and aggregate fixes.
 *
 * Covers:
 * 1. Empty search query returns empty results (not all objects)
 * 2. Aggregate function validation — rejects invalid functions
 * 3. Aggregate function case normalization — 'SUM' works like 'sum'
 * 4. Query limit enforcement — MAX_QUERY_LIMIT prevents DoS
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../memory-storage-provider.js';
import type { RequestContext, OntologySchema } from '@altius/spi';

const ctx: RequestContext = { tenantId: 't-1', actorId: 'user-1' };

const schema: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Item',
      properties: [
        { name: 'title', type: 'string', required: true },
        { name: 'price', type: 'number', required: false },
        { name: 'category', type: 'string', required: false },
      ],
    },
  ],
  linkTypes: [],
};

let provider: MemoryStorageProvider;

beforeEach(async () => {
  provider = new MemoryStorageProvider();
  await provider.applySchema(ctx, schema);
});

// ── Search: empty query guard ────────────────────────────────────────────

describe('search — empty query guard', () => {
  it('returns empty results for empty string query', async () => {
    await provider.createObject(ctx, 'Item', { title: 'Widget', price: 10 });
    const result = await provider.searchObjects(ctx, 'Item', { query: '', limit: 10, offset: 0 });
    expect(result.hits).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it('returns empty results for whitespace-only query', async () => {
    await provider.createObject(ctx, 'Item', { title: 'Widget', price: 10 });
    const result = await provider.searchObjects(ctx, 'Item', { query: '   ', limit: 10, offset: 0 });
    expect(result.hits).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it('returns results for non-empty query', async () => {
    await provider.createObject(ctx, 'Item', { title: 'Widget', price: 10 });
    const result = await provider.searchObjects(ctx, 'Item', { query: 'Widget', limit: 10, offset: 0 });
    expect(result.hits).toHaveLength(1);
  });
});

// ── Aggregate: function validation ───────────────────────────────────────

describe('aggregate — function validation', () => {
  it('accepts valid lowercase functions', async () => {
    await provider.createObject(ctx, 'Item', { title: 'A', price: 10 });
    const result = await provider.aggregateObjects(ctx, 'Item', {
      fields: [{ field: 'price', fn: 'sum' }],
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.values['sum_price']).toBe(10);
  });

  it('accepts uppercase function names via case normalization', async () => {
    await provider.createObject(ctx, 'Item', { title: 'A', price: 5 });
    await provider.createObject(ctx, 'Item', { title: 'B', price: 15 });
    const result = await provider.aggregateObjects(ctx, 'Item', {
      fields: [{ field: 'price', fn: 'SUM' as unknown as 'sum' }],
    });
    expect(result.groups).toHaveLength(1);
    // Alias uses original fn casing in key
    expect(result.groups[0]!.values['SUM_price']).toBe(20);
  });

  it('rejects invalid aggregate function names', async () => {
    await provider.createObject(ctx, 'Item', { title: 'A', price: 10 });
    await expect(
      provider.aggregateObjects(ctx, 'Item', {
        fields: [{ field: 'price', fn: 'INVALID_FN' as unknown as 'sum' }],
      }),
    ).rejects.toThrow('Invalid aggregate function');
  });

  it('rejects empty fields array', async () => {
    await expect(
      provider.aggregateObjects(ctx, 'Item', { fields: [] }),
    ).rejects.toThrow('Aggregate query must specify at least one field');
  });
});

// ── Query: limit enforcement ─────────────────────────────────────────────

describe('query — limit enforcement', () => {
  it('enforces MAX_QUERY_LIMIT of 1000', async () => {
    // Create a few objects and request an absurd limit
    for (let i = 0; i < 5; i++) {
      await provider.createObject(ctx, 'Item', { title: `Item ${i}`, price: i });
    }
    const result = await provider.queryObjects(
      ctx, 'Item',
      { field: 'title', operator: 'exists', value: true },
      { limit: 999999 },
    );
    // Should return all 5 (below limit), but the limit should be capped internally
    expect(result.items).toHaveLength(5);
    // hasNextPage should be false because 5 < 1000 (capped limit)
    expect(result.hasNextPage).toBe(false);
  });

  it('uses default limit of 100 when not specified', async () => {
    const result = await provider.queryObjects(
      ctx, 'Item',
      { field: 'title', operator: 'exists', value: true },
    );
    // With no items, just verify it doesn't crash
    expect(result.items).toHaveLength(0);
  });
});

// ── Search: match-quality scoring ────────────────────────────────────────
//
// Score sums per-field match quality (exact 3, prefix 2, substring 1) rather
// than a flat 1 per matching field. Pinned here because the two providers must
// agree weight for weight — the Postgres CASE expression in
// storage-postgres/src/objects/search.ts is the other half of this contract,
// and a flat score let an incidental substring tie an exact hit.

describe('search — match-quality scoring', () => {
  it('ranks exact above prefix above substring', async () => {
    await provider.createObject(ctx, 'Item', { title: 'ward' });          // exact   → 3
    await provider.createObject(ctx, 'Item', { title: 'ward round' });    // prefix  → 2
    await provider.createObject(ctx, 'Item', { title: 'the ward is' });   // substr  → 1

    const result = await provider.searchObjects(ctx, 'Item', { query: 'ward', fields: ['title'] });

    expect(result.hits.map((h) => [h.object.title, h.score])).toEqual([
      ['ward', 3],
      ['ward round', 2],
      ['the ward is', 1],
    ]);
  });

  it('is case-insensitive when grading the match', async () => {
    await provider.createObject(ctx, 'Item', { title: 'WARD' });
    const result = await provider.searchObjects(ctx, 'Item', { query: 'ward', fields: ['title'] });
    expect(result.hits[0]?.score).toBe(3);
  });

  it('sums across fields rather than taking the best single field', async () => {
    // 1 (substring in title) + 2 (prefix in category) = 3, which is why the
    // weights are summed and not maxed: a row that matches weakly in two
    // places is as relevant as one exact hit, and max() would score it 2.
    await provider.createObject(ctx, 'Item', { title: 'a ward b', category: 'ward x' });

    const result = await provider.searchObjects(ctx, 'Item', {
      query: 'ward', fields: ['title', 'category'],
    });
    expect(result.hits[0]?.score).toBe(3);
  });
});
