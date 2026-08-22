/**
 * The URL is the location, so parsing has to be total and round-tripping has
 * to be exact — a link someone pasted must reopen the same record.
 */

import { describe, it, expect } from 'vitest';
import { parseRoute, formatRoute, sameRoute, JOB_SLUGS } from '../routing/route.js';
import type { Route } from '../routing/route.js';

describe('parseRoute', () => {
  it('reads pack, job and screen', () => {
    expect(parseRoute('/supply-chain/operate/objects')).toEqual({
      pack: 'supply-chain', job: 'OP', screen: 'objects',
    });
  });

  it('reads an open record', () => {
    expect(parseRoute('/nhs-acute/operate/objects/Patient/pat-001')).toEqual({
      pack: 'nhs-acute', job: 'OP', screen: 'objects',
      record: { type: 'Patient', id: 'pat-001' },
    });
  });

  it('accepts every job slug', () => {
    for (const [key, slug] of Object.entries(JOB_SLUGS)) {
      expect(parseRoute(`/core/${slug}/x`)?.job).toBe(key);
    }
  });

  it('decodes segments, so an id with a slash-escaped character survives', () => {
    const route = parseRoute('/core/operate/objects/Order/ord%2F42');
    expect(route?.record).toEqual({ type: 'Order', id: 'ord/42' });
  });

  it('returns null for anything that is not a location', () => {
    // Each of these used to be a candidate for "guess something reasonable",
    // which is how a bad link renders the wrong screen instead of a 404.
    expect(parseRoute('/')).toBeNull();
    expect(parseRoute('/supply-chain')).toBeNull();
    expect(parseRoute('/supply-chain/operate')).toBeNull();
    expect(parseRoute('/supply-chain/nonsense/objects')).toBeNull();
    expect(parseRoute('/supply-chain/operate/objects/Patient')).toBeNull();
    expect(parseRoute('/a/operate/b/c/d/e')).toBeNull();
  });
});

describe('formatRoute', () => {
  it('round-trips every shape', () => {
    const routes: Route[] = [
      { pack: 'supply-chain', job: 'OP', screen: 'objects' },
      { pack: 'nhs-acute', job: 'IN', screen: 'audit-trail' },
      { pack: 'core', job: 'MO', screen: 'workshop' },
      { pack: 'core', job: 'AD', screen: 'sync-health', record: { type: 'Facility', id: 'f 1/2' } },
    ];
    for (const route of routes) {
      expect(parseRoute(formatRoute(route))).toEqual(route);
    }
  });

  it('writes the readable job slug rather than the internal key', () => {
    expect(formatRoute({ pack: 'core', job: 'IN', screen: 'audit-trail' }))
      .toBe('/core/investigate/audit-trail');
  });
});

describe('sameRoute', () => {
  it('compares by value so a repeat navigation adds no history entry', () => {
    const a: Route = { pack: 'core', job: 'OP', screen: 'objects' };
    expect(sameRoute(a, { ...a })).toBe(true);
    expect(sameRoute(a, { ...a, screen: 'facilities' })).toBe(false);
    expect(sameRoute(a, null)).toBe(false);
    expect(sameRoute(null, null)).toBe(true);
  });
});
