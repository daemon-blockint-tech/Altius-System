/**
 * Cross-reference must not flag member access as an unknown variable.
 *
 * `extractExpressionRoots` matched every identifier in an expression, so the
 * property in `patient.status` and the method in `actor.hasRole('x')` were both
 * reported as unknown top-level variables. The same shape of bug applied to
 * `updateObject.target`, which is compared against the action's @param names
 * even though a dotted link path (`patient.currentBed`) is explicitly supported
 * — the executor pre-resolves those paths before effects run.
 *
 * Every shipped pack tripped this, which is why the pass could never be turned
 * on: the findings were noise, not drift.
 *
 * These tests pin both directions — a real unknown root must still be caught.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import { parseActionManifest } from '../index.js';
import { crossReferenceManifest } from '../index.js';
import type { ActionManifest } from '../types.js';

const ODL = `
extend schema @namespace(name: "nhs.acute", version: "1.0.0")

type Ward @objectType {
  id: ID! @primary
  name: String!
}

type Bed @objectType {
  id: ID! @primary
  status: BedStatus!
}

type Patient @objectType {
  id: ID! @primary
  status: PatientStatus!
  currentWard: Ward @link(type: "AdmittedTo", direction: OUTBOUND)
  currentBed: Bed @link(type: "OccupiesBed", direction: OUTBOUND)
}

type AdmittedTo @linkType(from: "Patient", to: "Ward", cardinality: MANY_TO_ONE) {
  id: ID! @primary
}

type OccupiesBed @linkType(from: "Patient", to: "Bed", cardinality: ONE_TO_ONE) {
  id: ID! @primary
}

type DischargePatient @actionType {
  patient: Patient! @param
  notes: String @param
}

enum PatientStatus { ACTIVE DISCHARGED }
enum BedStatus { AVAILABLE OCCUPIED CLEANING }
`;

function schema(): ParsedSchema {
  return parseOdl(ODL);
}

function manifest(yaml: string): ActionManifest {
  const result = parseActionManifest(yaml);
  expect(result.errors).toEqual([]);
  return result.manifest!;
}

const MEMBER_ACCESS = `
action: DischargePatient
version: 1
reversible: false
preconditions:
  - expr: "patient.status == 'ACTIVE'"
    error: "Patient is not active"
  - expr: "actor.hasRole('clinician')"
    error: "Insufficient role"
  - expr: "patient.currentWard != null"
    error: "Not admitted"
effects:
  - type: updateObject
    target: "patient.currentBed"
    set:
      status: "CLEANING"
sideEffects: []
`;

const UNKNOWN_ROOT = `
action: DischargePatient
version: 1
reversible: false
preconditions:
  - expr: "clinician.status == 'ACTIVE'"
    error: "bad root"
effects: []
sideEffects: []
`;

describe('crossReferenceManifest — member access', () => {
  it('does not flag a property read as an unknown variable', () => {
    const issues = crossReferenceManifest(manifest(MEMBER_ACCESS), schema());
    const unknownVars = issues.filter(i => i.code === 'UNKNOWN_CEL_VARIABLE');
    expect(unknownVars).toEqual([]);
  });

  it('does not flag a method call as an unknown variable', () => {
    const issues = crossReferenceManifest(manifest(MEMBER_ACCESS), schema());
    expect(issues.some(i => i.message.includes('hasRole'))).toBe(false);
  });

  it('does not flag a dotted link path as a non-param target', () => {
    const issues = crossReferenceManifest(manifest(MEMBER_ACCESS), schema());
    const paramRefs = issues.filter(i => i.code === 'UNKNOWN_PARAM_REF');
    expect(paramRefs).toEqual([]);
  });

  it('reports no findings at all for a manifest that matches the schema', () => {
    expect(crossReferenceManifest(manifest(MEMBER_ACCESS), schema())).toEqual([]);
  });
});

describe('crossReferenceManifest — real drift is still caught', () => {
  it('flags an expression whose root is not a param or well-known name', () => {
    const issues = crossReferenceManifest(manifest(UNKNOWN_ROOT), schema());
    expect(issues.some(i => i.code === 'UNKNOWN_CEL_VARIABLE')).toBe(true);
    expect(issues.some(i => i.message.includes('clinician'))).toBe(true);
  });
});
