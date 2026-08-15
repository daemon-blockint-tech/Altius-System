/**
 * Link paging bounds must match the Postgres provider.
 *
 * These two disagreed twice over: this provider defaulted to returning every
 * link while Postgres defaulted to 100, and an over-large limit was honoured
 * here while Postgres silently shrank it to 1000. Either way the same call
 * returned a different page depending on which backend was configured, which
 * is the divergence tests/spi-conformance exists to prevent.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MAX_LINK_QUERY_LIMIT, DEFAULT_LINK_QUERY_LIMIT } from '@altius/spi';
import type { RequestContext, OntologySchema } from '@altius/spi';
import { MemoryStorageProvider } from '../memory-storage-provider.js';

const CTX: RequestContext = { tenantId: 't1' };

const SCHEMA: OntologySchema = {
  version: 1,
  objectTypes: [
    { name: 'Ward', properties: [], indexes: [] },
    { name: 'Bed', properties: [], indexes: [] },
  ],
  linkTypes: [
    { name: 'HasBed', fromType: 'Ward', toType: 'Bed', cardinality: 'ONE_TO_MANY', properties: [] },
  ],
} as unknown as OntologySchema;

describe('MemoryStorageProvider getLinks paging bounds', () => {
  let storage: MemoryStorageProvider;

  beforeEach(async () => {
    storage = new MemoryStorageProvider();
    await storage.applySchema(CTX, SCHEMA);
    const ward = await storage.createObject(CTX, 'Ward', { name: 'A' });
    // More links than the default page so the default is observable.
    for (let i = 0; i < DEFAULT_LINK_QUERY_LIMIT + 25; i++) {
      const bed = await storage.createObject(CTX, 'Bed', { number: `b${i}` });
      await storage.createLink(CTX, 'HasBed', ward._id, bed._id, {});
    }
    (storage as unknown as { _wardId: string })._wardId = ward._id;
  });

  function wardId(): string {
    return (storage as unknown as { _wardId: string })._wardId;
  }

  it('refuses a limit above the maximum instead of honouring it', async () => {
    await expect(
      storage.getLinks(CTX, wardId(), 'HasBed', 'outbound', { limit: MAX_LINK_QUERY_LIMIT + 1 }),
    ).rejects.toThrow(/exceeds the maximum/);
  });

  it('defaults to the shared page size, not "every link"', async () => {
    const page = await storage.getLinks(CTX, wardId(), 'HasBed', 'outbound', undefined);
    expect(page.items).toHaveLength(DEFAULT_LINK_QUERY_LIMIT);
    // The total still tells the caller how much was left behind.
    expect(page.totalCount).toBe(DEFAULT_LINK_QUERY_LIMIT + 25);
    expect(page.hasNextPage).toBe(true);
  });

  it('accepts a limit exactly at the maximum', async () => {
    const page = await storage.getLinks(
      CTX, wardId(), 'HasBed', 'outbound', { limit: MAX_LINK_QUERY_LIMIT },
    );
    expect(page.items).toHaveLength(DEFAULT_LINK_QUERY_LIMIT + 25);
  });
});
