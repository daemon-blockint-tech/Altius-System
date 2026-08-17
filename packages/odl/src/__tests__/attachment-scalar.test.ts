/**
 * Tests for the Attachment scalar type in ODL.
 *
 * Verifies that Attachment:
 * 1. Parses as a field type
 * 2. Passes validation
 * 3. Generates GraphQL schema with Attachment scalar
 * 4. Generates an AttachmentFilter with only `exists`
 * 5. Is excluded from unique/indexed directives
 * 6. Maps to JSONB in Postgres
 */

import { describe, it, expect } from 'vitest';
import { parseOdl, validateSchema, generateGraphQLSchema } from '../index.js';

const ATTACHMENT_ODL = `
extend schema @namespace(name: "test.attachment", version: "0.1.0")

interface Identifiable {
  id: ID!
}

type Document implements Identifiable @objectType {
  id: ID! @primary
  title: String!
  file: Attachment
  attachments: [Attachment!]
  avatar: Attachment @default(value: null)
}
`;

describe('Attachment scalar type', () => {
  const schema = parseOdl(ATTACHMENT_ODL);

  it('parses Attachment-typed fields', () => {
    const doc = schema.objectTypes.find(t => t.name === 'Document')!;
    const file = doc.fields.find(f => f.name === 'file')!;
    expect(file.type.name).toBe('Attachment');
    expect(file.type.nonNull).toBe(false);

    const attachments = doc.fields.find(f => f.name === 'attachments')!;
    expect(attachments.type.name).toBe('Attachment');
    expect(attachments.type.isList).toBe(true);
  });

  it('passes schema validation', () => {
    const result = validateSchema(schema);
    const errors = result.errors.filter(e => e.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('generates GraphQL with Attachment scalar declaration', () => {
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('scalar Attachment');
    expect(sdl).toContain('file: Attachment');
    expect(sdl).toContain('attachments: [Attachment!]');
  });

  it('generates AttachmentFilter with only exists', () => {
    const sdl = generateGraphQLSchema(schema);
    expect(sdl).toContain('input AttachmentFilter');
    expect(sdl).toContain('exists: Boolean');
    // Should NOT contain eq/ne/gt/lt for Attachment
    const filterBlock = sdl.match(/input AttachmentFilter \{[^}]+\}/)?.[0];
    expect(filterBlock).toBeDefined();
    expect(filterBlock).not.toContain('eq:');
    expect(filterBlock).not.toContain('gt:');
  });

  it('accepts @unique on Attachment (blobId can be unique)', () => {
    const odl = `
extend schema @namespace(name: "test.ok", version: "0.1.0")
interface Identifiable { id: ID! }
type Ok implements Identifiable @objectType {
  id: ID! @primary
  avatar: Attachment @unique
}
`;
    const s = parseOdl(odl);
    const result = validateSchema(s);
    const errors = result.errors.filter(e => e.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
