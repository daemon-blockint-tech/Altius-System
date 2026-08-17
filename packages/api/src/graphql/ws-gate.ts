/**
 * The controls the WebSocket transport applies before an operation runs.
 *
 * graphql-ws carries QUERIES and MUTATIONS, not just subscriptions, so
 * `onSubscribe` is the socket's equivalent of the HTTP request path. It
 * enforced only a per-connection subscription cap: neither the query-complexity
 * gate nor the per-principal rate limiter ran, so any principal holding a valid
 * token could execute unlimited operations of unbounded depth and cost by
 * opening a socket instead of POSTing. Both HTTP controls were advisory as long
 * as that was true.
 *
 * Extracted from the inline hook in server.ts so it can be tested at all — it
 * sat inside `main()`, unreachable from a test, which is a large part of why it
 * went so long without either gate.
 */

import { GraphQLError } from 'graphql';

import type { QueryComplexityAnalyzer } from '../governance/index.js';
import type { RateLimitIdentity } from '../governance/index.js';

/** The subset of the rate limiter this gate needs. */
export interface WsRateLimiter {
  check(identity: RateLimitIdentity): Promise<{ allowed: boolean }> | { allowed: boolean };
}

/** The subset of the subscription manager this gate needs. */
export interface WsConnectionAuthenticator {
  authenticateConnection(params: Record<string, unknown>): Promise<
    | { authenticated: true; user: { id: string; tenantId: string } }
    | { authenticated: false; error: string }
  >;
}

export interface WsOperationGateConfig {
  complexityAnalyzer: Pick<QueryComplexityAnalyzer, 'analyze' | 'createComplexityError'>;
  rateLimiter: WsRateLimiter;
  subscriptionManager: WsConnectionAuthenticator;
  /** Concurrent subscriptions one connection may hold. */
  maxSubscriptionsPerConnection: number;
}

/**
 * Decide whether one WebSocket operation may proceed.
 *
 * Returns `undefined` to allow (and, when allowed, charges the connection's
 * subscription count), or the errors graphql-ws should send back.
 *
 * Order is deliberate: the subscription cap and the complexity gate are local
 * and cheap, the rate-limit check may cross the network to Redis. Refusing an
 * over-budget document costs one parse; refusing it after a Redis round-trip
 * costs the round-trip too.
 */
export async function guardWsOperation(
  cfg: WsOperationGateConfig,
  connectionParams: Record<string, unknown>,
  query: string | undefined,
  counts: { get(): number; set(n: number): void },
): Promise<readonly GraphQLError[] | undefined> {
  // Everything synchronous happens before the first await, and the counter is
  // reserved within that same tick.
  //
  // graphql-ws does not serialize message handling — use/ws.js registers
  // `socket.on('message', async (event) => { await cb(...) })` and never awaits
  // the returned promise — so pipelined Subscribe frames run their handlers
  // interleaved. Reading the count before an await and writing it after lets
  // every in-flight handler observe the same pre-increment value, which
  // defeats the cap entirely: 50 concurrent frames against a cap of 2 all pass.
  // The hook this replaced was fully synchronous, so its get/set pair was
  // atomic by construction; adding the rate-limit await is what opened the
  // window.

  if (typeof query === 'string') {
    let analysis;
    try {
      analysis = cfg.complexityAnalyzer.analyze(query);
    } catch {
      // A document that will not parse is graphql-js's to reject, with a far
      // better message than anything this gate could produce.
      analysis = undefined;
    }
    if (analysis && !analysis.valid) {
      // The analyzer's own error, unwrapped and unrebuilt, so a client sees the
      // identical QUERY_TOO_COMPLEX payload — violations and all — whichever
      // transport it used. Refused before any slot is reserved, so there is
      // nothing to release.
      return [cfg.complexityAnalyzer.createComplexityError(analysis)];
    }
  }

  const count = counts.get();
  if (count >= cfg.maxSubscriptionsPerConnection) {
    return [new GraphQLError('Subscription limit exceeded', {
      extensions: { code: 'RATE_LIMITED' },
    })];
  }
  counts.set(count + 1);

  // From here the slot is held, so every refusal must give it back or a
  // connection leaks its budget one rejected operation at a time.
  const release = (): void => counts.set(Math.max(0, counts.get() - 1));

  const authResult = await cfg.subscriptionManager.authenticateConnection(connectionParams);
  if (!authResult.authenticated) {
    release();
    return [new GraphQLError(authResult.error, { extensions: { code: 'UNAUTHENTICATED' } })];
  }

  // Same limiter and the same identity shape as every HTTP surface, so a
  // principal's budget is one budget rather than one per transport.
  const rl = await cfg.rateLimiter.check({
    tenantId: authResult.user.tenantId,
    principalId: authResult.user.id,
  } as RateLimitIdentity);
  if (!rl.allowed) {
    release();
    return [new GraphQLError('Rate limit exceeded', {
      extensions: { code: 'RATE_LIMITED' },
    })];
  }

  return undefined;
}
