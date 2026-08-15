/**
 * Regression tests for foosChanged(filter:) fail-closed semantics.
 *
 * ChangeEvent.object carries only { id, _type }, so a filter key naming an
 * object property (e.g. status) cannot be evaluated from the payload. Such a
 * filter must deliver nothing, not everything.
 */

import { describe, it, expect } from 'vitest';
import { PubSub } from 'graphql-subscriptions';
import { createFilteredSubscription } from '../subscriptions/subscription-manager.js';
import type { ChangeEvent } from '../subscriptions/subscription-manager.js';
import type { ResolverContext } from '../graphql/types.js';

// Authorization always allows, so the filter is the only thing that can reject.
const ctx = {
  requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'test-trace' },
  user: { id: 'u-1', tenantId: 't-1' },
  deps: { authorizationService: { check: async () => true } },
} as unknown as ResolverContext;

const EVENT: ChangeEvent = {
  changeType: 'UPDATED',
  tenantId: 't-1',
  object: { id: 'p-1', _type: 'Patient' },
  previousValues: null,
  causedBy: null,
  timestamp: '2025-01-15T10:30:00Z',
};

/** Publish one event and report whether the subscriber received it. */
async function deliversUnder(filter: Record<string, unknown>): Promise<boolean> {
  const pubsub = new PubSub();
  const sub = createFilteredSubscription(pubsub, 'patientChanged');
  const iterator = sub.subscribe(null, { filter }, ctx);

  const next = iterator.next();
  await pubsub.publish('patientChanged', { patientChanged: EVENT });

  const outcome = await Promise.race([
    next.then(r => (r.done ? 'dropped' : 'delivered')),
    new Promise<string>(resolve => setTimeout(() => resolve('dropped'), 50)),
  ]);
  await iterator.return!();
  return outcome === 'delivered';
}

describe('foosChanged filter fail-closed', () => {
  it('drops events when a filter key is not evaluable from the payload', async () => {
    expect(await deliversUnder({ status: 'DISCHARGED' })).toBe(false);
  });

  it('drops events when an un-evaluable key accompanies a matching changeType', async () => {
    expect(await deliversUnder({ changeType: 'UPDATED', status: 'DISCHARGED' })).toBe(false);
  });

  it('still delivers on evaluable keys', async () => {
    expect(await deliversUnder({ changeType: 'UPDATED' })).toBe(true);
    expect(await deliversUnder({ id: 'p-1' })).toBe(true);
    expect(await deliversUnder({ _type: 'Patient' })).toBe(true);
  });

  it('still rejects on non-matching evaluable keys', async () => {
    expect(await deliversUnder({ changeType: 'DELETED' })).toBe(false);
    expect(await deliversUnder({ id: 'p-2' })).toBe(false);
  });
});
