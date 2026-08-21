import { describe, it, expect } from 'vitest';
import { filterToSql } from '../objects/filter-to-sql.js';
import type { FilterExpression } from '@altius/spi';

describe('filterToSql — within (GeoPoint bounding box)', () => {
  it('extracts lat/lng from the JSONB column and range-checks each axis', () => {
    const filter: FilterExpression = {
      field: 'location',
      operator: 'within',
      value: { minLat: 45, minLng: -5, maxLat: 55, maxLng: 5 },
    };
    const { text, params } = filterToSql(filter);
    expect(text).toContain(`->>'lat')::float8 BETWEEN $1 AND $2`);
    expect(text).toContain(`->>'lng')::float8 BETWEEN $3 AND $4`);
    // Params are [minLat, maxLat, minLng, maxLng] to match the BETWEEN order.
    expect(params).toEqual([45, 55, -5, 5]);
  });

  it('offsets bind placeholders when composed with other predicates', () => {
    const filter: FilterExpression = {
      and: [
        { field: 'name', operator: 'eq', value: 'x' },
        { field: 'location', operator: 'within', value: { minLat: 1, minLng: 2, maxLat: 3, maxLng: 4 } },
      ],
    };
    const { text, params } = filterToSql(filter);
    expect(text).toContain('$1');
    expect(text).toContain('BETWEEN $2 AND $3');
    expect(text).toContain('BETWEEN $4 AND $5');
    expect(params).toEqual(['x', 1, 3, 2, 4]);
  });
});

describe('filterToSql — near (haversine radius)', () => {
  it('binds [queryLat, queryLng, radius] contiguously from the offset', () => {
    const filter: FilterExpression = {
      field: 'location',
      operator: 'near',
      value: { lat: 51.5, lng: -0.12, radiusMeters: 1000 },
    };
    const { text, params } = filterToSql(filter);
    expect(params).toEqual([51.5, -0.12, 1000]);
    // Every referenced placeholder must lie within the fragment's own params:
    // $1, $2, $3 — and never $4, which belongs to the next fragment.
    expect(text).toContain('$1');
    expect(text).toContain('$2');
    expect(text).toContain('$3');
    expect(text).not.toContain('$4');
  });

  it('keeps placeholders contiguous when composed after another predicate', () => {
    const filter: FilterExpression = {
      and: [
        { field: 'name', operator: 'eq', value: 'x' },
        { field: 'location', operator: 'near', value: { lat: 10, lng: 20, radiusMeters: 500 } },
      ],
    };
    const { text, params } = filterToSql(filter);
    expect(params).toEqual(['x', 10, 20, 500]);
    // near owns $2..$4; it must not reference $5 (out of range) or reuse $1.
    expect(text).toContain('$2');
    expect(text).toContain('$3');
    expect(text).toContain('$4');
    expect(text).not.toContain('$5');
  });
});

describe('filterToSql — withinPolygon (ray casting)', () => {
  it('binds the polygon as a JSON parameter, never interpolating coordinates', () => {
    const filter: FilterExpression = {
      field: 'location',
      operator: 'withinPolygon',
      value: { points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }] },
    };
    const { text, params } = filterToSql(filter);
    expect(params).toEqual([JSON.stringify([[0, 0], [1, 0], [1, 1]])]);
    expect(text).toContain('$1::json');
  });

  it('cannot be injected through a coordinate that closes the SQL literal', () => {
    const filter: FilterExpression = {
      field: 'location',
      operator: 'withinPolygon',
      // A hostile string coordinate that, if interpolated, would break out.
      value: { points: [{ lat: 0, lng: "0'); DROP TABLE patient;--" as unknown as number }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }] },
    };
    const { text, params } = filterToSql(filter);
    // The malicious text never reaches the SQL string...
    expect(text).not.toContain('DROP TABLE');
    // ...and the non-numeric coordinate becomes JSON null, not a broken literal.
    expect(params[0]).toBe(JSON.stringify([[null, 0], [1, 0], [1, 1]]));
  });
});
