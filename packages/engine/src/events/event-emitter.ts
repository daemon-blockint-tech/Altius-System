/**
 * CloudEvent emitter for the Ontology Engine (Section 4.2).
 *
 * Produces CloudEvents 1.0 compliant events for all state changes
 * (objects and links) and publishes them to the configured EventBus.
 */

import type { CloudEvent, CloudEventType, RequestContext, DateTime } from '@altius/spi';
import type { EventBus } from './event-bus.js';

/** Describes who/what caused the state change. */
export interface EventCause {
  actionType?: string;
  actionId?: string;
  actor?: string;
}

/** Describes field-level changes for update events. */
export type ChangeSet = Record<string, { old: unknown; new: unknown }>;

/** Data payload for object lifecycle events. */
export interface ObjectEventData {
  objectType: string;
  objectId: string;
  version: number;
  changes?: ChangeSet;
  causedBy?: EventCause;
}

/** Data payload for link lifecycle events. */
export interface LinkEventData {
  linkType: string;
  linkId: string;
  fromId: string;
  toId: string;
  /** ObjectType of the from-endpoint. Enables type-level subscription routing. */
  fromType?: string;
  /** ObjectType of the to-endpoint. Enables type-level subscription routing. */
  toType?: string;
  version: number;
  changes?: ChangeSet;
  causedBy?: EventCause;
}

let _eventCounter = 0;

function generateEventId(): string {
  _eventCounter++;
  return `evt-${Date.now()}-${_eventCounter}`;
}

/**
 * Emits CloudEvents for object and link lifecycle operations.
 *
 * @sensitive fields are redacted from `changes` before publishing to the bus,
 * so a CloudEvent consumer that reads directly from the bus (not through the
 * subscription manager's read-path redaction) cannot recover @sensitive values.
 * The redaction map is optional — when absent, no redaction occurs (preserves
 * existing behaviour for tests that don't declare @sensitive fields).
 */
export class EngineEventEmitter {
  private readonly source: string;
  private readonly bus: EventBus;
  private readonly sensitiveFieldsByType?: Map<string, Set<string>>;

  constructor(
    bus: EventBus,
    source = 'altius://engine/ontology',
    sensitiveFieldsByType?: Map<string, Set<string>>,
  ) {
    this.source = source;
    this.bus = bus;
    this.sensitiveFieldsByType = sensitiveFieldsByType;
  }

  // ── Object events ──────────────────────────────────────────────────────

  /** Emit an object.created event. */
  async emitObjectCreated(
    ctx: RequestContext,
    objectType: string,
    objectId: string,
    version: number,
    cause?: EventCause,
  ): Promise<void> {
    await this.emitEvent('altius.object.created', `${objectType}/${objectId}`, ctx, {
      objectType,
      objectId,
      version,
      causedBy: this.buildCause(ctx, cause),
    });
  }

  /** Emit an object.updated event. */
  async emitObjectUpdated(
    ctx: RequestContext,
    objectType: string,
    objectId: string,
    version: number,
    changes: ChangeSet,
    cause?: EventCause,
  ): Promise<void> {
    await this.emitEvent('altius.object.updated', `${objectType}/${objectId}`, ctx, {
      objectType,
      objectId,
      version,
      changes,
      causedBy: this.buildCause(ctx, cause),
    });
  }

  /** Emit an object.deleted event. */
  async emitObjectDeleted(
    ctx: RequestContext,
    objectType: string,
    objectId: string,
    version: number,
    cause?: EventCause,
  ): Promise<void> {
    await this.emitEvent('altius.object.deleted', `${objectType}/${objectId}`, ctx, {
      objectType,
      objectId,
      version,
      causedBy: this.buildCause(ctx, cause),
    });
  }

  // ── Link events ────────────────────────────────────────────────────────

