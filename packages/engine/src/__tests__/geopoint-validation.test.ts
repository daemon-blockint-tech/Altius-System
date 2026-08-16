/**
 * GeoPoint properties are validated as real coordinates.
 *
 * Previously any non-null object passed (`{}` or `{foo:1}` stored fine). Now a
 * GeoPoint must carry numeric lat in [-90,90] and lng in [-180,180], so a
 * malformed point is rejected at data-load / action-apply time.
 */

import { describe, it, expect } from 'vitest';
import { validateObjectProperties } from '../objects/validation.js';
import type { ParsedSchema } from '@altius/odl';
import type { RequestContext, StorageProvider } from '@altius/spi';

const schema: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Place',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
        { name: 'location', type: { name: 'GeoPoint', nonNull: false, isList: false, listElementNonNull: false }, directives: [] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
  ],
  linkTypes: [],
  actionTypes: [],
  functionTypes: [],
  enums: [],
  interfaces: [],
  scalars: [],
};

const ctx: RequestContext = { tenantId: 't' };
// Scalar-type validation runs before any storage access; a no-op query stub
// covers any uniqueness lookup without a live database.
const storage = { queryObjects: async () => ({ items: [], totalCount: 0, hasNextPage: false }) } as unknown as StorageProvider;

describe('GeoPoint property validation', () => {
  it('rejects a point missing numeric lat/lng', async () => {
    const r = await validateObjectProperties(schema, 'Place', { location: {} }, ctx, storage);
    expect(r.valid).toBe(false);
    expect(JSON.stringify(r.failures)).toContain('location');
  });

  it('rejects out-of-range coordinates', async () => {
    const r = await validateObjectProperties(schema, 'Place', { location: { lat: 999, lng: 0 } }, ctx, storage);
    expect(r.valid).toBe(false);
    expect(JSON.stringify(r.failures)).toContain('location');
  });

  it('accepts a well-formed point', async () => {
    const r = await validateObjectProperties(schema, 'Place', { location: { lat: 51.5, lng: -0.12 } }, ctx, storage);
    expect(r.failures.every((f) => !JSON.stringify(f).includes('location'))).toBe(true);
  });
});
