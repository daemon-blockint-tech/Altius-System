/**
 * @searchable(weight:) propagation — verifies that per-field weights
 * from IndexDefinition propagate into search ranking in the memory provider.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../memory-storage-provider.js';
import type { RequestContext, OntologySchema } from '@altius/spi';

const ctx: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1' };

const schema: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Document',
      properties: [
        { name: 'title', type: 'string', required: true },
        { name: 'body', type: 'string', required: false },
      ],
      indexes: [
        { field: 'title', indexType: 'FULLTEXT', weight: 5 },
        { field: 'body', indexType: 'FULLTEXT', weight: 1 },
      ],
    },
  ],
  linkTypes: [],
};

let storage: MemoryStorageProvider;

beforeEach(async () => {
  storage = new MemoryStorageProvider();
  await storage.applySchema(ctx, schema);
});

describe('search weight propagation', () => {
  it('ranks title matches above body matches when title has higher weight', async () => {
    // Both docs match "alpha" but doc A in title, doc B in body
    await storage.createObject(ctx, 'Document', {
      title: 'beta gamma',
      body: 'alpha delta',
    });
    await storage.createObject(ctx, 'Document', {
      title: 'alpha epsilon',
      body: 'zeta eta',
    });

    const result = await storage.searchObjects(ctx, 'Document', {
      query: 'alpha',
      fields: ['title', 'body'],
    });

    expect(result.hits).toHaveLength(2);
    // Title match (weight 5) should rank above body match (weight 1)
    expect(result.hits[0]!.object.title).toBe('alpha epsilon');
    expect(result.hits[1]!.object.title).toBe('beta gamma');
    // Score should be higher for the title match
    expect(result.hits[0]!.score).toBeGreaterThan(result.hits[1]!.score);
  });

  it('applies weight as a multiplier to the match-quality score', async () => {
    // Both match in title, but one is exact and one is substring
    await storage.createObject(ctx, 'Document', {
      title: 'alpha',
      body: '',
    });
    await storage.createObject(ctx, 'Document', {
      title: 'alphabet',
      body: '',
    });

    const result = await storage.searchObjects(ctx, 'Document', {
      query: 'alpha',
      fields: ['title'],
    });

    expect(result.hits).toHaveLength(2);
    // Exact match: 3 * weight(5) = 15
    // Prefix match: 2 * weight(5) = 10
    expect(result.hits[0]!.object.title).toBe('alpha');
    expect(result.hits[0]!.score).toBe(15);
    expect(result.hits[1]!.object.title).toBe('alphabet');
    expect(result.hits[1]!.score).toBe(10);
  });

  it('defaults to weight 1 when no weight is specified', async () => {
    const unweightedSchema: OntologySchema = {
      version: 1,
      objectTypes: [
        {
          name: 'Note',
          properties: [
            { name: 'text', type: 'string', required: true },
          ],
          indexes: [{ field: 'text', indexType: 'FULLTEXT' }],
        },
      ],
      linkTypes: [],
    };
    const s = new MemoryStorageProvider();
    await s.applySchema(ctx, unweightedSchema);
    await s.createObject(ctx, 'Note', { text: 'hello world' });

    const result = await s.searchObjects(ctx, 'Note', {
      query: 'hello',
      fields: ['text'],
    });

    expect(result.hits).toHaveLength(1);
    // Prefix match: 2 * weight(1) = 2
    expect(result.hits[0]!.score).toBe(2);
  });
});
