/**
 * WebSocket subscription manager (Section 8.1.4).
 *
 * Bridges CloudEvents from the engine EventBus into GraphQL PubSub,
 * handles ID and filter-based subscription routing, and enforces
 * authentication on WebSocket connections.
 */

import type { PubSub } from 'graphql-subscriptions';
import type { CloudEvent } from '@altius/spi';
import type { ObjectEventData, LinkEventData } from '@altius/engine';
import type { EventBus } from '@altius/engine';
import type { AuthenticatedUserInfo, ResolverContext } from '../graphql/types.js';
import { lowerFirst, toSnakeCase } from '../utils.js';
import { logger } from '../logger.js';

// ─── Types ───

/** A change event delivered to GraphQL subscribers. */
export interface ChangeEvent {
  changeType: 'CREATED' | 'UPDATED' | 'DELETED';
  /**
   * Tenant the change happened in. Carried on the payload because the topic is
   * derived from the object type alone, so every tenant's events share it —
   * this is the only thing that distinguishes them before delivery.
   */
  tenantId: string;
  object: { id: string; _type: string };
  previousValues: Record<string, { old: unknown; new: unknown }> | null;
  causedBy: { actionType: string | null; actionId: string | null } | null;
  timestamp: string;
}

/** Filter criteria for foosChanged subscriptions. */
export interface SubscriptionFilter {
  [field: string]: unknown;
}

/** Result of authenticating a WebSocket connection. */
export type ConnectionAuthResult =
  | { authenticated: true; user: AuthenticatedUserInfo }
  | { authenticated: false; error: string };

/** Function that authenticates a WebSocket connection from connection params. */
export type ConnectionAuthenticator = (
  connectionParams: Record<string, unknown>,
) => Promise<ConnectionAuthResult>;

// ─── CloudEvent to ChangeEvent mapping ───

const OBJECT_EVENT_CHANGE_MAP: Record<string, ChangeEvent['changeType']> = {
  'altius.object.created': 'CREATED',
  'altius.object.updated': 'UPDATED',
  'altius.object.deleted': 'DELETED',
};

const LINK_EVENT_TYPES: Set<string> = new Set([
  'altius.link.created',
  'altius.link.updated',
  'altius.link.deleted',
]);

/**
 * Convert a CloudEvent with ObjectEventData into a ChangeEvent
 * and the topic it should be published to.
 */
export function mapObjectEvent(
  event: CloudEvent<ObjectEventData>,
): { topic: string; changeEvent: ChangeEvent } | null {
  const changeType = OBJECT_EVENT_CHANGE_MAP[event.type];
  if (!changeType || !event.data) return null;

  const data = event.data;
  const topic = `${lowerFirst(data.objectType)}Changed`;

  const changeEvent: ChangeEvent = {
    changeType,
    tenantId: event.tenantid,
    object: { id: data.objectId, _type: data.objectType },
    previousValues: data.changes ?? null,
    causedBy: data.causedBy
      ? {
          actionType: data.causedBy.actionType ?? null,
          actionId: data.causedBy.actionId ?? null,
        }
      : null,
    timestamp: event.time,
  };

  return { topic, changeEvent };
}

/**
 * Convert a CloudEvent with LinkEventData into ChangeEvents
 * for the related object types.  Link events trigger change
 * notifications on both endpoints.
 *
 * When the event carries endpoint object types (fromType/toType — emitted
 * by the engine LinkManager), each endpoint publishes to the same
 * type-level topic object events use (e.g. "patientChanged"), so both
 * fooChanged(id) and foosChanged(filter) subscribers receive link-driven
 * changes with a real _type that per-event FGA checks can authorize.
 * Events without endpoint types (older emitters) fall back to per-ID
 * topics, which no generated resolver consumes — effectively dropped.
 */
export function mapLinkEvent(
  event: CloudEvent<LinkEventData>,
): { topic: string; changeEvent: ChangeEvent }[] | null {
  if (!LINK_EVENT_TYPES.has(event.type) || !event.data) return null;

  const data = event.data;
  const endpoints: Array<{ id: string; type?: string }> = [
    { id: data.fromId, type: data.fromType },
    { id: data.toId, type: data.toType },
  ];

  return endpoints.map(({ id, type }) => ({
    topic: type ? `${lowerFirst(type)}Changed` : id,
    changeEvent: {
      changeType: 'UPDATED',
      tenantId: event.tenantid,
      object: { id, _type: type ?? 'unknown' },
      previousValues: null,
      causedBy: data.causedBy
        ? {
            actionType: data.causedBy.actionType ?? null,
            actionId: data.causedBy.actionId ?? null,
          }
        : null,
      timestamp: event.time,
    },
  }));
}

// ─── Subscribable EventBus adapter ───

/**
 * Extends EventBus with a subscribe method so the subscription manager
 * can receive CloudEvents.
 */
export interface SubscribableEventBus extends EventBus {
  subscribe(handler: (event: CloudEvent) => void): () => void;
}

/**
 * In-memory subscribable event bus for testing and single-instance deploys.
 */
