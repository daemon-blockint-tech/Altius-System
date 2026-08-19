/**
 * Engine tests for @reducer directive evaluation.
 *
 * Verifies that the ComputedFieldEvaluator dispatches @reducer fields
 * to the correct built-in aggregation function, producing the same
 * results as the equivalent @computed(fn: "sumLinks") declaration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import { MemoryStorageProvider } from '@altius/storage-memory';
import type { RequestContext, OntologySchema } from '@altius/spi';
import { ComputedFieldEvaluator } from '../computed/computed-field-evaluator.js';

const SCHEMA_ODL = `
extend schema @namespace(name: "test.reducer.engine", version: "0.1.0")

type PurchaseOrder implements Identifiable @objectType {
  id: ID! @primary
  unitCost: Float!
  quantity: Int!
  status: String!
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

const CTX: RequestContext = {
  tenantId: 'test',
  actorId: 'test-user',
  branch: 'main',
};

const SPI_SCHEMA: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'PurchaseOrder',
      properties: [
        { name: 'unitCost', type: 'float', required: true },
        { name: 'quantity', type: 'integer', required: true },
        { name: 'status', type: 'string', required: true },
      ],
    },
    {
      name: 'Supplier',
      properties: [
        { name: 'name', type: 'string', required: true },
      ],
    },
  ],
  linkTypes: [
    { name: 'OrderedFrom', fromType: 'PurchaseOrder', toType: 'Supplier', cardinality: 'MANY_TO_ONE' },
  ],
};

describe('Reducer field evaluation', () => {
  let schema: ParsedSchema;
  let storage: MemoryStorageProvider;
  let evaluator: ComputedFieldEvaluator;
  let supplierId: string;

  beforeEach(async () => {
    schema = parseOdl(SCHEMA_ODL);
    storage = new MemoryStorageProvider();
    await storage.applySchema(CTX, SPI_SCHEMA);
    evaluator = new ComputedFieldEvaluator({ storage, schema });

    // Create a supplier
    const supplier = await storage.createObject(CTX, 'Supplier', { name: 'Acme Corp' });
    supplierId = String(supplier._id);

    // Create purchase orders
    const po1 = await storage.createObject(CTX, 'PurchaseOrder', { unitCost: 100.0, quantity: 10, status: 'CONFIRMED' });
    const po2 = await storage.createObject(CTX, 'PurchaseOrder', { unitCost: 200.0, quantity: 50, status: 'CONFIRMED' });
    const po3 = await storage.createObject(CTX, 'PurchaseOrder', { unitCost: 50.0, quantity: 5, status: 'CONFIRMED' });

    // Create links: PurchaseOrder -> Supplier (OrderedFrom)
    await storage.createLink(CTX, 'OrderedFrom', String(po1._id), supplierId, {});
    await storage.createLink(CTX, 'OrderedFrom', String(po2._id), supplierId, {});
    await storage.createLink(CTX, 'OrderedFrom', String(po3._id), supplierId, {});
  });

  it('evaluates SUM reducer over linked unitCost', async () => {
    const result = await evaluator.evaluate('Supplier', supplierId, 'totalOrderValue', CTX);
    expect(result).toBe(350.0); // 100 + 200 + 50
  });

  it('evaluates AVG reducer over linked unitCost', async () => {
    const result = await evaluator.evaluate('Supplier', supplierId, 'avgOrderValue', CTX);
    expect(result).toBeCloseTo(116.67, 1); // (100 + 200 + 50) / 3
  });

  it('evaluates COUNT reducer (counts inbound links)', async () => {
    const result = await evaluator.evaluate('Supplier', supplierId, 'orderCount', CTX);
    expect(result).toBe(3);
  });

  it('evaluates MAX reducer over linked quantity', async () => {
    const result = await evaluator.evaluate('Supplier', supplierId, 'maxOrderQty', CTX);
    expect(result).toBe(50);
  });

  it('evaluates MIN reducer over linked quantity', async () => {
    const result = await evaluator.evaluate('Supplier', supplierId, 'minOrderQty', CTX);
    expect(result).toBe(5);
  });

  it('evaluateAll includes all reducer fields', async () => {
    const result = await evaluator.evaluateAll('Supplier', supplierId, CTX);
    expect(result['totalOrderValue']).toBe(350.0);
    expect(result['orderCount']).toBe(3);
    expect(result['maxOrderQty']).toBe(50);
    expect(result['minOrderQty']).toBe(5);
  });

  it('getComputedFields includes reducer fields', () => {
    const fields = evaluator.getComputedFields('Supplier');
    const names = fields.map(f => f.name);
    expect(names).toContain('totalOrderValue');
    expect(names).toContain('avgOrderValue');
    expect(names).toContain('orderCount');
    expect(names).toContain('maxOrderQty');
    expect(names).toContain('minOrderQty');
  });

  it('throws when evaluating a non-reducer, non-computed field', async () => {
    await expect(
      evaluator.evaluate('Supplier', supplierId, 'name', CTX),
    ).rejects.toThrow('is not a computed or reducer field');
  });
});
