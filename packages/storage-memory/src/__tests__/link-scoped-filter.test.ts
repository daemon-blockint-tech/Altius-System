/**
 * Link-scoped (nested) FieldPredicate tests for the memory provider.
 *
 * A dotted field path like `primaryDoctor.name` is resolved by following
 * the link of that name from the source object to its target, then
 * applying the predicate against the target field. This mirrors the
 * Postgres EXISTS-subquery translation in filter-to-sql.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../memory-storage-provider.js';
import type { RequestContext, OntologySchema } from '@altius/spi';

const CTX: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 'trace-test' };

const SCHEMA: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Patient',
      properties: [
        { name: 'name', type: 'string', required: true },
        { name: 'status', type: 'string' },
      ],
    },
    {
      name: 'Ward',
      properties: [
        { name: 'name', type: 'string', required: true },
        { name: 'capacity', type: 'integer' },
      ],
    },
  ],
  linkTypes: [
    {
      name: 'admittedTo',
      fromType: 'Patient',
      toType: 'Ward',
      cardinality: 'MANY_TO_ONE',
    },
    {
      name: 'treats',
      fromType: 'Ward',
      toType: 'Patient',
      cardinality: 'ONE_TO_MANY',
    },
  ],
};

describe('MemoryStorageProvider — link-scoped filters', () => {
  let storage: MemoryStorageProvider;
  let patientA: string;
  let patientB: string;
  let wardIcu: string;
  let wardGen: string;

  beforeEach(async () => {
    storage = new MemoryStorageProvider();
    await storage.applySchema(CTX, SCHEMA);

    wardIcu = (await storage.createObject(CTX, 'Ward', { name: 'ICU', capacity: 10 }))._id;
    wardGen = (await storage.createObject(CTX, 'Ward', { name: 'General', capacity: 50 }))._id;

    patientA = (await storage.createObject(CTX, 'Patient', { name: 'Alice', status: 'active' }))._id;
    patientB = (await storage.createObject(CTX, 'Patient', { name: 'Bob', status: 'active' }))._id;

    await storage.createLink(CTX, 'admittedTo', patientA, wardIcu);
    await storage.createLink(CTX, 'admittedTo', patientB, wardGen);
  });

  it('filters patients by the name of their ward (outbound link)', async () => {
    const result = await storage.queryObjects(CTX, 'Patient', {
      field: 'admittedTo.name',
      operator: 'eq',
      value: 'ICU',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!._id).toBe(patientA);
  });

  it('returns no patients when the ward name does not match', async () => {
    const result = await storage.queryObjects(CTX, 'Patient', {
      field: 'admittedTo.name',
      operator: 'eq',
      value: 'Nonexistent',
    });

    expect(result.items).toHaveLength(0);
  });

  it('filters wards by a field on their patients (inbound link)', async () => {
    // admittedTo is Patient→Ward. Querying Wards with admittedTo.name follows
    // the link backwards: find wards that have a patient named 'Alice'.
    const result = await storage.queryObjects(CTX, 'Ward', {
      field: 'admittedTo.name',
      operator: 'eq',
      value: 'Alice',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!._id).toBe(wardIcu);
  });

  it('link-scoped filter inside a logical AND', async () => {
    const result = await storage.queryObjects(CTX, 'Patient', {
      and: [
        { field: 'status', operator: 'eq', value: 'active' },
        { field: 'admittedTo.name', operator: 'eq', value: 'General' },
      ],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!._id).toBe(patientB);
  });

  it('returns no matches when the link type is unknown', async () => {
    const result = await storage.queryObjects(CTX, 'Patient', {
      field: 'unknownLink.name',
      operator: 'eq',
      value: 'ICU',
    });

    expect(result.items).toHaveLength(0);
  });

  it('returns no matches for a patient with no link', async () => {
    // Create a patient with no admittedTo link
    const patientC = (await storage.createObject(CTX, 'Patient', { name: 'Carol', status: 'active' }))._id;
    const result = await storage.queryObjects(CTX, 'Patient', {
      field: 'admittedTo.name',
      operator: 'eq',
      value: 'ICU',
    });

    expect(result.items.map((o) => o._id)).not.toContain(patientC);
  });

  it('works with range operators on the target field', async () => {
    // Find patients in wards with capacity > 20 (General has 50, ICU has 10)
    const result = await storage.queryObjects(CTX, 'Patient', {
      field: 'admittedTo.capacity',
      operator: 'gt',
      value: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!._id).toBe(patientB);
  });
});
