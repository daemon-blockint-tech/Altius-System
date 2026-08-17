/**
 * Caller properties must not reach the row as system columns.
 *
 * The memory provider let a supplied `_type` override the computed one, so a
 * row could report a type it was not stored as — misleading every control that
 * trusts `_type` — and `_tenantId` crossed a tenant boundary outright.
 *
 * Postgres already refused both, but by accident: snakeCase strips the leading
 * underscore, so `_type` became a `type` column that does not exist and the
 * insert raised 42703. That protection evaporates the moment an ObjectType
 * declares a property actually called `type`, and a 42703 is a poor way to
 * express "you may not set this". The columns are now filtered deliberately.
 *
 * Asserted against the generated SQL rather than a live database, so it runs
 * everywhere rather than only where PG_TEST_URL is set — which is what let the
 * equivalent gap sit unnoticed on this path.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import type { RequestContext } from '@altius/spi';
import { createObject } from '../objects/object-crud.js';

const CTX: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 'trace-1' };

function mockPool(): { pool: Pool; sql: () => string; params: () => unknown[] } {
  const query = vi.fn().mockResolvedValue({
    rows: [{
      _tenant_id: 'tenant-1', _id: 'x', _type: 'Note', _version: 1,
      _created_at: new Date('2026-01-01T00:00:00Z'),
      _updated_at: new Date('2026-01-01T00:00:00Z'),
      _deleted_at: null,
    }],
  });
  return {
    pool: { query } as unknown as Pool,
    sql: () => String(query.mock.calls[0]![0]),
    params: () => query.mock.calls[0]![1] as unknown[],
  };
}

describe('createObject column building', () => {
  it('does not emit a column for a forged _type', async () => {
    const { pool, sql, params } = mockPool();

    await createObject(pool, CTX, 'Note', { text: 'x', _type: 'Patient' });

    // Neither the stripped form nor the raw one.
    expect(sql()).not.toMatch(/"type"/);
    expect(params()).not.toContain('Patient');
    // The declared type is still written, from the argument.
    expect(params()).toContain('Note');
  });

  it('does not emit a column for a forged _tenantId', async () => {
    const { pool, sql, params } = mockPool();

    await createObject(pool, CTX, 'Note', { text: 'x', _tenantId: 'other-tenant' });

    expect(sql()).not.toMatch(/"tenant_id"/);
    expect(params()).not.toContain('other-tenant');
    expect(params()).toContain('tenant-1');
  });

  it('ignores any underscore-prefixed property, not just the exploited ones', async () => {
    // The rule is the leading underscore, so a system column added later is
    // covered without anyone remembering to extend a list.
    const { pool, sql } = mockPool();

    await createObject(pool, CTX, 'Note', { text: 'x', _version: 99, _addedLater: 'y' });

    expect(sql()).not.toMatch(/"added_later"/);
    expect(sql()).toMatch(/"text"/);
  });

  it('still writes ordinary properties', async () => {
    const { pool, sql, params } = mockPool();

    await createObject(pool, CTX, 'Note', { text: 'kept', count: 3 });

    expect(sql()).toMatch(/"text"/);
    expect(sql()).toMatch(/"count"/);
    expect(params()).toContain('kept');
    expect(params()).toContain(3);
  });
});
