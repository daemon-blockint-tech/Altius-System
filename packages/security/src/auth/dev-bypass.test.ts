/**
 * The unauthenticated dev identity must take a deliberate act to reach.
 *
 * `NODE_ENV !== 'production'` was the whole gate on the REST/GraphQL surface.
 * That test is fail-OPEN: it passes when the variable is unset, misspelled, or
 * capitalised differently. The published api-gateway image sets no NODE_ENV, so
 * `docker run` of a release image with no environment answered any request that
 * carried no Authorization header with a nine-role admin — and staging, UAT and
 * demo boxes are the same shape.
 *
 * These pin both halves of the gate, because either one alone is the bug.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DEV_USER, devAuthBypassEnabled } from './dev-bypass.js';

const FLAG = 'ALTIUS_TEST_DEV_AUTH_BYPASS';

describe('devAuthBypassEnabled', () => {
  let savedFlag: string | undefined;
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    savedFlag = process.env[FLAG];
    savedNodeEnv = process.env['NODE_ENV'];
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = savedFlag;
    if (savedNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = savedNodeEnv;
  });

  it('is off when the flag is unset, whatever NODE_ENV says', () => {
    delete process.env[FLAG];
    // The exact shape that shipped: not production, no opt-in.
    for (const env of ['development', 'staging', 'test', 'Production', 'prod']) {
      process.env['NODE_ENV'] = env;
      expect(devAuthBypassEnabled(FLAG), `NODE_ENV=${env}`).toBe(false);
    }
    // And with NODE_ENV absent entirely — the published image's default.
    delete process.env['NODE_ENV'];
    expect(devAuthBypassEnabled(FLAG)).toBe(false);
  });

  it('is off in production even when the flag is set', () => {
    process.env[FLAG] = 'true';
    process.env['NODE_ENV'] = 'production';
    expect(devAuthBypassEnabled(FLAG)).toBe(false);
  });

  it('is on only for an exact "true" outside production', () => {
    process.env['NODE_ENV'] = 'development';
    process.env[FLAG] = 'true';
    expect(devAuthBypassEnabled(FLAG)).toBe(true);

    // Truthy-looking values are not opt-ins.
    for (const v of ['1', 'yes', 'TRUE', 'True', '']) {
      process.env[FLAG] = v;
      expect(devAuthBypassEnabled(FLAG), `flag=${JSON.stringify(v)}`).toBe(false);
    }
  });

  it('reads the flag per call, so flipping it takes effect immediately', () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env[FLAG];
    expect(devAuthBypassEnabled(FLAG)).toBe(false);
    process.env[FLAG] = 'true';
    expect(devAuthBypassEnabled(FLAG)).toBe(true);
  });

  it('is a full-privilege identity, which is why the gate matters', () => {
    // If this ever narrows, the gate can relax. Until then it holds every role.
    expect(DEV_USER.roles).toContain('admin');
    expect(DEV_USER.id).toBe('dev-user');
  });
});
