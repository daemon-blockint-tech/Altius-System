/**
 * One derivation of "how is this action authorized", and one snake_case.
 *
 * The FGA object string a runtime builds must name a type the generated model
 * actually declares. Three copies of `toSnakeCase` existed — odl's (which
 * NAMES the model's types), api's, and mcp-server's. The first two matched;
 * mcp-server's used `replace(/([A-Z])/g, '_$1')`, which agrees on `CarePlan`
 * and disagrees on every acronym. No bundled pack has an acronym ObjectType,
 * so it never fired — the failure was waiting for the first `GPPractice`.
 *
 * These pin the two properties that matter: the mapping is derived once, and
 * the name it produces is the name the model declares.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '../index.js';
import { deriveActionAuthzMapping, toSnakeCase, generateOpenFGAModel } from '../codegen/openfga.js';

const SCHEMA = `
extend schema @namespace(name: "test", version: "0.1.0")

type GPPractice implements Identifiable @objectType {
  id: ID! @primary
  name: String
}

type Patient implements Identifiable @objectType {
  id: ID! @primary
  name: String
}

type AdmitPatient @actionType {
  patient: Patient! @param
  ward: String @param
}

type RegisterPatient @actionType {
  name: String! @param
}
`;

describe('deriveActionAuthzMapping', () => {
  const schema = parseOdl(SCHEMA);
  const names = new Set(schema.objectTypes.map((o) => o.name));
  const action = (n: string) => schema.actionTypes.find((a) => a.name === n)!;

  it('targets the first ObjectType-typed @param', () => {
    const m = deriveActionAuthzMapping(action('AdmitPatient'), names);
    expect(m).toEqual({ relation: 'can_admit', objectType: 'patient', objectIdParam: 'patient' });
  });

  it('returns undefined for an action with no ObjectType @param', () => {
    // RegisterPatient creates its target, so there is no instance to hold a
    // relation on. Callers must treat this as "not ReBAC-gated", not as "deny".
    expect(deriveActionAuthzMapping(action('RegisterPatient'), names)).toBeUndefined();
  });

  it('names every object type exactly as the generated model declares it', () => {
    // The regression guard. `GPPractice` is the shape that broke: the model
    // declares `gp_practice`, and a per-capital snake_case yields
    // `g_p_practice` — a type OpenFGA has never heard of.
    const declared = new Set(generateOpenFGAModel(schema).types.map((t) => t.name));

    for (const obj of schema.objectTypes) {
      expect(declared, `model has no type for ObjectType ${obj.name}`).toContain(toSnakeCase(obj.name));
    }
    expect(toSnakeCase('GPPractice')).toBe('gp_practice');
    expect(toSnakeCase('NHSTrust')).toBe('nhs_trust');
    expect(toSnakeCase('CarePlan')).toBe('care_plan');
  });
});
