/**
 * Tests for versioned transactional datasets.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDatasetService } from '../in-memory-datasets.js';
import type { DatasetSchema, RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

const SCHEMA: DatasetSchema = {
  columns: [
    { name: 'id', type: 'integer', nullable: false },
    { name: 'name', type: 'string', nullable: false },
    { name: 'age', type: 'integer', nullable: true },
  ],
  primaryKey: ['id'],
  version: 1,
};

describe('InMemoryDatasetService', () => {
  let service: InMemoryDatasetService;

  beforeEach(() => {
    service = new InMemoryDatasetService();
  });

  it('creates and retrieves a dataset', async () => {
    const ds = await service.create(CTX, { name: 'patients', schema: SCHEMA });
    expect(ds.name).toBe('patients');
    expect(ds.branch).toBe('main');
    const fetched = await service.get(CTX, 'patients');
    expect(fetched?.name).toBe('patients');
  });

  it('lists datasets', async () => {
    await service.create(CTX, { name: 'a', schema: SCHEMA });
    await service.create(CTX, { name: 'b', schema: SCHEMA });
    const list = await service.list(CTX);
    expect(list).toHaveLength(2);
  });

  it('inserts and reads rows', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    const result = await service.insert(CTX, 'patients', {
      rows: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ],
    });
    expect(result.rowsWritten).toBe(2);
    const read = await service.read(CTX, 'patients');
    expect(read.rows).toHaveLength(2);
    expect(read.total).toBe(2);
  });

  it('upserts rows on primary key', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    await service.insert(CTX, 'patients', { rows: [{ id: 1, name: 'Alice', age: 30 }] });
    const result = await service.insert(CTX, 'patients', {
      rows: [{ id: 1, name: 'Alice Updated', age: 31 }],
      upsert: true,
    });
    expect(result.rowsUpserted).toBe(1);
    const read = await service.read(CTX, 'patients');
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0]!.name).toBe('Alice Updated');
  });

  it('updates rows by filter', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    await service.insert(CTX, 'patients', {
      rows: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ],
    });
    const result = await service.update(CTX, 'patients', { id: { eq: 1 } }, { age: 31 });
    expect(result.rowsWritten).toBe(1);
    const read = await service.read(CTX, 'patients', { filter: { id: { eq: 1 } } });
    expect(read.rows[0]!.age).toBe(31);
  });

  it('deletes rows by filter', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    await service.insert(CTX, 'patients', {
      rows: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ],
    });
    const result = await service.delete(CTX, 'patients', { id: { eq: 1 } });
    expect(result.rowsWritten).toBe(1);
    const read = await service.read(CTX, 'patients');
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0]!.name).toBe('Bob');
  });

  it('truncates a dataset', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    await service.insert(CTX, 'patients', { rows: [{ id: 1, name: 'Alice' }] });
    const result = await service.truncate(CTX, 'patients');
    expect(result.rowsWritten).toBe(1);
    const read = await service.read(CTX, 'patients');
    expect(read.rows).toHaveLength(0);
  });

  it('reads with filter, columns, orderBy, limit, offset', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    await service.insert(CTX, 'patients', {
      rows: [
        { id: 1, name: 'Charlie', age: 30 },
        { id: 2, name: 'Alice', age: 25 },
        { id: 3, name: 'Bob', age: 35 },
      ],
    });
    const read = await service.read(CTX, 'patients', {
      filter: { age: { gte: 25 } },
      columns: ['name', 'age'],
      orderBy: [{ field: 'name', direction: 'asc' }],
      limit: 2,
    });
    expect(read.rows).toHaveLength(2);
    expect(read.rows[0]!.name).toBe('Alice');
    expect(read.rows[1]!.name).toBe('Bob');
    expect(read.rows[0]!.id).toBeUndefined();
  });

  it('records and lists transactions', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    await service.insert(CTX, 'patients', { rows: [{ id: 1, name: 'Alice' }] });
    await service.insert(CTX, 'patients', { rows: [{ id: 2, name: 'Bob' }] });
    const txs = await service.listTransactions(CTX, 'patients');
    expect(txs).toHaveLength(2);
    expect(txs[0]!.type).toBe('insert');
  });

  it('reads as of a specific transaction (snapshot isolation)', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    const r1 = await service.insert(CTX, 'patients', { rows: [{ id: 1, name: 'Alice' }] });
    await service.insert(CTX, 'patients', { rows: [{ id: 2, name: 'Bob' }] });
    // Read as of the first transaction — should only see Alice
    const read = await service.read(CTX, 'patients', { asOfTransactionId: r1.transactionId });
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0]!.name).toBe('Alice');
  });

  it('creates and lists branches', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    await service.insert(CTX, 'patients', { rows: [{ id: 1, name: 'Alice' }] });
    const branch = await service.createBranch(CTX, 'patients', 'dev');
    expect(branch.name).toBe('dev');
    expect(branch.parentBranch).toBe('main');
    const branches = await service.listBranches(CTX, 'patients');
    expect(branches).toHaveLength(2);
  });

  it('isolates writes between branches', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    await service.insert(CTX, 'patients', { rows: [{ id: 1, name: 'Alice' }] });
    await service.createBranch(CTX, 'patients', 'dev');
    // Write to dev branch
    await service.insert(CTX, 'patients', { rows: [{ id: 2, name: 'Bob' }] }, 'dev');
    // Main should not see Bob
    const mainRead = await service.read(CTX, 'patients');
    expect(mainRead.rows).toHaveLength(1);
    // Dev should see both
    const devRead = await service.read(CTX, 'patients', undefined, 'dev');
    expect(devRead.rows).toHaveLength(2);
  });

  it('merges a branch into main', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    await service.insert(CTX, 'patients', { rows: [{ id: 1, name: 'Alice' }] });
    await service.createBranch(CTX, 'patients', 'dev');
    await service.insert(CTX, 'patients', { rows: [{ id: 2, name: 'Bob' }] }, 'dev');
    const result = await service.mergeBranch(CTX, 'patients', 'dev');
    expect(result.transactionsApplied).toBe(1);
    const mainRead = await service.read(CTX, 'patients');
    expect(mainRead.rows).toHaveLength(2);
  });

  it('updates schema and records schema_change transaction', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    const newSchema: DatasetSchema = {
      columns: [...SCHEMA.columns, { name: 'email', type: 'string', nullable: true }],
      primaryKey: ['id'],
      version: 2,
    };
    const updated = await service.updateSchema(CTX, 'patients', newSchema);
    expect(updated.schema.version).toBe(2);
    expect(updated.schema.columns).toHaveLength(4);
    const txs = await service.listTransactions(CTX, 'patients');
    const schemaTx = txs.find(t => t.type === 'schema_change');
    expect(schemaTx).toBeDefined();
    expect(schemaTx!.schemaVersion).toBe(2);
  });

  it('drops a dataset', async () => {
    await service.create(CTX, { name: 'patients', schema: SCHEMA });
    await service.drop(CTX, 'patients');
    const fetched = await service.get(CTX, 'patients');
    expect(fetched).toBeNull();
  });
});
