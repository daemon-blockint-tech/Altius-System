/**
 * `requiredRoles` — the declarative role gate for object-less actions.
 */

import { describe, it, expect } from 'vitest';

import { parseActionManifest } from '../index.js';

const BASE = `
action: RegisterPatient
version: 1
reversible: false
effects: []
`;

describe('parseActionManifest — requiredRoles', () => {
  it('parses a role list', () => {
    const result = parseActionManifest(`${BASE}requiredRoles: [receptionist, clinician]\n`);
    expect(result.valid).toBe(true);
    expect(result.manifest?.requiredRoles).toEqual(['receptionist', 'clinician']);
  });

  it('is absent when not declared', () => {
    const result = parseActionManifest(BASE);
    expect(result.valid).toBe(true);
    expect(result.manifest?.requiredRoles).toBeUndefined();
  });

  it('rejects a non-array value', () => {
    const result = parseActionManifest(`${BASE}requiredRoles: receptionist\n`);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'requiredRoles')).toBe(true);
  });

  it('rejects non-string entries', () => {
    const result = parseActionManifest(`${BASE}requiredRoles: [receptionist, 42]\n`);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'requiredRoles[1]')).toBe(true);
  });
});
