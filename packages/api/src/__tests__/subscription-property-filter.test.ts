/**
 * Property-level subscription filtering.
 *
 * `foosChanged(filter: {...})` accepted a filter naming a real property and
 * then dropped every event, because the payload off the bus carries only
 * {id,_type} and an un-evaluable key fails closed. The filter was documented
 * as supported, compiled, and silently matched nothing.
 *
 * Events carrying such a filter are now hydrated per subscriber — after the
 * tenant, FGA and consent gates — so the filter has real values to test.
 *
 * Only when a property filter needs it. The `${Type}ChangeEvent.object` field
 * resolver already hydrates the delivered payload on demand, so hydrating
 * unconditionally would read every object twice; the resolver in turn reuses an
 * object this path already hydrated. Both directions are pinned below, because
 * a duplicate read per event per subscriber is invisible in correctness tests.
 *
 * The redaction case is the security half: filtering must run against the
 * REDACTED object, or the filter becomes an oracle for fields the subscriber
 * cannot read.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PubSub } from 'graphql-subscriptions';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import { createFilteredSubscription } from '../subscriptions/subscription-manager.js';
import { generateResolvers } from '../graphql/resolver-generator.js';
import type { ChangeEvent } from '../subscriptions/subscription-manager.js';
import type { ApiDependencies, ResolverContext } from '../graphql/types.js';
import type { AuthenticatedUserInfo } from '../graphql/types.js';

const ODL = `
extend schema @namespace(name: "nhs.acute", version: "0.1.0")

type Patient @objectType {
  id: ID! @primary
  nhsNumber: String @unique @indexed
  name: String! @sensitive @searchable(weight: 2.0)
  dateOfBirth: Date! @sensitive
  status: PatientStatus!
}

enum PatientStatus {
  ACTIVE
  DISCHARGED
  DECEASED
  TRANSFERRED
}
`;

const USER: AuthenticatedUserInfo = {
  id: 'user-1',
  name: 'Dr Smith',
  email: 'dr.smith@nhs.uk',
  roles: ['clinician'],
  groups: [],
  tenantId: 'tenant-1',
};

/** Stored rows the hydrating read returns, keyed by id. */
type Stored = Record<string, Record<string, unknown> | null>;

function makeDeps(
  schema: ParsedSchema,
  stored: Stored,
  opts: { visibleFields?: Set<string>; getThrows?: boolean } = {},
): ApiDependencies {
  return {
    schema,
    objectManager: {
      get: vi.fn(async (_type: string, id: string) => {
        if (opts.getThrows) throw new Error('storage unavailable');
        return stored[id] ?? null;
      }),
    } as unknown as ApiDependencies['objectManager'],
    linkManager: {} as unknown as ApiDependencies['linkManager'],
    actionExecutor: {} as unknown as ApiDependencies['actionExecutor'],
    authorizationService: {
      check: vi.fn().mockResolvedValue(true),
      getVisibleFields: vi.fn().mockReturnValue(opts.visibleFields),
      // Mirrors the real implementation: fields outside the visible set are
      // nulled in place, system fields are never touched.
      redactFields: vi.fn().mockImplementation(
        (_u: string, _r: string[], _t: string, obj: Record<string, unknown>) => {
          if (!opts.visibleFields) return { data: { ...obj }, _redactedFields: [] };
          const data = { ...obj };
          const hidden: string[] = [];
          for (const key of Object.keys(obj)) {
            if (key.startsWith('_')) continue;
            if (!opts.visibleFields.has(key)) {
              data[key] = null;
              hidden.push(key);
            }
          }
          return { data, _redactedFields: hidden };
        },
      ),
    } as unknown as ApiDependencies['authorizationService'],
    authenticator: {} as unknown as ApiDependencies['authenticator'],
    storage: {} as unknown as ApiDependencies['storage'],
  } as ApiDependencies;
}

function makeCtx(deps: ApiDependencies): ResolverContext {
  return {
    requestContext: { tenantId: USER.tenantId, actorId: USER.id, traceId: 'test-trace' },
    user: USER,
    deps,
  };
}

