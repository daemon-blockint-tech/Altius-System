/**
 * Oracle: @sensitive fields must be redacted from CloudEvent `changes`
 * before the event reaches the bus.
 *
 * Without the sensitiveFieldsByType map injected into EngineEventEmitter,
 * a CloudEvent published via emitObjectUpdated carries raw {old, new} values
 * for @sensitive fields — any bus consumer that reads directly (not through
 * the subscription manager's read-path redaction) recovers the raw values.
 *
 * Two-sided proof:
 *   1. Without the map → sensitive field `name` appears raw in the event.
 *   2. With the map    → `name` is nulled to {old: null, new: null}.
 */
import { describe, it, expect } from 'vitest';
import { EngineEventEmitter } from '../events/event-emitter.js';
import { InMemoryEventBus } from '../events/event-bus.js';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = {
  tenantId: 'test-tenant',
  actorId: 'user:test',
  traceId: 'trace-1',
};

describe('EngineEventEmitter @sensitive redaction', () => {
  it('leaks @sensitive field in changes when no redaction map is provided', async () => {
    const bus = new InMemoryEventBus();
    // No sensitiveFieldsByType — the pre-fix behaviour
    const emitter = new EngineEventEmitter(bus);

    await emitter.emitObjectUpdated(
      CTX,
      'Patient',
      'p1',
      2,
      { name: { old: 'Alice', new: 'Bob' }, status: { old: 'admitted', new: 'discharged' } },
    );

    expect(bus.events).toHaveLength(1);
    const data = bus.events[0]!.data as { changes?: Record<string, { old: unknown; new: unknown }> };
    // Without redaction, the sensitive `name` field leaks raw values
    expect(data.changes?.['name']).toEqual({ old: 'Alice', new: 'Bob' });
    expect(data.changes?.['status']).toEqual({ old: 'admitted', new: 'discharged' });
  });

  it('redacts @sensitive field in changes when the map is provided', async () => {
    const bus = new InMemoryEventBus();
    const sensitiveMap = new Map<string, Set<string>>([
      ['Patient', new Set(['name', 'dateOfBirth'])],
    ]);
    const emitter = new EngineEventEmitter(bus, 'altius://engine/ontology', sensitiveMap);

    await emitter.emitObjectUpdated(
      CTX,
      'Patient',
      'p1',
      2,
      { name: { old: 'Alice', new: 'Bob' }, status: { old: 'admitted', new: 'discharged' } },
    );

    expect(bus.events).toHaveLength(1);
    const data = bus.events[0]!.data as { changes?: Record<string, { old: unknown; new: unknown }> };
    // Sensitive field `name` is nulled
    expect(data.changes?.['name']).toEqual({ old: null, new: null });
    // Non-sensitive field `status` is preserved
    expect(data.changes?.['status']).toEqual({ old: 'admitted', new: 'discharged' });
  });

  it('does not redact when the type has no sensitive fields', async () => {
    const bus = new InMemoryEventBus();
    const sensitiveMap = new Map<string, Set<string>>([
      ['Patient', new Set(['name'])],
    ]);
    const emitter = new EngineEventEmitter(bus, 'altius://engine/ontology', sensitiveMap);

    await emitter.emitObjectUpdated(
      CTX,
      'Ward',
      'w1',
      2,
      { name: { old: 'Ward A', new: 'Ward B' } },
    );

    const data = bus.events[0]!.data as { changes?: Record<string, { old: unknown; new: unknown }> };
    // Ward has no sensitive fields — `name` is a regular field here
    expect(data.changes?.['name']).toEqual({ old: 'Ward A', new: 'Ward B' });
  });

  it('preserves non-change events (created/deleted) without redaction', async () => {
    const bus = new InMemoryEventBus();
    const sensitiveMap = new Map<string, Set<string>>([
      ['Patient', new Set(['name'])],
    ]);
    const emitter = new EngineEventEmitter(bus, 'altius://engine/ontology', sensitiveMap);

    await emitter.emitObjectCreated(CTX, 'Patient', 'p1', 1);
    await emitter.emitObjectDeleted(CTX, 'Patient', 'p1', 2);

    expect(bus.events).toHaveLength(2);
    // created and deleted events have no `changes` field — nothing to redact
    expect((bus.events[0]!.data as { changes?: unknown }).changes).toBeUndefined();
    expect((bus.events[1]!.data as { changes?: unknown }).changes).toBeUndefined();
  });

  it('redacts @sensitive link properties in link.updated changes', async () => {
    const bus = new InMemoryEventBus();
    // The map is keyed by the LINK type name (server builds it from linkTypes too).
    const sensitiveMap = new Map<string, Set<string>>([
      ['TreatedBy', new Set(['dosage'])],
    ]);
    const emitter = new EngineEventEmitter(bus, 'altius://engine/ontology', sensitiveMap);

    await emitter.emitLinkUpdated(
      CTX,
      'TreatedBy',
      'l1',
      'p1',
      'c1',
      2,
      { dosage: { old: '10mg', new: '20mg' }, status: { old: 'active', new: 'stopped' } },
    );

    expect(bus.events).toHaveLength(1);
    const data = bus.events[0]!.data as { changes?: Record<string, { old: unknown; new: unknown }> };
    // The sensitive link property is nulled; the ordinary one is untouched.
    expect(data.changes?.['dosage']).toEqual({ old: null, new: null });
    expect(data.changes?.['status']).toEqual({ old: 'active', new: 'stopped' });
  });
});
