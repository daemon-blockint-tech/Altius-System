/**
 * Row mapping for links.
 *
 * The link mappers (link-crud's rowToLink, traversal's rowToLink) carried the
 * same hand-written system-column list as the object mappers. Unlike those,
 * they have not drifted: link tables genuinely have no `_actor_id`
 * (generateLinkTableDDL emits none), and the enumerated list covered every
 * column the DDL does emit.
 *
 * So this does not pin a live defect — it pins the property the enumerated list
 * could not have. A column added to the link DDL later is recognised as system
 * metadata without anyone remembering to update a list, which is precisely the
 * failure that hit the object mappers: `_actor_id` was added to the generator,
 * one of six copies learned about it, and the rest silently reclassified it as
 * user data.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import type { RequestContext } from '@altius/spi';
import { getLink } from '../links/link-crud.js';

function createMockPool(rows: Record<string, unknown>[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

const CTX: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 'trace-1' };

/** A link row as generateLinkTableDDL shapes it. */
function linkRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _tenant_id: 'tenant-1',
    _id: 'link-1',
    _type: 'AdmittedTo',
    _from_type: 'Patient',
    _from_id: 'patient-1',
    _to_type: 'Ward',
    _to_id: 'ward-1',
    _version: 1,
    _created_at: new Date('2026-01-01T00:00:00Z'),
    _updated_at: new Date('2026-01-01T00:00:00Z'),
    _deleted_at: null,
    reason: 'admission',
    ...overrides,
  };
}

describe('link row mapping', () => {
  it('returns the link properties', async () => {
    const pool = createMockPool([linkRow()]);

    const link = await getLink(pool, CTX, 'AdmittedTo', 'link-1');

    expect(link).not.toBeNull();
    expect(link!['reason']).toBe('admission');
  });

  it('treats an unrecognised system column as metadata, not user data', async () => {
    // The enumerated list this replaced could only recognise columns someone
    // had remembered to add to it. A column the DDL gains later would have been
    // renamed by the snake-to-camel mapper and served as an ordinary property —
    // with no leading underscore, so redactObject would not skip it either.
    const pool = createMockPool([linkRow({ _added_to_ddl_later: 'x' })]);

    const link = await getLink(pool, CTX, 'AdmittedTo', 'link-1');

    expect(Object.keys(link!)).not.toContain('AddedToDdlLater');
    // And the real link properties still come through.
    expect(link!['reason']).toBe('admission');
  });
});
