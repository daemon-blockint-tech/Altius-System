/**
 * A GeoPoint field gets a spatial filter surface in the generated GraphQL.
 *
 * Scalar comparison operators are meaningless on a JSONB {lat,lng}, so the
 * GeoPoint filter exposes bounding-box containment (`within`) backed by
 * GeoBoundingBoxInput. This pins the generated shape and that the SDL builds.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '../parser/index.js';
import { generateGraphQLSchema } from '../codegen/index.js';
import { buildSchema } from 'graphql';

const ODL = `
type Place @objectType {
  id: ID! @primary
  name: String!
  location: GeoPoint
}
`;

describe('GeoPoint filter codegen', () => {
  it('emits GeoPointFilter.within referencing GeoBoundingBoxInput', () => {
    const sdl = generateGraphQLSchema(parseOdl(ODL));
    expect(sdl).toContain('input GeoPointFilter {');
    expect(sdl).toContain('within: GeoBoundingBoxInput');
    expect(sdl).toContain('input GeoBoundingBoxInput {');
    expect(sdl).toContain('minLat: Float!');
    expect(sdl).toContain('maxLng: Float!');
  });

  it('wires the geo filter onto the object filter and builds a valid schema', () => {
    const sdl = generateGraphQLSchema(parseOdl(ODL));
    expect(sdl).toContain('location: GeoPointFilter');
    expect(() => buildSchema(sdl)).not.toThrow();
  });
});
