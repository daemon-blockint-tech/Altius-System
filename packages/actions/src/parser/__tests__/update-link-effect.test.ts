/**
 * Tests for the updateLink effect — parsing, validation, and cross-reference.
 *
 * A "link rule" could previously only create or delete links, not modify link
 * properties. updateLink fills that gap: it resolves a filter to matching
 * links (same as deleteLink), resolves `set` expressions (same as updateObject),
 * and calls txn.updateLink.
 */

import { describe, it, expect } from 'vitest';
import { parseActionManifest } from '../index.js';

describe('updateLink effect parsing', () => {
  it('parses a valid updateLink effect', () => {
    const yaml = `
action: UpdateReason
version: 1
reversible: false
effects:
  - type: updateLink
    linkType: AdmittedTo
    filter:
      from: patient
    set:
      reason: "params.newReason"
`;
    const result = parseActionManifest(yaml);
    expect(result.errors).toHaveLength(0);
    expect(result.manifest!.effects).toHaveLength(1);
    const effect = result.manifest!.effects[0]!;
    expect(effect.type).toBe('updateLink');
    if (effect.type === 'updateLink') {
      expect(effect.linkType).toBe('AdmittedTo');
      expect(effect.filter.from).toBe('patient');
      expect(effect.set['reason']).toBe('params.newReason');
      expect(effect.expect).toBeUndefined(); // defaults to ONE at execution
    }
  });

  it('parses expect: ALL and condition', () => {
    const yaml = `
action: UpdateReason
version: 1
reversible: false
effects:
  - type: updateLink
    linkType: AdmittedTo
    filter:
      from: patient
    set:
      reason: "'updated'"
    expect: ALL
    condition: "patient.active == true"
`;
    const result = parseActionManifest(yaml);
    expect(result.errors).toHaveLength(0);
    const effect = result.manifest!.effects[0]!;
    if (effect.type === 'updateLink') {
      expect(effect.expect).toBe('ALL');
      expect(effect.condition).toBe('patient.active == true');
    }
  });

  it('rejects updateLink without set', () => {
    const yaml = `
action: UpdateReason
version: 1
reversible: false
effects:
  - type: updateLink
    linkType: AdmittedTo
    filter:
      from: patient
`;
    const result = parseActionManifest(yaml);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.code === 'MISSING_FIELD' && e.message.includes('set'))).toBe(true);
  });

  it('rejects updateLink without linkType', () => {
    const yaml = `
action: UpdateReason
version: 1
reversible: false
effects:
  - type: updateLink
    filter:
      from: patient
    set:
      reason: "x"
`;
    const result = parseActionManifest(yaml);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.code === 'MISSING_FIELD' && e.message.includes('linkType'))).toBe(true);
  });
});
