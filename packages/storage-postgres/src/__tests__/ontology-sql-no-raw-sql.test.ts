/**
 * SQL Studio must never run caller SQL against physical tables.
 *
 * PostgresOntologySqlService.execute once did `pool.query(`${sql} LIMIT n`)` with
 * `ctx` ignored — arbitrary, cross-tenant, unredacted SQL on the privileged
 * pool. It now evaluates a SELECT subset over object types read through a
 * tenant-scoped ObjectManager reader, and never sends user SQL to the pool.
 *
 * These tests fail against the old raw-SQL implementation and pass against the
 * governed one; no live database is needed because the whole point is that
 * user SQL must not reach the pool.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import type { RequestContext } from '@altius/spi';
import { PostgresOntologySqlService } from '../postgres-platform-stores.js';

const ctxA: RequestContext = { tenantId: 'tenant-a', actorId: 'user-a' };

describe('PostgresOntologySqlService — no raw SQL egress', () => {
  it('evaluates over the tenant-scoped reader, never sending user SQL to the pool', async () => {
    const poolQuery = vi.fn(async () => ({ rows: [], rowCount: 0, fields: [] }));
    const pool = { query: poolQuery } as unknown as Pool;

    const readerCalls: Array<{ tenantId: string; objectType: string }> = [];
    const reader = async (ctx: RequestContext, objectType: string) => {
      readerCalls.push({ tenantId: ctx.tenantId, objectType });
      return [
        { id: 'p1', properties: { _id: 'p1', name: 'Alice', nhsNumber: '9990000018' } },
        { id: 'p2', properties: { _id: 'p2', name: 'Bob', nhsNumber: '9990000026' } },
      ];
    };

    const svc = new PostgresOntologySqlService(pool, reader);
    const result = await svc.execute(ctxA, "SELECT * FROM Patient WHERE name = 'Alice'");

    // The reader was consulted for the object type, scoped to the caller's tenant.
    expect(readerCalls).toEqual([{ tenantId: 'tenant-a', objectType: 'Patient' }]);
    // The WHERE ran in the engine, not in SQL.
    expect(result.totalRowCount).toBe(1);
    expect(result.rows[0]![0]!['name']).toBe('Alice');
    // Crucially: no caller SQL ever reached the pool.
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('cannot be used to run injected / cross-schema SQL against the pool', async () => {
    const poolQuery = vi.fn(async () => ({ rows: [{ leaked: true }], rowCount: 1, fields: [{ name: 'leaked' }] }));
    const pool = { query: poolQuery } as unknown as Pool;
    const reader = async () => [] as Array<{ id: string; properties: Record<string, unknown> }>;

    const svc = new PostgresOntologySqlService(pool, reader);
    // A payload that, under the old raw path, would have read another schema.
    await svc.execute(ctxA, 'SELECT * FROM governance.agent_holds; DROP TABLE patient');
    await svc.validate(ctxA, 'SELECT * FROM governance.agent_holds');

    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('is read-inert (empty, never raw SQL) when no reader is wired', async () => {
    const poolQuery = vi.fn(async () => ({ rows: [{ x: 1 }], rowCount: 1, fields: [{ name: 'x' }] }));
    const pool = { query: poolQuery } as unknown as Pool;

    const svc = new PostgresOntologySqlService(pool); // no reader
    const result = await svc.execute(ctxA, 'SELECT * FROM Patient');

    expect(result.rows).toEqual([]);
    expect(result.totalRowCount).toBe(0);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
