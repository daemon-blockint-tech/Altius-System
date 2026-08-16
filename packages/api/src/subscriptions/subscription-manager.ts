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
import { DEFAULT_CONSENT_PURPOSE, isConsentSubjectType } from '../graphql/types.js';
import { lowerFirst, toSnakeCase } from '../utils.js';
import { objectToGraphQL } from '../graphql/object-shape.js';
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
  /**
   * The changed object. Off the bus this carries only `id` and `_type` — the
   * emitter has no subscriber to scope a read to. It is hydrated with the full
   * property set at delivery time, per subscriber and after every gate, by
   * `hydrateObject`. A DELETED event is never hydrated: the row is gone.
   */
  object: { id: string; _type: string; [key: string]: unknown };
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

/** A live subscription the registry can close. */
interface ActiveSubscription {
  tenantId: string;
  /**
   * The consent subject this stream is about, or null for a type-level
   * subscription that is about no single subject.
   */
  subjectId: string | null;
  terminate: () => void;
}

/**
 * Tracks live subscriptions so consent revocation can close the ones that are
 * about the revoking subject.
 *
 * Only id-filtered subscriptions carry a subject, so only those are closed.
 * A type-level stream (`patientsChanged`) is about every patient, and closing
 * it would cut off a subscriber's access to unrelated subjects; its events for
 * the revoking subject are already withheld by the per-event consent gate, so
 * nothing of theirs flows either way. Closing the id-filtered stream on top of
 * that is what makes the revocation observable to the client rather than
 * leaving it hanging on a socket that will never speak again.
 */
export class SubscriptionRegistry {
  private readonly active = new Set<ActiveSubscription>();

  /** Register a live subscription; returns the function that deregisters it. */
  register(sub: ActiveSubscription): () => void {
    this.active.add(sub);
    return () => { this.active.delete(sub); };
  }

  /** Close every subject-scoped subscription for this subject. Returns the count. */
  terminateForSubject(tenantId: string, subjectId: string): number {
    let closed = 0;
    for (const sub of [...this.active]) {
      if (sub.tenantId !== tenantId || sub.subjectId !== subjectId) continue;
      try {
        sub.terminate();
      } catch (err) {
        logger.warn({ err, subjectId }, 'Failed to terminate subscription on consent revocation');
      }
      this.active.delete(sub);
      closed += 1;
    }
    return closed;
  }

  /** Number of live subscriptions — for tests and diagnostics. */
  get size(): number {
    return this.active.size;
  }
}

/**
 * Whether a subscriber may be told about this event at all.
 *
 * Consent is enforced on every read surface — REST, GraphQL, FHIR, CDM, MCP —
 * and was absent here, so a subject who had denied consent could still have
 * their changes streamed to a subscriber, complete with previous values. The
 * push surface has to apply the same gate the pull surfaces do, or it is a
 * way around them.
 *
 * A restricted event is DROPPED, not blanked. On a single-object read the
 * caller already named the record, so an emptied shell tells them nothing
 * new; here the mere arrival of an event discloses that the record exists and
 * just changed.
 *
 * Fails closed: if a consent service is configured and the check throws, the
 * event is withheld rather than delivered unchecked.
 */
async function passesConsent(event: ChangeEvent, ctx: ResolverContext): Promise<boolean> {
  const consentService = ctx?.deps?.consentService;
  if (!consentService) return true;
  if (!isConsentSubjectType(event.object._type, ctx?.deps?.consentSubjectTypes)) return true;

  const userId = ctx?.user?.id;
  const tenantId = ctx?.user?.tenantId;
  if (!userId || !tenantId) return false;

  try {
    const result = await consentService.checkSingleObject(
      { _id: event.object.id },
      event.object.id,
      DEFAULT_CONSENT_PURPOSE,
      userId,
      tenantId,
    );
    return !result._consentRestricted;
  } catch (err) {
    logger.error({ err, objectType: event.object._type }, 'Subscription consent check failed — withholding event');
    return false;
  }
}

/**
 * Load the changed object as the subscriber and shape it like every other read
 * surface, so the payload satisfies the full object type the SDL declares and
 * a property-level filter has real values to test.
 *
 * Runs only after the tenant, FGA and consent gates have passed, so it never
 * reads an object the subscriber could not have fetched over GraphQL.
 *
 * Returns null — leaving the {id,_type} stub in place — when the object cannot
 * be hydrated: a DELETED event (the row is gone), a row deleted between emit
 * and delivery, an unknown type, or a storage failure. That is the behaviour
 * this surface had before hydration existed, so a transient read failure
 * degrades to the old payload instead of silently killing the subscription.
 * Property filters still fail closed in that case, because `matchesFilter`
 * drops any key the object does not carry.
 */
async function hydrateObject(
  event: ChangeEvent,
  ctx: ResolverContext,
): Promise<ChangeEvent['object'] | null> {
  if (event.changeType === 'DELETED') return null;

  const deps = ctx?.deps;
  const objectManager = deps?.objectManager;
  const requestContext = ctx?.requestContext;
  if (!objectManager || !requestContext) return null;

  const objectType = deps?.schema?.objectTypes.find(ot => ot.name === event.object._type);
  if (!objectType) return null;

  try {
    const stored = await objectManager.get(event.object._type, event.object.id, requestContext);
    if (!stored) return null;

    const shaped = objectToGraphQL(stored, objectType);
    const redacted = deps?.authorizationService?.redactFields(
      ctx.user.id,
      ctx.user.roles ?? [],
      event.object._type,
      shaped,
    );
    const data = (redacted?.data ?? shaped) as Record<string, unknown>;
    data._redactedFields = redacted && redacted._redactedFields.length > 0 ? redacted._redactedFields : null;
    // The bus stub keys the object by `id`; the shaped object keys the primary
    // field by its declared name (which may be mrn, sku, …). Keep `id` so the
    // FGA/consent identity on the payload stays what those gates checked.
    data.id = event.object.id;
    data._type = event.object._type;
    return data as ChangeEvent['object'];
  } catch (err) {
    logger.error(
      { err, objectType: event.object._type, objectId: event.object.id },
      'Subscription payload hydration failed — delivering the id-only stub',
    );
    return null;
  }
}

