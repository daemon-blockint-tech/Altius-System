/**
 * Custom scalars must be validated by FORMAT, not by `typeof`.
 *
 * Date, DateTime, Duration and URI were checked as `typeof v === 'string'`
 * and GeoPoint as any non-null object. Postgres maps the first three to
 * DATE/TIMESTAMPTZ/INTERVAL, so `"not-a-date"` passed the engine and then
 * produced two different outcomes: the memory provider stored it happily
 * while Postgres raised. Same ODL, same write, different behaviour per
 * backend — the divergence the conformance suite exists to catch, arriving
 * from above the SPI where the suite cannot see it.
 *
 * Validated in the engine rather than in each provider because that is the
 * one place both of them route through.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '@altius/storage-memory';
import type { RequestContext, OntologySchema } from '@altius/spi';
import type { ParsedSchema } from '@altius/odl';
import { ObjectManager } from '../objects/object-manager.js';
import { EngineEventEmitter } from '../events/event-emitter.js';
import { InMemoryEventBus } from '../events/event-bus.js';

const ctx: RequestContext = { tenantId: 't-1', actorId: 'u-1' };

function field(name: string, type: string) {
  return {
    name,
    type: { name: type, nonNull: false, isList: false, listElementNonNull: false },
    directives: [],
  };
}

const parsedSchema: ParsedSchema = {
  objectTypes: [{
    kind: 'objectType',
    name: 'Reading',
    fields: [
      { ...field('id', 'ID'), type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
      field('day', 'Date'),
      field('at', 'DateTime'),
      field('span', 'Duration'),
      field('where', 'GeoPoint'),
      field('link', 'URI'),
    ],
    interfaces: [],
    directives: [{ kind: 'objectType' }],
  }],
  linkTypes: [], actionTypes: [], functionTypes: [], enums: [], interfaces: [], scalars: [],
} as unknown as ParsedSchema;

const spiSchema: OntologySchema = {
  version: 1,
  objectTypes: [{
    name: 'Reading',
    properties: [
      { name: 'day', type: 'date' }, { name: 'at', type: 'datetime' },
      { name: 'span', type: 'string' }, { name: 'where', type: 'json' },
      { name: 'link', type: 'string' },
    ],
  }],
  linkTypes: [],
};

let manager: ObjectManager;

beforeEach(async () => {
  const storage = new MemoryStorageProvider();
  await storage.applySchema(ctx, spiSchema);
  manager = new ObjectManager({
    storage, schema: parsedSchema,
    eventEmitter: new EngineEventEmitter(new InMemoryEventBus()),
  });
});

const reject = (props: Record<string, unknown>) =>
  expect(manager.create('Reading', props, ctx)).rejects.toThrow();
const accept = (props: Record<string, unknown>) =>
  expect(manager.create('Reading', props, ctx)).resolves.toBeTruthy();

describe('Date', () => {
  it('accepts an ISO calendar date', () => accept({ day: '2026-08-16' }));
  it('rejects a non-date string Postgres would refuse', () => reject({ day: 'not-a-date' }));
  it('rejects a date that does not exist', () => reject({ day: '2025-02-30' }));
  it('rejects a datetime in a Date field — they are different columns', () =>
    reject({ day: '2026-08-16T10:00:00Z' }));
});

describe('DateTime', () => {
  it('accepts an ISO instant', () => accept({ at: '2026-08-16T10:00:00Z' }));
  it('rejects a bare date — DATE and TIMESTAMPTZ are not interchangeable', () =>
    reject({ at: '2026-08-16' }));
  it('rejects gibberish', () => reject({ at: 'yesterday' }));
});

describe('Duration', () => {
  it('accepts an ISO 8601 duration', () => accept({ span: 'PT30M' }));
  it('accepts a compound duration', () => accept({ span: 'P3Y6M4DT12H30M5S' }));
  it('rejects a bare P with no components', () => reject({ span: 'P' }));
  it('rejects a human-written duration', () => reject({ span: '30 minutes' }));
});

describe('GeoPoint', () => {
  it('accepts a lat/lng pair', () => accept({ where: { lat: 51.5, lng: -0.12 } }));
  it('rejects an empty object — the shape guaranteed nothing before', () =>
    reject({ where: {} }));
  it('rejects coordinates off the globe', () => reject({ where: { lat: 91, lng: 0 } }));
  it('rejects an array', () => reject({ where: [51.5, -0.12] }));
  it('rejects non-numeric coordinates', () => reject({ where: { lat: '51.5', lng: '-0.12' } }));
});

describe('URI', () => {
  it('accepts an absolute URL', () => accept({ link: 'https://nhs.uk/patient/1' }));
  it('rejects a bare word', () => reject({ link: 'nhs' }));
  it('rejects an empty string', () => reject({ link: '' }));
});
