/**
 * Which runtime executes pack-authored function code decides whether that code
 * can read the gateway's secrets.
 *
 * NodeFunctionRuntime imports the entry module into the API process, so a
 * function body sees the same `process.env` the gateway does — the Postgres
 * URL, the OIDC client secret, the OpenFGA store token. IsolatedNodeFunctionRuntime
 * forks a child with `env: {}` instead.
 *
 * These tests pin that difference so the safe runtime cannot quietly stop being
 * the one production wires.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeFunctionRuntime, IsolatedNodeFunctionRuntime } from '../functions/index.js';
import type { FunctionRuntimeContext } from '../functions/index.js';

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const SECRET = 'postgres://user:hunter2@db/altius';

/** Minimal context: the runtimes read fn.entry, fn.name, inputs and log. */
function probeContext(): FunctionRuntimeContext {
  return {
    fn: { name: 'EnvProbe', entry: 'env-probe.mjs' } as FunctionRuntimeContext['fn'],
    inputs: {},
    packDir: FIXTURE_DIR,
    log: () => {},
  };
}

describe('function runtime isolation', () => {
  beforeEach(() => {
    process.env['ALTIUS_TEST_SECRET'] = SECRET;
  });
  afterEach(() => {
    delete process.env['ALTIUS_TEST_SECRET'];
  });

  it('in-process runtime hands pack code the gateway environment', async () => {
    const runtime = new NodeFunctionRuntime({ packDir: FIXTURE_DIR });

    const result = (await runtime.execute(probeContext())) as { secret: string | null };

    // Not an assertion of desired behaviour — this documents why production
    // must not use this runtime for pack-authored code.
    expect(result.secret).toBe(SECRET);
  });

  it('isolated runtime does not', async () => {
    const runtime = new IsolatedNodeFunctionRuntime({ packDir: FIXTURE_DIR });

    const result = (await runtime.execute(probeContext())) as { secret: string | null };

    expect(result.secret).toBeNull();
  });

  it('registers under a caller-chosen name so it can replace the built-in node runtime', () => {
    // Production wires it as 'node' so packs get isolation without opting in;
    // defaulting to 'node-isolated' would make safety a per-pack decision.
    expect(new IsolatedNodeFunctionRuntime().name).toBe('node-isolated');
    expect(new IsolatedNodeFunctionRuntime({ name: 'node' }).name).toBe('node');
  });
});
