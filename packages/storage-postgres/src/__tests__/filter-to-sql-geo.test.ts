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
