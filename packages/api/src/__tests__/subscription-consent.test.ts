/**
 * Subscriptions were the one read surface with no consent gate.
 *
 * REST, GraphQL, FHIR, CDM and MCP all check consent before returning a
 * consent-subject's data. The push surface did not, and its payload carries
 * real values (previousValues), so a subject who had denied consent could
 * still have their changes streamed — a way around the gate the pull surfaces
 * apply, not merely a missing feature.
 *
 * Separately, revokeConsent was dead code returning hardcoded zeros: nothing
 * reached it and nothing tore down a live stream.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PubSub } from 'graphql-subscriptions';
import { createIdFilteredSubscription, SubscriptionRegistry } from '../subscriptions/index.js';
import type { ResolverContext } from '../graphql/types.js';

const TOPIC = 'patientChanged';

function event(id = 'p-1') {
  return {
    changeType: 'UPDATED',
    tenantId: 't-1',
    object: { id, _type: 'Patient' },
    previousValues: { name: 'Ann' },
  };
}

function context(over: { consentRestricted?: boolean; registry?: SubscriptionRegistry } = {}): ResolverContext {
  return {
    user: { id: 'u-1', roles: ['clinician'], tenantId: 't-1' },
    requestContext: { tenantId: 't-1', actorId: 'u-1', traceId: 'tr-1' },
    deps: {
      authorizationService: {
        check: async () => true,
        getVisibleFields: () => undefined,
      },
      consentSubjectTypes: ['Patient'],
      consentService: {
        checkSingleObject: async (data: unknown) => ({
          data,
          _consentRestricted: over.consentRestricted === true,
        }),
      },
      ...(over.registry ? { subscriptionRegistry: over.registry } : {}),
    },
  } as unknown as ResolverContext;
}

/** Pull one event with a timeout, so a withheld event fails fast instead of hanging. */
async function nextWithin(iter: AsyncIterator<unknown>, ms = 120): Promise<unknown | 'timeout'> {
  return Promise.race([
    iter.next().then(r => r.value),
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), ms)),
  ]);
}

let pubsub: PubSub;

beforeEach(() => { pubsub = new PubSub(); });

describe('subscription consent gate', () => {
  it('delivers an event when consent allows', async () => {
    const sub = createIdFilteredSubscription(pubsub, TOPIC);
    const iter = sub.subscribe(null, { id: 'p-1' }, context()) as AsyncIterator<unknown>;

    setTimeout(() => { void pubsub.publish(TOPIC, { [TOPIC]: event() }); }, 10);

    expect(await nextWithin(iter)).not.toBe('timeout');
  });

  it('withholds an event when the subject has denied consent', async () => {
    const sub = createIdFilteredSubscription(pubsub, TOPIC);
    const iter = sub.subscribe(null, { id: 'p-1' }, context({ consentRestricted: true })) as AsyncIterator<unknown>;

    setTimeout(() => { void pubsub.publish(TOPIC, { [TOPIC]: event() }); }, 10);

    // Dropped, not blanked: the arrival of the event is itself the disclosure.
    expect(await nextWithin(iter)).toBe('timeout');
  });
});

describe('SubscriptionRegistry', () => {
  it('closes only the streams about the revoking subject', () => {
    const registry = new SubscriptionRegistry();
    const closed: string[] = [];

    registry.register({ tenantId: 't-1', subjectId: 'p-1', terminate: () => closed.push('p-1') });
    registry.register({ tenantId: 't-1', subjectId: 'p-2', terminate: () => closed.push('p-2') });
    // Type-level stream — about no single subject, so it must survive.
    registry.register({ tenantId: 't-1', subjectId: null, terminate: () => closed.push('type-level') });

    expect(registry.terminateForSubject('t-1', 'p-1')).toBe(1);
    expect(closed).toEqual(['p-1']);
    expect(registry.size).toBe(2);
  });

  it('does not cross the tenant boundary', () => {
    const registry = new SubscriptionRegistry();
    const closed: string[] = [];
    registry.register({ tenantId: 't-2', subjectId: 'p-1', terminate: () => closed.push('other-tenant') });

    expect(registry.terminateForSubject('t-1', 'p-1')).toBe(0);
    expect(closed).toEqual([]);
  });

  it('registers a live id-filtered subscription and deregisters when it ends', async () => {
    const registry = new SubscriptionRegistry();
    const sub = createIdFilteredSubscription(pubsub, TOPIC);
    const iter = sub.subscribe(null, { id: 'p-1' }, context({ registry })) as AsyncIterableIterator<unknown>;

    expect(registry.size).toBe(1);

    await iter.return?.(undefined);
    expect(registry.size).toBe(0);
  });
});
