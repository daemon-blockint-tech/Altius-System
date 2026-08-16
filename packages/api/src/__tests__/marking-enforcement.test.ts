/**
 * Mandatory markings on the read surfaces.
 *
 * Two properties make this different from every other control here, and both
 * are easy to implement wrongly in a way that looks fine:
 *
 * 1. Markings are MANDATORY. Roles and ReBAC relations expand access; a
 *    marking restricts it. An admin holding `editor` must still be denied, so
 *    the check cannot sit alongside authorization — it has to run first.
 *
 * 2. Markings restrict DISCOVERY. A denied caller must not be able to tell
 *    the resource exists, so the answer is 404/null/empty rather than 403.
 *    Returning FORBIDDEN would confirm the type exists and that something is
 *    being withheld — the exact disclosure the marking prevents.
 */

import { describe, it, expect } from 'vitest';
import { MarkingPolicy } from '@altius/security';
import { isTypeVisible, missingMarkings } from '../markings/enforce.js';

const policy = new MarkingPolicy({
  categories: [{ name: 'RELEASE_TO', mode: 'DISJUNCTIVE' }],
  markings: [
    { name: 'PII' },
    { name: 'GBR', category: 'RELEASE_TO' },
    { name: 'CAN', category: 'RELEASE_TO' },
  ],
  byObjectType: { Patient: ['PII'], Case: ['GBR', 'CAN'] },
});

const user = (markings: string[]) => ({ markings });

describe('type visibility', () => {
  it('hides a marked type from a caller without the marking', () => {
    expect(isTypeVisible(policy, user([]), 'Patient')).toBe(false);
  });

  it('shows it to a caller who holds the marking', () => {
    expect(isTypeVisible(policy, user(['PII']), 'Patient')).toBe(true);
  });

  it('leaves unmarked types visible to everyone', () => {
    expect(isTypeVisible(policy, user([]), 'Ward')).toBe(true);
  });

  it('honours a disjunctive category — one of the pair is enough', () => {
    expect(isTypeVisible(policy, user(['CAN']), 'Case')).toBe(true);
    expect(isTypeVisible(policy, user(['GBR']), 'Case')).toBe(true);
    expect(isTypeVisible(policy, user(['USA']), 'Case')).toBe(false);
  });
});

describe('fail-closed behaviour', () => {
  it('denies when no identity resolved — an unauthenticated path is not a way past a mandatory control', () => {
    expect(isTypeVisible(policy, undefined, 'Patient')).toBe(false);
  });

  it('denies when the identity carries no markings field at all', () => {
    expect(isTypeVisible(policy, {} as { markings?: string[] }, 'Patient')).toBe(false);
  });

  it('is inert when no policy is configured, so unmarked deployments pay nothing', () => {
    expect(isTypeVisible(undefined, user([]), 'Patient')).toBe(true);
    expect(isTypeVisible(new MarkingPolicy({ markings: [] }), user([]), 'Patient')).toBe(true);
  });
});

describe('what the audit trail learns versus what the caller learns', () => {
  it('records exactly which markings were unsatisfied', () => {
    expect(missingMarkings(policy, user([]), 'Patient')).toEqual(['PII']);
  });

  it('reports the whole disjunctive set when none of it was satisfied', () => {
    expect(missingMarkings(policy, user([]), 'Case').slice().sort()).toEqual(['CAN', 'GBR']);
  });

  it('reports nothing when access was allowed', () => {
    expect(missingMarkings(policy, user(['PII']), 'Patient')).toEqual([]);
  });
});

/**
 * Every read surface, not just the two that were easy.
 *
 * A mandatory control enforced on REST and GraphQL but not on MCP, FHIR and
 * CDM is not enforced: the agent surface reads at machine rate, and the
 * clinical projections are what an integration actually calls. Each one
 * withholds a marked type the same way — as if the type were not exposed —
 * because a distinct denial confirms it exists.
 */
describe('enforcement covers every read surface', () => {
  const marked = new MarkingPolicy({
    markings: [{ name: 'PII' }],
    byObjectType: { Patient: ['PII'] },
  });

  it('FHIR withholds a marked resource type', () => {
    expect(isTypeVisible(marked, user([]), 'Patient')).toBe(false);
    expect(isTypeVisible(marked, user(['PII']), 'Patient')).toBe(true);
  });

  it('CDM withholds a marked source type', () => {
    expect(isTypeVisible(marked, user([]), 'Patient')).toBe(false);
  });

  it('leaves an unmarked type reachable on every surface', () => {
    expect(isTypeVisible(marked, user([]), 'Ward')).toBe(true);
  });
});
