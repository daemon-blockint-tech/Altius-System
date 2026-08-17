/**
 * SandboxProfile tests.
 *
 * Verifies that the sandbox profile is correctly constructed,
 * validated, and applied to child process environments.
 */
import { describe, it, expect } from 'vitest';
import {
  applySandboxProfile,
  validateSandboxProfile,
  DEFAULT_SANDBOX_PROFILE,
  type SandboxProfile,
} from '../functions/sandbox-profile.js';

describe('SandboxProfile', () => {
  describe('validateSandboxProfile', () => {
    it('accepts a valid profile', () => {
      expect(() =>
        validateSandboxProfile({
          fsRules: [{ path: '/data', access: 'read' }],
          networkRules: [{ host: 'localhost', port: 5432 }],
        }),
      ).not.toThrow();
    });

    it('rejects a relative path', () => {
      expect(() =>
        validateSandboxProfile({
          fsRules: [{ path: 'relative/path', access: 'read' }],
          networkRules: [],
        }),
      ).toThrow(/must be absolute/);
    });

    it('rejects an empty path', () => {
      expect(() =>
        validateSandboxProfile({
          fsRules: [{ path: '', access: 'read' }],
          networkRules: [],
        }),
      ).toThrow(/must be absolute/);
    });

    it('rejects an invalid access mode', () => {
      expect(() =>
        validateSandboxProfile({
          fsRules: [{ path: '/data', access: 'execute' as 'read' }],
          networkRules: [],
        }),
      ).toThrow(/access must be/);
    });

    it('rejects a network rule without a host', () => {
      expect(() =>
        validateSandboxProfile({
          fsRules: [],
          networkRules: [{ host: '' }],
        }),
      ).toThrow(/must have a host/);
    });

    it('rejects an invalid port', () => {
      expect(() =>
        validateSandboxProfile({
          fsRules: [],
          networkRules: [{ host: 'localhost', port: 99999 }],
        }),
      ).toThrow(/port must be/);
    });

    it('accepts a network rule without a port', () => {
      expect(() =>
        validateSandboxProfile({
          fsRules: [],
          networkRules: [{ host: 'localhost' }],
        }),
      ).not.toThrow();
    });
  });

  describe('applySandboxProfile', () => {
    it('creates a temp directory and config file', async () => {
      const app = await applySandboxProfile(DEFAULT_SANDBOX_PROFILE);
      expect(app.tempDir).toBeDefined();
      expect(app.env['ALTius_SANDBOX_CONFIG']).toBeDefined();
      expect(app.env['ALTius_SANDBOX_TEMP']).toBeDefined();
      expect(app.env['TMPDIR']).toBe(app.tempDir);
      await app.cleanup();
    });

    it('includes the temp dir in the config', async () => {
      const app = await applySandboxProfile(DEFAULT_SANDBOX_PROFILE);
      const configPath = app.env['ALTius_SANDBOX_CONFIG']!;
      const { readFile } = await import('node:fs/promises');
      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      expect(config.fs).toContainEqual(
        expect.objectContaining({ path: app.tempDir, access: 'read-write' }),
      );
      await app.cleanup();
    });

    it('includes user-specified fs rules in the config', async () => {
      const profile: SandboxProfile = {
        fsRules: [{ path: '/data/shared', access: 'read' }],
        networkRules: [],
      };
      const app = await applySandboxProfile(profile);
      const configPath = app.env['ALTius_SANDBOX_CONFIG']!;
      const { readFile } = await import('node:fs/promises');
      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      expect(config.fs).toContainEqual(
        expect.objectContaining({ path: '/data/shared', access: 'read' }),
      );
      await app.cleanup();
    });

    it('includes user-specified network rules in the config', async () => {
      const profile: SandboxProfile = {
        fsRules: [],
        networkRules: [{ host: 'db.internal', port: 5432 }],
      };
      const app = await applySandboxProfile(profile);
      const configPath = app.env['ALTius_SANDBOX_CONFIG']!;
      const { readFile } = await import('node:fs/promises');
      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      expect(config.network).toContainEqual(
        expect.objectContaining({ host: 'db.internal', port: 5432 }),
      );
      await app.cleanup();
    });

    it('cleanup removes the temp directory', async () => {
      const app = await applySandboxProfile(DEFAULT_SANDBOX_PROFILE);
      const tempDir = app.tempDir!;
      await app.cleanup();
      const { existsSync } = await import('node:fs');
      expect(existsSync(tempDir)).toBe(false);
    });

    it('reports whether the sandbox is enforced', async () => {
      const app = await applySandboxProfile(DEFAULT_SANDBOX_PROFILE);
      // On Linux with the preload library, enforced=true; otherwise false
      expect(typeof app.enforced).toBe('boolean');
      await app.cleanup();
    });

    it('uses the provided workDir instead of creating a temp dir', async () => {
      const { mkdtemp } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const workDir = await mkdtemp(join(tmpdir(), 'altius-test-workdir-'));
      const app = await applySandboxProfile(DEFAULT_SANDBOX_PROFILE, { workDir });
      expect(app.tempDir).toBeUndefined();
      // cleanup should NOT remove the workDir
      await app.cleanup();
      const { existsSync } = await import('node:fs');
      expect(existsSync(workDir)).toBe(true);
      await import('node:fs/promises').then(({ rm }) =>
        rm(workDir, { recursive: true, force: true }),
      );
    });
  });

  describe('DEFAULT_SANDBOX_PROFILE', () => {
    it('has no fs rules', () => {
      expect(DEFAULT_SANDBOX_PROFILE.fsRules).toEqual([]);
    });

    it('has no network rules', () => {
      expect(DEFAULT_SANDBOX_PROFILE.networkRules).toEqual([]);
    });

    it('does not allow /proc', () => {
      expect(DEFAULT_SANDBOX_PROFILE.allowProc).toBe(false);
    });

    it('does not allow env vars', () => {
      expect(DEFAULT_SANDBOX_PROFILE.allowEnv).toBe(false);
    });
  });
});
