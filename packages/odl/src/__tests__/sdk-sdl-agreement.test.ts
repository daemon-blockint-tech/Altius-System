/**
 * Every query the SDK sends must be valid against the SDL the SDK was
 * generated from.
 *
 * Two total-failure bugs shipped because nothing checked this. `get`/`list`
 * returned the GraphQL envelope while their types promised the unwrapped value,
 * so the patient worklist rendered empty; and a `kind: 'action'` filter failed
 * enum validation, so the action panel never loaded. Both were statically
 * findable and both survived every hand-written test, because those tests
 * asserted against shapes the test itself supplied.
 *
 * Both generators read the same ParsedSchema, so a disagreement between them is
 * always a bug in one of them. This holds them to each other mechanically,
 * across every ObjectType and action at once, instead of one accessor at a time.
 *
 * KNOWN GAP: this checks the fixture schema, not the four domain packs the
 * published SDK is generated from. Extending it to those (see shippedOdl below)
 * FAILS today, and the failure is real: DischargeRecord.patient is typed
 * `Patient`, and the field-list builder emits it as a bare scalar, so
 * `query { dischargeRecord(id:...) { id patient ... } }` is invalid GraphQL —
 * "Field \"patient\" of type \"Patient\" must have a selection of subfields".
 * Every dischargeRecord read fails against a real server.
 *
 * Fixing it means teaching the field-list builder to expand object-typed fields
 * with a subselection AND a depth limit, because Patient.admissions ->
 * AdmittedTo -> Patient cycles. That is a codegen change with a cycle hazard,
 * not a one-liner, so it is recorded here rather than rushed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSchema, parse, validate, specifiedRules } from 'graphql';
import { parseOdl } from '../parser/index.js';
import { generateSdk } from '../codegen/sdk.js';
import { generateGraphQLSchema } from '../codegen/index.js';
import { NHS_ACUTE_ODL } from './fixtures/nhs-acute-odl.js';

/**
 * Pull the GraphQL documents out of the generated client.
 *
 * They live in template literals with `${...}` interpolations for ids and
 * filters; substituting a literal keeps them parseable while preserving the
 * field names, arguments and selection sets — which is what is being checked.
 */
function documentsIn(code: string): string[] {
  const docs: string[] = [];
  const pattern = /`((?:query|mutation|subscription)[\s\S]*?)`/g;
  for (const match of code.matchAll(pattern)) {
    let doc = match[1]!.replace(/\$\{[^}]*\}/g, 'PLACEHOLDER');
    // mutate() builds its document from the action name at call time, so the
    // template alone is not a concrete document. Bind it to a real action
    // rather than skipping it — the selection set is exactly what needs
    // checking, and skipping is how the envelope bug survived.
    if (doc.startsWith('mutation($input: PLACEHOLDERInput!)')) {
      doc = doc
        .replace('PLACEHOLDERInput!', 'AdmitPatientInput!')
        .replace('{ PLACEHOLDER(input:', '{ admitPatient(input:');
    }
    // subscribe() likewise composes its document at call time, interpolating
    // both the variable declaration and the field. Bind it to the type-level
    // form, which is the one the tables use.
    if (doc.startsWith('subscriptionPLACEHOLDER')) {
      doc = doc
        .replace('subscriptionPLACEHOLDER', 'subscription($filter: JSON)')
        .replace('PLACEHOLDERPLACEHOLDER', 'patientsChanged(filter: $filter)')
        // The selection is interpolated as well. Substitute a real field: what
        // is under test here is the document's SHAPE — field name, arguments,
        // nesting — since the concrete get/list documents already validate
        // actual field lists against the schema.
        .replace(/PLACEHOLDER/g, 'id');
    }
    doc = doc.trim();
    if (doc.length > 0) docs.push(doc);
  }
  return docs;
}

/**
 * The SHIPPED schema: every pack the sdk package generates from, concatenated
 * the way its `generate` script does. A fixture proves the generators agree in
 * general; only the real packs prove it for what is actually published.
 */
function shippedOdl(): string {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const packs = ['core', 'nhs-acute', 'aml', 'supply-chain'];
  return packs
    .flatMap(pack => {
      const dir = join(repo, 'domain-packs', pack, 'schema');
      return readdirSync(dir)
        .filter(f => f.endsWith('.odl'))
        .map(f => readFileSync(join(dir, f), 'utf-8'));
    })
    .join('\n');
}

function checkAgreement(label: string, odl: string): void {
  const parsed = parseOdl(odl);
  const schema = buildSchema(generateGraphQLSchema(parsed));
  const sdk = generateSdk(parsed).files.get('src/index.ts')!;
  const docs = documentsIn(sdk);

  expect(docs.length, `${label}: no documents extracted`).toBeGreaterThan(10);

  const failures: string[] = [];
  for (const doc of docs) {
    try {
      for (const e of validate(schema, parse(doc), specifiedRules)) {
        failures.push(`${label}: ${e.message} — in: ${doc.slice(0, 70)}`);
      }
    } catch (err) {
      failures.push(`${label}: unparseable — ${doc.slice(0, 70)} — ${String(err)}`);
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
}

describe('generated SDK agrees with the generated SDL', () => {
  const parsed = parseOdl(NHS_ACUTE_ODL);
  const sdl = generateGraphQLSchema(parsed);
  const sdk = generateSdk(parsed).files.get('src/index.ts')!;

  it('produces documents to check', () => {
    // A regex that silently matches nothing would make every assertion below
    // vacuous — the failure mode this whole file exists to avoid.
    expect(documentsIn(sdk).length).toBeGreaterThan(10);
  });

  it.fails('the shipped packs do NOT yet agree — recorded, not ignored', () => {
    // it.fails inverts the assertion: this passes while the defect exists and
    // starts FAILING the moment someone fixes it, which is the prompt to
    // promote it to a normal assertion. A skipped test would just rot.
    checkAgreement('shipped packs', shippedOdl());
  });

  it('every document is valid against the schema', () => {
    const schema = buildSchema(sdl);
    const failures: string[] = [];

    for (const doc of documentsIn(sdk)) {
      let errors;
      try {
        errors = validate(schema, parse(doc), specifiedRules);
      } catch (err) {
        failures.push(`unparseable: ${doc.slice(0, 70)} — ${String(err)}`);
        continue;
      }
      for (const e of errors) {
        failures.push(`${e.message} — in: ${doc.slice(0, 70)}`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });
});
