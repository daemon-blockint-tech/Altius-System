/**
 * Tests for the in-memory embedding store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryEmbeddingStore } from '../in-memory-embedding-store.js';
import { cosineSimilarity } from '@altius/spi';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1' };
const CTX2: RequestContext = { tenantId: 't2' };

describe('InMemoryEmbeddingStore', () => {
  let store: InMemoryEmbeddingStore;

  beforeEach(() => {
    store = new InMemoryEmbeddingStore();
  });

  it('upserts and retrieves an embedding', async () => {
    await store.upsert(CTX, {
      objectType: 'Document',
      objectId: 'd1',
      field: 'content',
      vector: [1, 0, 0],
      model: 'test-model',
      dimensions: 3,
    });
    const emb = await store.get(CTX, 'Document', 'd1', 'content');
    expect(emb).not.toBeNull();
    expect(emb?.vector).toEqual([1, 0, 0]);
    expect(emb?.model).toBe('test-model');
  });

  it('upsert replaces existing embedding', async () => {
    await store.upsert(CTX, {
      objectType: 'Document', objectId: 'd1', field: 'content',
      vector: [1, 0, 0], model: 'v1', dimensions: 3,
    });
    await store.upsert(CTX, {
      objectType: 'Document', objectId: 'd1', field: 'content',
      vector: [0, 1, 0], model: 'v2', dimensions: 3,
    });
    const emb = await store.get(CTX, 'Document', 'd1', 'content');
    expect(emb?.vector).toEqual([0, 1, 0]);
    expect(emb?.model).toBe('v2');
  });

  it('deletes an embedding', async () => {
    await store.upsert(CTX, {
      objectType: 'Document', objectId: 'd1', field: 'content',
      vector: [1, 0, 0], model: 'm', dimensions: 3,
    });
    await store.delete(CTX, 'Document', 'd1', 'content');
    const emb = await store.get(CTX, 'Document', 'd1', 'content');
    expect(emb).toBeNull();
  });

  it('deletes all embeddings for an object', async () => {
    await store.upsert(CTX, {
      objectType: 'Document', objectId: 'd1', field: 'title',
      vector: [1, 0, 0], model: 'm', dimensions: 3,
    });
    await store.upsert(CTX, {
      objectType: 'Document', objectId: 'd1', field: 'body',
      vector: [0, 1, 0], model: 'm', dimensions: 3,
    });
    await store.deleteAllForObject(CTX, 'Document', 'd1');
    expect(await store.get(CTX, 'Document', 'd1', 'title')).toBeNull();
    expect(await store.get(CTX, 'Document', 'd1', 'body')).toBeNull();
  });

  it('searches by cosine similarity', async () => {
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'a', field: 'content',
      vector: [1, 0, 0], model: 'm', dimensions: 3,
    });
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'b', field: 'content',
      vector: [0, 1, 0], model: 'm', dimensions: 3,
    });
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'c', field: 'content',
      vector: [0.9, 0.1, 0], model: 'm', dimensions: 3,
    });

    const result = await store.search(CTX, 'Doc', 'content', [1, 0, 0]);
    expect(result.hits[0]!.objectId).toBe('a');
    expect(result.hits[0]!.score).toBeCloseTo(1.0, 5);
    expect(result.hits[1]!.objectId).toBe('c');
    expect(result.hits[2]!.objectId).toBe('b');
  });

  it('respects limit option', async () => {
    for (let i = 0; i < 5; i++) {
      await store.upsert(CTX, {
        objectType: 'Doc', objectId: `d${i}`, field: 'content',
        vector: [i * 0.1, 0, 0], model: 'm', dimensions: 3,
      });
    }
    const result = await store.search(CTX, 'Doc', 'content', [1, 0, 0], { limit: 2 });
    expect(result.hits).toHaveLength(2);
    expect(result.totalCount).toBe(5);
  });

  it('respects minScore option', async () => {
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'a', field: 'content',
      vector: [1, 0, 0], model: 'm', dimensions: 3,
    });
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'b', field: 'content',
      vector: [0, 1, 0], model: 'm', dimensions: 3,
    });
    const result = await store.search(CTX, 'Doc', 'content', [1, 0, 0], { minScore: 0.99 });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]!.objectId).toBe('a');
  });

  it('respects allowedObjectIds filter', async () => {
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'a', field: 'content',
      vector: [1, 0, 0], model: 'm', dimensions: 3,
    });
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'b', field: 'content',
      vector: [0.9, 0.1, 0], model: 'm', dimensions: 3,
    });
    const result = await store.search(CTX, 'Doc', 'content', [1, 0, 0], {
      allowedObjectIds: ['b'],
    });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]!.objectId).toBe('b');
  });

  it('isolates tenants', async () => {
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'a', field: 'content',
      vector: [1, 0, 0], model: 'm', dimensions: 3,
    });
    await store.upsert(CTX2, {
      objectType: 'Doc', objectId: 'a', field: 'content',
      vector: [1, 0, 0], model: 'm', dimensions: 3,
    });
    const t1 = await store.search(CTX, 'Doc', 'content', [1, 0, 0]);
    const t2 = await store.search(CTX2, 'Doc', 'content', [1, 0, 0]);
    expect(t1.totalCount).toBe(1);
    expect(t2.totalCount).toBe(1);
  });

  it('counts embeddings', async () => {
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'a', field: 'content',
      vector: [1, 0, 0], model: 'm', dimensions: 3,
    });
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'b', field: 'content',
      vector: [1, 0, 0], model: 'm', dimensions: 3,
    });
    await store.upsert(CTX, {
      objectType: 'Doc', objectId: 'c', field: 'title',
      vector: [1, 0, 0], model: 'm', dimensions: 3,
    });
    expect(await store.count(CTX, 'Doc')).toBe(3);
    expect(await store.count(CTX, 'Doc', 'content')).toBe(2);
    expect(await store.count(CTX, 'Doc', 'title')).toBe(1);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
});
