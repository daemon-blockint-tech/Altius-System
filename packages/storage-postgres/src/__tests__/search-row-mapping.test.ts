/**
 * Row mapping for full-text search.
 *
 * search.ts had one of six hand-written system-column lists that decided which
 * `SELECT *` columns are metadata and which are user properties. Only
 * object-crud gained `_actor_id` when the DDL did, so here it fell through to
 * the user-property branch, where the snake-to-camel mapper renames it
 * "ActorId" — a key in no schema. Without a leading underscore, redactObject
 * does not skip it as system metadata: under a field policy it is nulled and
 * named in `_redactedFields`, reporting a redacted field that does not exist;
 * without one, the writer identity is returned to every caller of search.
 *
 * The same list also had to know about the two columns this query synthesises,
 * `_search_score` and `_total_count`, which is a second way for it to drift.
 *
 * Only a Postgres-gated integration test covered this path, so there was no
 * unit-level guard at all. This is that harness.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import type { RequestContext } from '@altius/spi';
import { searchObjects } from '../objects/search.js';

/**
 * Explicit `fields` are passed in every test so search skips its
 * information_schema column-discovery query — a single-response mock cannot
 * answer both that and the row query.
 */
function createMockPool(rows: Record<string, unknown>[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

const CTX: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 'trace-1' };

/** A row as Postgres returns it for this query, including synthesised columns. */
function searchRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _tenant_id: 'tenant-1',
    _id: 'patient-1',
    _type: 'Patient',
    _version: 1,
    _created_at: new Date('2026-01-01T00:00:00Z'),
    _updated_at: new Date('2026-01-01T00:00:00Z'),
    _deleted_at: null,
    // On the object table per ddl-objects.ts:23.
    _actor_id: 'user-9',
    // Synthesised by the search query itself (search.ts:168).
    _search_score: 0.75,
    _total_count: '1',
    nhs_number: '1234567890',
    ...overrides,
  };
}

describe('search row mapping', () => {
  it('returns the user properties', async () => {
    const pool = createMockPool([searchRow()]);

    const result = await searchObjects(pool, CTX, 'Patient', { query: 'smith', fields: ['nhsNumber'] });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]!.object['nhsNumber']).toBe('1234567890');
  });

  it('does not expose system or synthesised columns as user properties', async () => {
    // Reverting the predicate in search.ts to the old enumerated list makes
    // this fail on "ActorId" — the assertion discriminates.
    const pool = createMockPool([searchRow()]);

    const result = await searchObjects(pool, CTX, 'Patient', { query: 'smith', fields: ['nhsNumber'] });
    const keys = Object.keys(result.hits[0]!.object);

    expect(keys).not.toContain('ActorId');
    // The query's own scaffolding must not reach the caller as data either.
    expect(keys).not.toContain('SearchScore');
    expect(keys).not.toContain('TotalCount');
  });
});
