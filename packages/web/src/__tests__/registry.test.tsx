/**
 * The registry is the navigation. The property that matters is that it cannot
 * offer a screen the active pack has no way to render — that mismatch is what
 * used to produce four dead nav entries and a "not yet wired" placeholder.
 */

import { describe, it, expect } from 'vitest';
import { SCREENS, screensFor, findScreen, jobsFor } from '../screens/registry.js';

describe('screen registry', () => {
  it('offers supply-chain its own screens', () => {
    const ids = screensFor('supply-chain').map(s => s.id);
    expect(ids).toContain('facilities');
    expect(ids).toContain('shipments');
    expect(ids).toContain('inventory');
    expect(ids).not.toContain('patients');
  });

  it('does not offer another pack the supply-chain screens', () => {
    for (const pack of ['nhs-acute', 'altius-core', 'aml']) {
      const ids = screensFor(pack).map(s => s.id);
      expect(ids).not.toContain('facilities');
      expect(ids).not.toContain('purchase-orders');
    }
  });

  it('gives every pack the ontology-driven screens', () => {
    for (const pack of ['supply-chain', 'nhs-acute', 'altius-core']) {
      const ids = screensFor(pack).map(s => s.id);
      expect(ids).toEqual(expect.arrayContaining(['objects', 'action-console', 'audit-trail', 'ontology-explorer']));
    }
  });

  it('every screen the nav lists can be found and rendered', () => {
    for (const pack of ['supply-chain', 'nhs-acute', 'altius-core']) {
      for (const job of jobsFor(pack)) {
        for (const entry of job.screens) {
          const def = findScreen(pack, entry.id);
          expect(def, `${pack}/${entry.id} is in the nav`).toBeDefined();
          expect(typeof def!.render).toBe('function');
        }
      }
    }
  });

  it('leaves out a job with nothing to show rather than rendering it empty', () => {
    for (const pack of ['supply-chain', 'nhs-acute', 'altius-core']) {
      for (const job of jobsFor(pack)) {
        expect(job.screens.length).toBeGreaterThan(0);
      }
    }
  });

  it('finds nothing for a screen the pack cannot show', () => {
    expect(findScreen('nhs-acute', 'shipments')).toBeUndefined();
    expect(findScreen('supply-chain', 'patients')).toBeUndefined();
    expect(findScreen('supply-chain', 'no-such-screen')).toBeUndefined();
  });

  it('keeps ids unique — two screens sharing one id is what made /facilities ambiguous', () => {
    const seen = new Map<string, string[]>();
    for (const s of SCREENS) seen.set(s.id, [...(seen.get(s.id) ?? []), s.packs?.join(',') ?? 'all']);
    for (const [id, owners] of seen) {
      expect(owners.length, `${id} is declared once`).toBe(1);
    }
  });
});