function event(id: string, changeType: ChangeEvent['changeType'] = 'UPDATED'): ChangeEvent {
  return {
    changeType,
    tenantId: 'tenant-1',
    object: { id, _type: 'Patient' },
    previousValues: null,
    causedBy: null,
    timestamp: '2026-01-15T10:30:00Z',
  };
}

/** A stored Patient row as the object manager would return it. */
function row(id: string, name: string, status: string): Record<string, unknown> {
  return { _id: id, _version: 1, _actorId: 'user-9', name, status, nhsNumber: `nhs-${id}` };
}

describe('property-level subscription filtering', () => {
  let schema: ParsedSchema;

  beforeEach(() => {
    schema = parseOdl(ODL);
  });

  it('delivers an event whose hydrated property matches the filter', async () => {
    const deps = makeDeps(schema, { 'p-1': row('p-1', 'Alice', 'DISCHARGED') });
    const pubsub = new PubSub();
    const sub = createFilteredSubscription(pubsub, 'patientChanged');
    const iterator = sub.subscribe(null, { filter: { status: 'DISCHARGED' } }, makeCtx(deps));
    const next = iterator.next();

    await pubsub.publish('patientChanged', { patientChanged: event('p-1') });

    const payload = (await next).value as Record<string, ChangeEvent>;
    const delivered = payload['patientChanged']!;
    expect(delivered.object.id).toBe('p-1');
    // The SDL declares the full object type, so a real property must be present
    // rather than absent from a two-field stub.
    expect(delivered.object.status).toBe('DISCHARGED');
    expect(delivered.object.name).toBe('Alice');
  });

  it('drops an event whose hydrated property does not match the filter', async () => {
    const deps = makeDeps(schema, {
      'p-1': row('p-1', 'Alice', 'ACTIVE'),
      'p-2': row('p-2', 'Bob', 'DISCHARGED'),
    });
    const pubsub = new PubSub();
    const sub = createFilteredSubscription(pubsub, 'patientChanged');
    const iterator = sub.subscribe(null, { filter: { status: 'DISCHARGED' } }, makeCtx(deps));
    const next = iterator.next();

    // Non-matching (ACTIVE) must not be delivered...
    await pubsub.publish('patientChanged', { patientChanged: event('p-1') });
    await new Promise(r => setTimeout(r, 10));
    // ...and the stream must still be live for the matching one.
    await pubsub.publish('patientChanged', { patientChanged: event('p-2') });

    const payload = (await next).value as Record<string, ChangeEvent>;
    expect(payload['patientChanged']!.object.id).toBe('p-2');
  });

  it('does not let the filter act as an oracle for a redacted field', async () => {
    // The subscriber cannot see `name`. The stored name IS "Alice", so a filter
    // evaluated against raw values would deliver and confirm it.
    const deps = makeDeps(
      schema,
      { 'p-1': row('p-1', 'Alice', 'ACTIVE'), 'p-2': row('p-2', 'Bob', 'ACTIVE') },
      { visibleFields: new Set(['status', 'nhsNumber', 'id']) },
    );
    const pubsub = new PubSub();
    const sub = createFilteredSubscription(pubsub, 'patientChanged');
    const iterator = sub.subscribe(null, { filter: { name: 'Alice' } }, makeCtx(deps));
    const next = iterator.next();

    await pubsub.publish('patientChanged', { patientChanged: event('p-1') });
    await new Promise(r => setTimeout(r, 10));

    // Prove the drop was the filter and not a dead stream: a subscriber
    // filtering on a field it CAN see still receives.
    const visibleSub = createFilteredSubscription(pubsub, 'patientChanged');
    const visibleIter = visibleSub.subscribe(null, { filter: { status: 'ACTIVE' } }, makeCtx(deps));
    const visibleNext = visibleIter.next();
    await pubsub.publish('patientChanged', { patientChanged: event('p-2') });

    const visiblePayload = (await visibleNext).value as Record<string, ChangeEvent>;
    expect(visiblePayload['patientChanged']!.object.id).toBe('p-2');

    // The name-filtered subscriber got nothing.
    const raced = await Promise.race([
      next.then(() => 'delivered'),
      new Promise(r => setTimeout(() => r('pending'), 20)),
    ]);
    expect(raced).toBe('pending');
  });

  it('fails a property filter closed on DELETED, which cannot be hydrated', async () => {
    const deps = makeDeps(schema, { 'p-1': row('p-1', 'Alice', 'DISCHARGED') });
    const pubsub = new PubSub();
    const sub = createFilteredSubscription(pubsub, 'patientChanged');
    const iterator = sub.subscribe(null, { filter: { status: 'DISCHARGED' } }, makeCtx(deps));
    const next = iterator.next();

    await pubsub.publish('patientChanged', { patientChanged: event('p-1', 'DELETED') });
    await new Promise(r => setTimeout(r, 10));

    const raced = await Promise.race([
      next.then(() => 'delivered'),
      new Promise(r => setTimeout(() => r('pending'), 20)),
    ]);
    expect(raced).toBe('pending');
    // The row is gone, so no read should have been attempted for it.
    expect(deps.objectManager.get).not.toHaveBeenCalled();
  });

  it('does not hydrate when no property filter needs it', async () => {
    // The `${Type}ChangeEvent.object` field resolver hydrates the payload on
    // demand, so hydrating here as well would read every object twice.
    const deps = makeDeps(schema, { 'p-1': row('p-1', 'Alice', 'ACTIVE') });
    const pubsub = new PubSub();
    const sub = createFilteredSubscription(pubsub, 'patientChanged');
    // changeType is on the event itself — evaluable without a read.
    const iterator = sub.subscribe(null, { filter: { changeType: 'UPDATED' } }, makeCtx(deps));
    const next = iterator.next();

    await pubsub.publish('patientChanged', { patientChanged: event('p-1') });

    const payload = (await next).value as Record<string, ChangeEvent>;
    expect(payload['patientChanged']!.object.id).toBe('p-1');
    expect(deps.objectManager.get).not.toHaveBeenCalled();
  });

  it('lets the field resolver reuse an already-hydrated object instead of re-reading', async () => {
    const parsed = parseOdl(ODL);
    const deps = makeDeps(parsed, { 'p-1': row('p-1', 'Alice', 'ACTIVE') });
    const storageGet = vi.fn();
    (deps as { storage: unknown }).storage = { getObject: storageGet };

    const { resolvers } = generateResolvers(parsed, deps);
    const objectResolver = (resolvers as Record<string, Record<string, unknown>>)['PatientChangeEvent']?.['object'] as
      | ((parent: unknown, args: unknown, ctx: ResolverContext) => Promise<unknown>)
      | undefined;
    expect(objectResolver, 'PatientChangeEvent.object resolver is not generated').toBeDefined();

    // A parent the subscription manager already hydrated — carries _version.
    const hydratedParent = {
      changeType: 'UPDATED',
      object: { id: 'p-1', _type: 'Patient', _version: 1, name: 'Alice', status: 'ACTIVE' },
    };
    const result = await objectResolver!(hydratedParent, {}, makeCtx(deps));

    expect(result).toMatchObject({ id: 'p-1', status: 'ACTIVE' });
    expect(storageGet, 'field resolver re-read an object the manager had already hydrated').not.toHaveBeenCalled();
  });

  it('degrades to the id-only stub when hydration fails, rather than dropping the stream', async () => {
    const deps = makeDeps(schema, {}, { getThrows: true });
    const pubsub = new PubSub();
    const sub = createFilteredSubscription(pubsub, 'patientChanged');
    // No filter — an unfiltered subscriber must keep receiving through a
    // transient storage failure.
    const iterator = sub.subscribe(null, {}, makeCtx(deps));
    const next = iterator.next();

    await pubsub.publish('patientChanged', { patientChanged: event('p-1') });

    const payload = (await next).value as Record<string, ChangeEvent>;
    expect(payload['patientChanged']!.object.id).toBe('p-1');
    expect(payload['patientChanged']!.object.status).toBeUndefined();
  });
});
