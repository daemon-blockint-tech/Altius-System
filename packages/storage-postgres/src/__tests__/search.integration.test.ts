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

import { it, expect, beforeAll, afterAll } from 'vitest';
import type { RequestContext, OntologySchema } from '@altius/spi';
import { PostgresStorageProvider } from '../postgres-storage-provider.js';
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

// Gate shared with the other Postgres suites so CI can turn a skip into a
// failure (REQUIRE_PG) instead of a silent pass. See pg-gate.ts.
const describeWithPg = pgGate;

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

  it('emits a per-field _fts tsvector generated column with a GIN index', async () => {
    const colResult = await provider.pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'search_doc' AND column_name = '_fts_title'`,
    );
    expect(colResult.rows).toHaveLength(1);
    expect(colResult.rows[0].data_type).toBe('tsvector');

    const idxResult = await provider.pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'idx_search_doc__fts_title'`,
    );
    expect(idxResult.rows).toHaveLength(1);
    expect(idxResult.rows[0].indexdef).toContain('USING gin');
    // pg_indexes renders the identifier as Postgres normalised it, without the
    // quotes the DDL wrote, so assert on the column name itself.
    expect(idxResult.rows[0].indexdef).toContain('_fts_title');
  });

  it('stemming: query "summary" matches "Summaries" via tsvector (ILIKE cannot)', async () => {
    // Inflections of one word share a lexeme: 'Summaries' and 'summary' both
    // stem to 'summari'. ILIKE '%summary%' does NOT match 'Summaries Report'
    // (no 'summary' substring), so this only passes via the tsvector @@ path.
    //
    // The pair used to be summary/summarize, which the English Snowball
    // stemmer does not relate at all — 'summarize' stems to 'summar' and
    // 'summary' to 'summari'. That assertion had never executed, because the
    // whole suite failed in setup on the FULLTEXT history-column bug.
    await provider.createObject(ctx, 'SearchDoc', {
      title: 'Summaries Report',
      contactEmail: 's@hospital.org',
    });
    const r = await provider.searchObjects(ctx, 'SearchDoc', {
      query: 'summary',
      fields: ['title'],
    });
    const titles = r.hits.map((h) => h.object.title as string);
    expect(titles).toContain('Summaries Report');
  });

  it('field-scoped: stemming only applies to FULLTEXT-indexed fields', async () => {
    // contactEmail is NOT FULLTEXT-indexed in this schema. A stemmed query
    // for 'summary' against contactEmail must NOT match 'summarize@x.org'
    // via tsvector — only ILIKE substring applies. This proves the per-field
    // scoping: _fts_title is used for title searches, but contactEmail
    // searches get no tsvector boost.
    await provider.createObject(ctx, 'SearchDoc', {
      title: 'Unrelated',
      contactEmail: 'summarize@hospital.org',
    });
    const r = await provider.searchObjects(ctx, 'SearchDoc', {
      query: 'summary',
      fields: ['contactEmail'],
    });
    // ILIKE '%summary%' does NOT match 'summarize@hospital.org' — and since
    // contactEmail has no _fts column, there's no tsvector fallback. Zero hits.
    expect(r.hits).toHaveLength(0);
  });

  it('stemming: query "running" matches "run" via tsvector', async () => {
    // Insert a doc with 'run' and search for 'running' — stems match.
    await provider.createObject(ctx, 'SearchDoc', {
      title: 'Daily Run Log',
      contactEmail: 'run@hospital.org',
    });
    const r = await provider.searchObjects(ctx, 'SearchDoc', {
      query: 'running',
      fields: ['title'],
    });
    const titles = r.hits.map((h) => h.object.title as string);
    expect(titles).toContain('Daily Run Log');
  });

  it('ts_rank scoring: higher term density scores higher within the same match tier', async () => {
    // Density is a tie-breaker, not the whole score: per-field ILIKE tiers
    // (exact 3 / prefix 2 / substring 1) dominate, and the ts_rank_cd bonus is
    // added on top. So both documents must sit in the SAME tier for density to
    // be what is under test — hence a trailing word on each, which keeps both
    // at "prefix" rather than letting the shorter one win outright on an exact
    // whole-field match. The earlier version compared 'guidelines guidelines
    // guidelines' against a bare 'guidelines' and so asserted that density
    // beats an exact match, which contradicts the documented tiering; it had
    // never executed because the suite failed in setup.
    await provider.createObject(ctx, 'SearchDoc', {
      title: 'guidelines guidelines guidelines review',
      contactEmail: 'g@hospital.org',
    });
    await provider.createObject(ctx, 'SearchDoc', {
      title: 'guidelines review',
      contactEmail: 'g2@hospital.org',
    });
    const r = await provider.searchObjects(ctx, 'SearchDoc', {
      query: 'guidelines',
      fields: ['title'],
    });
    const dense = r.hits.find((h) => h.object.title === 'guidelines guidelines guidelines review');
    const sparse = r.hits.find((h) => h.object.title === 'guidelines review');
    expect(dense).toBeDefined();
    expect(sparse).toBeDefined();
    expect(dense!.score).toBeGreaterThan(sparse!.score);
  });

  it('multi-language: French stemming matches plural with singular query', async () => {
    // Apply a schema with language: 'french' on the FULLTEXT index.
    // 'hôpitaux' (plural) stems to the same lexeme as 'hôpital' (singular)
    // in French. ILIKE '%hôpital%' does NOT match 'hôpitaux' (different
    // suffix), so this only passes via the French tsvector path.
    const frSchema: OntologySchema = {
      version: SCHEMA_VERSION + 1,
      objectTypes: [
        {
          name: 'SearchDocFr',
          properties: [
            { name: 'title', type: 'String', required: true },
          ],
          indexes: [{ field: 'title', indexType: 'FULLTEXT', language: 'french' }],
        },
      ],
      linkTypes: [],
    };
    const frCtx: RequestContext = { tenantId: 'tenant-search-fr', actorId: 'test-actor' };
    await provider.pool.query(`
      DROP TABLE IF EXISTS "public"."search_doc_fr_history" CASCADE;
      DROP TABLE IF EXISTS "public"."search_doc_fr" CASCADE;
    `);
    await provider.pool.query(
      'DELETE FROM _schema_migrations WHERE version = $1',
      [frSchema.version],
    ).catch(() => {});
    await provider.applySchema(frCtx, frSchema);

    await provider.createObject(frCtx, 'SearchDocFr', { title: 'Les hôpitaux de Paris' });
    const r = await provider.searchObjects(frCtx, 'SearchDocFr', {
      query: 'hôpital',
      fields: ['title'],
    });
    expect(r.hits.map((h) => h.object.title as string)).toContain('Les hôpitaux de Paris');

    await provider.pool.query('DROP TABLE IF EXISTS "public"."search_doc_fr_history" CASCADE');
    await provider.pool.query('DROP TABLE IF EXISTS "public"."search_doc_fr" CASCADE');
    await provider.pool.query(
      'DELETE FROM _schema_migrations WHERE version = $1',
      [frSchema.version],
    ).catch(() => {});
  });
});
