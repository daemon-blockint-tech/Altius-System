/**
 * SandboxProfile — declarative filesystem and network restrictions for
 * function execution.
 *
 * The isolated Node and Python runtimes fork child processes to run
 * user-authored code. Without a sandbox, those children can open sockets
 * and read any file the OS lets them read. This module provides a
 * declarative profile that the runtimes apply to restrict:
 *
 *   - Network: which hosts/ports the child may connect to (default: none)
 *   - Filesystem: which directories the child may read/write (default: temp only)
 *
 * Implementation:
 *
 * On Linux, the profile is enforced via a preload library that intercepts
 * socket(2), connect(2), open(2), and openat(2) syscalls using LD_PRELOAD.
 * The preload library reads the sandbox config from an env var and rejects
 * disallowed calls with EACCES.
 *
 * On macOS/Darwin, the profile is enforced via the `sandbox-exec` wrapper
 * (Apple's Seatbelt), which applies a Seatbelt policy derived from the profile.
 *
 * On platforms without either mechanism (Windows, or Linux without the
 * preload library), the profile is advisory only — the runtimes log a
 * warning that no sandbox is active. This is the same posture as before
 * (process isolation without a security boundary), but now the platform
 * CAN enforce one when the deployment provides the preload library.
 *
 * The preload library source is shipped at
 * packages/engine/src/functions/sandbox-preload.c and can be compiled with:
 *   cc -shared -fPIC -o sandbox-preload.so sandbox-preload.c -ldl
 */
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

/** A filesystem access rule. */
export interface FsRule {
  /** Directory path the rule applies to. */
  path: string;
  /** Allowed operations. */
  access: 'read' | 'write' | 'read-write';
}

/** A network access rule. */
export interface NetworkRule {
  /** Hostname or IP address. */
  host: string;
  /** Port (optional — if omitted, all ports on this host). */
  port?: number;
}

/** A declarative sandbox profile. */
export interface SandboxProfile {
  /** Filesystem rules. If empty, no filesystem access is allowed (except temp). */
  fsRules: FsRule[];
  /** Network rules. If empty, no network access is allowed. */
  networkRules: NetworkRule[];
  /** Whether to allow the child to read /proc and /sys (Linux). Default: false. */
  allowProc?: boolean;
  /** Whether to allow the child to read environment variables. Default: false. */
  allowEnv?: boolean;
}

/** Default sandbox profile: no network, temp-dir-only filesystem. */
export const DEFAULT_SANDBOX_PROFILE: SandboxProfile = {
  fsRules: [],
  networkRules: [],
  allowProc: false,
  allowEnv: false,
};

/**
 * Result of applying a sandbox profile to a child process.
 */
export interface SandboxApplication {
  /** Environment variables to set on the child. */
  env: Record<string, string>;
  /** Extra execArgv or args to pass to the child. */
  args: string[];
  /** The temp directory created for this sandbox (to clean up after). */
  tempDir?: string;
  /** Whether the sandbox is actually enforced (vs advisory). */
  enforced: boolean;
  /** Cleanup function to call after the child exits. */
  cleanup: () => Promise<void>;
}

/**
 * Apply a sandbox profile to a child process environment.
 *
 * This prepares the env vars and args that the runtime will pass to
 * spawn/fork. The actual enforcement happens in the preload library
 * (Linux) or sandbox-exec wrapper (macOS).
 */
