import { describe, it, expect } from 'vitest';
import { parseOdl } from '../parser/index.js';
import { validateSchema } from '../validator/index.js';
import { mergeInterfaceFields } from '../parser/inherit.js';

const SHARED_PROPS_ODL = `
extend schema @namespace(name: "test.shared", version: "0.1.0")

interface Auditable {
  createdAt: DateTime! @readonly
  createdBy: String! @readonly
  updatedAt: DateTime! @readonly
  updatedAtBy: String! @readonly
}

interface Locatable {
  location: GeoPoint
  address: String
  country: String
}

type Warehouse implements Identifiable & Locatable @objectType {
  id: ID! @primary
  name: String!
  capacity: Int!
}

type DistributionCenter implements Identifiable & Locatable @objectType {
  id: ID! @primary
  name: String!
  throughput: Int!
  # Override the inherited country with a more specific type constraint
  country: String! @constraint(expr: "value.size() > 0")
}
`;

describe('Shared property definitions (interface inheritance)', () => {
  const rawSchema = parseOdl(SHARED_PROPS_ODL);

  it('before merge: Warehouse does not have inherited fields', () => {
    const warehouse = rawSchema.objectTypes.find(t => t.name === 'Warehouse')!;
    expect(warehouse.fields.find(f => f.name === 'location')).toBeUndefined();
    expect(warehouse.fields.find(f => f.name === 'address')).toBeUndefined();
    expect(warehouse.fields.find(f => f.name === 'country')).toBeUndefined();
  });

  it('after merge: Locatable fields are inherited into Warehouse', () => {
    const merged = mergeInterfaceFields(rawSchema);
    const warehouse = merged.objectTypes.find(t => t.name === 'Warehouse')!;
    expect(warehouse.fields.find(f => f.name === 'location')).toBeDefined();
    expect(warehouse.fields.find(f => f.name === 'address')).toBeDefined();
    expect(warehouse.fields.find(f => f.name === 'country')).toBeDefined();
  });

  it('after merge: inherited fields have the interface field type and directives', () => {
    const merged = mergeInterfaceFields(rawSchema);
    const warehouse = merged.objectTypes.find(t => t.name === 'Warehouse')!;
    const location = warehouse.fields.find(f => f.name === 'location')!;
    expect(location.type.name).toBe('GeoPoint');
    expect(location.type.nonNull).toBe(false);
  });

  it('after merge: DistributionCenter keeps its own country override', () => {
    const merged = mergeInterfaceFields(rawSchema);
    const dc = merged.objectTypes.find(t => t.name === 'DistributionCenter')!;
    const country = dc.fields.find(f => f.name === 'country')!;
    // The override has the @constraint directive; the inherited one does not
    expect(country.directives.some(d => d.kind === 'constraint')).toBe(true);
    // The override makes it nonNull
    expect(country.type.nonNull).toBe(true);
  });

  it('after merge: fields not on the interface are preserved', () => {
    const merged = mergeInterfaceFields(rawSchema);
    const warehouse = merged.objectTypes.find(t => t.name === 'Warehouse')!;
    expect(warehouse.fields.find(f => f.name === 'capacity')).toBeDefined();
    expect(warehouse.fields.find(f => f.name === 'name')).toBeDefined();
  });

  it('validator does not require redeclaration after merge', () => {
    const merged = mergeInterfaceFields(rawSchema);
    const result = validateSchema(merged);
    const missingErrors = result.errors.filter(e => e.code === 'INTERFACE_FIELD_MISSING');
    expect(missingErrors).toHaveLength(0);
  });

  it('validator rejects type mismatch on redeclared inherited field', () => {
    const badOdl = `
extend schema @namespace(name: "test.bad", version: "0.1.0")

interface Named {
  name: String!
}

type Bad implements Named @objectType {
  id: ID! @primary
  name: Int!
}
`;
    const badSchema = mergeInterfaceFields(parseOdl(badOdl));
    const result = validateSchema(badSchema);
    expect(result.errors.some(e => e.code === 'INTERFACE_FIELD_TYPE_MISMATCH')).toBe(true);
  });

  it('multi-interface inheritance merges fields from all interfaces', () => {
    const merged = mergeInterfaceFields(rawSchema);
    const dc = merged.objectTypes.find(t => t.name === 'DistributionCenter')!;
    // Locatable fields
    expect(dc.fields.find(f => f.name === 'address')).toBeDefined();
    // Identifiable provides id — already declared as @primary
    expect(dc.fields.find(f => f.name === 'id')).toBeDefined();
  });
});
