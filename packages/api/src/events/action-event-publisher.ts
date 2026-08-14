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
export function createActionEventPublisher(
  emitter: LinkAwareEventEmitter,
  linkTypes: readonly LinkType[],
): ActionEventPublisher {
  const endpointsByLinkType = new Map(
    linkTypes.map(lt => [lt.name, { from: lt.from, to: lt.to }]),
  );

  return {
    async publishObjectChange(changeType, objectType, objectId, _before, _after, cause, ctx) {
      const version = 1; // Actions don't track version; use placeholder
      const eventCause = { actionType: cause.actionType, actionId: cause.actionId, actor: cause.actor };
      if (changeType === 'created') await emitter.emitObjectCreated(ctx, objectType, objectId, version, eventCause);
      else if (changeType === 'updated') await emitter.emitObjectUpdated(ctx, objectType, objectId, version, {}, eventCause);
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
