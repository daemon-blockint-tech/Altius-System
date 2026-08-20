/**
 * PostgresDatasetService against real Postgres.
 *
 * Two things are being proven here, and they are different things.
 *
 * 1. PARITY. Every behaviour the in-memory service is tested for
 *    (storage-memory/src/__tests__/datasets.test.ts) is asserted again against
 *    Postgres. A durable implementation that answers reads differently from
 *    the one developers run locally is not a port, it is a second product —
 *    and the divergence would only surface in production.
 *
 * 2. DURABILITY. The restart-survival cases write through one provider, close
 *    it, and read through a completely fresh one. Nothing in a process-local
 *    Map survives that. This is the check that caught #19, and it is the only
 *    evidence that separates "full" from "wired but lossy" in the parity
 *    grading — a service can pass every functional test above while keeping
 *    its state in a field on the instance.
 *
 * Requires PostgreSQL. Set PG_TEST_URL or these are skipped — treat a skip as
 * "unverified", never as "passing". CI sets REQUIRE_PG so a missing database
 * fails the job instead of silently skipping it.
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import type { DatasetSchema, RequestContext, OntologySchema } from '@altius/spi';
import { PostgresStorageProvider } from '../postgres-storage-provider.js';
import { PostgresDatasetService } from '../dataset/postgres-dataset-service.js';
import { PostgresDatasetMetadataService } from '../postgres-platform-stores.js';
import { describeWithPg as pgGate } from './pg-gate.js';

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

const describeWithPg = pgGate;

const TENANT = 'tenant-datasets-001';
const CTX: RequestContext = { tenantId: TENANT, actorId: 'u1' };

const SCHEMA: DatasetSchema = {
  columns: [
    { name: 'id', type: 'integer', nullable: false },
    { name: 'name', type: 'string', nullable: false },
    { name: 'age', type: 'integer', nullable: true },
  ],
  primaryKey: ['id'],
  version: 1,
};

describeWithPg('PostgresDatasetService (integration)', () => {
  let provider: PostgresStorageProvider;
  let service: PostgresDatasetService;

  const SCHEMA_VERSION = 616161;
  const ontology: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [{ name: 'DatasetDoc', properties: [{ name: 'title', type: 'String', required: true }] }],
    linkTypes: [],
  };

  /** A dataset name unique to one test, so cases cannot leak into each other. */
  let seq = 0;
  const freshName = (label: string) => `${label}_${seq++}`;

  beforeAll(async () => {
    provider = new PostgresStorageProvider(parseUrl(PG_TEST_URL!));
    await provider.pool
      .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
      .catch(() => {
        /* table may not exist yet on a fresh database */
      });
    await provider.applySchema(CTX, ontology);
    service = new PostgresDatasetService(provider.pool);
  });

  afterAll(async () => {
    if (!provider) return;
    for (const table of ['rows', 'transactions', 'branches', 'metadata']) {
      await provider.pool
        .query(`DELETE FROM "dataset"."${table}" WHERE "tenant_id" = $1`, [TENANT])
        .catch(() => {});
    }
    await provider.close();
  });

  // ── Parity with the in-memory contract ───────────────────────────────────

  it('creates and retrieves a dataset', async () => {
    const name = freshName('patients');
    const ds = await service.create(CTX, { name, schema: SCHEMA });
    expect(ds.name).toBe(name);
    expect(ds.branch).toBe('main');
    const fetched = await service.get(CTX, name);
    expect(fetched?.name).toBe(name);
    expect(fetched?.schema.columns).toHaveLength(3);
  });

  it('returns null for a dataset that does not exist', async () => {
    expect(await service.get(CTX, 'never_created')).toBeNull();
  });

  it('lists datasets', async () => {
    const a = freshName('list_a');
    const b = freshName('list_b');
    await service.create(CTX, { name: a, schema: SCHEMA });
    await service.create(CTX, { name: b, schema: SCHEMA });
    const names = (await service.list(CTX)).map(d => d.name);
    expect(names).toContain(a);
    expect(names).toContain(b);
  });

  it('inserts and reads rows', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    const result = await service.insert(CTX, name, {
      rows: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ],
    });
    expect(result.rowsWritten).toBe(2);
    const read = await service.read(CTX, name);
    expect(read.rows).toHaveLength(2);
    expect(read.total).toBe(2);
  });

  it('upserts rows on primary key', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice', age: 30 }] });
    const result = await service.insert(CTX, name, {
      rows: [{ id: 1, name: 'Alice Updated', age: 31 }],
      upsert: true,
    });
    expect(result.rowsUpserted).toBe(1);
    const read = await service.read(CTX, name);
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0]!['name']).toBe('Alice Updated');
  });

  it('updates rows by filter', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, {
      rows: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ],
    });
    const result = await service.update(CTX, name, { id: { eq: 1 } }, { age: 31 });
    expect(result.rowsWritten).toBe(1);
    const read = await service.read(CTX, name, { filter: { id: { eq: 1 } } });
    expect(read.rows[0]!['age']).toBe(31);
  });

  it('deletes rows by filter', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, {
      rows: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ],
    });
    const result = await service.delete(CTX, name, { id: { eq: 1 } });
    expect(result.rowsWritten).toBe(1);
    const read = await service.read(CTX, name);
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0]!['name']).toBe('Bob');
  });

  it('truncates a dataset', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice' }] });
    const result = await service.truncate(CTX, name);
    expect(result.rowsWritten).toBe(1);
    expect((await service.read(CTX, name)).rows).toHaveLength(0);
  });

  it('reads with filter, columns, orderBy, limit, offset', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, {
      rows: [
        { id: 1, name: 'Charlie', age: 30 },
        { id: 2, name: 'Alice', age: 25 },
        { id: 3, name: 'Bob', age: 35 },
      ],
    });
    const read = await service.read(CTX, name, {
      filter: { age: { gte: 25 } },
      columns: ['name', 'age'],
      orderBy: [{ field: 'name', direction: 'asc' }],
      limit: 2,
    });
    expect(read.rows).toHaveLength(2);
    expect(read.rows[0]!['name']).toBe('Alice');
    expect(read.rows[1]!['name']).toBe('Bob');
    expect(read.rows[0]!['id']).toBeUndefined();
  });

  it('records and lists transactions', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice' }] });
    await service.insert(CTX, name, { rows: [{ id: 2, name: 'Bob' }] });
    const txs = await service.listTransactions(CTX, name);
    expect(txs).toHaveLength(2);
    expect(txs[0]!.type).toBe('insert');
    // Newest first, and the row payload survives the JSONB round trip.
    expect(txs[0]!.rows[0]!['name']).toBe('Bob');
  });

  it('reads as of a specific transaction (snapshot isolation)', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    const r1 = await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice' }] });
    await service.insert(CTX, name, { rows: [{ id: 2, name: 'Bob' }] });
    const read = await service.read(CTX, name, { asOfTransactionId: r1.transactionId });
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0]!['name']).toBe('Alice');
  });

  it('creates and lists branches', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice' }] });
    const branch = await service.createBranch(CTX, name, 'dev');
    expect(branch.name).toBe('dev');
    expect(branch.parentBranch).toBe('main');
    expect(await service.listBranches(CTX, name)).toHaveLength(2);
  });

  it('rejects a duplicate branch', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.createBranch(CTX, name, 'dev');
    await expect(service.createBranch(CTX, name, 'dev')).rejects.toThrow(/already exists/);
  });

  it('isolates writes between branches', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice' }] });
    await service.createBranch(CTX, name, 'dev');
    await service.insert(CTX, name, { rows: [{ id: 2, name: 'Bob' }] }, 'dev');
    expect((await service.read(CTX, name)).rows).toHaveLength(1);
    expect((await service.read(CTX, name, undefined, 'dev')).rows).toHaveLength(2);
  });

  it('merges a branch into main', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice' }] });
    await service.createBranch(CTX, name, 'dev');
    await service.insert(CTX, name, { rows: [{ id: 2, name: 'Bob' }] }, 'dev');
    const result = await service.mergeBranch(CTX, name, 'dev');
    expect(result.transactionsApplied).toBe(1);
    expect((await service.read(CTX, name)).rows).toHaveLength(2);
  });

  it('updates schema and records a schema_change transaction', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    const newSchema: DatasetSchema = {
      columns: [...SCHEMA.columns, { name: 'email', type: 'string', nullable: true }],
      primaryKey: ['id'],
      version: 2,
    };
    const updated = await service.updateSchema(CTX, name, newSchema);
    expect(updated.schema.version).toBe(2);
    expect(updated.schema.columns).toHaveLength(4);
    const schemaTx = (await service.listTransactions(CTX, name)).find(t => t.type === 'schema_change');
    expect(schemaTx).toBeDefined();
    expect(schemaTx!.schemaVersion).toBe(2);
    // Both sides snapshotted, so a historical schema is reconstructable.
    expect(schemaTx!.schemaSnapshot?.columns).toHaveLength(4);
    expect(schemaTx!.previousSchemaSnapshot?.columns).toHaveLength(3);
  });

  it('drops a dataset', async () => {
    const name = freshName('patients');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.drop(CTX, name);
    expect(await service.get(CTX, name)).toBeNull();
  });

  it('throws for a write to a dataset that does not exist', async () => {
    await expect(service.insert(CTX, 'no_such_dataset', { rows: [{ id: 1 }] })).rejects.toThrow(/not found/);
  });

  // ── Postgres-specific hazards ────────────────────────────────────────────

  it('stores a composite primary key without a NUL byte', async () => {
    // The in-memory service joins composite key parts on a NUL byte. Postgres
    // cannot store NUL in a TEXT column at all, so persisting that key would
    // fail outright — the shared datasetRowKey JSON-encodes instead. This is
    // the regression test for that.
    const name = freshName('composite');
    const composite: DatasetSchema = {
      columns: [
        { name: 'region', type: 'string', nullable: false },
        { name: 'code', type: 'string', nullable: false },
        { name: 'value', type: 'integer', nullable: true },
      ],
      primaryKey: ['region', 'code'],
      version: 1,
    };
    await service.create(CTX, { name, schema: composite });
    await service.insert(CTX, name, {
      rows: [
        { region: 'north', code: 'a', value: 1 },
        { region: 'south', code: 'a', value: 2 },
      ],
    });
    await service.insert(CTX, name, { rows: [{ region: 'north', code: 'a', value: 99 }], upsert: true });
    const read = await service.read(CTX, name, { orderBy: [{ field: 'region', direction: 'asc' }] });
    expect(read.rows).toHaveLength(2);
    expect(read.rows.find(r => r['region'] === 'north')!['value']).toBe(99);
  });

  it('keeps composite keys unambiguous across part boundaries', async () => {
    // ('a b','c') and ('a','b c') are different rows. A key joined on a space
    // would collide them into one; the JSON encoding keeps them apart.
    const name = freshName('ambiguous');
    const composite: DatasetSchema = {
      columns: [
        { name: 'left', type: 'string', nullable: false },
        { name: 'right', type: 'string', nullable: false },
      ],
      primaryKey: ['left', 'right'],
      version: 1,
    };
    await service.create(CTX, { name, schema: composite });
    await service.insert(CTX, name, {
      rows: [
        { left: 'a b', right: 'c' },
        { left: 'a', right: 'b c' },
      ],
    });
    expect((await service.read(CTX, name)).rows).toHaveLength(2);
  });

  it('appends rather than upserts when the schema has no primary key', async () => {
    const name = freshName('nopk');
    const noPk: DatasetSchema = {
      columns: [{ name: 'note', type: 'string', nullable: true }],
      version: 1,
    };
    await service.create(CTX, { name, schema: noPk });
    await service.insert(CTX, name, { rows: [{ note: 'same' }] });
    await service.insert(CTX, name, { rows: [{ note: 'same' }] });
    expect((await service.read(CTX, name)).rows).toHaveLength(2);
  });

  it('isolates datasets between tenants', async () => {
    const name = freshName('tenant_scoped');
    const other: RequestContext = { tenantId: 'tenant-datasets-other', actorId: 'u2' };
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice' }] });
    expect(await service.get(other, name)).toBeNull();
    await provider.pool
      .query(`DELETE FROM "dataset"."metadata" WHERE "tenant_id" = $1`, [other.tenantId])
      .catch(() => {});
  });

  it('rolls a failed write back whole', async () => {
    // The log is the only thing a snapshot read can be rebuilt from, so a write
    // that appended a transaction without its rows (or vice versa) would leave
    // the two permanently disagreeing.
    const name = freshName('atomic');
    await service.create(CTX, { name, schema: SCHEMA });
    await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice' }] });
    const txsBefore = (await service.listTransactions(CTX, name)).length;

    // A row whose JSON cannot be serialised fails mid-write, after the first
    // row has already been inserted inside the transaction.
    const circular: Record<string, unknown> = { id: 2, name: 'Bob' };
    circular['self'] = circular;
    await expect(service.insert(CTX, name, { rows: [{ id: 3, name: 'Carol' }, circular] })).rejects.toThrow();

    expect((await service.read(CTX, name)).rows).toHaveLength(1);
    expect(await service.listTransactions(CTX, name)).toHaveLength(txsBefore);
  });

  // ── Durability: survives losing the process ──────────────────────────────

  it('survives a restart: rows, transactions and branches read back from a fresh provider', async () => {
    const name = freshName('durable');
    await service.create(CTX, { name, schema: SCHEMA, description: 'restart me' });
    await service.insert(CTX, name, {
      rows: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ],
      message: 'seed',
    });
    await service.createBranch(CTX, name, 'dev');
    await service.insert(CTX, name, { rows: [{ id: 3, name: 'Carol' }] }, 'dev');

    // Drop everything process-local: a new provider, a new pool, a new service.
    const restarted = new PostgresStorageProvider(parseUrl(PG_TEST_URL!));
    try {
      const fresh = new PostgresDatasetService(restarted.pool);

      const ds = await fresh.get(CTX, name);
      expect(ds).not.toBeNull();
      expect(ds!.description).toBe('restart me');
      expect(ds!.schema.version).toBe(1);

      const mainRows = await fresh.read(CTX, name);
      expect(mainRows.rows).toHaveLength(2);
      expect(mainRows.rows.map(r => r['name']).sort()).toEqual(['Alice', 'Bob']);

      const devRows = await fresh.read(CTX, name, undefined, 'dev');
      expect(devRows.rows).toHaveLength(3);

      const txs = await fresh.listTransactions(CTX, name);
      expect(txs).toHaveLength(1);
      expect(txs[0]!.message).toBe('seed');

      const branches = await fresh.listBranches(CTX, name);
      expect(branches.map(b => b.name).sort()).toEqual(['dev', 'main']);
    } finally {
      await restarted.close();
    }
  });

  it('survives a restart: a snapshot read still replays the persisted log', async () => {
    const name = freshName('durable_snapshot');
    await service.create(CTX, { name, schema: SCHEMA });
    const first = await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice' }] });
    await service.insert(CTX, name, { rows: [{ id: 2, name: 'Bob' }] });

    const restarted = new PostgresStorageProvider(parseUrl(PG_TEST_URL!));
    try {
      const fresh = new PostgresDatasetService(restarted.pool);
      const snapshot = await fresh.read(CTX, name, { asOfTransactionId: first.transactionId });
      expect(snapshot.rows).toHaveLength(1);
      expect(snapshot.rows[0]!['name']).toBe('Alice');
    } finally {
      await restarted.close();
    }
  });

  it('feeds the metadata service real rows instead of an empty table', async () => {
    // dataset.metadata had no writer before this store existed, so
    // PostgresDatasetMetadataService answered 200 with an empty list for every
    // deployment — a live surface with nothing behind it.
    const name = freshName('metadata_visible');
    await service.create(CTX, { name, schema: SCHEMA, description: 'visible' });
    await service.insert(CTX, name, { rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] });

    const metadata = new PostgresDatasetMetadataService(provider.pool);
    const one = await metadata.get(CTX, name);
    expect(one).not.toBeNull();
    expect(one!.description).toBe('visible');
    expect(one!.rowCount).toBe(2);
    expect((await metadata.getSchema(CTX, name))?.columns).toHaveLength(3);
    expect((await metadata.list(CTX)).map(m => m.name)).toContain(name);
    // listTransactions returned a hardcoded [] before there was a log to read.
    expect(await metadata.listTransactions(CTX, name)).toHaveLength(1);
  });
});
