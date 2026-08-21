/**
 * Bridge from the action pipeline's ActionEventPublisher to the engine emitter.
 *
 * The action executor reports changes by (type, id) only; the engine emitter
 * additionally wants a link's endpoint ObjectType names. Those names decide
 * where the event lands: mapLinkEvent publishes to the type-level
 * `fooChanged` topic when they are present, and falls back to a per-ID topic
 * that no generated resolver subscribes to when they are not.
 *
 * LinkManager has always supplied them, so before this bridge did, link changes
 * made *by an action* were silently dropped for every subscriber while link
 * changes made outside one were delivered.
 */

import type { ActionEventPublisher } from '@altius/actions';
import type { LinkType } from '@altius/odl';
import type { RequestContext } from '@altius/spi';

/** The emitter surface this bridge needs — structural, so tests can stub it. */
export interface LinkAwareEventEmitter {
  emitObjectCreated(
    ctx: RequestContext, objectType: string, objectId: string, version: number,
    cause?: unknown,
  ): Promise<void>;
  emitObjectUpdated(
    ctx: RequestContext, objectType: string, objectId: string, version: number,
    changedFields?: Record<string, unknown>, cause?: unknown,
  ): Promise<void>;
  emitObjectDeleted(
    ctx: RequestContext, objectType: string, objectId: string, version: number,
    cause?: unknown,
  ): Promise<void>;
  emitLinkCreated(
    ctx: RequestContext, linkType: string, linkId: string, fromId: string, toId: string,
    version: number, cause?: unknown, fromType?: string, toType?: string,
  ): Promise<void>;
  emitLinkDeleted(
    ctx: RequestContext, linkType: string, linkId: string, fromId: string, toId: string,
    version: number, cause?: unknown, fromType?: string, toType?: string,
  ): Promise<void>;
}

/**
 * @param linkTypes - Schema link types, used to recover each link's endpoint
 *   ObjectType names. A link type absent from the schema emits without them,
 *   which is the pre-existing (dropped) behaviour rather than a hard failure.
 */
/**
 * Field-level diff of an object's before/after state, as a ChangeSet
 * ({ field: { old, new } }). System fields (leading underscore — _version,
 * _updatedAt, …) are excluded so `changes` carries only meaningful deltas; the
 * emitter redacts @sensitive entries before the bus.
 */
function diffFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): Record<string, { old: unknown; new: unknown }> {
  const out: Record<string, { old: unknown; new: unknown }> = {};
  if (!after) return out;
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  for (const k of keys) {
    if (k.startsWith('_')) continue;
    const oldVal = before?.[k];
    const newVal = after[k];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      out[k] = { old: oldVal ?? null, new: newVal ?? null };
    }
  }
  return out;
}

export function createActionEventPublisher(
  emitter: LinkAwareEventEmitter,
  linkTypes: readonly LinkType[],
): ActionEventPublisher {
  const endpointsByLinkType = new Map(
    linkTypes.map(lt => [lt.name, { from: lt.from, to: lt.to }]),
  );

  return {
    async publishObjectChange(changeType, objectType, objectId, before, after, cause, ctx) {
      // The action executor passes the real before/after objects, so recover the
      // committed _version and the field deltas rather than emitting a version=1
      // placeholder with no changes — a bus consumer reading the event directly
      // would otherwise see a wrong version and no diff for action-driven writes.
      const version =
        (after?.['_version'] as number | undefined) ??
        (before?.['_version'] as number | undefined) ??
        1;
      const eventCause = { actionType: cause.actionType, actionId: cause.actionId, actor: cause.actor };
      if (changeType === 'created') await emitter.emitObjectCreated(ctx, objectType, objectId, version, eventCause);
      else if (changeType === 'updated') await emitter.emitObjectUpdated(ctx, objectType, objectId, version, diffFields(before, after), eventCause);
      else if (changeType === 'deleted') await emitter.emitObjectDeleted(ctx, objectType, objectId, version, eventCause);
    },

    async publishLinkChange(changeType, linkType, linkId, fromId, toId, cause, ctx) {
      const eventCause = { actionType: cause.actionType, actionId: cause.actionId, actor: cause.actor };
      const endpoints = endpointsByLinkType.get(linkType);
      if (changeType === 'created') {
        await emitter.emitLinkCreated(ctx, linkType, linkId, fromId, toId, 1, eventCause, endpoints?.from, endpoints?.to);
      } else if (changeType === 'deleted') {
        await emitter.emitLinkDeleted(ctx, linkType, linkId, fromId, toId, 1, eventCause, endpoints?.from, endpoints?.to);
      }
    },
  };
}
