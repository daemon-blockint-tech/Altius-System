import { describe, it, expect, vi } from 'vitest';
import { AutomationRunner } from '../runner.js';
import type { AutomationManifest } from '../types.js';
import type { ActionExecutor, ActionManifest, CelEvaluator } from '@altius/actions';
import type { CloudEvent, StorageProvider } from '@altius/spi';
import { parseOdl, type ParsedSchema } from '@altius/odl';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

const emptySchema: ParsedSchema = {
  objectTypes: [], linkTypes: [], actionTypes: [], functionTypes: [],
  enums: [], interfaces: [], scalars: [],
};

function makeCel(): CelEvaluator {
  return {
    async evaluate(expr, vars) {
      const object = (vars as { object?: Record<string, unknown> }).object;
      if (expr === "object.status == 'DISCHARGED'") return { value: object?.['status'] === 'DISCHARGED' };
      if (expr === 'object.bedId') return { value: object?.['bedId'] };
      return { value: undefined };
    },
  };
}

function makeExecutor() {
  return {
    execute: vi.fn(async () => ({ success: true, actionId: 'act-1', errors: [], affectedObjects: [] })),
  };
}

const manifestRegistry = { get: (n: string) => (n === 'CleanBed' ? ({} as ActionManifest) : undefined) };

function makeStorage(object: Record<string, unknown> | null): StorageProvider {
  return { getObject: async () => object } as unknown as StorageProvider;
}

function updatedEvent(causedByActor: string): CloudEvent {
  return {
    specversion: '1.0',
    id: 'e1',
    source: 'altius://engine/ontology',
    type: 'altius.object.updated',
    subject: 'Patient/p1',
    time: new Date().toISOString(),
    tenantid: 't1',
    data: {
      objectType: 'Patient',
      objectId: 'p1',
      version: 2,
      changes: { status: { old: 'ACTIVE', new: 'DISCHARGED' } },
      causedBy: { actor: causedByActor },
    },
  } as unknown as CloudEvent;
}

const eventAutomation: AutomationManifest = {
  name: 'CleanOnDischarge',
  trigger: { type: 'event', objectType: 'Patient', on: ['UPDATED'], condition: "object.status == 'DISCHARGED'" },
  action: { name: 'CleanBed', params: { bedId: { from: 'object.bedId' }, reason: 'auto-clean' } },
  actor: { id: 'svc-automation', roles: ['automation'] },
};

function makeRunner(automations: AutomationManifest[], executor: ReturnType<typeof makeExecutor>, storage: StorageProvider) {
  return new AutomationRunner({
    automations,
    subscribe: () => () => {},
    manifestRegistry,
    executor: executor as unknown as ActionExecutor,
    schema: emptySchema,
    cel: makeCel(),
    storage,
    logger: noopLogger,
  });
}

