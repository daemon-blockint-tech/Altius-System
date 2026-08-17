/**
 * The generated SDL must actually build as an executable schema.
 *
 * Every other test here asserts on SDL *text* — that a field appears, that a
 * type is emitted. None of them ran the result through GraphQL's own
 * validation, so a schema that is well-formed as a string but illegal as a
 * schema passed the whole suite and only failed at boot.
 *
 * That happened: adding generic update mutations emitted
 * `UpdateTransferInput.patient: Patient`, an output type inside an input.
 * 56/56 packages were green and the server refused to start with
 * "must be Input Type but got: Patient". This closes that gap — the class of
 * bug is "valid text, invalid schema", and only the real builder catches it.
 */

import { describe, it, expect } from 'vitest';
import { buildSchema } from 'graphql';
import { parseOdl } from '../parser/index.js';
import { generateGraphQLSchema } from '../codegen/index.js';

/** An ObjectType-typed field is the shape that broke the build. */
const WITH_OBJECT_TYPED_FIELD = `
extend schema @namespace(name: "test", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  name: String
  admittedOn: Date
}

type Ward @objectType {
  id: ID! @primary
  name: String!
}

type Transfer @objectType {
  id: ID! @primary
  patient: Patient
  fromWard: Ward
  toWard: Ward
  reason: String
  recordedAt: DateTime @readonly
}

type TransferPatient @actionType {
  patient: Patient! @param
  toWard: Ward! @param
}
`;

describe('generated SDL is a legal GraphQL schema', () => {
  it('builds without error', () => {
    const sdl = generateGraphQLSchema(parseOdl(WITH_OBJECT_TYPED_FIELD));

    expect(() => buildSchema(sdl)).not.toThrow();
  });

  it('keeps ObjectType-typed fields out of update inputs', () => {
    const sdl = generateGraphQLSchema(parseOdl(WITH_OBJECT_TYPED_FIELD));
    const schema = buildSchema(sdl);
    const input = schema.getType('UpdateTransferInput');

    expect(input).toBeDefined();
    const fields = Object.keys((input as { getFields(): Record<string, unknown> }).getFields());
    // Relationships are edited through link effects, not by patching an
    // embedded object — and GraphQL refuses an output type in an input.
    expect(fields).not.toContain('patient');
    expect(fields).not.toContain('fromWard');
    expect(fields).toContain('reason');
  });

  it('omits @readonly and @primary from update inputs', () => {
    const sdl = generateGraphQLSchema(parseOdl(WITH_OBJECT_TYPED_FIELD));
    const schema = buildSchema(sdl);
    const fields = Object.keys(
      (schema.getType('UpdateTransferInput') as { getFields(): Record<string, unknown> }).getFields(),
    );

    // The primary field is the mutation's `id` argument, and storage mints it.
    expect(fields).not.toContain('id');
    // A readonly field would be advertised only to be refused by the writer.
    expect(fields).not.toContain('recordedAt');
  });

  it('exposes the generic update and delete mutations the resolvers implement', () => {
    const sdl = generateGraphQLSchema(parseOdl(WITH_OBJECT_TYPED_FIELD));
    const mutation = buildSchema(sdl).getMutationType();
    const fields = Object.keys(mutation!.getFields());

    expect(fields).toContain('updatePatient');
    expect(fields).toContain('deletePatient');
  });

  it('makes every update-input field optional — an update is a partial patch', () => {
    const sdl = generateGraphQLSchema(parseOdl(WITH_OBJECT_TYPED_FIELD));

    // Requiring the whole object would force a read-modify-write to change one
    // property, and race anyone else doing the same.
    const block = sdl.slice(sdl.indexOf('input UpdateWardInput'));
    const body = block.slice(0, block.indexOf('}'));
    expect(body).not.toMatch(/:\s*\w+!/);
  });
});
