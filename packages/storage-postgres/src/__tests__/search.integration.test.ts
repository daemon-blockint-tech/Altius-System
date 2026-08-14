/**
 * Integration tests for full-text search — FULLTEXT trigram index path.
 *
 * Verifies the DDL/runtime pairing: FULLTEXT IndexDefinitions emit pg_trgm
 * GIN indexes, and the ILIKE queries issued by searchObjects can be served
 * by them (SPI substring semantics preserved).
 *
 * Requires a running PostgreSQL instance. Set PG_TEST_URL env var or
 * these tests will be skipped.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RequestContext, OntologySchema } from '@altius/spi';
import { PostgresStorageProvider } from '../postgres-storage-provider.js';

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

describeWithPg('searchObjects with FULLTEXT trigram index (integration)', () => {
  let provider: PostgresStorageProvider;
  const ctx: RequestContext = { tenantId: 'tenant-search-001', actorId: 'test-actor' };

  // Distinct version key: other integration suites record version 1 in the
  // shared _schema_migrations table with different DDL — reusing it would
  // trip the checksum-drift guard depending on file ordering.
  const SCHEMA_VERSION = 424242;

  const schema: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [
      {
        name: 'SearchDoc',
        properties: [
          { name: 'title', type: 'String', required: true },
          { name: 'contactEmail', type: 'String', required: false },
        ],
        indexes: [{ field: 'title', indexType: 'FULLTEXT' }],
      },
    ],
    linkTypes: [],
  };

  beforeAll(async () => {
    provider = new PostgresStorageProvider(parseUrl(PG_TEST_URL!));
    const pool = provider.pool;
    await pool.query(`
      DROP TABLE IF EXISTS "public"."search_doc_history" CASCADE;
      DROP TABLE IF EXISTS "public"."search_doc" CASCADE;
    `);
    await pool.query(
      'DELETE FROM _schema_migrations WHERE version = $1',
      [SCHEMA_VERSION],
    ).catch(() => { /* table may not exist yet on a fresh database */ });
    await provider.applySchema(ctx, schema);

    await provider.createObject(ctx, 'SearchDoc', {
      title: 'Discharge Summary Guidelines',
      contactEmail: 'clerk@hospital.org',
    });
    await provider.createObject(ctx, 'SearchDoc', {
      title: 'Ward Handover Checklist',
      contactEmail: 'nurse@example.com',
    });
    await provider.createObject(ctx, 'SearchDoc', {
      title: 'Summary of Admissions',
      contactEmail: 'admin@hospital.org',
    });
  });

  afterAll(async () => {
    if (provider) {
      await provider.pool.query('DROP TABLE IF EXISTS "public"."search_doc_history" CASCADE');
      await provider.pool.query('DROP TABLE IF EXISTS "public"."search_doc" CASCADE');
      await provider.close();
    }
  });

  it('creates a gin_trgm_ops index for FULLTEXT definitions', async () => {
    const result = await provider.pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'idx_search_doc_title'`,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].indexdef).toContain('gin');
    expect(result.rows[0].indexdef).toContain('gin_trgm_ops');
  });

  it('matches substrings case-insensitively (SPI contract)', async () => {
    const result = await provider.searchObjects(ctx, 'SearchDoc', {
      query: 'summar',
      fields: ['title'],
    });
    expect(result.totalCount).toBe(2);

    // substring inside an email-style token must match too
    const email = await provider.searchObjects(ctx, 'SearchDoc', {
      query: 'HOSPITAL',
      fields: ['contactEmail'],
    });
    expect(email.totalCount).toBe(2);
  });

  it('planner can serve the field-restricted ILIKE from the trigram index', async () => {
    const client = await provider.pool.connect();
    try {
      // Tiny table — seqscan always wins on cost, so disable it to prove
      // the index is *usable* for this predicate shape.
      await client.query('SET enable_seqscan = off');
      const plan = await client.query(
        `EXPLAIN SELECT * FROM "public"."search_doc"
         WHERE "title" ILIKE '%summar%'`,
      );
      const planText = plan.rows.map((r: Record<string, unknown>) => Object.values(r)[0]).join('\n');
      expect(planText).toContain('idx_search_doc_title');
    } finally {
      await client.query('RESET enable_seqscan');
      client.release();
    }
  });
});
