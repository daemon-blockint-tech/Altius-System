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
});
