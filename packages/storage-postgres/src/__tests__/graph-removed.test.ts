/**
 * Apache AGE is gone, and must stay gone.
 *
 * The graph was a write-only mirror: `createAgeVertex`/`createAgeEdge` wrote
 * vertices and edges on every mutation, and the only two `cypher()` call
 * sites in the repo discarded their results (`ageQuery` returned
 * `Promise<void>`). Nothing read it back — traversal resolves paths with SQL
 * JOINs over the link tables, and the conformance suite passes with no AGE
 * installed at all.
 *
 * What it cost: `CREATE EXTENSION IF NOT EXISTS age` ran inside the migration
 * transaction, so schema application failed outright on any Postgres without
 * the binary — every managed service among them; and every insert, update and
 * delete paid a SAVEPOINT plus a Cypher round-trip for data no query touched.
 *
 * This pins that the DDL emits no AGE statement, so a re-introduction has to
 * be deliberate rather than accidental.
 */

import { describe, it, expect } from 'vitest';
import { generateDDL } from '../schema/index.js';
import type { OntologySchema } from '@altius/spi';

const schema: OntologySchema = {
  version: 1,
  objectTypes: [{
    name: 'Patient',
    properties: [{ name: 'name', type: 'string' }],
    indexes: [{ field: 'name', indexType: 'FULLTEXT' }],
  }],
  linkTypes: [{ name: 'AdmittedTo', fromType: 'Patient', toType: 'Patient', cardinality: 'MANY_TO_ONE' }],
};

describe('the AGE graph dependency is gone', () => {
  it('emits no AGE statement anywhere in the DDL', () => {
    const all = generateDDL(schema, { dataSchema: 'public' }).all;

    // Match the AGE statements themselves — a bare 'age' substring also hits
    // "storage" and "message" and would pass no matter what we emitted.
    expect(all.some(s => s.includes('EXTENSION IF NOT EXISTS age'))).toBe(false);
    expect(all.some(s => s.includes("LOAD 'age'"))).toBe(false);
    expect(all.some(s => s.includes('create_graph'))).toBe(false);
    expect(all.some(s => s.includes('create_vlabel'))).toBe(false);
    expect(all.some(s => s.includes('create_elabel'))).toBe(false);
    expect(all.some(s => s.includes('ag_catalog'))).toBe(false);
  });

  it('still emits pg_trgm, which managed Postgres does have', () => {
    const all = generateDDL(schema, { dataSchema: 'public' }).all;

    expect(all.some(s => s.includes('pg_trgm'))).toBe(true);
  });

  it('still creates the object and link tables', () => {
    const ddl = generateDDL(schema, { dataSchema: 'public' });

    expect(ddl.objectTables.some(s => s.includes('CREATE TABLE'))).toBe(true);
    expect(ddl.linkTables.some(s => s.includes('CREATE TABLE'))).toBe(true);
  });
});
