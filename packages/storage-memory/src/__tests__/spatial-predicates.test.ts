/**
 * Tests for spatial filter predicates (within, near, withinPolygon)
 * in the in-memory storage provider.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../memory-storage-provider.js';
import type { OntologySchema, ObjectTypeDefinition, RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 'test' };

const SCHEMA: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Place',
      properties: [
        { name: 'id', type: 'ID', required: true },
        { name: 'name', type: 'String', required: true },
        { name: 'location', type: 'GeoPoint', required: false },
      ],
      indexes: [],
    } satisfies ObjectTypeDefinition,
  ],
  linkTypes: [],
};

describe('Spatial filter predicates', () => {
  let provider: MemoryStorageProvider;

  beforeEach(async () => {
    provider = new MemoryStorageProvider();
    await provider.applySchema(CTX, SCHEMA);
    await provider.createObject(CTX, 'Place', { id: 'p1', name: 'London', location: { lat: 51.5074, lng: -0.1278 } });
    await provider.createObject(CTX, 'Place', { id: 'p2', name: 'Paris', location: { lat: 48.8566, lng: 2.3522 } });
    await provider.createObject(CTX, 'Place', { id: 'p3', name: 'Berlin', location: { lat: 52.5200, lng: 13.4050 } });
    await provider.createObject(CTX, 'Place', { id: 'p4', name: 'NoLocation', location: null });
  });

  it('within: bounding box filter', async () => {
    const page = await provider.queryObjects(CTX, 'Place', {
      and: [
        { field: 'location', operator: 'within', value: { minLat: 50, maxLat: 53, minLng: -1, maxLng: 1 } },
      ],
    });
    const ids = page.items.map(o => o.id);
    expect(ids).toContain('p1'); // London: 51.5, -0.13 — inside
    expect(ids).not.toContain('p2'); // Paris: 48.8, 2.35 — outside (lat < 50)
    expect(ids).not.toContain('p3'); // Berlin: 52.5, 13.4 — lng outside (13.4 > 1)
  });

  it('near: radius filter finds nearby points', async () => {
    // London to Paris is ~344km. 500km radius from London should include Paris.
    const page = await provider.queryObjects(CTX, 'Place', {
      and: [
        { field: 'location', operator: 'near', value: { lat: 51.5074, lng: -0.1278, radiusMeters: 500_000 } },
      ],
    });
    const ids = page.items.map(o => o.id);
    expect(ids).toContain('p1'); // London itself (0 distance)
    expect(ids).toContain('p2'); // Paris ~344km
    expect(ids).not.toContain('p3'); // Berlin ~933km
  });

  it('near: small radius excludes distant points', async () => {
    const page = await provider.queryObjects(CTX, 'Place', {
      and: [
        { field: 'location', operator: 'near', value: { lat: 51.5074, lng: -0.1278, radiusMeters: 10_000 } },
      ],
    });
    const ids = page.items.map(o => o.id);
    expect(ids).toContain('p1'); // London itself
    expect(ids).not.toContain('p2');
    expect(ids).not.toContain('p3');
  });

  it('withinPolygon: polygon containment', async () => {
    // Triangle covering London but not Paris (lat 48.8 < 50) or Berlin
    const page = await provider.queryObjects(CTX, 'Place', {
      and: [
        {
          field: 'location',
          operator: 'withinPolygon',
          value: {
            points: [
              { lat: 50, lng: -2 },
              { lat: 50, lng: 5 },
              { lat: 54, lng: 1 },
            ],
          },
        },
      ],
    });
    const ids = page.items.map(o => o.id);
    expect(ids).toContain('p1'); // London 51.5, -0.13 — inside triangle
    expect(ids).not.toContain('p2'); // Paris 48.8 — below triangle (lat < 50)
    expect(ids).not.toContain('p3'); // Berlin 52.5, 13.4 — lng outside triangle
  });

  it('withinPolygon: rejects points outside polygon', async () => {
    // Small triangle near London only
    const page = await provider.queryObjects(CTX, 'Place', {
      and: [
        {
          field: 'location',
          operator: 'withinPolygon',
          value: {
            points: [
              { lat: 51.4, lng: -0.3 },
              { lat: 51.4, lng: 0.0 },
              { lat: 51.7, lng: -0.1 },
            ],
          },
        },
      ],
    });
    const ids = page.items.map(o => o.id);
    expect(ids).toContain('p1'); // London — inside
    expect(ids).not.toContain('p2'); // Paris — outside
  });

  it('near: handles null location gracefully', async () => {
    const page = await provider.queryObjects(CTX, 'Place', {
      and: [
        { field: 'location', operator: 'near', value: { lat: 51.5074, lng: -0.1278, radiusMeters: 100_000 } },
      ],
    });
    const ids = page.items.map(o => o.id);
    expect(ids).not.toContain('p4'); // null location should not match
  });
});