export class InMemorySubscribableEventBus implements SubscribableEventBus {
  public readonly events: CloudEvent[] = [];
  private handlers: Array<(event: CloudEvent) => void> = [];

  async publish(event: CloudEvent): Promise<void> {
    this.events.push(event);
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  subscribe(handler: (event: CloudEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  clear(): void {
    this.events.length = 0;
  }
}

// ─── Subscription Manager ───

export interface SubscriptionManagerConfig {
  pubsub: PubSub;
  eventBus: SubscribableEventBus;
  authenticate: ConnectionAuthenticator;
}

/**
 * Manages the bridge between CloudEvents and GraphQL subscriptions.
 *
 * - Subscribes to the event bus for CloudEvents
 * - Maps them to ChangeEvent payloads
 * - Publishes to PubSub topics for GraphQL delivery
 * - Authenticates WebSocket connections
 */
export class SubscriptionManager {
  private readonly pubsub: PubSub;
  private readonly eventBus: SubscribableEventBus;
  private readonly authenticate: ConnectionAuthenticator;
  private unsubscribe: (() => void) | null = null;

  constructor(config: SubscriptionManagerConfig) {
    this.pubsub = config.pubsub;
    this.eventBus = config.eventBus;
    this.authenticate = config.authenticate;
  }

  /**
   * Start listening for CloudEvents and bridging them to PubSub.
   */
  start(): void {
    if (this.unsubscribe) return; // Already started

    this.unsubscribe = this.eventBus.subscribe((event: CloudEvent) => {
      this.handleCloudEvent(event);
    });
  }

  /**
   * Stop listening for CloudEvents.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Authenticate a WebSocket connection.
   * Called during the graphql-ws connection_init phase.
   */
  async authenticateConnection(
    connectionParams: Record<string, unknown>,
  ): Promise<ConnectionAuthResult> {
    return this.authenticate(connectionParams);
  }

  /**
   * Get the PubSub instance for use by subscription resolvers.
   */
  getPubSub(): PubSub {
    return this.pubsub;
  }

  // ─── Internal ───

  private handleCloudEvent(event: CloudEvent): void {
    // Handle object lifecycle events
    if (OBJECT_EVENT_CHANGE_MAP[event.type]) {
      const mapped = mapObjectEvent(event as CloudEvent<ObjectEventData>);
      if (mapped) {
        // CQ-19: Log errors from pubsub publish instead of silently swallowing
        this.pubsub.publish(mapped.topic, {
          [mapped.topic]: mapped.changeEvent,
        }).catch((err: unknown) => {
          logger.warn({ topic: mapped.topic, err: err instanceof Error ? err.message : String(err) }, 'PubSub publish failed');
        });
      }
      return;
    }

    // Handle link lifecycle events — emit change events for both endpoints
    if (LINK_EVENT_TYPES.has(event.type)) {
      const mappedLinks = mapLinkEvent(event as CloudEvent<LinkEventData>);
      if (mappedLinks) {
        for (const link of mappedLinks) {
          this.pubsub.publish(link.topic, { [link.topic]: link.changeEvent }).catch((err: unknown) => {
            logger.warn({ topic: link.topic, err: err instanceof Error ? err.message : String(err) }, 'PubSub link event publish failed');
          });
        }
      }
    }
  }
}

// ─── Subscription resolver helpers ───

/**
 * Create a subscription resolver that filters by object ID.
 *
 * Used for `fooChanged(id: ID!)` subscriptions.
 *
 * Authorization: Each emitted event is checked against FGA — subscribers
 * only receive events for objects they have `viewer` access to.
 */
export function createIdFilteredSubscription(
  pubsub: PubSub,
  topic: string,
): {
  subscribe: (_parent: unknown, args: { id: string }, ctx: ResolverContext) => AsyncIterator<unknown>;
  resolve: (payload: unknown) => unknown;
} {
  return {
    // The payload is published keyed by `topic` (e.g. "patientChanged"); the
    // subscription FIELD may differ (e.g. plural "patientsChanged"). Extract the
    // change event by the topic key so graphql-js's default field resolver
    // (which would look up the field name) doesn't return undefined.
    resolve: (payload: unknown) => (payload as Record<string, unknown> | undefined)?.[topic],
    subscribe: (_parent: unknown, args: { id: string }, ctx: ResolverContext) => {
      const baseIterator = pubsub.asyncIterator(topic);
      const authzService = ctx?.deps?.authorizationService;
      const userId = ctx?.user?.id;
      // Authorization is per-tenant (one OpenFGA store per tenant), so a
      // subscription with no tenant has no store to check against.
      const tenantId = ctx?.user?.tenantId;

      return filterAsyncIteratorAsync(baseIterator, async (payload: unknown) => {
        const p = payload as Record<string, unknown>;
        const event = p[topic] as ChangeEvent | undefined;
        if (!event) return false;
        if (event.object.id !== args.id) return false;

        // Fail closed: deny events when authorization context is unavailable
        if (!authzService || !userId || !tenantId) return false;

        // The bus is one topic per object type shared by every tenant, so this
        // is the boundary — not the FGA check below, which runs against the
        // subscriber's OWN store and therefore approves another tenant's event
        // whenever the two tenants happen to share an object id.
        if (!event.tenantId || event.tenantId !== tenantId) return false;

        // Authorize: check viewer access on the specific object
        const fgaType = toSnakeCase(event.object._type);
        const allowed = await authzService.check(
          `user:${userId}`,
          'viewer',
          `${fgaType}:${event.object.id}`,
          tenantId,
        );
        if (!allowed) return false;
        return true;
      });
    },
  };
}

/**
 * Create a subscription resolver for type-level changes with optional filter.
 *
 * Used for `foosChanged(filter: FooFilter)` subscriptions.
 *
 * Authorization: Each emitted event is checked against FGA — subscribers
 * only receive events for objects they have `viewer` access to.
 */
export function createFilteredSubscription(
  pubsub: PubSub,
  topic: string,
): {
  subscribe: (_parent: unknown, args: { filter?: SubscriptionFilter }, ctx: ResolverContext) => AsyncIterator<unknown>;
  resolve: (payload: unknown) => unknown;
} {
  return {
    // See createIdFilteredSubscription: payload is keyed by `topic`, field name
    // may differ (plural). Extract by topic key.
    resolve: (payload: unknown) => (payload as Record<string, unknown> | undefined)?.[topic],
    subscribe: (_parent: unknown, args: { filter?: SubscriptionFilter }, ctx: ResolverContext) => {
      const baseIterator = pubsub.asyncIterator(topic);
      const authzService = ctx?.deps?.authorizationService;
      const userId = ctx?.user?.id;
      // Authorization is per-tenant (one OpenFGA store per tenant), so a
      // subscription with no tenant has no store to check against.
      const tenantId = ctx?.user?.tenantId;

      return filterAsyncIteratorAsync(baseIterator, async (payload: unknown) => {
        const p = payload as Record<string, unknown>;
        const event = p[topic] as ChangeEvent | undefined;
        if (!event) return false;

        // Apply user-provided filters
        if (args.filter && Object.keys(args.filter).length > 0) {
          if (!matchesFilter(event, args.filter)) return false;
        }

        // Fail closed: deny events when authorization context is unavailable
        if (!authzService || !userId || !tenantId) return false;

        // The bus is one topic per object type shared by every tenant, so this
        // is the boundary — not the FGA check below, which runs against the
        // subscriber's OWN store and therefore approves another tenant's event
        // whenever the two tenants happen to share an object id.
        if (!event.tenantId || event.tenantId !== tenantId) return false;

        // Authorize: check viewer access on the specific object
        const fgaType = toSnakeCase(event.object._type);
        const allowed = await authzService.check(
          `user:${userId}`,
          'viewer',
          `${fgaType}:${event.object.id}`,
          tenantId,
        );
        if (!allowed) return false;
        return true;
      });
    },
  };
}

/**
 * Check if a ChangeEvent matches a subscription filter.
 * Matches on changeType and on the object fields the event carries (id, _type).
 *
 * Fails closed: the payload carries no property values, so a filter key naming
 * an object property (e.g. status) cannot be evaluated. Treating it as a match
 * would deliver the whole type-level change stream to a subscriber who asked
 * for a narrow slice — a leak. Drop the event instead.
 */
function matchesFilter(event: ChangeEvent, filter: SubscriptionFilter): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (value == null) continue;

    if (key === 'changeType') {
      if (event.changeType !== value) return false;
      continue;
    }

    // Match on object fields the event carries; un-evaluable keys never match
    if (!(key in event.object)) return false;
    if ((event.object as Record<string, unknown>)[key] !== value) return false;
  }
  return true;
}

/**
 * Wrap an AsyncIterator with an async predicate filter.
 * Supports both sync and async predicates (e.g. FGA authorization checks).
 */
function filterAsyncIteratorAsync<T>(
  iterator: AsyncIterator<T>,
  predicate: (value: T) => Promise<boolean>,
): AsyncIterableIterator<T> {
  const wrapped: AsyncIterableIterator<T> = {
    // graphql-js `subscribe()` requires an AsyncIterable (it checks for
    // Symbol.asyncIterator). Returning a bare AsyncIterator (next/return/throw
    // only) makes every subscription fail with "Subscription field must return
    // Async Iterable" (graphql-ws close code 4500). Make this self-iterable.
    [Symbol.asyncIterator](): AsyncIterableIterator<T> {
      return wrapped;
    },
    next(): Promise<IteratorResult<T>> {
      return new Promise((resolve, reject) => {
        const getNext = (): void => {
          iterator.next().then(
            (result) => {
              if (result.done) {
                resolve(result);
                return;
              }
              predicate(result.value).then(
                (matches) => {
                  if (matches) {
                    resolve(result);
                  } else {
                    getNext();
                  }
                },
                (err) => reject(err),
              );
            },
            (err) => reject(err),
          );
        };
        getNext();
      });
    },
    return: iterator.return
      ? (value?: unknown) => iterator.return!(value)
      : undefined,
    throw: iterator.throw
      ? (err?: unknown) => iterator.throw!(err)
      : undefined,
  } as AsyncIterableIterator<T>;
  return wrapped;
}
