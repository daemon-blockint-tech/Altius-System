/**
 * A change event must never leave the tenant it happened in.
 *
 * Subscription delivery is a process-wide (in production, cross-pod) broadcast:
 * the topic is derived from the object type alone, and every tenant's events go
 * to that one topic. Until this check existed the only discriminator was an FGA
 * check run against the SUBSCRIBER's own store — so whenever an object id
 * existed in both tenants, tenant B's subscriber was authorised for its own
 * record and handed tenant A's event, `previousValues` included.
 *
 * The FGA check here always allows, which is exactly that collision: nothing
 * but the tenant comparison can stop the delivery.
 */

import { describe, it, expect } from 'vitest';
import { PubSub } from 'graphql-subscriptions';
import {
  createFilteredSubscription,
  createIdFilteredSubscription,
} from '../subscriptions/subscription-manager.js';
import type { ChangeEvent } from '../subscriptions/subscription-manager.js';
import type { ResolverContext } from '../graphql/types.js';

function subscriberIn(tenantId: string): ResolverContext {
  return {
    requestContext: { tenantId, actorId: 'u-1', traceId: 'test-trace' },
    user: { id: 'u-1', tenantId },
    deps: { authorizationService: { check: async () => true } },
  } as unknown as ResolverContext;
}

function eventFrom(tenantId: string | undefined): ChangeEvent {
  return {
    changeType: 'UPDATED',
    object: { id: 'p-1', _type: 'Patient' },
    // The leak is not just the id — the diff rides along.
    previousValues: { diagnosis: { old: 'A', new: 'B' } },
    causedBy: null,
    timestamp: '2025-01-15T10:30:00Z',
    ...(tenantId === undefined ? {} : { tenantId }),
  } as ChangeEvent;
}

/** Publish one event and report whether the subscriber received it. */
async function delivers(
  sub: { subscribe: (p: unknown, a: never, c: ResolverContext) => AsyncIterator<unknown> },
  args: Record<string, unknown>,
  ctx: ResolverContext,
  event: ChangeEvent,
  pubsub: PubSub,
): Promise<boolean> {
  const iterator = sub.subscribe(null, args as never, ctx);
  const next = iterator.next();
  await pubsub.publish('patientChanged', { patientChanged: event });

  const outcome = await Promise.race([
    next.then(r => (r.done ? 'dropped' : 'delivered')),
    new Promise<string>(resolve => setTimeout(() => resolve('dropped'), 50)),
  ]);
  await iterator.return!();
  return outcome === 'delivered';
}

describe('subscription tenant isolation', () => {
  it('does not deliver another tenant\'s event to foosChanged', async () => {
    const pubsub = new PubSub();
    const sub = createFilteredSubscription(pubsub, 'patientChanged');

    expect(
      await delivers(sub, {}, subscriberIn('tenant-b'), eventFrom('tenant-a'), pubsub),
    ).toBe(false);
  });

  it('does not deliver another tenant\'s event to fooChanged(id)', async () => {
    const pubsub = new PubSub();
    const sub = createIdFilteredSubscription(pubsub, 'patientChanged');

    expect(
      await delivers(sub, { id: 'p-1' }, subscriberIn('tenant-b'), eventFrom('tenant-a'), pubsub),
    ).toBe(false);
  });

  it('drops an event carrying no tenant at all, rather than trusting it', async () => {
    const pubsub = new PubSub();
    const sub = createFilteredSubscription(pubsub, 'patientChanged');

    expect(
      await delivers(sub, {}, subscriberIn('tenant-a'), eventFrom(undefined), pubsub),
    ).toBe(false);
  });

  it('still delivers an event from the subscriber\'s own tenant', async () => {
    const pubsub = new PubSub();
    const sub = createFilteredSubscription(pubsub, 'patientChanged');

    expect(
      await delivers(sub, {}, subscriberIn('tenant-a'), eventFrom('tenant-a'), pubsub),
    ).toBe(true);
  });
});
