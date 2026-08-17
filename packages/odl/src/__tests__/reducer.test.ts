import { describe, it, expect } from 'vitest';
import { parseOdl } from '../parser/index.js';
import { validateSchema } from '../validator/index.js';

const REDUCER_ODL = `
extend schema @namespace(name: "test.reducer", version: "0.1.0")

type PurchaseOrder implements Identifiable @objectType {
  id: ID! @primary
  unitCost: Float!
  quantity: Int!
}

type Supplier implements Identifiable @objectType {
  id: ID! @primary
  name: String!
  totalOrderValue: Float @reducer(
    linkType: "OrderedFrom",
    direction: INBOUND,
    function: SUM,
    field: "unitCost"
  )
  avgOrderValue: Float @reducer(
    linkType: "OrderedFrom",
    direction: INBOUND,
    function: AVG,
    field: "unitCost"
  )
  orderCount: Int @reducer(
    linkType: "OrderedFrom",
    direction: INBOUND,
    function: COUNT
  )
  maxOrderQty: Int @reducer(
    linkType: "OrderedFrom",
    direction: INBOUND,
    function: MAX,
    field: "quantity"
  )
  minOrderQty: Int @reducer(
    linkType: "OrderedFrom",
    direction: INBOUND,
    function: MIN,
    field: "quantity"
  )
}

type OrderedFrom @linkType(from: "PurchaseOrder", to: "Supplier", cardinality: MANY_TO_ONE) {
  placedAt: DateTime
}
`;

describe('Reducer directive parsing', () => {
  const schema = parseOdl(REDUCER_ODL);
  const supplier = schema.objectTypes.find(t => t.name === 'Supplier')!;

  it('parses @reducer with SUM function', () => {
    const field = supplier.fields.find(f => f.name === 'totalOrderValue')!;
    const reducer = field.directives.find(d => d.kind === 'reducer');
    expect(reducer).toBeDefined();
    expect(reducer!.kind).toBe('reducer');
    if (reducer!.kind === 'reducer') {
      expect(reducer!.linkType).toBe('OrderedFrom');
      expect(reducer!.direction).toBe('INBOUND');
      expect(reducer!.function).toBe('SUM');
      expect(reducer!.field).toBe('unitCost');
    }
  });

  it('parses @reducer with COUNT function (no field)', () => {
    const field = supplier.fields.find(f => f.name === 'orderCount')!;
    const reducer = field.directives.find(d => d.kind === 'reducer');
    expect(reducer).toBeDefined();
    if (reducer!.kind === 'reducer') {
      expect(reducer!.function).toBe('COUNT');
      expect(reducer!.field).toBeUndefined();
    }
  });

  it('parses @reducer with AVG, MIN, MAX functions', () => {
    const avg = supplier.fields.find(f => f.name === 'avgOrderValue')!;
    const max = supplier.fields.find(f => f.name === 'maxOrderQty')!;
    const min = supplier.fields.find(f => f.name === 'minOrderQty')!;
    expect(avg.directives.find(d => d.kind === 'reducer')).toBeDefined();
    expect(max.directives.find(d => d.kind === 'reducer')).toBeDefined();
    expect(min.directives.find(d => d.kind === 'reducer')).toBeDefined();
  });

  it('defaults direction to OUTBOUND when not specified', () => {
    const odl = `
extend schema @namespace(name: "test.default", version: "0.1.0")
type Bar implements Identifiable @objectType {
  id: ID! @primary
}
type Foo implements Identifiable @objectType {
  id: ID! @primary
  count: Int @reducer(linkType: "Bar", function: COUNT)
}
type BarLink @linkType(from: "Foo", to: "Bar", cardinality: MANY_TO_ONE) {
  note: String
}
`;
    const s = parseOdl(odl);
    const foo = s.objectTypes.find(t => t.name === 'Foo')!;
    const reducer = foo.fields.find(f => f.name === 'count')!.directives.find(d => d.kind === 'reducer')!;
    if (reducer.kind === 'reducer') {
      expect(reducer.direction).toBe('OUTBOUND');
    }
  });
});

describe('Reducer directive validation', () => {
  it('passes validation for valid reducers', () => {
    const schema = parseOdl(REDUCER_ODL);
    const result = validateSchema(schema);
    const reducerErrors = result.errors.filter(e =>
      e.code.startsWith('REDUCER_')
    );
    expect(reducerErrors).toHaveLength(0);
  });

  it('rejects unknown link type', () => {
    const odl = `
extend schema @namespace(name: "test.bad", version: "0.1.0")
type Foo implements Identifiable @objectType {
  id: ID! @primary
  count: Int @reducer(linkType: "Nonexistent", function: COUNT)
}
`;
    const result = validateSchema(parseOdl(odl));
    expect(result.errors.some(e => e.code === 'REDUCER_UNKNOWN_LINK_TYPE')).toBe(true);
  });

  it('rejects SUM without field', () => {
    const odl = `
extend schema @namespace(name: "test.bad", version: "0.1.0")
type Foo implements Identifiable @objectType {
  id: ID! @primary
  total: Float @reducer(linkType: "Bar", function: SUM)
}
`;
    const result = validateSchema(parseOdl(odl));
    expect(result.errors.some(e => e.code === 'REDUCER_MISSING_FIELD')).toBe(true);
  });

  it('rejects SUM on non-numeric field', () => {
    const odl = `
extend schema @namespace(name: "test.bad", version: "0.1.0")
type Foo implements Identifiable @objectType {
  id: ID! @primary
  total: String @reducer(linkType: "Bar", function: SUM, field: "x")
}
`;
    const result = validateSchema(parseOdl(odl));
    expect(result.errors.some(e => e.code === 'REDUCER_TYPE_MISMATCH')).toBe(true);
  });

  it('rejects COUNT on non-Int field', () => {
    const odl = `
extend schema @namespace(name: "test.bad", version: "0.1.0")
type Foo implements Identifiable @objectType {
  id: ID! @primary
  count: String @reducer(linkType: "Bar", function: COUNT)
}
`;
    const result = validateSchema(parseOdl(odl));
    expect(result.errors.some(e => e.code === 'REDUCER_TYPE_MISMATCH')).toBe(true);
  });

  it('rejects @reducer conflicting with @computed', () => {
    const odl = `
extend schema @namespace(name: "test.bad", version: "0.1.0")
type Foo implements Identifiable @objectType {
  id: ID! @primary
  count: Int @reducer(linkType: "Bar", function: COUNT) @computed(fn: "countLinks", args: { type: "Bar" })
}
`;
    const result = validateSchema(parseOdl(odl));
    expect(result.errors.some(e => e.code === 'REDUCER_CONFLICT')).toBe(true);
  });
});