describe('AutomationRunner — event path', () => {
  it('runs the action with mapped params + system actor when the condition holds', async () => {
    const executor = makeExecutor();
    const runner = makeRunner([eventAutomation], executor, makeStorage({ _id: 'p1', status: 'DISCHARGED', bedId: 'b1' }));
    await runner.onEvent(updatedEvent('user:clinician'));

    expect(executor.execute).toHaveBeenCalledTimes(1);
    const call = executor.execute.mock.calls[0] as unknown[];
    expect(call[1]).toEqual({ bedId: 'b1', reason: 'auto-clean' });
    expect(call[2]).toEqual({ id: 'svc-automation', type: 'system', roles: ['automation'] });
    const ctx = call[3] as { requestContext: { tenantId: string; actorId: string } };
    expect(ctx.requestContext.tenantId).toBe('t1');
    expect(ctx.requestContext.actorId).toBe('svc-automation');
  });

  it('does not run when the CEL condition is false', async () => {
    const executor = makeExecutor();
    const runner = makeRunner([eventAutomation], executor, makeStorage({ _id: 'p1', status: 'ACTIVE', bedId: 'b1' }));
    await runner.onEvent(updatedEvent('user:clinician'));
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('does not re-fire on an event its own actor caused (self-loop guard)', async () => {
    const executor = makeExecutor();
    const runner = makeRunner([eventAutomation], executor, makeStorage({ _id: 'p1', status: 'DISCHARGED', bedId: 'b1' }));
    await runner.onEvent(updatedEvent('user:svc-automation'));
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('still fires when a DIFFERENT actor whose id merely contains the automation id caused the event (exact-match, not substring)', async () => {
    const executor = makeExecutor();
    const runner = makeRunner([eventAutomation], executor, makeStorage({ _id: 'p1', status: 'DISCHARGED', bedId: 'b1' }));
    await runner.onEvent(updatedEvent('user:svc-automation-2'));
    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  it('ignores events whose ObjectType or change kind do not match', async () => {
    const executor = makeExecutor();
    const runner = makeRunner([eventAutomation], executor, makeStorage({ status: 'DISCHARGED' }));
    const created = { ...updatedEvent('user:x'), type: 'altius.object.created' } as CloudEvent;
    await runner.onEvent(created); // wrong change kind (CREATED not in on:[UPDATED])
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('skips when the referenced action is unknown', async () => {
    const executor = makeExecutor();
    const auto: AutomationManifest = { ...eventAutomation, action: { name: 'DoesNotExist', params: {} } };
    const runner = makeRunner([auto], executor, makeStorage({ status: 'DISCHARGED' }));
    await runner.onEvent(updatedEvent('user:clinician'));
    expect(executor.execute).not.toHaveBeenCalled();
  });
});

describe('AutomationRunner — schedule path', () => {
  it('runs the action under the declared tenant with static params', async () => {
    const executor = makeExecutor();
    const scheduled: AutomationManifest = {
      name: 'NightlySweep',
      trigger: { type: 'schedule', intervalMs: 3_600_000 },
      action: { name: 'CleanBed', params: { reason: 'nightly' } },
      actor: { id: 'svc', roles: ['automation'] },
      tenantId: 't7',
    };
    const runner = makeRunner([scheduled], executor, makeStorage(null));
    await runner.runScheduled(scheduled);

    expect(executor.execute).toHaveBeenCalledTimes(1);
    const call = executor.execute.mock.calls[0] as unknown[];
    expect(call[1]).toEqual({ reason: 'nightly' });
    expect(call[2]).toEqual({ id: 'svc', type: 'system', roles: ['automation'] });
    const ctx = call[3] as { requestContext: { tenantId: string } };
    expect(ctx.requestContext.tenantId).toBe('t7');
  });

  it('fires scheduled automations through an injected timer on start()', async () => {
    const executor = makeExecutor();
    const scheduled: AutomationManifest = {
      name: 'Tick', trigger: { type: 'schedule', intervalMs: 1000 },
      action: { name: 'CleanBed', params: {} }, actor: { id: 'svc', roles: [] }, tenantId: 't1',
    };
    let fired: (() => void) | null = null;
    const runner = new AutomationRunner({
      automations: [scheduled],
      subscribe: () => () => {},
      manifestRegistry,
      executor: executor as unknown as ActionExecutor,
      schema: emptySchema,
      cel: makeCel(),
      storage: makeStorage(null),
      logger: noopLogger,
      setTimer: (fn) => { fired = fn; return 1; },
      clearTimer: () => {},
    });
    runner.start();
    expect(fired).not.toBeNull();
    fired!(); // simulate a timer tick
    await new Promise((r) => setTimeout(r, 0)); // let the async chain settle
    expect(executor.execute).toHaveBeenCalledTimes(1);
    runner.stop();
  });
});

describe('AutomationRunner — hardening', () => {
  it('skips a scheduled tick while the previous run is still in flight (non-overlap)', async () => {
    const done = { success: true, actionId: '', errors: [], affectedObjects: [] };
    let pending = true;
    let resolveRun: (v: unknown) => void = () => {};
    const executor = {
      execute: vi.fn(() => (pending ? new Promise((r) => { resolveRun = r; }) : Promise.resolve(done))),
    };
    const scheduled: AutomationManifest = {
      name: 'Slow', trigger: { type: 'schedule', intervalMs: 1000 },
      action: { name: 'CleanBed', params: {} }, actor: { id: 'svc', roles: [] }, tenantId: 't1',
    };
    const runner = makeRunner([scheduled], executor as unknown as ReturnType<typeof makeExecutor>, makeStorage(null));

    const first = runner.runScheduled(scheduled); // starts, in-flight, execute pending
    await runner.runScheduled(scheduled);         // must skip while first is in flight
    expect(executor.execute).toHaveBeenCalledTimes(1);

    pending = false;
    resolveRun(done);
    await first;
    await runner.runScheduled(scheduled);         // runs again once the previous finished
    expect(executor.execute).toHaveBeenCalledTimes(2);
  });

  it('derives consent subject + purpose from an object-typed @param (consent parity)', async () => {
    const consentSchema = parseOdl(`
type Patient @objectType { id: ID! @primary }
type DischargePatient @actionType { patientId: Patient @param }
`);
    const executor = makeExecutor();
    const auto: AutomationManifest = {
      name: 'AutoDischarge', trigger: { type: 'schedule', intervalMs: 1000 },
      action: { name: 'DischargePatient', params: { patientId: 'p-1' } },
      actor: { id: 'svc', roles: ['clinician'] }, tenantId: 't1',
    };
    const runner = new AutomationRunner({
      automations: [auto],
      subscribe: () => () => {},
      manifestRegistry: { get: () => ({} as ActionManifest) },
      executor: executor as unknown as ActionExecutor,
      schema: consentSchema,
      cel: makeCel(),
      storage: makeStorage(null),
      logger: noopLogger,
      consentSubjectTypes: ['Patient'],
      consentPurpose: 'DIRECT_CARE',
    });

    await runner.runScheduled(auto);

    const call = executor.execute.mock.calls[0] as unknown[];
    const ctx = call[3] as { consentSubjectId?: string; consentPurpose?: string };
    expect(ctx.consentSubjectId).toBe('p-1');
    expect(ctx.consentPurpose).toBeDefined();
  });
});
