/**
 * GitFunctionSource — manages function source code stored in Git repositories.
 *
 * A function repository is a Git repo containing function source files.
 * This module provides:
 *   - clone: Clone a repo to a local working directory
 *   - pull: Fetch latest changes from the remote
 *   - readFile: Read a file from the working directory
 *   - listFiles: List files matching a pattern
 *
 * Uses the system `git` CLI via child_process. No Git library dependency.
 *
 * Security: only HTTPS URLs are allowed (no SSH, no file://) to prevent
 * access to arbitrary local paths. The clone is done into a sandboxed
 * directory under the configured base.
 */
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

/** Configuration for a Git function repository. */
export interface GitRepoConfig {
  /** HTTPS URL of the Git repository. */
  url: string;
  /** Branch or tag to clone. Default: 'main'. */
  ref?: string;
  /** Optional access token (for private repos). Injected as URL auth. */
  token?: string;
  /** Subdirectory within the repo containing function sources. Default: root. */
  subDir?: string;
}

/** Result of a clone or pull operation. */
export interface GitOperationResult {
  success: boolean;
  commit: string;
  message: string;
}

/**
 * Manages Git-based function source repositories.
 *
 * Each repo is cloned into `<baseDir>/<repoId>` and can be pulled
 * to update to the latest commit on the configured ref.
 */
export class GitFunctionSource {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = resolve(baseDir);
  }

  /**
   * Clone a Git repository into a working directory.
   *
   * @param repoId  - Unique identifier for this repo (used as dir name)
   * @param config  - Repo configuration
   * @returns       - Operation result with the cloned commit hash
   */
  async clone(repoId: string, config: GitRepoConfig): Promise<GitOperationResult> {
    this._validateUrl(config.url);
    const targetDir = this._repoDir(repoId);
    if (existsSync(targetDir)) {
      throw new Error(`GitFunctionSource: repo ${repoId} already cloned at ${targetDir}`);
    }
    await mkdir(targetDir, { recursive: true });

    const url = this._injectToken(config.url, config.token);
    const ref = config.ref ?? 'main';

    await this._git(targetDir, ['clone', '--depth', '1', '--branch', ref, url, targetDir]);
    const commitHash = await this._getCommitHash(targetDir);

    return { success: true, commit: commitHash, message: `Cloned ${config.url}@${ref}` };
  }

  /**
   * Pull the latest changes from the remote.
   */
  async pull(repoId: string, config: GitRepoConfig): Promise<GitOperationResult> {
    const targetDir = this._repoDir(repoId);
    if (!existsSync(targetDir)) {
      throw new Error(`GitFunctionSource: repo ${repoId} not cloned. Call clone() first.`);
    }

    const ref = config.ref ?? 'main';
    // For a shallow clone, we need to unshallow or fetch the specific ref
    await this._git(targetDir, ['fetch', '--depth', '1', 'origin', ref]);
    await this._git(targetDir, ['checkout', ref]);
    const commitHash = await this._getCommitHash(targetDir);

    return { success: true, commit: commitHash, message: `Pulled latest from ${config.url}@${ref}` };
  }

  /**
   * Read a file from the repo's working directory.
   */
  async readFile(repoId: string, filePath: string): Promise<string> {
    const targetDir = this._repoDir(repoId);
    const abs = this._safePath(targetDir, filePath);
    return readFile(abs, 'utf-8');
  }

  /**
   * List files in the repo matching a pattern (simple glob: *.py, *.ts).
   */
  async listFiles(repoId: string, pattern?: string): Promise<string[]> {
    const targetDir = this._repoDir(repoId);
    const result: string[] = [];

    const walk = async (dir: string, prefix: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip .git directory
        if (entry.name === '.git') continue;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(join(dir, entry.name), rel);
        } else {
          if (!pattern || this._matchGlob(entry.name, pattern)) {
            result.push(rel);
          }
        }
      }
    };

    await walk(targetDir, '');
    return result.sort();
  }

  /**
   * Remove a cloned repository.
   */
  async remove(repoId: string): Promise<void> {
    const targetDir = this._repoDir(repoId);
    await rm(targetDir, { recursive: true, force: true });
  }

  /**
   * Get the current commit hash of a cloned repo.
   */
  async getCommitHash(repoId: string): Promise<string> {
    const targetDir = this._repoDir(repoId);
    return this._getCommitHash(targetDir);
  }

  // ── Private helpers ──────────────────────────────────────────────

  private _repoDir(repoId: string): string {
    // Sanitize repoId to prevent path traversal
    const safe = repoId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.baseDir, safe);
  }

  private _validateUrl(url: string): void {
    if (!url.startsWith('https://')) {
      throw new Error(`GitFunctionSource: only HTTPS URLs are allowed (got: ${url.slice(0, 30)}...)`);
    }
  }

  private _injectToken(url: string, token?: string): string {
    if (!token) return url;
    // Inject token as basic auth: https://<token>@github.com/...
    return url.replace('https://', `https://${token}@`);
  }

  private _safePath(base: string, filePath: string): string {
    const abs = resolve(base, filePath);
    if (!abs.startsWith(base)) {
      throw new Error(`GitFunctionSource: path traversal detected: ${filePath}`);
    }
    return abs;
  }

  private _matchGlob(name: string, pattern: string): boolean {
    // Simple glob: only supports * wildcard
    const regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regex}$`).test(name);
  }

  private async _git(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn('git', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60_000,
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      child.on('error', (err) => {
        rejectPromise(new Error(`GitFunctionSource: git failed: ${err.message}`));
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
          rejectPromise(new Error(`GitFunctionSource: git ${args.join(' ')} exited with code ${code}: ${stderr}`));
          return;
        }
        resolvePromise(Buffer.concat(stdoutChunks).toString('utf-8').trim());
      });
    });
  }

  private async _getCommitHash(cwd: string): Promise<string> {
    const output = await this._git(cwd, ['rev-parse', 'HEAD']);
    return output.slice(0, 12); // short hash
  }
}

/**
 * Create a unique repo ID for a given URL.
 */
export function repoIdForUrl(url: string): string {
  // Extract repo name from URL: https://github.com/org/repo.git → repo
  const match = url.match(/\/([^/]+?)(\.git)?$/);
  const name = match?.[1] ?? 'repo';
  return `${name}-${randomUUID().slice(0, 8)}`;
}
