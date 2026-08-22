/**
 * DatasetService conformance — the same assertions against every provider.
 *
 * The rest of this suite takes a StorageProvider, because that is what the
 * other categories exercise. DatasetService is not part of StorageProvider, so
 * this category takes a service factory instead and both providers' test files
 * call it with their own.
 *
 * It exists because of a specific defect. `create` on an existing name used to
 * overwrite it, discarding rows and transaction log — invisible in memory,
 * where a developer just gets a fresh Map, and irrecoverable on Postgres. The
 * two implementations were each internally consistent and each had passing
 * tests; nothing compared them. A contract asserted once per provider is not a
 * contract, it is two contracts that happen to agree today.
 *
 * So the rule this file enforces is: a DatasetService behaviour changes in
 * every provider or in none. Anything asserted here must hold for all of them.
 */

import { describe, it, expect } from 'vitest';
import type { DatasetService, DatasetSchema, RequestContext } from '@altius/spi';

export type DatasetServiceFactory = () => DatasetService | Promise<DatasetService>;

const SCHEMA: DatasetSchema = {
  columns: [
    { name: 'id', type: 'integer', nullable: false },
    { name: 'name', type: 'string', nullable: false },
    { name: 'age', type: 'integer', nullable: true },
  ],
  primaryKey: ['id'],
  version: 1,
};

