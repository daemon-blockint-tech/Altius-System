/**
 * applySandboxProfile must not reference `__dirname`.
 *
 * This package is ESM, where `__dirname` is undefined. The Linux branch resolved
 * the preload library with `resolve(__dirname, ...)`, throwing a ReferenceError
 * on every isolated-node and python function invocation on Linux (production) —
 * unseen because the branch never runs on the macOS dev/test host.
 *
 * This test forces the Linux branch and asserts the call resolves cleanly.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { applySandboxProfile, DEFAULT_SANDBOX_PROFILE } from '../functions/sandbox-profile.js';

const realPlatform = process.platform;
const dirs: string[] = [];

afterEach(async () => {
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true })));
});

describe('applySandboxProfile — ESM path resolution', () => {
  it('resolves the preload path on the linux branch without throwing', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const app = await applySandboxProfile(DEFAULT_SANDBOX_PROFILE);
    if (app.tempDir) dirs.push(app.tempDir);
    // The config env is always populated; enforcement is false here because the
    // preload .so is not installed in the test tree — the point is it did not
    // throw resolving the path.
    expect(app.env['ALTius_SANDBOX_CONFIG']).toBeTruthy();
    expect(typeof app.enforced).toBe('boolean');
    await app.cleanup();
  });
});
