/**
 * Integration tests for PostgresAuditStore.
 *
 * Requires a running PostgreSQL instance. Set PG_TEST_URL env var or
 * these tests will be skipped.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { AuditRecord } from '@altius/spi';
import { PostgresAuditStore } from '../audit/postgres-audit-store.js';
import { generateAuditDDL } from '../schema/ddl-audit.js';

const PG_TEST_URL = process.env['PG_TEST_URL'];

function parseUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: u.username,
    password: u.password,
  };
}

const describeWithPg = PG_TEST_URL ? describe : describe.skip;

describeWithPg('PostgresAuditStore (integration)', () => {
  let pool: Pool;
  let store: PostgresAuditStore;

  beforeAll(async () => {
    const config = parseUrl(PG_TEST_URL!);
    pool = new Pool(config);
    store = new PostgresAuditStore(pool);

    // Create audit schema and table
    const ddl = generateAuditDDL();
    for (const stmt of ddl) {
      await pool.query(stmt);
    }

    // Clean any leftover test data
    await cleanTestRecords();
  });

  afterAll(async () => {
    // Clean up test data
    if (pool) {
      await cleanTestRecords();
      await pool.end();
    }
  });

  /**
   * The audit table is append-only (enforced by trigger), so test cleanup
   * must explicitly bypass the guard as the table owner.
   */
  async function cleanTestRecords(): Promise<void> {
    await pool.query(`ALTER TABLE "audit"."audit_records" DISABLE TRIGGER "audit_records_immutable_row"`);
    try {
      await pool.query(`DELETE FROM "audit"."audit_records" WHERE "id" LIKE 'test-%'`);
    } finally {
      await pool.query(`ALTER TABLE "audit"."audit_records" ENABLE TRIGGER "audit_records_immutable_row"`);
    }
  }

  function makeRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
    return {
      id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      traceId: 'trace-001',
      tenantId: 'tenant-test',
      actor: { type: 'user', id: 'user-alice', roles: ['clinician'] },
      operation: { type: 'create', objectType: 'Patient', objectId: 'p-001' },
      detail: { result: 'success' },
      ...overrides,
    };
  }

  it('rejects UPDATE, DELETE, and TRUNCATE at the database level', async () => {
    const record = makeRecord({ actor: { type: 'user', id: 'audit-immutable-test', roles: [] } });
    await store.append(record);

    await expect(
      pool.query(`UPDATE "audit"."audit_records" SET "actor_id" = 'tampered' WHERE "id" = $1`, [record.id]),
    ).rejects.toThrow(/append-only/);
    await expect(
      pool.query(`DELETE FROM "audit"."audit_records" WHERE "id" = $1`, [record.id]),
    ).rejects.toThrow(/append-only/);
    await expect(
      pool.query(`TRUNCATE "audit"."audit_records"`),
    ).rejects.toThrow(/append-only/);
  });

  it('appends a record and retrieves it by actorId', async () => {
    const record = makeRecord({ actor: { type: 'user', id: 'audit-test-1', roles: ['admin'] } });
    await store.append(record);

    const results = await store.query({ actorId: 'audit-test-1' });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(record.id);
    expect(results[0]!.actor.id).toBe('audit-test-1');
    expect(results[0]!.actor.roles).toEqual(['admin']);
    expect(results[0]!.detail.result).toBe('success');
  });

  it('queries by objectType and objectId', async () => {
    const record = makeRecord({
      operation: { type: 'update', objectType: 'Ward', objectId: 'w-audit-test' },
      actor: { type: 'system', id: 'audit-test-2', roles: [] },
    });
    await store.append(record);

    const results = await store.query({ objectType: 'Ward', objectId: 'w-audit-test' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.operation.objectType).toBe('Ward');
    expect(results[0]!.operation.objectId).toBe('w-audit-test');
  });

  it('queries by traceId', async () => {
    const traceId = `trace-audit-${Date.now()}`;
    const record = makeRecord({ traceId });
    await store.append(record);

    const results = await store.query({ traceId });
    expect(results).toHaveLength(1);
    expect(results[0]!.traceId).toBe(traceId);
  });

  it('queries by time range', async () => {
    const before = new Date(Date.now() - 1000).toISOString();
    const record = makeRecord({ actor: { type: 'user', id: 'audit-test-time', roles: [] } });
    await store.append(record);
    const after = new Date(Date.now() + 1000).toISOString();

    const results = await store.query({ actorId: 'audit-test-time', from: before, to: after });
    expect(results).toHaveLength(1);
  });

  it('queries by operationType', async () => {
    const record = makeRecord({
      operation: { type: 'action', actionType: 'AdmitPatient', actionId: 'act-001' },
      actor: { type: 'user', id: 'audit-test-optype', roles: [] },
    });
    await store.append(record);

    const results = await store.query({ actorId: 'audit-test-optype', operationType: 'action' });
    expect(results).toHaveLength(1);
    expect(results[0]!.operation.actionType).toBe('AdmitPatient');
    expect(results[0]!.operation.actionId).toBe('act-001');
  });

  it('stores and retrieves detail with before/after snapshots', async () => {
    const record = makeRecord({
      actor: { type: 'user', id: 'audit-test-detail', roles: [] },
      detail: {
        before: { status: 'ACTIVE', ward: 'Cardiology' },
        after: { status: 'DISCHARGED', ward: null },
        result: 'success',
      },
    });
    await store.append(record);

    const results = await store.query({ actorId: 'audit-test-detail' });
    expect(results).toHaveLength(1);
    expect(results[0]!.detail.before).toEqual({ status: 'ACTIVE', ward: 'Cardiology' });
    expect(results[0]!.detail.after).toEqual({ status: 'DISCHARGED', ward: null });
  });

  it('returns empty array for unmatched filter', async () => {
    const results = await store.query({ actorId: 'nonexistent-user-xyz' });
    expect(results).toEqual([]);
  });
});

