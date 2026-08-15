/**
 * The generated SDL must declare `_version` on ObjectTypes — without it the
 * `_expectedVersion` action input (and the REST `If-Match` header) asks for a
 * value no GraphQL query can return.
 */

import { describe, it, expect } from 'vitest';
import { buildSchema } from 'graphql';
import { parseOdl } from '../parser/index.js';
import { generateGraphQLSchema } from '../codegen/index.js';

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Item @objectType {
  id: ID! @primary
  name: String!
}
`;

describe('_version on generated ObjectTypes', () => {
  it('declares _version: Int on each ObjectType', () => {
    const sdl = generateGraphQLSchema(parseOdl(ODL));
    const item = buildSchema(sdl).getType('Item') as { getFields(): Record<string, unknown> };
    expect(Object.keys(item.getFields())).toContain('_version');
  });
});
