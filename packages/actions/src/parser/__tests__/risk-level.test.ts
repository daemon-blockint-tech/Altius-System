/**
 * Two-sided proof that the action manifest `riskLevel` declaration works.
 *
 * The gap: risk classification was effects-derived (deleteObject/deleteLink →
 * high) + env (MCP_HIGH_RISK_ACTIONS). A pack author had no way to declare
 * that a non-destructive action (e.g. bulk PII export) is high-risk, or to
 * downgrade a destructive action to medium. The fix: `riskLevel` is now a
 * declarative field on ActionManifest, parsed and validated, and takes
 * precedence over the effects-derived classification in the server.
 */
import { describe, it, expect } from 'vitest';
import { parseActionManifest } from '../index.js';

const BASE = `action: TestAction
version: 1
reversible: false
effects: []
sideEffects: []
`;

describe('parseActionManifest — riskLevel', () => {
  it('parses a valid riskLevel: high', () => {
    const result = parseActionManifest(`${BASE}riskLevel: high\n`);
    expect(result.valid).toBe(true);
    expect(result.manifest?.riskLevel).toBe('high');
  });

  it('parses a valid riskLevel: medium', () => {
    const result = parseActionManifest(`${BASE}riskLevel: medium\n`);
    expect(result.valid).toBe(true);
    expect(result.manifest?.riskLevel).toBe('medium');
  });

  it('parses a valid riskLevel: low', () => {
    const result = parseActionManifest(`${BASE}riskLevel: low\n`);
    expect(result.valid).toBe(true);
    expect(result.manifest?.riskLevel).toBe('low');
  });

  it('omits riskLevel when not declared', () => {
    const result = parseActionManifest(BASE);
    expect(result.valid).toBe(true);
    expect(result.manifest?.riskLevel).toBeUndefined();
  });

  it('rejects an invalid riskLevel value', () => {
    const result = parseActionManifest(`${BASE}riskLevel: hight\n`);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_RISK_LEVEL')).toBe(true);
    expect(result.errors[0]!.message).toContain('hight');
  });

  it('rejects a non-string riskLevel', () => {
    const result = parseActionManifest(`${BASE}riskLevel: 42\n`);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_RISK_LEVEL')).toBe(true);
  });

  it('coexists with requiredRoles and requiresJustification', () => {
    const result = parseActionManifest(`${BASE}requiredRoles: [admin]
requiresJustification: true
riskLevel: high
`);
    expect(result.valid).toBe(true);
    expect(result.manifest?.riskLevel).toBe('high');
    expect(result.manifest?.requiredRoles).toEqual(['admin']);
    expect(result.manifest?.requiresJustification).toBe(true);
  });
});
