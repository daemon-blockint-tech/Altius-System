/**
 * GitFunctionSource tests.
 *
 * Creates a real local Git repo in a temp directory and clones it
 * via the file:// URL scheme... but wait — GitFunctionSource only allows
 * HTTPS. So instead we test the URL validation, path safety, and
 * glob matching directly, and skip the clone/pull tests if git is not
 * available.
 *
 * For the clone/pull integration, we use a mock by spawning a local
 * git server is overkill — instead we verify the security checks and
 * the file-reading/listing logic against a pre-populated directory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitFunctionSource, repoIdForUrl } from '../functions/git-function-source.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('GitFunctionSource', () => {
  let baseDir: string;
  let source: GitFunctionSource;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'altius-git-test-'));
    source = new GitFunctionSource(baseDir);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  describe('URL validation', () => {
    it('rejects non-HTTPS URLs', async () => {
      await expect(
        source.clone('repo1', { url: 'git@github.com:org/repo.git' }),
      ).rejects.toThrow(/only HTTPS/);
    });

    it('rejects file:// URLs', async () => {
      await expect(
        source.clone('repo1', { url: 'file:///etc/passwd' }),
      ).rejects.toThrow(/only HTTPS/);
    });

    it('rejects SSH URLs', async () => {
      await expect(
        source.clone('repo1', { url: 'ssh://git@github.com/org/repo.git' }),
      ).rejects.toThrow(/only HTTPS/);
    });
  });

  describe('readFile with pre-populated directory', () => {
    beforeEach(async () => {
      // Simulate a cloned repo by creating the directory directly
      const repoDir = join(baseDir, 'test-repo');
      await mkdir(repoDir, { recursive: true });
      await mkdir(join(repoDir, 'functions'), { recursive: true });
      await writeFile(join(repoDir, 'functions', 'doubler.py'), 'print("hello")\n');
      await writeFile(join(repoDir, 'README.md'), '# Test Repo\n');
    });

    it('reads a file from the repo', async () => {
      const content = await source.readFile('test-repo', 'functions/doubler.py');
      expect(content).toContain('print("hello")');
    });

    it('reads a file from the root', async () => {
      const content = await source.readFile('test-repo', 'README.md');
      expect(content).toContain('# Test Repo');
    });

    it('rejects path traversal', async () => {
      await expect(
        source.readFile('test-repo', '../../../etc/passwd'),
      ).rejects.toThrow(/path traversal/);
    });

    it('lists files matching a pattern', async () => {
      const files = await source.listFiles('test-repo', '*.py');
      expect(files).toContain('functions/doubler.py');
      expect(files).not.toContain('README.md');
    });

    it('lists all files when no pattern', async () => {
      const files = await source.listFiles('test-repo');
      expect(files).toContain('functions/doubler.py');
      expect(files).toContain('README.md');
    });

    it('skips the .git directory', async () => {
      const repoDir = join(baseDir, 'test-repo');
      await mkdir(join(repoDir, '.git'), { recursive: true });
      await writeFile(join(repoDir, '.git', 'config'), '[core]\n');
      const files = await source.listFiles('test-repo');
      expect(files.some((f) => f.startsWith('.git/'))).toBe(false);
    });
  });

  describe('repoIdForUrl', () => {
    it('extracts repo name from URL', () => {
      const id = repoIdForUrl('https://github.com/org/my-functions.git');
      expect(id).toMatch(/^my-functions-/);
    });

    it('handles URLs without .git suffix', () => {
      const id = repoIdForUrl('https://github.com/org/my-functions');
      expect(id).toMatch(/^my-functions-/);
    });
  });

  describe('remove', () => {
    it('removes a cloned repo directory', async () => {
      const repoDir = join(baseDir, 'to-remove');
      await mkdir(repoDir, { recursive: true });
      await writeFile(join(repoDir, 'file.txt'), 'content\n');
      await source.remove('to-remove');
      // Should not throw — directory is gone
      const { existsSync } = await import('node:fs');
      expect(existsSync(repoDir)).toBe(false);
    });
  });
});
