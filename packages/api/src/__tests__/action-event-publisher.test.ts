/**
 * Link events raised by an action must carry their endpoint ObjectType names.
 *
 * mapLinkEvent routes to the type-level `fooChanged` topic only when fromType
 * and toType are present; without them it falls back to a per-ID topic that no
 * generated resolver subscribes to, so the event is effectively dropped.
 * LinkManager always supplied them — the action bridge did not.
 */

import { describe, it, expect, vi } from 'vitest';

import type { LinkType } from '@altius/odl';
import type { RequestContext } from '@altius/spi';

import { createActionEventPublisher, type LinkAwareEventEmitter } from '../events/action-event-publisher.js';
import { mapLinkEvent } from '../subscriptions/subscription-manager.js';

const CTX = { tenantId: 't1', traceId: 'trace-1' } as unknown as RequestContext;
const CAUSE = { actionType: 'AdmitPatient', actionId: 'act_1', actor: 'user:alice' };

const LINK_TYPES = [
  { name: 'AdmittedTo', from: 'Patient', to: 'Ward' },
] as unknown as LinkType[];

function stubEmitter() {
  return {
    emitObjectCreated: vi.fn(async () => {}),
    emitObjectUpdated: vi.fn(async () => {}),
    emitObjectDeleted: vi.fn(async () => {}),
    // Params are spelled out so `.mock.calls` is typed and the fromType/toType
    // positions can be asserted.
    emitLinkCreated: vi.fn(async (
      _ctx: RequestContext, _linkType: string, _linkId: string, _fromId: string,
      _toId: string, _version: number, _cause?: unknown, _fromType?: string, _toType?: string,
    ) => {}),
    emitLinkDeleted: vi.fn(async (
      _ctx: RequestContext, _linkType: string, _linkId: string, _fromId: string,
      _toId: string, _version: number, _cause?: unknown, _fromType?: string, _toType?: string,
    ) => {}),
  } satisfies LinkAwareEventEmitter;
}

describe('createActionEventPublisher', () => {
  it('passes endpoint object types on link creation', async () => {
    const emitter = stubEmitter();
    const publisher = createActionEventPublisher(emitter, LINK_TYPES);

    await publisher.publishLinkChange('created', 'AdmittedTo', 'l1', 'p1', 'w1', CAUSE, CTX);

    const args = emitter.emitLinkCreated.mock.calls[0]!;
    expect(args[7]).toBe('Patient'); // fromType
    expect(args[8]).toBe('Ward');    // toType
  });

  it('passes endpoint object types on link deletion', async () => {
    const emitter = stubEmitter();
    const publisher = createActionEventPublisher(emitter, LINK_TYPES);

    await publisher.publishLinkChange('deleted', 'AdmittedTo', 'l1', 'p1', 'w1', CAUSE, CTX);

    const args = emitter.emitLinkDeleted.mock.calls[0]!;
    expect(args[7]).toBe('Patient');
    expect(args[8]).toBe('Ward');
  });

  it('emits without endpoint types for a link type absent from the schema', async () => {
    const emitter = stubEmitter();
    const publisher = createActionEventPublisher(emitter, []);

    await publisher.publishLinkChange('created', 'Unknown', 'l1', 'p1', 'w1', CAUSE, CTX);

    const args = emitter.emitLinkCreated.mock.calls[0]!;
    expect(args[7]).toBeUndefined();
    expect(args[8]).toBeUndefined();
  });

  it('the emitted endpoint types are what route the event to a live topic', () => {
    // The whole point of carrying fromType/toType: without them mapLinkEvent
    // targets a per-ID topic nothing consumes.
    const withTypes = mapLinkEvent({
      type: 'altius.link.created',
      data: { linkType: 'AdmittedTo', linkId: 'l1', fromId: 'p1', toId: 'w1', fromType: 'Patient', toType: 'Ward' },
    } as never);
    expect(withTypes!.map(r => r.topic)).toEqual(['patientChanged', 'wardChanged']);

    const withoutTypes = mapLinkEvent({
      type: 'altius.link.created',
      data: { linkType: 'AdmittedTo', linkId: 'l1', fromId: 'p1', toId: 'w1' },
    } as never);
    expect(withoutTypes!.map(r => r.topic)).toEqual(['p1', 'w1']);
  });

  it('emits the committed version and field diff for an updated object', async () => {
    const emitter = stubEmitter();
    const publisher = createActionEventPublisher(emitter, LINK_TYPES);

    const before = { _id: 'p1', _type: 'Patient', _version: 4, status: 'admitted', ward: 'A' };
    const after = { _id: 'p1', _type: 'Patient', _version: 5, status: 'discharged', ward: 'A' };
    await publisher.publishObjectChange('updated', 'Patient', 'p1', before, after, CAUSE, CTX);

    const args = emitter.emitObjectUpdated.mock.calls[0]!;
    expect(args[3]).toBe(5); // real committed version, not the version=1 placeholder
    // Only the changed field appears in the diff; unchanged and system fields don't.
    expect(args[4]).toEqual({ status: { old: 'admitted', new: 'discharged' } });
  });

  it('falls back to version 1 only when neither state carries a version', async () => {
    const emitter = stubEmitter();
    const publisher = createActionEventPublisher(emitter, LINK_TYPES);
    await publisher.publishObjectChange('created', 'Patient', 'p1', undefined, { _id: 'p1' }, CAUSE, CTX);
    expect(emitter.emitObjectCreated.mock.calls[0]![3]).toBe(1);
  });

  it('uses the before-state version for a delete', async () => {
    const emitter = stubEmitter();
    const publisher = createActionEventPublisher(emitter, LINK_TYPES);
    await publisher.publishObjectChange('deleted', 'Patient', 'p1', { _id: 'p1', _version: 7 }, undefined, CAUSE, CTX);
    expect(emitter.emitObjectDeleted.mock.calls[0]![3]).toBe(7);
  });
});
