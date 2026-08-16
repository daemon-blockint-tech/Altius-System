import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../memory-storage-provider.js';
import type { RequestContext, OntologySchema } from '@altius/spi';

const ctx: RequestContext = { tenantId: 'tenant-a', actorId: 'actor-1' };

const schema: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Place',
      properties: [
        { name: 'name', type: 'string', required: true },
        { name: 'location', type: 'geopoint' },
      ],
    },
  ],
  linkTypes: [],
};

/** London ~ (51.5, -0.12); Paris ~ (48.85, 2.35); New York ~ (40.71, -74.0). */
describe('MemoryStorageProvider — within (bounding box)', () => {
  let provider: MemoryStorageProvider;

  beforeEach(async () => {
    provider = new MemoryStorageProvider();
    await provider.applySchema(ctx, schema);
    await provider.createObject(ctx, 'Place', { name: 'London', location: { lat: 51.5, lng: -0.12 } });
    await provider.createObject(ctx, 'Place', { name: 'Paris', location: { lat: 48.85, lng: 2.35 } });
    await provider.createObject(ctx, 'Place', { name: 'New York', location: { lat: 40.71, lng: -74.0 } });
  });

  it('advertises geo query support', () => {
    expect(provider.capabilities().supportsGeoQueries).toBe(true);
  });

  it('returns only points inside the box (Western Europe)', async () => {
    const page = await provider.queryObjects(ctx, 'Place', {
      field: 'location',
      operator: 'within',
      value: { minLat: 45, minLng: -5, maxLat: 55, maxLng: 5 },
    });
    expect(page.items.map((o) => o['name']).sort()).toEqual(['London', 'Paris']);
  });

  it('excludes points outside the box', async () => {
    const page = await provider.queryObjects(ctx, 'Place', {
      field: 'location',
      operator: 'within',
      value: { minLat: 35, minLng: -80, maxLat: 45, maxLng: -70 },
    });
    expect(page.items.map((o) => o['name'])).toEqual(['New York']);
  });

  it('does not match a malformed point', async () => {
    await provider.createObject(ctx, 'Place', { name: 'Nowhere', location: {} });
    const page = await provider.queryObjects(ctx, 'Place', {
      field: 'location',
      operator: 'within',
      value: { minLat: -90, minLng: -180, maxLat: 90, maxLng: 180 },
    });
    expect(page.items.map((o) => o['name'])).not.toContain('Nowhere');
  });
});
