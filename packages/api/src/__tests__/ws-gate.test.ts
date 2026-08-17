/**
 * Transport parity: a socket must not be a way around the HTTP controls.
 *
 * graphql-ws carries queries and mutations as well as subscriptions, so its
 * `onSubscribe` hook is the socket's request path. It enforced only a
 * per-connection subscription cap — the query-complexity gate and the
 * per-principal rate limiter both ran on HTTP and neither ran here. A caller
 * holding any valid token could execute unlimited operations of unbounded depth
 * and cost by opening a socket instead of POSTing, which made both HTTP
 * controls advisory.
 */

import { describe, it, expect, vi } from 'vitest';
import { QueryComplexityAnalyzer } from '../governance/index.js';
import { guardWsOperation } from '../graphql/ws-gate.js';
import type { WsOperationGateConfig } from '../graphql/ws-gate.js';

const USER = { id: 'u-1', tenantId: 't-1' };

function counter(start = 0) {
  let n = start;
  return { get: () => n, set: (v: number) => { n = v; }, value: () => n };
}

function makeCfg(over: Partial<WsOperationGateConfig> = {}): WsOperationGateConfig {
  return {
    complexityAnalyzer: new QueryComplexityAnalyzer(),
    rateLimiter: { check: vi.fn(async () => ({ allowed: true })) },
    subscriptionManager: {
      authenticateConnection: vi.fn(async () => ({ authenticated: true as const, user: USER })),
    },
    maxSubscriptionsPerConnection: 50,
    ...over,
  };
}

/** Deeper than the depth-10 limit the HTTP gate enforces. */
const DEEP_QUERY = `query { ${'a { '.repeat(14)}id${' }'.repeat(14)} }`;

describe('WebSocket operation gate', () => {
  it('allows an ordinary operation and charges the subscription count', async () => {
    const c = counter();
    const errs = await guardWsOperation(makeCfg(), {}, 'subscription { patientChanged { changeType } }', c);

    expect(errs).toBeUndefined();
    expect(c.value()).toBe(1);
  });

  it('refuses a document over the complexity budget, with the HTTP error', async () => {
    const c = counter();
    const errs = await guardWsOperation(makeCfg(), {}, DEEP_QUERY, c);

    expect(errs).toBeDefined();
    // The analyzer's own error object, so the payload matches the HTTP path
    // rather than being rebuilt into something similar.
    const ext = errs![0]!.extensions as { altius?: { code?: string } };
    expect(ext.altius?.code).toBe('QUERY_TOO_COMPLEX');
    // A refused operation must not consume the connection's budget.
    expect(c.value()).toBe(0);
  });

  it('refuses when the principal is over the rate limit', async () => {
    const cfg = makeCfg({ rateLimiter: { check: vi.fn(async () => ({ allowed: false })) } });
    const c = counter();

    const errs = await guardWsOperation(cfg, {}, 'query { patients { id } }', c);

    expect(errs?.[0]?.message).toBe('Rate limit exceeded');
    expect(c.value()).toBe(0);
  });

  it('rate-limits under the SAME identity the HTTP surfaces use', async () => {
    // A per-transport budget would be two budgets, so a caller could double
    // their allowance by splitting traffic across HTTP and the socket.
    const check = vi.fn(async () => ({ allowed: true }));
    await guardWsOperation(makeCfg({ rateLimiter: { check } }), {}, 'query { a }', counter());

    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't-1', principalId: 'u-1' }),
    );
  });

  it('refuses an unauthenticated connection', async () => {
    const cfg = makeCfg({
      subscriptionManager: {
        authenticateConnection: vi.fn(async () => ({ authenticated: false as const, error: 'Invalid token' })),
      },
    });

    const errs = await guardWsOperation(cfg, {}, 'query { a }', counter());

    expect(errs?.[0]?.message).toBe('Invalid token');
  });

  it('still enforces the per-connection subscription cap first', async () => {
    const cfg = makeCfg({ maxSubscriptionsPerConnection: 2 });
    const c = counter(2);

    const errs = await guardWsOperation(cfg, {}, 'subscription { x }', c);

    expect(errs?.[0]?.message).toBe('Subscription limit exceeded');
    // The cheap local check must not have paid for a rate-limit round trip.
    expect(cfg.rateLimiter.check).not.toHaveBeenCalled();
  });

  it('leaves an unparseable document to graphql-js rather than guessing', async () => {
    const c = counter();
    const errs = await guardWsOperation(makeCfg(), {}, 'this is not graphql {{{', c);

    // Not rejected HERE — execution will produce the real syntax error.
    expect(errs).toBeUndefined();
  });
});

describe('subscription cap under concurrency', () => {
  it('caps concurrent operations, not just sequential ones', async () => {
    // graphql-ws does not serialize message handling: use/ws.js does
    // `socket.on('message', async (event) => { await cb(...) })` and never
    // awaits the returned promise, so every in-flight Subscribe frame runs its
    // handler interleaved. Reading the counter before an await and writing it
    // after lets N handlers all observe the same pre-increment value.
    //
    // The hook this gate replaced was synchronous, so its get/set pair was
    // atomic within one tick. Making the gate async to add the rate-limit
    // check reintroduced the cap as a TOCTOU race.
    const cfg = makeCfg({
      maxSubscriptionsPerConnection: 2,
      // Both awaits present, so the window is real.
      rateLimiter: { check: async () => ({ allowed: true }) },
    });
    const c = counter();

    const results = await Promise.all(
      Array.from({ length: 50 }, () => guardWsOperation(cfg, {}, 'subscription { x }', c)),
    );

    const allowed = results.filter((r) => r === undefined).length;
    expect(allowed, 'concurrent Subscribe frames bypassed the cap').toBe(2);
    expect(c.value()).toBe(2);
  });

  it('releases the reserved slot when a later check refuses', async () => {
    // Reserving before the awaits is what makes the cap hold; a refusal after
    // the reservation must give the slot back or a connection leaks its budget
    // one rejected operation at a time.
    const cfg = makeCfg({ rateLimiter: { check: async () => ({ allowed: false }) } });
    const c = counter();

    await guardWsOperation(cfg, {}, 'subscription { x }', c);

    expect(c.value()).toBe(0);
  });
});
