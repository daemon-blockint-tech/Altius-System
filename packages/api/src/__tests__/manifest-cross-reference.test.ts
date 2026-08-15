/**
 * Regression: action manifests must be cross-referenced against the merged
 * schema at boot.
 *
 * `crossReferenceSchema` has always existed inside the manifest parser, gated
 * behind `if (schema)` (packages/actions/src/parser/index.ts:105-108). The one
 * production call site passed no schema:
 *
 *   const result = parseActionManifest(yamlContent);   // schema-loader.ts:304
 *
 * so the branch was dead in the running system and manifest/schema drift — an
 * effect naming a link type that does not exist, a target that is not a @param
 * — shipped silently and failed at execution time instead.
 *
 * Findings are reported, not thrown. Structural manifest errors stay fatal (a
 * manifest that does not parse cannot run), but cross-reference drift is
 * surfaced as a warning so an existing deployment reports its drift instead of
 * failing to boot on it.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import { parseActionManifest, crossReferenceManifest } from '@altius/actions';
import type { ActionManifest } from '@altius/actions';
import { crossReferenceManifests } from '../schema-loader.js';

const ODL = `
extend schema @namespace(name: "test", version: "1.0.0")

type Patient @objectType {
  id: ID! @primary
  status: PatientStatus!
}

type Ward @objectType {
  id: ID! @primary
  name: String!
}

type AdmittedTo @linkType(from: "Patient", to: "Ward", cardinality: MANY_TO_ONE) {
  id: ID! @primary
}

type AdmitPatient @actionType {
  patient: Patient! @param
  ward: Ward! @param
}

enum PatientStatus {
  ACTIVE
  DISCHARGED
}
`;

/** Names a link type that does not exist in the schema above. */
const DRIFTED_MANIFEST = `
action: AdmitPatient
version: 1
reversible: false
preconditions: []
effects:
  - type: createLink
    linkType: TransferredTo
    from: patient
    to: ward
sideEffects: []
`;

const CLEAN_MANIFEST = `
action: AdmitPatient
version: 1
reversible: false
preconditions: []
effects:
  - type: createLink
    linkType: AdmittedTo
    from: patient
    to: ward
sideEffects: []
`;

function parse(yaml: string): ActionManifest {
  const result = parseActionManifest(yaml);
  expect(result.valid).toBe(true);
  return result.manifest!;
}

describe('crossReferenceManifest', () => {
  it('reports an effect naming a link type that is not in the schema', () => {
    const schema = parseOdl(ODL);
    const issues = crossReferenceManifest(parse(DRIFTED_MANIFEST), schema);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.code === 'UNKNOWN_LINK_TYPE')).toBe(true);
  });

  it('reports nothing for a manifest that matches the schema', () => {
    const schema = parseOdl(ODL);
    const issues = crossReferenceManifest(parse(CLEAN_MANIFEST), schema);

    expect(issues).toEqual([]);
  });
});

describe('crossReferenceManifests (boot pass)', () => {
  it('surfaces drift across every loaded manifest', () => {
    const schema = parseOdl(ODL);
    const manifests = new Map<string, ActionManifest>([
      ['AdmitPatient', parse(DRIFTED_MANIFEST)],
    ]);

    const issues = crossReferenceManifests(manifests, schema);

    expect(issues.some(i => i.code === 'UNKNOWN_LINK_TYPE')).toBe(true);
  });

  it('reports drift as a warning so boot is not blocked', () => {
    const schema = parseOdl(ODL);
    const manifests = new Map<string, ActionManifest>([
      ['AdmitPatient', parse(DRIFTED_MANIFEST)],
    ]);

    const issues = crossReferenceManifests(manifests, schema);

    expect(issues.length).toBeGreaterThan(0);
    // Structural errors are fatal elsewhere; drift must not be.
    expect(issues.every(i => i.severity === 'warning')).toBe(true);
  });

  it('is empty when every manifest matches the schema', () => {
    const schema = parseOdl(ODL);
    const manifests = new Map<string, ActionManifest>([
      ['AdmitPatient', parse(CLEAN_MANIFEST)],
    ]);

    expect(crossReferenceManifests(manifests, schema)).toEqual([]);
  });
});