/** The code a transport reads to pick a status. Undefined means it saw a crash. */
function codeOf(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

export function registerDatasetServiceTests(providerName: string, factory: DatasetServiceFactory): void {
  describe(`[${providerName}] SPI Conformance: DatasetService contract`, () => {
    // Postgres keeps state between tests where a fresh Map does not, so every
    // case works on a name no other case touches.
    let counter = 0;
    const nameFor = (label: string) => `conf_${label}_${Date.now().toString(36)}_${counter++}`;

    describe('external sources round-trip', () => {
      // A dataset that reads a file in place stores where those rows live and
      // nothing else. Postgres keeps it in a JSONB column and memory in a
      // field; a provider that drops it on the way in or out turns an external
      // dataset into an empty ordinary one, which reads as "the source has no
      // rows" rather than as a fault.
      const source = { format: 'parquet', blobId: 'blob-abc-123' } as const;

      it('returns the source it was created with', async () => {
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('external');

        const created = await svc.create(ctx, { name, schema: SCHEMA, externalSource: { ...source } });
        expect(created.externalSource).toEqual(source);
        expect((await svc.get(ctx, name))!.externalSource).toEqual(source);
      });

      it('lists an external dataset alongside ordinary ones, still carrying its source', async () => {
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf-list', actorId: 'u1' };
        const external = nameFor('ext_listed');
        const ordinary = nameFor('ord_listed');

        await svc.create(ctx, { name: external, schema: SCHEMA, externalSource: { ...source } });
        await svc.create(ctx, { name: ordinary, schema: SCHEMA });

        const listed = await svc.list(ctx);
        expect(listed.find(d => d.name === external)?.externalSource).toEqual(source);
        // An ordinary dataset must not acquire one.
        expect(listed.find(d => d.name === ordinary)?.externalSource).toBeUndefined();
      });

      it('leaves an ordinary dataset without a source', async () => {
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('ordinary');
        const created = await svc.create(ctx, { name, schema: SCHEMA });
        expect(created.externalSource).toBeUndefined();
        expect((await svc.get(ctx, name))!.externalSource).toBeUndefined();
      });
    });

    describe('create is non-destructive', () => {
      it('refuses a name that already exists', async () => {
        const svc = await factory();
        const name = nameFor('dup');
        await svc.create({ tenantId: 't-conf', actorId: 'u1' }, { name, schema: SCHEMA });
        await expect(
          svc.create({ tenantId: 't-conf', actorId: 'u1' }, { name, schema: SCHEMA }),
        ).rejects.toThrow(/already exists/i);
      });

      it('reports the refusal as a conflict rather than a crash', async () => {
        // Without a code the REST layer categorises the error as 'system',
        // answers 500 and withholds the message — a deliberate refusal made
        // indistinguishable from a bug.
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('code');
        await svc.create(ctx, { name, schema: SCHEMA });
        const err = await svc.create(ctx, { name, schema: SCHEMA }).catch(e => e);
        expect(codeOf(err)).toBe('ALREADY_EXISTS');
      });

      it('leaves the existing rows and transaction log untouched after refusing', async () => {
        // The assertion that actually matters: the refusal must not be a
        // half-done replace. This is what fails if `create` deletes first and
        // only then discovers the conflict.
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('intact');
        await svc.create(ctx, { name, schema: SCHEMA });
        await svc.insert(ctx, name, { rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] });

        await expect(svc.create(ctx, { name, schema: SCHEMA })).rejects.toThrow();

        const read = await svc.read(ctx, name);
        expect(read.rows).toHaveLength(2);
        expect(await svc.listTransactions(ctx, name)).toHaveLength(1);
      });

      it('allows the name again once the dataset is dropped', async () => {
        // Refusing must not make a name permanently unusable — drop is the
        // deliberate, explicit way to destroy a dataset.
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('recreate');
        await svc.create(ctx, { name, schema: SCHEMA });
        await svc.drop(ctx, name);
        const again = await svc.create(ctx, { name, schema: SCHEMA });
        expect(again.name).toBe(name);
        expect((await svc.read(ctx, name)).rows).toHaveLength(0);
      });

      it('scopes the name clash to one tenant', async () => {
        const svc = await factory();
        const name = nameFor('tenants');
        await svc.create({ tenantId: 't-conf-a', actorId: 'u1' }, { name, schema: SCHEMA });
        const other = await svc.create({ tenantId: 't-conf-b', actorId: 'u1' }, { name, schema: SCHEMA });
        expect(other.name).toBe(name);
      });
    });

    describe('refusals carry a code', () => {
      it('reports a missing dataset as not-found', async () => {
        const svc = await factory();
        const err = await svc
          .insert({ tenantId: 't-conf', actorId: 'u1' }, nameFor('missing'), { rows: [{ id: 1 }] })
          .catch(e => e);
        expect(String(err?.message)).toMatch(/not found/i);
        expect(codeOf(err)).toBe('OBJECT_NOT_FOUND');
      });

      it('refuses a duplicate branch', async () => {
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('branchdup');
        await svc.create(ctx, { name, schema: SCHEMA });
        await svc.createBranch(ctx, name, 'dev');
        const err = await svc.createBranch(ctx, name, 'dev').catch(e => e);
        expect(String(err?.message)).toMatch(/already exists/i);
        expect(codeOf(err)).toBe('ALREADY_EXISTS');
      });

      it('refuses a merge from a branch that does not exist', async () => {
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('mergemissing');
        await svc.create(ctx, { name, schema: SCHEMA });
        const err = await svc.mergeBranch(ctx, name, 'nope').catch(e => e);
        expect(String(err?.message)).toMatch(/not found/i);
        expect(codeOf(err)).toBe('OBJECT_NOT_FOUND');
      });
    });

    describe('row semantics agree across providers', () => {
      // Both providers call the same helpers from @altius/spi, which is only
      // half the guarantee — this is the half that checks they are wired to
      // them the same way.
      it('reads back what was inserted', async () => {
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('rw');
        await svc.create(ctx, { name, schema: SCHEMA });
        const res = await svc.insert(ctx, name, {
          rows: [{ id: 1, name: 'Alice', age: 30 }, { id: 2, name: 'Bob', age: 25 }],
        });
        expect(res.rowsWritten).toBe(2);
        const read = await svc.read(ctx, name);
        expect(read.rows).toHaveLength(2);
        expect(read.total).toBe(2);
      });

      it('replaces on a primary-key collision and counts it as an upsert', async () => {
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('upsert');
        await svc.create(ctx, { name, schema: SCHEMA });
        await svc.insert(ctx, name, { rows: [{ id: 1, name: 'Alice', age: 30 }] });
        const res = await svc.insert(ctx, name, {
          rows: [{ id: 1, name: 'Alice Updated', age: 31 }],
          upsert: true,
        });
        expect(res.rowsUpserted).toBe(1);
        const read = await svc.read(ctx, name);
        expect(read.rows).toHaveLength(1);
        expect(read.rows[0]!['name']).toBe('Alice Updated');
      });

      it('applies filter, projection, ordering and limit the same way', async () => {
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('query');
        await svc.create(ctx, { name, schema: SCHEMA });
        await svc.insert(ctx, name, {
          rows: [
            { id: 1, name: 'Charlie', age: 30 },
            { id: 2, name: 'Alice', age: 25 },
            { id: 3, name: 'Bob', age: 35 },
          ],
        });
        const read = await svc.read(ctx, name, {
          filter: { age: { gte: 25 } },
          columns: ['name', 'age'],
          orderBy: [{ field: 'name', direction: 'asc' }],
          limit: 2,
        });
        expect(read.rows).toHaveLength(2);
        expect(read.rows.map(r => r['name'])).toEqual(['Alice', 'Bob']);
        expect(read.rows[0]!['id']).toBeUndefined();
      });

      it('keeps branch writes out of the parent branch', async () => {
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('branchiso');
        await svc.create(ctx, { name, schema: SCHEMA });
        await svc.insert(ctx, name, { rows: [{ id: 1, name: 'Alice' }] });
        await svc.createBranch(ctx, name, 'dev');
        await svc.insert(ctx, name, { rows: [{ id: 2, name: 'Bob' }] }, 'dev');
        expect((await svc.read(ctx, name)).rows).toHaveLength(1);
        expect((await svc.read(ctx, name, undefined, 'dev')).rows).toHaveLength(2);
      });

      it('rebuilds a snapshot from the transaction log', async () => {
        const svc = await factory();
        const ctx: RequestContext = { tenantId: 't-conf', actorId: 'u1' };
        const name = nameFor('snapshot');
        await svc.create(ctx, { name, schema: SCHEMA });
        const first = await svc.insert(ctx, name, { rows: [{ id: 1, name: 'Alice' }] });
        await svc.insert(ctx, name, { rows: [{ id: 2, name: 'Bob' }] });
        const snap = await svc.read(ctx, name, { asOfTransactionId: first.transactionId });
        expect(snap.rows).toHaveLength(1);
        expect(snap.rows[0]!['name']).toBe('Alice');
      });
    });
  });
}