  /** Emit a link.created event. */
  async emitLinkCreated(
    ctx: RequestContext,
    linkType: string,
    linkId: string,
    fromId: string,
    toId: string,
    version: number,
    cause?: EventCause,
    fromType?: string,
    toType?: string,
  ): Promise<void> {
    await this.emitEvent('altius.link.created', `${linkType}/${linkId}`, ctx, {
      linkType,
      linkId,
      fromId,
      toId,
      fromType,
      toType,
      version,
      causedBy: this.buildCause(ctx, cause),
    });
  }

  /** Emit a link.updated event. */
  async emitLinkUpdated(
    ctx: RequestContext,
    linkType: string,
    linkId: string,
    fromId: string,
    toId: string,
    version: number,
    changes: ChangeSet,
    cause?: EventCause,
    fromType?: string,
    toType?: string,
  ): Promise<void> {
    await this.emitEvent('altius.link.updated', `${linkType}/${linkId}`, ctx, {
      linkType,
      linkId,
      fromId,
      toId,
      fromType,
      toType,
      version,
      changes,
      causedBy: this.buildCause(ctx, cause),
    });
  }

  /** Emit a link.deleted event. */
  async emitLinkDeleted(
    ctx: RequestContext,
    linkType: string,
    linkId: string,
    fromId: string,
    toId: string,
    version: number,
    cause?: EventCause,
    fromType?: string,
    toType?: string,
  ): Promise<void> {
    await this.emitEvent('altius.link.deleted', `${linkType}/${linkId}`, ctx, {
      linkType,
      linkId,
      fromId,
      toId,
      fromType,
      toType,
      version,
      causedBy: this.buildCause(ctx, cause),
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private async emitEvent(
    type: CloudEventType,
    subject: string,
    ctx: RequestContext,
    data: ObjectEventData | LinkEventData,
  ): Promise<void> {
    // Redact @sensitive fields from `changes` before the event reaches the bus.
    // The bus is shared infrastructure (Redis/Redpanda/in-memory); a consumer
    // that reads directly from it bypasses the subscription manager's read-path
    // redaction. This is the write-side guard — fail-closed at the source.
    const redactedData = this.redactChanges(data);
    const event: CloudEvent<ObjectEventData | LinkEventData> = {
      specversion: '1.0',
      id: generateEventId(),
      source: this.source,
      type,
      subject,
      time: new Date().toISOString() as DateTime,
      datacontenttype: 'application/json',
      // The topic is derived from the object type alone and the bus is shared
      // by every tenant, so this is what lets a consumer tell whose change it
      // is looking at. Dropping it here is a cross-tenant leak downstream.
      tenantid: ctx.tenantId,
      data: redactedData,
    };
    await this.bus.publish(event);
  }

  /**
   * Null out `changes` entries for @sensitive fields before the event leaves
   * the engine. Returns `data` unchanged when no sensitive map is configured
   * or the type has no sensitive fields. Mutates a copy, not the caller's
   * original — the action executor's audit trail still needs the raw values
   * for the read-path redaction to have something to redact.
   */
  private redactChanges(data: ObjectEventData | LinkEventData): ObjectEventData | LinkEventData {
    if (!this.sensitiveFieldsByType || this.sensitiveFieldsByType.size === 0) return data;
    if (!data.changes) return data;

    // Object events key on the object type; link events on the link type.
    // A link's @sensitive property deltas ride in `changes` just like an
    // object's and must be redacted the same way — keying only on objectType
    // let them through unredacted.
    const typeName = 'objectType' in data ? data.objectType : data.linkType;
    if (!typeName) return data;

    const sensitive = this.sensitiveFieldsByType.get(typeName);
    if (!sensitive || sensitive.size === 0) return data;

    const redactedChanges: ChangeSet = {};
    for (const [field, values] of Object.entries(data.changes)) {
      if (sensitive.has(field)) {
        redactedChanges[field] = { old: null, new: null };
      } else {
        redactedChanges[field] = values;
      }
    }
    return { ...data, changes: redactedChanges };
  }

  private buildCause(ctx: RequestContext, cause?: EventCause): EventCause {
    return {
      ...cause,
      actor: cause?.actor ?? (ctx.actorId ? `user:${ctx.actorId}` : undefined),
    };
  }
}
