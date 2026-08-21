/**
 * `requiresJustification` — the checkpoint declaration on action manifests.
 */

import { describe, it, expect } from 'vitest';

import { parseActionManifest } from '../index.js';

const BASE = `
action: ExportRecords
version: 1
reversible: false
effects: []
`;

describe('parseActionManifest — requiresJustification', () => {
  it('parses true', () => {
    const result = parseActionManifest(`${BASE}requiresJustification: true\n`);
    expect(result.valid).toBe(true);
    expect(result.manifest?.requiresJustification).toBe(true);
  });

  it('is absent when not declared (and when false)', () => {
    expect(parseActionManifest(BASE).manifest?.requiresJustification).toBeUndefined();
    expect(
      parseActionManifest(`${BASE}requiresJustification: false\n`).manifest?.requiresJustification,
    ).toBeUndefined();
  });
});