describeWithPg('PostgresAuditStore — function invocations', () => {
  let pool: Pool;
  let store: PostgresAuditStore;

  beforeAll(async () => {
    pool = new Pool(parseUrl(PG_TEST_URL!));
    store = new PostgresAuditStore(pool);
    for (const stmt of generateAuditDDL()) await pool.query(stmt);
  });

  afterAll(async () => { await pool.end(); });

  // audit_records is append-only by DB trigger, so a reused database keeps
  // every prior run's rows — ids and the queried actor must be unique per run.
  const run = randomUUID().slice(0, 8);

  const rec = (id: string, fnName: string): AuditRecord => ({
    id: `${id}-${run}`,
    timestamp: new Date().toISOString(),
    tenantId: `tenant-${run}`,
    traceId: `trace-${id}-${run}`,
    actor: { type: 'user', id: `u-fn-${run}`, roles: ['bsa_officer'] },
    operation: { type: 'function', functionName: fnName },
    detail: { result: 'success' },
  });

  it('round-trips a function invocation, including the function name', async () => {
    await store.append(rec('fnaudit-1', 'ScoreRisk'));

    const [got] = await store.query({ traceId: `trace-fnaudit-1-${run}` });

    expect(got!.operation.type).toBe('function');
    expect(got!.operation.functionName).toBe('ScoreRisk');
  });

  it('filters by operationType', async () => {
    await store.append(rec('fnaudit-2', 'ScoreRisk'));

    const records = await store.query({ operationType: 'function', functionName: 'ScoreRisk', actorId: `u-fn-${run}` });

    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records.every(r => r.operation.type === 'function')).toBe(true);
  });
});

describeWithPg('PostgresAuditStore — tenant scoping', () => {
  let pool: Pool;
  let store: PostgresAuditStore;
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    pool = new Pool(parseUrl(PG_TEST_URL!));
    store = new PostgresAuditStore(pool);
    for (const stmt of generateAuditDDL()) await pool.query(stmt);
  });

  afterAll(async () => { await pool.end(); });

  const rec = (tenantId: string, actorId: string): AuditRecord => ({
    id: `tenant-${actorId}-${run}`,
    timestamp: new Date().toISOString(),
    traceId: `trace-${actorId}-${run}`,
    tenantId,
    actor: { type: 'user', id: actorId, roles: ['clinician'] },
    // Same object id in both tenants — the case that makes an unscoped read a
    // leak rather than a nuisance, since ids are unique only per tenant.
    operation: { type: 'read', objectType: 'Patient', objectId: 'p-1' },
    detail: { result: 'success' },
  });

  it('round-trips the tenant that produced the record', async () => {
    await store.append(rec(`ten-a-${run}`, `alice-${run}`));

    const [got] = await store.query({ traceId: `trace-alice-${run}-${run}` });

    expect(got!.tenantId).toBe(`ten-a-${run}`);
  });

  it('never returns another tenant records for the same object id', async () => {
    await store.append(rec(`ten-b-${run}`, `bob-${run}`));

    const forB = await store.query({ tenantId: `ten-b-${run}`, objectId: 'p-1' });

    expect(forB).toHaveLength(1);
    expect(forB[0]!.actor.id).toBe(`bob-${run}`);
  });
});
