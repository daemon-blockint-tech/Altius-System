/**
 * The in-process node runtime imports pack code straight into the API process,
 * which holds POSTGRES_URL, the OIDC client secret and the OpenFGA token — so
 * pack code can read all of them, and a non-terminating function hangs the
 * gateway for every tenant.
 *
 * These assert the two properties that make the isolated runtime usable for
 * pack code: the child cannot see the parent's environment, and it cannot run
 * forever.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FunctionType } from '@altius/odl';
import { IsolatedNodeFunctionRuntime } from '../functions/isolated-node-runtime.js';
import type { FunctionLogEntry } from '../functions/function-executor.js';

const PACK_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fns');

function fn(entry: string): FunctionType {
  return { name: entry.replace('.js', ''), entry, fields: [], directives: [] } as unknown as FunctionType;
}

function run(runtime: IsolatedNodeFunctionRuntime, entry: string, inputs: Record<string, unknown> = {}) {
  const logs: FunctionLogEntry[] = [];
  const promise = runtime.execute({
    fn: fn(entry),
    inputs,
    packDir: PACK_DIR,
    log: (level, message) => logs.push({ level, message, timestamp: '' }),
  });
  return { promise, logs };
}

describe('IsolatedNodeFunctionRuntime', () => {
  beforeAll(() => { process.env['ALTIUS_TEST_SECRET'] = 'super-secret-value'; });
  afterAll(() => { delete process.env['ALTIUS_TEST_SECRET']; });

  it('runs a function and returns its value', async () => {
    const runtime = new IsolatedNodeFunctionRuntime();
    const { promise, logs } = run(runtime, 'echo.js', { n: 21 });

    await expect(promise).resolves.toEqual({ doubled: 42 });
    expect(logs.map(l => l.message)).toContain('got 1 input(s)');
  });

  it('does not leak the parent process environment to pack code', async () => {
    // The whole reason this runtime exists.
    expect(process.env['ALTIUS_TEST_SECRET']).toBe('super-secret-value');
    const runtime = new IsolatedNodeFunctionRuntime();

    const { promise } = run(runtime, 'leak-secret.js');
    const result = await promise as { saw: string | null; envKeys: string[] };

    expect(result.saw).toBeNull();
    // Nothing the parent set reaches the child. Asserted by name rather than
    // by count: the OS injects its own vars (macOS adds
    // __CF_USER_TEXT_ENCODING), so a zero-key assertion would be false on some
    // platforms and green-but-meaningless on others.
    for (const inherited of ['ALTIUS_TEST_SECRET', 'PATH', 'HOME', 'POSTGRES_URL']) {
      expect(result.envKeys).not.toContain(inherited);
    }
  });

  it('kills a function that never terminates instead of hanging', async () => {
    const runtime = new IsolatedNodeFunctionRuntime({ timeoutMs: 300 });

    const { promise } = run(runtime, 'spin.js');

    await expect(promise).rejects.toThrow(/exceeded 300ms and was terminated/);
  }, 10_000);

  it('surfaces a throw inside pack code as a typed failure', async () => {
    const runtime = new IsolatedNodeFunctionRuntime();

    const { promise } = run(runtime, 'boom.js');

    await expect(promise).rejects.toThrow(/deliberate failure inside pack code/);
  });

  it('rejects a function type that declares no entry', async () => {
    const runtime = new IsolatedNodeFunctionRuntime();

    await expect(runtime.execute({
      fn: { name: 'NoEntry', fields: [], directives: [] } as unknown as FunctionType,
      inputs: {},
      log: () => {},
    })).rejects.toThrow(/declares no entry module/);
  });
});
