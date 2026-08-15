/**
 * Aggregation builtins for @computed fields, and the link-direction fix they
 * depend on.
 *
 * Before this the only aggregate a pack could declare was `countLinks`, so any
 * "total dose" or "average score" field needed platform code. These drive the
 * real `evaluate()` path, so the @computed directive parsing is exercised too.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '@altius/storage-memory';
import { parseOdl, type ParsedSchema } from '@altius/odl';
import type { RequestContext, OntologySchema } from '@altius/spi';
import { ComputedFieldEvaluator } from '../computed/computed-field-evaluator.js';

const ctx: RequestContext = { tenantId: 't1', actorId: 'a1' };

const ODL = `
extend schema @namespace(name: "test", version: "0.1.0")

type Reading @objectType {
  id: ID! @primary
  label: String
  value: Float
  patientName: String @computed(fn: "lookupField", args: { linkType: "HasReading", field: "name", direction: "INBOUND" })
}

type Patient @objectType {
  id: ID! @primary
  name: String
  totalValue: Float @computed(fn: "sumLinks", args: { linkType: "HasReading", field: "value" })
  meanValue: Float @computed(fn: "avgLinks", args: { linkType: "HasReading", field: "value" })
  lowest: Float @computed(fn: "minLinks", args: { linkType: "HasReading", field: "value" })
  highest: Float @computed(fn: "maxLinks", args: { linkType: "HasReading", field: "value" })
}

type HasReading @linkType(from: "Patient", to: "Reading", cardinality: ONE_TO_MANY) {
  id: ID! @primary
}
`;

const spiSchema: OntologySchema = {
  version: 1,
  objectTypes: [
    { name: 'Patient', properties: [{ name: 'name', type: 'String' }] },
    { name: 'Reading', properties: [
      { name: 'label', type: 'String' },
      { name: 'value', type: 'Float' },
    ] },
  ],
  linkTypes: [
    { name: 'HasReading', fromType: 'Patient', toType: 'Reading', cardinality: 'ONE_TO_MANY' },
  ],
};

let storage: MemoryStorageProvider;
let evaluator: ComputedFieldEvaluator;
let schema: ParsedSchema;
let patientId: string;

async function addReading(label: string, value: number | null | string): Promise<string> {
  const props: Record<string, unknown> = value === null ? { label } : { label, value };
  const r = await storage.createObject(ctx, 'Reading', props);
  await storage.createLink(ctx, 'HasReading', patientId, r._id);
  return r._id;
}

beforeEach(async () => {
  schema = parseOdl(ODL);
  storage = new MemoryStorageProvider();
  await storage.applySchema(ctx, spiSchema);
  evaluator = new ComputedFieldEvaluator({ storage, schema });
  const p = await storage.createObject(ctx, 'Patient', { name: 'P' });
  patientId = p._id;
});

describe('@computed aggregation builtins', () => {
  it('sums a numeric field across linked objects', async () => {
    await addReading('a', 2);
    await addReading('b', 3.5);

    await expect(evaluator.evaluate('Patient', patientId, 'totalValue', ctx)).resolves.toBe(5.5);
  });

  it('averages, treating a missing value as absent rather than zero', async () => {
    await addReading('a', 4);
    await addReading('b', 6);
    await addReading('not-taken', null);

    // 5, not 3.33 — an unrecorded reading is not a reading of zero.
    await expect(evaluator.evaluate('Patient', patientId, 'meanValue', ctx)).resolves.toBe(5);
  });

  it('returns min and max', async () => {
    await addReading('a', 9);
    await addReading('b', -2);
    await addReading('c', 4);

    await expect(evaluator.evaluate('Patient', patientId, 'lowest', ctx)).resolves.toBe(-2);
    await expect(evaluator.evaluate('Patient', patientId, 'highest', ctx)).resolves.toBe(9);
  });

  it('sums to 0 over no links, but reports avg/min as null', async () => {
    await expect(evaluator.evaluate('Patient', patientId, 'totalValue', ctx)).resolves.toBe(0);
    await expect(evaluator.evaluate('Patient', patientId, 'meanValue', ctx)).resolves.toBeNull();
    await expect(evaluator.evaluate('Patient', patientId, 'lowest', ctx)).resolves.toBeNull();
  });

  it('fails loudly on a non-numeric value instead of coercing it', async () => {
    await addReading('a', 1);
    await addReading('b', 'not-a-number');

    await expect(evaluator.evaluate('Patient', patientId, 'totalValue', ctx))
      .rejects.toThrow(/is not a number/);
  });

  it("resolves an inbound link using that end's own type", async () => {
    // Regression: the id came from _fromId while the type came from _toType,
    // so an inbound lookup searched a real id in the wrong type's table.
    const readingId = await addReading('a', 7);

    await expect(evaluator.evaluate('Reading', readingId, 'patientName', ctx)).resolves.toBe('P');
  });
});
