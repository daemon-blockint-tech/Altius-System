/**
 * Tests for data expectations, conflict resolution, and pipeline build orchestration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryDataExpectationsService,
  InMemoryConflictResolutionService,
  InMemoryPipelineBuildService,
} from '../in-memory-data-pipelines.js';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

// ===========================================================================
// Data expectations
// ===========================================================================

describe('InMemoryDataExpectationsService', () => {
  let service: InMemoryDataExpectationsService;

  beforeEach(() => {
    service = new InMemoryDataExpectationsService();
  });

  it('creates and retrieves an expectation', async () => {
    const exp = await service.create(CTX, {
      name: 'not-null-name',
      description: 'Name must not be null',
      targetType: 'Patient',
      field: 'name',
      type: 'not_null',
      params: {},
    });
    expect(exp.id).toBeTruthy();
    const fetched = await service.get(CTX, exp.id);
    expect(fetched?.name).toBe('not-null-name');
  });

  it('evaluates not_null expectation', async () => {
    await service.create(CTX, {
      name: 'name-not-null', description: '', targetType: 'Patient', field: 'name',
      type: 'not_null', params: {},
    });
    const results = await service.evaluate(CTX, 'Patient', [
      { name: 'Alice' },
      { name: null },
      { name: 'Bob' },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]!.rowsChecked).toBe(3);
    expect(results[0]!.rowsFailed).toBe(1);
    expect(results[0]!.passed).toBe(false);
  });

  it('evaluates unique expectation', async () => {
    await service.create(CTX, {
      name: 'unique-id', description: '', targetType: 'Patient', field: 'id',
      type: 'unique', params: {},
    });
    const results = await service.evaluate(CTX, 'Patient', [
      { id: 1 }, { id: 2 }, { id: 1 },
    ]);
    expect(results[0]!.rowsFailed).toBe(1);
  });

  it('evaluates range expectation', async () => {
    await service.create(CTX, {
      name: 'age-range', description: '', targetType: 'Patient', field: 'age',
      type: 'range', params: { min: 0, max: 120 },
    });
    const results = await service.evaluate(CTX, 'Patient', [
      { age: 25 }, { age: 150 }, { age: -5 },
    ]);
    expect(results[0]!.rowsFailed).toBe(2);
  });

  it('evaluates enum expectation', async () => {
    await service.create(CTX, {
      name: 'status-enum', description: '', targetType: 'Order', field: 'status',
      type: 'enum', params: { values: ['pending', 'shipped', 'delivered'] },
    });
    const results = await service.evaluate(CTX, 'Order', [
      { status: 'pending' }, { status: 'invalid' },
    ]);
    expect(results[0]!.rowsFailed).toBe(1);
  });

  it('evaluates row_count expectation', async () => {
    await service.create(CTX, {
      name: 'min-rows', description: '', targetType: 'Order',
      type: 'row_count', params: { min: 10 },
    });
    const results = await service.evaluate(CTX, 'Order', [{ id: 1 }, { id: 2 }]);
    expect(results[0]!.passed).toBe(false);
  });

  it('gates build with blocking failures', async () => {
    await service.create(CTX, {
      name: 'blocking-check', description: '', targetType: 'Order', field: 'id',
      type: 'not_null', params: {}, blocking: true,
    });
    await service.create(CTX, {
      name: 'non-blocking', description: '', targetType: 'Order', field: 'name',
      type: 'not_null', params: {}, blocking: false,
    });
    const gate = await service.gateBuild(CTX, 'Order', [
      { id: null, name: null },
    ]);
    expect(gate.passed).toBe(false);
    expect(gate.blockingFailures).toHaveLength(1);
  });

  it('passes build when all blocking expectations pass', async () => {
    await service.create(CTX, {
      name: 'check', description: '', targetType: 'Order', field: 'id',
      type: 'not_null', params: {}, blocking: true,
    });
    const gate = await service.gateBuild(CTX, 'Order', [{ id: 1 }]);
    expect(gate.passed).toBe(true);
  });

  it('lists and updates expectations', async () => {
    const exp = await service.create(CTX, {
      name: 'test', description: '', targetType: 'T', field: 'f',
      type: 'not_null', params: {},
    });
    const list = await service.list(CTX, 'T');
    expect(list).toHaveLength(1);
    const updated = await service.update(CTX, exp.id, { name: 'renamed' });
    expect(updated.name).toBe('renamed');
  });

  it('deletes an expectation', async () => {
    const exp = await service.create(CTX, {
      name: 'test', description: '', targetType: 'T', type: 'row_count', params: {},
    });
    await service.delete(CTX, exp.id);
    const fetched = await service.get(CTX, exp.id);
    expect(fetched).toBeNull();
  });

  it('isolates tenants', async () => {
    await service.create(CTX, { name: 't1', description: '', targetType: 'T', type: 'row_count', params: {} });
    const t2 = await service.list({ tenantId: 't2' } as RequestContext);
    expect(t2).toHaveLength(0);
  });
});

// ===========================================================================
// Conflict resolution
// ===========================================================================

describe('InMemoryConflictResolutionService', () => {
  let service: InMemoryConflictResolutionService;

  beforeEach(() => {
    service = new InMemoryConflictResolutionService();
  });

  it('detects and retrieves a conflict', async () => {
    const conflict = await service.detect(CTX, {
      objectType: 'Patient', objectId: 'p1', field: 'name',
      datasourceValue: 'DS', userValue: 'User',
      datasourceTimestamp: '2026-01-01T00:00:00Z',
      userTimestamp: '2026-01-02T00:00:00Z',
    });
    expect(conflict.id).toBeTruthy();
    expect(conflict.resolved).toBe(false);
    const fetched = await service.get(CTX, conflict.id);
    expect(fetched?.objectType).toBe('Patient');
  });

  it('resolves with user_edits_win strategy', async () => {
    const c = await service.detect(CTX, {
      objectType: 'P', objectId: '1', field: 'name',
      datasourceValue: 'ds', userValue: 'user',
      datasourceTimestamp: '2026-01-02T00:00:00Z',
      userTimestamp: '2026-01-01T00:00:00Z',
    });
    const resolved = await service.resolve(CTX, c.id, 'user_edits_win');
    expect(resolved.resolved).toBe(true);
    expect(resolved.resolvedValue).toBe('user');
  });

  it('resolves with latest_value_wins strategy', async () => {
    const c = await service.detect(CTX, {
      objectType: 'P', objectId: '1', field: 'name',
      datasourceValue: 'ds', userValue: 'user',
      datasourceTimestamp: '2026-01-02T00:00:00Z',
      userTimestamp: '2026-01-01T00:00:00Z',
    });
    const resolved = await service.resolve(CTX, c.id, 'latest_value_wins');
    expect(resolved.resolvedValue).toBe('ds');
  });

  it('resolves with merge strategy', async () => {
    const c = await service.detect(CTX, {
      objectType: 'P', objectId: '1', field: 'data',
      datasourceValue: { a: 1, b: 2 }, userValue: { b: 3, c: 4 },
      datasourceTimestamp: '2026-01-01T00:00:00Z',
      userTimestamp: '2026-01-01T00:00:00Z',
    });
    const resolved = await service.resolve(CTX, c.id, 'merge');
    expect(resolved.resolvedValue).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('resolves with manual strategy', async () => {
    const c = await service.detect(CTX, {
      objectType: 'P', objectId: '1', field: 'name',
      datasourceValue: 'ds', userValue: 'user',
      datasourceTimestamp: '2026-01-01T00:00:00Z',
      userTimestamp: '2026-01-01T00:00:00Z',
    });
    const resolved = await service.resolve(CTX, c.id, 'manual', 'manual-value');
    expect(resolved.resolvedValue).toBe('manual-value');
  });

  it('lists unresolved conflicts', async () => {
    await service.detect(CTX, {
      objectType: 'P', objectId: '1', field: 'f',
      datasourceValue: 'a', userValue: 'b',
      datasourceTimestamp: '2026-01-01T00:00:00Z', userTimestamp: '2026-01-01T00:00:00Z',
    });
    await service.detect(CTX, {
      objectType: 'O', objectId: '2', field: 'f',
      datasourceValue: 'a', userValue: 'b',
      datasourceTimestamp: '2026-01-01T00:00:00Z', userTimestamp: '2026-01-01T00:00:00Z',
    });
    const all = await service.listUnresolved(CTX);
    expect(all).toHaveLength(2);
    const filtered = await service.listUnresolved(CTX, 'P');
    expect(filtered).toHaveLength(1);
  });

  it('auto-resolves all conflicts', async () => {
    await service.detect(CTX, {
      objectType: 'P', objectId: '1', field: 'f',
      datasourceValue: 'a', userValue: 'b',
      datasourceTimestamp: '2026-01-01T00:00:00Z', userTimestamp: '2026-01-01T00:00:00Z',
    });
    const result = await service.autoResolve(CTX, 'user_edits_win');
    expect(result.resolved).toBe(1);
    const remaining = await service.listUnresolved(CTX);
    expect(remaining).toHaveLength(0);
  });

  it('manages default strategy', async () => {
    await service.setDefaultStrategy(CTX, 'latest_value_wins');
    const strategy = await service.getDefaultStrategy(CTX);
    expect(strategy).toBe('latest_value_wins');
  });
});

// ===========================================================================
// Pipeline build orchestration
// ===========================================================================

describe('InMemoryPipelineBuildService', () => {
  let service: InMemoryPipelineBuildService;

  beforeEach(() => {
    service = new InMemoryPipelineBuildService();
  });

  it('starts and retrieves a build', async () => {
    const build = await service.startBuild(CTX, 'etl-pipeline', 'manual');
    expect(build.id).toBeTruthy();
    expect(build.state).toBe('succeeded');
    const fetched = await service.getBuild(CTX, build.id);
    expect(fetched?.pipelineName).toBe('etl-pipeline');
  });

  it('lists builds', async () => {
    await service.startBuild(CTX, 'p1', 'manual');
    await service.startBuild(CTX, 'p2', 'schedule');
    const all = await service.listBuilds(CTX);
    expect(all).toHaveLength(2);
    const p1Only = await service.listBuilds(CTX, 'p1');
    expect(p1Only).toHaveLength(1);
  });

  it('aborts a build', async () => {
    const build = await service.startBuild(CTX, 'p', 'manual');
    await service.abortBuild(CTX, build.id);
    const fetched = await service.getBuild(CTX, build.id);
    expect(fetched?.state).toBe('aborted');
  });

  it('retries a build', async () => {
    const build = await service.startBuild(CTX, 'p', 'manual');
    const retried = await service.retryBuild(CTX, build.id);
    expect(retried.retryCount).toBe(1);
  });

  it('creates and lists schedules', async () => {
    const schedule = await service.createSchedule(CTX, {
      pipelineName: 'nightly-etl',
      cronExpression: '0 2 * * *',
    });
    expect(schedule.id).toBeTruthy();
    const list = await service.listSchedules(CTX);
    expect(list).toHaveLength(1);
  });

  it('updates and deletes schedules', async () => {
    const schedule = await service.createSchedule(CTX, {
      pipelineName: 'p', cronExpression: '0 * * * *',
    });
    const updated = await service.updateSchedule(CTX, schedule.id, { enabled: false });
    expect(updated.enabled).toBe(false);
    await service.deleteSchedule(CTX, schedule.id);
    const list = await service.listSchedules(CTX);
    expect(list).toHaveLength(0);
  });

  it('registers and triggers action-triggered builds', async () => {
    await service.registerActionTrigger(CTX, 'submitOrder', 'order-etl');
    const triggers = await service.getActionTriggers(CTX, 'submitOrder');
    expect(triggers).toEqual(['order-etl']);
    const builds = await service.triggerForAction(CTX, 'submitOrder');
    expect(builds).toHaveLength(1);
    expect(builds[0]!.trigger).toBe('action');
  });

  it('isolates tenants', async () => {
    await service.startBuild(CTX, 'p', 'manual');
    const t2 = await service.listBuilds({ tenantId: 't2' } as RequestContext);
    expect(t2).toHaveLength(0);
  });
});
