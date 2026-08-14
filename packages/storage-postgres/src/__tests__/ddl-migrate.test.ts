/**
 * Additive schema reconciliation planning.
 *
 * The planner is pure apart from one information_schema read, so these drive it
 * with canned column rows — no database required.
 */

import { describe, it, expect } from 'vitest';
import type { OntologySchema } from '@altius/spi';
import { planAdditiveMigration, type Queryable } from '../schema/ddl-migrate.js';

/** Fake information_schema.columns for the given table -> [col, data_type][]. */
function db(tables: Record<string, [string, string][]>): Queryable {
  return {
    async query() {
      const rows = Object.entries(tables).flatMap(([table_name, cols]) =>
        cols.map(([column_name, data_type]) => ({ table_name, column_name, data_type })),
      );
      return { rows };
    },
  };
}

function schemaWith(props: OntologySchema['objectTypes'][number]['properties']): OntologySchema {
  return {
    version: 1,
    objectTypes: [{ name: 'Patient', properties: props }],
    linkTypes: [],
  };
}

/** Columns a `patient` table already has before the schema change. */
const EXISTING: [string, string][] = [['_id', 'text'], ['nhs_number', 'text']];

describe('planAdditiveMigration', () => {
  it('adds a new optional property as a nullable column', async () => {
    const plan = await planAdditiveMigration(
      db({ patient: EXISTING, patient_history: EXISTING }),
      schemaWith([
        { name: 'nhsNumber', type: 'String' },
        { name: 'triageCategory', type: 'String' },
      ]),
    );

    expect(plan.blocked).toEqual([]);
    expect(plan.statements).toContain(
      'ALTER TABLE "public"."patient" ADD COLUMN IF NOT EXISTS "triage_category" TEXT;',
    );
    // The history table carries the same property columns.
    expect(plan.statements).toContain(
      'ALTER TABLE "public"."patient_history" ADD COLUMN IF NOT EXISTS "triage_category" TEXT;',
    );
  });

  it('blocks a new required property that has no default', async () => {
    const plan = await planAdditiveMigration(
      db({ patient: EXISTING, patient_history: EXISTING }),
      schemaWith([
        { name: 'nhsNumber', type: 'String' },
        { name: 'wardCode', type: 'String', required: true },
      ]),
    );

    expect(plan.statements).toEqual([]);
    expect(plan.blocked.join()).toMatch(/patient\.ward_code.*required.*no @default/);
  });

  it('adds a required property when it carries a default', async () => {
    const plan = await planAdditiveMigration(
      db({ patient: EXISTING, patient_history: EXISTING }),
      schemaWith([
        { name: 'nhsNumber', type: 'String' },
        { name: 'status', type: 'String', required: true, defaultValue: 'ACTIVE' },
      ]),
    );

    expect(plan.blocked).toEqual([]);
    expect(plan.statements).toContain(
      `ALTER TABLE "public"."patient" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'ACTIVE' NOT NULL;`,
    );
    // A history row records a past state, so its column stays nullable.
    expect(plan.statements).toContain(
      `ALTER TABLE "public"."patient_history" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'ACTIVE';`,
    );
  });

  it('blocks a type change instead of rewriting the column', async () => {
    const plan = await planAdditiveMigration(
      db({ patient: [['_id', 'text'], ['age', 'text']], patient_history: [['_id', 'text'], ['age', 'text']] }),
      schemaWith([{ name: 'age', type: 'Int' }]),
    );

    expect(plan.statements).toEqual([]);
    expect(plan.blocked.join()).toMatch(/patient\.age: declared INTEGER but the column is text/);
  });

  it('skips tables that do not exist yet — CREATE TABLE IF NOT EXISTS covers them', async () => {
    const plan = await planAdditiveMigration(db({}), schemaWith([{ name: 'nhsNumber', type: 'String' }]));

    expect(plan).toEqual({ statements: [], blocked: [] });
  });

  it('accepts a timestamptz column against its information_schema spelling', async () => {
    const plan = await planAdditiveMigration(
      db({ patient: [['admitted_at', 'timestamp with time zone']], patient_history: [['admitted_at', 'timestamp with time zone']] }),
      schemaWith([{ name: 'admittedAt', type: 'DateTime' }]),
    );

    expect(plan).toEqual({ statements: [], blocked: [] });
  });
});
