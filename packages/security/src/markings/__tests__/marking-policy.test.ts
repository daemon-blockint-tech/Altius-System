/**
 * Marking evaluation, against the source model's own worked examples.
 *
 * The semantics are easy to get subtly wrong and the failure mode is silent
 * over-disclosure, so these pin the exact rules rather than a paraphrase:
 * conjunctive within a category by default, disjunctive when the category
 * says so, always conjunctive ACROSS categories, and rank dominance inside a
 * hierarchical category.
 */

import { describe, it, expect } from 'vitest';
import { MarkingPolicy } from '../marking-policy.js';

describe('plain mandatory markings (conjunctive)', () => {
  const policy = new MarkingPolicy({
    markings: [{ name: 'PII' }, { name: 'Financial' }],
  });

  it('allows a caller holding every required marking', () => {
    expect(policy.check(['PII', 'Financial'], ['PII', 'Financial']).allowed).toBe(true);
  });

  it('denies a caller holding only some of them — markings are AND', () => {
    const d = policy.check(['PII'], ['PII', 'Financial']);

    expect(d.allowed).toBe(false);
    expect(d.missing).toEqual(['Financial']);
  });

  it('allows anyone when the resource carries no markings', () => {
    expect(policy.check([], []).allowed).toBe(true);
  });

  it('ignores markings the caller holds that were not asked for', () => {
    expect(policy.check(['PII', 'Unrelated'], ['PII']).allowed).toBe(true);
  });
});

describe('disjunctive category — releasability', () => {
  // The source model's own example: RELEASE TO is disjunctive, mwashington
  // holds GBR and CAN, jadams holds only GBR, and data marked "GBR, CAN" is
  // readable by both.
  const policy = new MarkingPolicy({
    categories: [{ name: 'RELEASE_TO', mode: 'DISJUNCTIVE' }],
    markings: [
      { name: 'GBR', category: 'RELEASE_TO' },
      { name: 'CAN', category: 'RELEASE_TO' },
    ],
  });

  it('admits a caller holding both', () => {
    expect(policy.check(['GBR', 'CAN'], ['GBR', 'CAN']).allowed).toBe(true);
  });

  it('admits a caller holding only one — any one satisfies the category', () => {
    expect(policy.check(['GBR'], ['GBR', 'CAN']).allowed).toBe(true);
  });

  it('denies a caller holding none of them', () => {
    const d = policy.check(['USA'], ['GBR', 'CAN']);

    expect(d.allowed).toBe(false);
    // No single one was "the" requirement, so the whole set is reported.
    expect(d.missing.slice().sort()).toEqual(['CAN', 'GBR']);
  });
});

describe('across categories the combination is always conjunctive', () => {
  const policy = new MarkingPolicy({
    categories: [
      { name: 'RELEASE_TO', mode: 'DISJUNCTIVE' },
      { name: 'TYPE', mode: 'CONJUNCTIVE' },
    ],
    markings: [
      { name: 'GBR', category: 'RELEASE_TO' },
      { name: 'CAN', category: 'RELEASE_TO' },
      { name: 'MEDICAL', category: 'TYPE' },
    ],
  });

  it('requires every category to pass, even when one is disjunctive', () => {
    // Satisfies RELEASE_TO via GBR but holds no MEDICAL.
    const d = policy.check(['GBR'], ['GBR', 'CAN', 'MEDICAL']);

    expect(d.allowed).toBe(false);
    expect(d.missing).toEqual(['MEDICAL']);
  });

  it('allows when each category is independently satisfied', () => {
    expect(policy.check(['CAN', 'MEDICAL'], ['GBR', 'CAN', 'MEDICAL']).allowed).toBe(true);
  });
});

describe('hierarchical category — rank dominance', () => {
  const policy = new MarkingPolicy({
    categories: [{ name: 'CLASSIFICATION', mode: 'CONJUNCTIVE' }],
    markings: [
      { name: 'SYNTHETIC', category: 'CLASSIFICATION', rank: 1 },
      { name: 'DEIDENTIFIED', category: 'CLASSIFICATION', rank: 2 },
      { name: 'IDENTIFIABLE', category: 'CLASSIFICATION', rank: 3 },
    ],
  });

  it('lets a higher clearance satisfy a lower requirement', () => {
    expect(policy.check(['IDENTIFIABLE'], ['DEIDENTIFIED']).allowed).toBe(true);
    expect(policy.check(['IDENTIFIABLE'], ['SYNTHETIC']).allowed).toBe(true);
  });

  it('does not let a lower clearance satisfy a higher requirement', () => {
    expect(policy.check(['DEIDENTIFIED'], ['IDENTIFIABLE']).allowed).toBe(false);
  });

  it('treats equal rank as satisfied', () => {
    expect(policy.check(['DEIDENTIFIED'], ['DEIDENTIFIED']).allowed).toBe(true);
  });

  it('does not let rank leak across categories', () => {
    const cross = new MarkingPolicy({
      markings: [
        { name: 'HIGH_A', category: 'A', rank: 9 },
        { name: 'LOW_B', category: 'B', rank: 1 },
      ],
    });

    expect(cross.check(['HIGH_A'], ['LOW_B']).allowed).toBe(false);
  });
});

describe('fail-closed on configuration gaps', () => {
  const policy = new MarkingPolicy({ markings: [{ name: 'PII' }] });

  it('denies a marking the deployment never defined', () => {
    // An undefined marking is a config error. Ignoring it would serve the data.
    expect(policy.check([], ['GHOST']).allowed).toBe(false);
  });

  it('does not rank-dominate an unknown marking', () => {
    expect(policy.check(['PII'], ['GHOST']).allowed).toBe(false);
  });
});

describe('per-ObjectType requirements', () => {
  const policy = new MarkingPolicy({
    markings: [{ name: 'PII' }],
    byObjectType: { Patient: ['PII'] },
  });

  it('reports what a type requires', () => {
    expect(policy.requiredFor('Patient')).toEqual(['PII']);
    expect(policy.requiredFor('Ward')).toEqual([]);
  });

  it('knows when nothing is configured, so callers can skip the check', () => {
    expect(new MarkingPolicy({ markings: [] }).isEmpty).toBe(true);
    expect(policy.isEmpty).toBe(false);
  });
});
