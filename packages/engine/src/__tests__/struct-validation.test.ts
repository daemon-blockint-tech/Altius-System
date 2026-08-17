import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import { validateSchemaFields, validationError } from '../objects/validation.js';
import { MemoryStorageProvider } from '@altius/storage-memory';
import type { ParsedSchema } from '@altius/odl';

const SCHEMA = `
extend schema @namespace(name: "test.structs", version: "0.1.0")

type Address @struct {
  street: String!
  city: String!
  postalCode: String
  country: String @default(value: "US")
}

type Money @struct {
  amount: Float!
  currency: String! @default(value: "USD")
}

type Supplier @objectType {
  id: ID! @primary
  name: String!
  headquarters: Address
  valuation: Money
  tags: [String!]
}
`;

describe('Struct validation', () => {
  const schema = parseOdl(SCHEMA);

  it('accepts a valid struct value', () => {
    const failures = validateSchemaFields(schema, 'Supplier', {
      id: 'sup-1',
      name: 'Acme',
      headquarters: {
        street: '123 Main St',
        city: 'Springfield',
        postalCode: '62701',
        country: 'US',
      },
    });
    expect(failures).toHaveLength(0);
  });

  it('rejects a struct value missing a required nested field', () => {
    const failures = validateSchemaFields(schema, 'Supplier', {
      id: 'sup-2',
      name: 'Acme',
      headquarters: {
        street: '123 Main St',
        // city is required but missing
      },
    });
    expect(failures.some(f => f.field === 'headquarters.city')).toBe(true);
    expect(failures.some(f => f.message.includes('Required'))).toBe(true);
  });

  it('rejects a struct value with wrong scalar type in nested field', () => {
    const failures = validateSchemaFields(schema, 'Supplier', {
      id: 'sup-3',
      name: 'Acme',
      headquarters: {
        street: 123, // should be string
        city: 'Springfield',
      },
    });
    expect(failures.some(f => f.field === 'headquarters.street')).toBe(true);
  });

  it('rejects a struct value that is not an object', () => {
    const failures = validateSchemaFields(schema, 'Supplier', {
      id: 'sup-4',
      name: 'Acme',
      headquarters: '123 Main St', // should be an object
    });
    expect(failures.some(f => f.field === 'headquarters')).toBe(true);
  });

  it('accepts a null struct value (optional field)', () => {
    const failures = validateSchemaFields(schema, 'Supplier', {
      id: 'sup-5',
      name: 'Acme',
      headquarters: null,
    });
    expect(failures).toHaveLength(0);
  });

  it('accepts a struct with only required fields (optional sub-fields omitted)', () => {
    const failures = validateSchemaFields(schema, 'Supplier', {
      id: 'sup-6',
      name: 'Acme',
      headquarters: {
        street: '123 Main St',
        city: 'Springfield',
      },
    });
    expect(failures).toHaveLength(0);
  });

  it('produces a VALIDATION_ERROR with struct field path', () => {
    const failures = validateSchemaFields(schema, 'Supplier', {
      id: 'sup-7',
      name: 'Acme',
      headquarters: {
        street: '123 Main St',
        // city missing
      },
    });
    const err = validationError(failures);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('headquarters.city');
  });
});
