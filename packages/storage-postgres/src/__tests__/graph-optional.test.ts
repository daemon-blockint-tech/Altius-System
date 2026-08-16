/**
 * Apache AGE must be optional.
 *
 * `CREATE EXTENSION IF NOT EXISTS age` was emitted unconditionally into the
 * DDL that applySchema runs inside its migration transaction, so schema
 * application failed outright on any Postgres without the AGE binary — every
 * managed service (Supabase, RDS, Cloud SQL) among them. The platform refused
 * a deployment over a graph no query reads: traversal goes through SQL JOINs
 * in links/traversal.ts and nothing consumes a Cypher result.
 *
 * These pin that the extension is emitted by default (so an existing
 * self-hosted deployment is unaffected) and absent when graph is off.
 */

import { describe, it, expect } from 'vitest';
import { generateDDL } from '../schema/index.js';
import { disableGraphWrites, graphWritesEnabled } from '../graph-flag.js';
import type { OntologySchema } from '@altius/spi';
import type { Pool } from 'pg';

const schema: OntologySchema = {
  version: 1,
  objectTypes: [{ name: 'Patient', properties: [{ name: 'name', type: 'string' }] }],
  linkTypes: [],
};

describe('AGE graph is optional', () => {
  it('emits the extension by default', () => {
    const ddl = generateDDL(schema, { dataSchema: 'public' });

    expect(ddl.all.some(s => s.includes('CREATE EXTENSION IF NOT EXISTS age'))).toBe(true);
  });

  it('emits no AGE statement when graph is disabled', () => {
    const ddl = generateDDL(schema, { dataSchema: 'public', includeGraph: false });

    // Match the AGE statements themselves — a bare 'age' substring also hits
    // "storage" and "message" and would pass no matter what we emitted.
    expect(ddl.all.some(s => s.includes('EXTENSION IF NOT EXISTS age'))).toBe(false);
    expect(ddl.all.some(s => s.includes('create_graph'))).toBe(false);
    expect(ddl.all.some(s => s.includes('create_vlabel'))).toBe(false);
    expect(ddl.all.some(s => s.includes('create_elabel'))).toBe(false);
    // The object tables must still be created — this turns off the mirror,
    // not the schema.
    expect(ddl.all.some(s => s.includes('CREATE TABLE'))).toBe(true);
  });

  it('keeps pg_trgm, which managed Postgres does have', () => {
    const withSearch: OntologySchema = {
      version: 1,
      objectTypes: [{
        name: 'Patient',
        properties: [{ name: 'name', type: 'string' }],
        indexes: [{ field: 'name', indexType: 'FULLTEXT' }],
      }],
      linkTypes: [],
    };
    const ddl = generateDDL(withSearch, { dataSchema: 'public', includeGraph: false });

    expect(ddl.all.some(s => s.includes('pg_trgm'))).toBe(true);
  });
});

describe('graph write mirror switch', () => {
  it('is per-pool, so two providers in one process do not decide for each other', () => {
    const poolA = {} as Pool;
    const poolB = {} as Pool;

    disableGraphWrites(poolA);

    expect(graphWritesEnabled(poolA)).toBe(false);
    expect(graphWritesEnabled(poolB)).toBe(true);
  });
});
