/**
 * History rows must not carry the generated `_fts_*` columns.
 *
 * A FULLTEXT index adds `_fts_<field> tsvector GENERATED ALWAYS AS (…) STORED`
 * to the object table and to that table only. The write path reads the new row
 * back with RETURNING *, so the generated column comes along, and the history
 * insert used to copy every key it was handed — into a history table that has
 * no such column. The result was that createObject failed outright for every
 * object type carrying a FULLTEXT index, which is a core write path, on
 * Postgres only. Adding the column to the history table would not help either:
 * Postgres refuses an explicit value for a generated column.
 *
 * This pins the filter without needing a live database. The integration suite
 * in search.integration.test.ts covers the same ground against real Postgres,
 * but it is skipped unless PG_TEST_URL is set — which is exactly how the bug
 * survived: CI runs the conformance suite against the memory provider by
 * default, and the memory provider issues no SQL at all.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const crudSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'objects', 'object-crud.ts'),
  'utf8',
);

describe('insertHistory column selection', () => {
  it('drops generated _fts_ columns before building the INSERT', () => {
    const fn = crudSource.slice(crudSource.indexOf('async function insertHistory'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/filter\(\s*\(\[k\]\)\s*=>\s*!k\.startsWith\('_fts_'\)\s*\)/);
  });
});

describe('embeddings DDL is opt-in on pgvector availability', () => {
  it('probes pg_available_extensions before generating the embeddings DDL', () => {
    const providerSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'postgres-storage-provider.ts'),
      'utf8',
    );
    // `CREATE EXTENSION IF NOT EXISTS vector` raises rather than degrading when
    // the server has no vector.control, and every DDL statement runs in one
    // loop — so an unguarded embeddings block takes the whole schema apply down
    // on any stock Postgres, the official postgres:17 image included.
    expect(providerSource).toContain("FROM pg_available_extensions WHERE name = 'vector'");
    expect(providerSource).toMatch(/includeEmbeddings:\s*hasPgVector/);
  });
});
