/**
 * The in-memory provider gives atomicity AND snapshot isolation.
 *
 * `supportsTransactions: true` reads as ACID. This provider implements
 * snapshot-on-begin: each transaction shallow-copies the committed Maps at
 * open time and writes to its own copy. Reads with the transaction's
 * RequestContext see the snapshot+overlay (read-your-writes); all other
 * readers see committed state only. Commit flushes only changed keys.
 *
 * These pin the declared capability to the observed behaviour, so the flag
 * cannot drift from reality: if someone removes the snapshot, the isolation
 * case fails and forces the flag to be flipped with it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../memory-storage-provider.js';
import type { RequestContext, OntologySchema } from '@altius/spi';

const ctx: RequestContext = { tenantId: 't-1', actorId: 'u-1' };
const otherCtx: RequestContext = { tenantId: 't-1', actorId: 'u-2' };

const schema: OntologySchema = {
  version: 1,
  objectTypes: [{ name: 'Ward', properties: [{ name: 'name', type: 'String' }] }],
  linkTypes: [],
};

let storage: MemoryStorageProvider;

beforeEach(async () => {
  storage = new MemoryStorageProvider();
  await storage.applySchema(ctx, schema);
});

describe('in-memory transaction guarantees', () => {
  it('declares atomicity with isolation', () => {
    const caps = storage.capabilities();

    expect(caps.supportsTransactions).toBe(true);
    expect(caps.supportsTransactionIsolation).toBe(true);
  });

  it('rolls back completely — atomicity holds', async () => {
    const txn = await storage.beginTransaction(ctx);
    const created = await txn.createObject('Ward', { name: 'Alpha' });
    await txn.rollback();

    await expect(storage.getObject(ctx, 'Ward', created._id)).resolves.toBeNull();
  });

  it('hides uncommitted writes from a concurrent reader — isolation holds', async () => {
    const txn = await storage.beginTransaction(ctx);
    const created = await txn.createObject('Ward', { name: 'Alpha' });

    // Read OUTSIDE the transaction with a different RequestContext.
    // Postgres would return null here; so does the in-memory provider now.
    const seenBeforeCommit = await storage.getObject(otherCtx, 'Ward', created._id);
    expect(seenBeforeCommit).toBeNull();

    await txn.rollback();
  });

  it('detects write-write conflict at commit — lost update is prevented', async () => {
    // Two transactions both read v1. T1 writes+commits v2. T2 writes with
    // expectedVersion=1 (passes against the stale snapshot) and commits.
    // Without a commit-time re-check, T2's write silently overwrites T1's.
    // Postgres catches this in the UPDATE WHERE clause; memory must catch
    // it at commit, the only place the committed Maps are touched.
    const obj = await storage.createObject(ctx, 'Ward', { name: 'A' });

    const t1 = await storage.beginTransaction(ctx);
    const t2 = await storage.beginTransaction(ctx);

    await t1.updateObject('Ward', obj._id, { name: 'B' }, 1);
    await t2.updateObject('Ward', obj._id, { name: 'C' }, 1);

    await t1.commit();

    // T2's commit must fail: the committed version is now 2, but T2's
    // snapshot was based on version 1 — a concurrent modification T2 did
    // not see.
    await expect(t2.commit()).rejects.toThrow(/VERSION_CONFLICT/);

    // T1's write survives; T2's is not applied.
    const final = await storage.getObject(ctx, 'Ward', obj._id);
    expect(final?.name).toBe('B');
    expect(final?._version).toBe(2);
  });

  it('allows a transaction to commit when no concurrent modification happened', async () => {
    const obj = await storage.createObject(ctx, 'Ward', { name: 'A' });

    const txn = await storage.beginTransaction(ctx);
    await txn.updateObject('Ward', obj._id, { name: 'B' }, 1);
    await txn.commit();

    const final = await storage.getObject(ctx, 'Ward', obj._id);
    expect(final?.name).toBe('B');
    expect(final?._version).toBe(2);
  });
});

describe('deletes participate in the lost-update check', () => {
  it('refuses a soft delete that would erase a concurrently committed update', async () => {
    const obj = await storage.createObject(ctx, 'Ward', { name: 'A' });

    const t1 = await storage.beginTransaction(ctx);
    const t2 = await storage.beginTransaction(ctx);

    await t1.updateObject('Ward', obj._id, { name: 'B' }, 1);
    await t2.deleteObject('Ward', obj._id, 'soft');

    await t1.commit();
    await expect(t2.commit()).rejects.toThrow(/VERSION_CONFLICT/);

    const final = await storage.getObject(ctx, 'Ward', obj._id);
    expect(final?.name).toBe('B');
    expect(final?._deletedAt).toBeUndefined();
  });

  it('refuses a hard delete that would erase a concurrently committed update', async () => {
    const obj = await storage.createObject(ctx, 'Ward', { name: 'A' });

    const t1 = await storage.beginTransaction(ctx);
    const t2 = await storage.beginTransaction(ctx);

    await t1.updateObject('Ward', obj._id, { name: 'B' }, 1);
    await t2.deleteObject('Ward', obj._id, 'hard');

    await t1.commit();
    await expect(t2.commit()).rejects.toThrow(/VERSION_CONFLICT/);

    expect(await storage.getObject(ctx, 'Ward', obj._id)).toBeTruthy();
  });

  it('refuses a restore racing another committed restore', async () => {
    const obj = await storage.createObject(ctx, 'Ward', { name: 'A' });
    await storage.deleteObject(ctx, 'Ward', obj._id, 'soft');

    // Both snapshots see the object deleted at v2, so both believe they are
    // the restorer. Only the first commit may win.
    const t1 = await storage.beginTransaction(ctx);
    const t2 = await storage.beginTransaction(ctx);

    await t1.restoreObject('Ward', obj._id);
    await t2.restoreObject('Ward', obj._id);

    await t1.commit();
    await expect(t2.commit()).rejects.toThrow(/VERSION_CONFLICT/);

    const final = await storage.getObject(ctx, 'Ward', obj._id);
    expect(final?._version).toBe(3);
  });

  it('still allows an uncontended delete', async () => {
    const obj = await storage.createObject(ctx, 'Ward', { name: 'A' });

    const txn = await storage.beginTransaction(ctx);
    await txn.deleteObject('Ward', obj._id, 'soft');
    await txn.commit();

    expect(await storage.getObject(ctx, 'Ward', obj._id)).toBeNull();
  });
});