/**
 * Create a subscription resolver for a single object by id.
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

      const stream = filterAsyncIteratorAsync(baseIterator, async (payload: unknown) => {
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

        // Consent gate — same purpose and semantics as every pull surface.
        if (!(await passesConsent(event, ctx))) return false;

        // Redact previousValues for fields the subscriber cannot see.
        // Without this, a @sensitive field leaks on the subscription surface
        // to a caller who would see it null on every read path.
        const redacted = redactPreviousValues(
          event,
          authzService as { getVisibleFields?(userId: string, roles: string[], objectType: string): Set<string> | undefined } | undefined,
          userId,
          ctx?.user?.roles ?? [],
        );
        (p as Record<string, unknown>)[topic] = redacted;
        return true;
      });

      // Register so a consent revocation for this subject can close the
      // stream rather than leave the client holding a socket that has gone
      // permanently silent.
      const registry = ctx?.deps?.subscriptionRegistry;
      if (registry && tenantId) {
        const deregister = registry.register({
          tenantId,
          subjectId: args.id,
          terminate: () => { void stream.return?.(undefined); },
        });
        const originalReturn = stream.return?.bind(stream);
        stream.return = async (value?: unknown) => {
          deregister();
          return originalReturn
            ? await originalReturn(value)
            : { done: true, value: undefined as never };
        };
      }

      return stream;
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

        // changeType is carried on the event itself, so it is evaluable before
        // the object is loaded. Checking it here skips the hydration read for
        // events the subscriber has already excluded.
        if (args.filter?.changeType != null && event.changeType !== args.filter.changeType) {
          return false;
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

        // Consent gate — same purpose and semantics as every pull surface.
        if (!(await passesConsent(event, ctx))) return false;

        // Redact previousValues for fields the subscriber cannot see.
        let delivered = redactPreviousValues(
          event,
          authzService as { getVisibleFields?(userId: string, roles: string[], objectType: string): Set<string> | undefined } | undefined,
          userId,
          ctx?.user?.roles ?? [],
        );

        // Hydrate the changed object as THIS subscriber, after the tenant, FGA
        // and consent gates have all passed. Two things depend on it: the SDL
        // declares the full object type, so a client selecting a real property
        // gets a value instead of an error; and a property-level filter has
        // something to evaluate against.
        const hydrated = await hydrateObject(delivered, ctx);
        if (hydrated) delivered = { ...delivered, object: hydrated };

        // Evaluate property filters against the REDACTED object, not the raw
        // one. Filtering on values the subscriber cannot read would turn the
        // filter into an oracle: subscribing with {ssn: "123-45-6789"} and
        // watching whether events arrive reveals a field that reads back null
        // on every pull surface.
        if (args.filter && Object.keys(args.filter).length > 0) {
          if (!matchesFilter(delivered, args.filter)) return false;
        }

        (p as Record<string, unknown>)[topic] = delivered;
        return true;
      });
    },
  };
}

/**
 * Redact previousValues entries for fields the subscriber cannot see.
 *
 * Subscription payloads carry raw {old, new} values for changed fields —
 * the same values that redactFields masks on every read path. Without this,
 * a @sensitive field (e.g. Patient.name) leaks on the subscription surface
 * to a caller who would see it null on REST/GraphQL reads.
 *
 * Uses getVisibleFields (the same source redactFields uses) to determine
 * which fields to keep. Returns undefined when no field policy exists
 * (getVisibleFields returns undefined), meaning no redaction is needed.
 */
function redactPreviousValues(
  event: ChangeEvent,
  authzService: { getVisibleFields?(userId: string, roles: string[], objectType: string): Set<string> | undefined } | undefined,
  userId: string,
  roles: string[],
): ChangeEvent {
  if (!event.previousValues) return event;
  if (!authzService?.getVisibleFields) return event;

  const visible = authzService.getVisibleFields(userId, roles, event.object._type);
  // No field policy → no redaction (same as redactFields)
  if (!visible) return event;

  const redacted: Record<string, { old: unknown; new: unknown }> = {};
  for (const [field, values] of Object.entries(event.previousValues)) {
    // System fields (starting with _) are never redacted
    if (field.startsWith('_') || visible.has(field)) {
      redacted[field] = values;
    }
  }
  return { ...event, previousValues: redacted };
}

/**
 * Check if a ChangeEvent matches a subscription filter.
 *
 * Runs against the hydrated, redacted object, so a filter naming a real
 * property (e.g. status) is evaluated against that property's value.
 *
 * Still fails closed on anything un-evaluable. A key the object does not carry
 * never matches — which is what a DELETED event, or one whose hydration failed,
 * falls back to. Treating un-evaluable as a match would deliver the whole
 * type-level stream to a subscriber who asked for a narrow slice. A field the
 * subscriber cannot see is redacted to null before this runs, so filtering on
 * it also fails rather than confirming the value.
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
