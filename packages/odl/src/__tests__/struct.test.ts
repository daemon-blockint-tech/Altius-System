import { describe, it, expect } from 'vitest';
import { parseOdl } from '../parser/index.js';
import { validateSchema } from '../validator/index.js';
import type { ParsedSchema } from '../parser/types.js';

const STRUCT_ODL = `
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

type ContactInfo @struct {
  email: String
  phone: String
  address: Address
}

type Supplier
  @objectType
  @display(label: "Supplier", pluralLabel: "Suppliers", icon: "truck")
{
  id: ID! @primary
  name: String! @searchable
  headquarters: Address
  valuation: Money
  contacts: [ContactInfo!]
  tags: [String!]
}
`;

describe('Struct property type', () => {
  const schema = parseOdl(STRUCT_ODL);

  it('parses @struct types into schema.structTypes', () => {
    expect(schema.structTypes).toBeDefined();
    expect(schema.structTypes).toHaveLength(3);

    const address = schema.structTypes!.find((s) => s.name === 'Address');
    expect(address).toBeDefined();
    expect(address!.fields).toHaveLength(4);
    expect(address!.fields[0]!.name).toBe('street');
    expect(address!.fields[0]!.type.nonNull).toBe(true);
    expect(address!.fields[2]!.type.nonNull).toBe(false);
  });

  it('struct fields can reference other structs (nesting)', () => {
    const contact = schema.structTypes!.find((s) => s.name === 'ContactInfo');
    expect(contact).toBeDefined();
    const addrField = contact!.fields.find((f) => f.name === 'address');
    expect(addrField).toBeDefined();
    expect(addrField!.type.name).toBe('Address');
  });

  it('struct fields can be lists of other structs', () => {
    const supplier = schema.objectTypes.find((t) => t.name === 'Supplier');
    const contacts = supplier!.fields.find((f) => f.name === 'contacts');
    expect(contacts).toBeDefined();
    expect(contacts!.type.isList).toBe(true);
    expect(contacts!.type.name).toBe('ContactInfo');
  });

  it('struct types are included in allTypeNames for field resolution', () => {
    const result = validateSchema(schema);
    const structFieldErrors = result.errors.filter((e) =>
      e.code === 'UNKNOWN_TYPE_REF' &&
      (e.message.includes('Address') || e.message.includes('Money') || e.message.includes('ContactInfo')),
    );
    expect(structFieldErrors).toHaveLength(0);
  });

  it('validates that struct fields cannot have @link or @computed', () => {
    const badOdl = `
extend schema @namespace(name: "test.bad", version: "0.1.0")

type BadStruct @struct {
  id: ID! @primary
  name: String
  related: [BadObject] @link(type: "SomeLink", direction: OUTBOUND)
}

type BadObject @objectType {
  id: ID! @primary
}
`;
    const badSchema = parseOdl(badOdl);
    const result = validateSchema(badSchema);
    expect(result.errors.some((e) => e.code === 'STRUCT_INVALID_FIELD')).toBe(true);
  });

  it('rejects @primary on struct fields', () => {
    const badOdl = `
extend schema @namespace(name: "test.bad", version: "0.1.0")

type BadStruct @struct {
  id: ID! @primary
  name: String
}
`;
    const badSchema = parseOdl(badOdl);
    const result = validateSchema(badSchema);
    expect(result.errors.some((e) => e.code === 'STRUCT_INVALID_FIELD')).toBe(true);
  });

  it('detects struct cycles', () => {
    const cyclicOdl = `
extend schema @namespace(name: "test.cyclic", version: "0.1.0")

type A @struct {
  b: B
}

type B @struct {
  a: A
}
`;
    const cyclicSchema = parseOdl(cyclicOdl);
    const result = validateSchema(cyclicSchema);
    expect(result.errors.some((e) => e.code === 'STRUCT_CYCLE')).toBe(true);
  });
});
