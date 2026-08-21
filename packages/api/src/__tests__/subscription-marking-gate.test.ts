/**
 * Markings (MAC) must gate the subscription surface, not just the pull surfaces.
 *
 * Every read/list/get/aggregate/traverse path runs isTypeVisible before FGA, so
 * a subscriber lacking a marked type's markings should never learn the object
 * exists or changed. Until this gate existed, a caller holding `viewer` on a
 * marked object still received its change events (field-redacted), leaking the
 * object's existence and change timing on the one surface that skipped MAC.
 *
 * FGA and consent always allow here, so nothing but the marking check can stop
 * delivery.
 */

import { describe, it, expect } from 'vitest';
import { PubSub } from 'graphql-subscriptions';
import { MarkingPolicy } from '@altius/security';
import {
  createFilteredSubscription,
  createIdFilteredSubscription,
} from '../subscriptions/subscription-manager.js';
import type { ChangeEvent } from '../subscriptions/subscription-manager.js';
import type { ResolverContext } from '../graphql/types.js';

// Patient requires the SECRET marking.
const policy = new MarkingPolicy({
  markings: [{ name: 'SECRET' }],
  byObjectType: { Patient: ['SECRET'] },
});

function subscriber(markings: string[]): ResolverContext {
  return {
    requestContext: { tenantId: 'tenant-a', actorId: 'u-1', traceId: 'test-trace' },
    user: { id: 'u-1', tenantId: 'tenant-a', roles: [], markings },
    deps: {
      authorizationService: { check: async () => true },
      markingPolicy: policy,
    },
  } as unknown as ResolverContext;
}

function event(): ChangeEvent {
  return {
    changeType: 'UPDATED',
    object: { id: 'p-1', _type: 'Patient' },
    previousValues: { diagnosis: { old: 'A', new: 'B' } },
    causedBy: null,
    timestamp: '2025-01-15T10:30:00Z',
    tenantId: 'tenant-a',
  } as ChangeEvent;
}

async function delivers(
  sub: { subscribe: (p: unknown, a: never, c: ResolverContext) => AsyncIterator<unknown> },
  args: Record<string, unknown>,
  ctx: ResolverContext,
  pubsub: PubSub,
): Promise<boolean> {
  const iterator = sub.subscribe(null, args as never, ctx);
  const next = iterator.next();
  await pubsub.publish('patientChanged', { patientChanged: event() });
  const outcome = await Promise.race([
    next.then(r => (r.done ? 'dropped' : 'delivered')),
    new Promise<string>(resolve => setTimeout(() => resolve('dropped'), 50)),
  ]);
  await iterator.return!();
  return outcome === 'delivered';
}

describe('subscription marking gate', () => {
  it('drops events for a marked type when the subscriber lacks the marking', async () => {
    const pubsub = new PubSub();
    expect(await delivers(createFilteredSubscription(pubsub, 'patientChanged'), {}, subscriber([]), pubsub)).toBe(false);

    const pubsub2 = new PubSub();
    expect(await delivers(createIdFilteredSubscription(pubsub2, 'patientChanged'), { id: 'p-1' }, subscriber([]), pubsub2)).toBe(false);
  });

  it('delivers when the subscriber holds the marking (FGA + consent allow)', async () => {
    const pubsub = new PubSub();
    expect(await delivers(createFilteredSubscription(pubsub, 'patientChanged'), {}, subscriber(['SECRET']), pubsub)).toBe(true);

    const pubsub2 = new PubSub();
    expect(await delivers(createIdFilteredSubscription(pubsub2, 'patientChanged'), { id: 'p-1' }, subscriber(['SECRET']), pubsub2)).toBe(true);
  });
});