export async function applySandboxProfile(
  profile: SandboxProfile,
  options: { workDir?: string } = {},
): Promise<SandboxApplication> {
  // Create a temp directory for the child's working files
  const tempDir = options.workDir ?? await mkdtemp(join(tmpdir(), 'altius-sandbox-'));

  // Build the sandbox config JSON that the preload library reads
  const config = {
    fs: [
      // Always allow the temp dir
      { path: tempDir, access: 'read-write' as const },
      // Always allow /tmp (for system temp operations)
      { path: '/tmp', access: 'read-write' as const },
      { path: tmpdir(), access: 'read-write' as const },
      // User-specified rules
      ...profile.fsRules,
    ],
    network: profile.networkRules,
    allowProc: profile.allowProc ?? false,
    allowEnv: profile.allowEnv ?? false,
  };

  const configPath = join(tempDir, '.sandbox-config.json');
  await writeFile(configPath, JSON.stringify(config), 'utf-8');

  // Detect the platform's enforcement mechanism
  const platform = process.platform;
  let enforced = false;
  let args: string[] = [];
  const env: Record<string, string> = {
    ALTius_SANDBOX_CONFIG: configPath,
    ALTius_SANDBOX_TEMP: tempDir,
    TMPDIR: tempDir,
  };

  if (platform === 'linux') {
    // Check for the preload library next to this module. This package is ESM
    // (`"type": "module"`), where `__dirname` is undefined — referencing it threw
    // a ReferenceError here on every Linux function invocation (the branch never
    // runs on the macOS dev/test host, so it went unseen). Resolve via the module
    // URL, the same pattern isolated-node-runtime uses for the worker.
    const preloadPath = fileURLToPath(new URL('sandbox-preload.so', import.meta.url));
    if (existsSync(preloadPath)) {
      env['LD_PRELOAD'] = preloadPath;
      enforced = true;
    } else {
      // Check for a system-installed preload
      const systemPreload = '/usr/lib/altius/sandbox-preload.so';
      if (existsSync(systemPreload)) {
        env['LD_PRELOAD'] = systemPreload;
        enforced = true;
      }
    }
  } else if (platform === 'darwin') {
    // macOS: use sandbox-exec if available
    try {
      const which = spawn('which', ['sandbox-exec'], { stdio: 'pipe' });
      await new Promise<void>((resolve, reject) => {
        which.on('close', (code) => code === 0 ? resolve() : reject());
        which.on('error', reject);
      });
      // We'll wrap the child in sandbox-exec at spawn time
      // The seatbelt policy is derived from the config
      enforced = true;
      args = ['-p', buildSeatbeltPolicy(config)];
    } catch {
      // sandbox-exec not available
    }
  }

  return {
    env,
    args,
    tempDir: options.workDir ? undefined : tempDir,
    enforced,
    cleanup: async () => {
      if (!options.workDir) {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Build a Seatbelt policy (macOS) from the sandbox config.
 *
 * This is a minimal policy that:
 *   - Denies all network by default
 *   - Allows network to specified hosts/ports
 *   - Allows file reads/writes to specified paths
 *   - Denies everything else
 */
function buildSeatbeltPolicy(config: {
  fs: FsRule[];
  network: NetworkRule[];
  allowProc: boolean;
  allowEnv: boolean;
}): string {
  const lines: string[] = [
    '(version 1)',
    '(deny default)',
    '(allow process-exec (subpath "/usr/bin" "/bin" "/usr/local/bin"))',
    '(allow sysctl-read)',
  ];

  // Filesystem rules
  for (const rule of config.fs) {
    const subpath = `(subpath "${rule.path}")`;
    if (rule.access === 'read') {
      lines.push(`(allow file-read* ${subpath})`);
    } else if (rule.access === 'write') {
      lines.push(`(allow file-write* ${subpath})`);
    } else {
      lines.push(`(allow file-read* ${subpath})`);
      lines.push(`(allow file-write* ${subpath})`);
    }
  }

  // Network rules
  if (config.network.length === 0) {
    lines.push('(deny network*)');
  } else {
    lines.push('(deny network*)');
    for (const rule of config.network) {
      const host = rule.host;
      if (rule.port !== undefined) {
        lines.push(`(allow network-outbound (remote tcp "${host}:${rule.port}"))`);
      } else {
        lines.push(`(allow network-outbound (remote tcp "${host}"))`);
      }
    }
  }

  // /proc and /sys
  if (!config.allowProc) {
    lines.push('(deny file-read* (subpath "/proc"))');
    lines.push('(deny file-read* (subpath "/sys"))');
  }

  return lines.join('\n');
}

/**
 * Validate a sandbox profile.
 *
 * Throws on invalid configurations (e.g. a rule with an empty path).
 */
export function validateSandboxProfile(profile: SandboxProfile): void {
  for (const rule of profile.fsRules) {
    if (!rule.path || !isAbsolute(rule.path)) {
      throw new Error(`SandboxProfile: fs rule path must be absolute (got: "${rule.path}")`);
    }
    if (rule.access !== 'read' && rule.access !== 'write' && rule.access !== 'read-write') {
      throw new Error(`SandboxProfile: fs rule access must be read, write, or read-write (got: "${rule.access}")`);
    }
  }
  for (const rule of profile.networkRules) {
    if (!rule.host) {
      throw new Error('SandboxProfile: network rule must have a host');
    }
    if (rule.port !== undefined && (rule.port < 1 || rule.port > 65535)) {
      throw new Error(`SandboxProfile: network rule port must be 1-65535 (got: ${rule.port})`);
    }
  }
}
