/**
 * The function chain, end to end, through the real pack loader.
 *
 * Every test the function work has so far leans on a hand-built
 * FunctionExecutor pointed at a fixtures directory. Nothing exercises the
 * shape a deployment actually has: packs discovered from disk, their ODL
 * parsed and merged, and each FunctionType's entry resolved against the pack
 * that declared it. The backlog records why that matters — zero shipped packs
 * declare @function (still true: grep across domain-packs/**\/*.odl returns
 * nothing), so the chain has never run for real.
 *
 * That gap is not academic. mergeSchemas flattens every pack's functionTypes
 * into one list while `entry` stays relative to its own pack, and
 * schema-loader forces `core` to load first — so a single packDir resolves
 * every function against core, which ships none. 1fd5056 fixed that with
 * functionPackDirs, but only a unit test with two synthetic directories ever
 * covered it. This drives the real loader with the real core pack loaded
 * first, which is the only shape in which the bug can appear.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FunctionExecutor, IsolatedNodeFunctionRuntime } from '@altius/engine';

import { loadDomainPacks } from '../schema-loader.js';

const FIXTURE_PACKS = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'packs');

describe('function chain end to end through the pack loader', () => {
  it('loads a FunctionType from a pack that is not core', async () => {
    const loaded = await loadDomainPacks(undefined, ['core', 'demofn'], [FIXTURE_PACKS]);

    const fn = loaded.parsed.functionTypes.find(f => f.name === 'Doubler');
    expect(fn).toBeDefined();
    expect(fn!.entry).toBe('functions/double.mjs');
    expect(fn!.requiredRoles).toEqual(['analyst']);
  });

  it('records the declaring pack directory, not the first-loaded one', async () => {
    const loaded = await loadDomainPacks(undefined, ['core', 'demofn'], [FIXTURE_PACKS]);

    // core is forced first, so packInfos[0] is core — the value the executor
    // used to receive for every function regardless of provenance.
    expect(loaded.packInfos[0]!.manifest.name).toBe('core');
    expect(loaded.functionPackDirs['Doubler']).toMatch(/demofn$/);
  });

  it('executes it in the isolated runtime, resolving the entry against its own pack', async () => {
    const loaded = await loadDomainPacks(undefined, ['core', 'demofn'], [FIXTURE_PACKS]);

    const executor = new FunctionExecutor({
      schema: loaded.parsed,
      // Exactly how server.ts builds it: the first pack's directory as the
      // fallback, provenance per function on top.
      packDir: loaded.packInfos[0]?.packDir,
      packDirByFunction: loaded.functionPackDirs,
      runtimes: [new IsolatedNodeFunctionRuntime({ name: 'node-isolated', timeoutMs: 20_000 })],
    });

    const out = await executor.execute('Doubler', { value: 21 });

    expect(out.result).toEqual({ doubled: 42 });
  }, 30_000);

  it('fails to find the entry when provenance is dropped, which is the bug 1fd5056 fixed', async () => {
    const loaded = await loadDomainPacks(undefined, ['core', 'demofn'], [FIXTURE_PACKS]);

    const executor = new FunctionExecutor({
      schema: loaded.parsed,
      packDir: loaded.packInfos[0]?.packDir, // core only — the pre-fix wiring
      runtimes: [new IsolatedNodeFunctionRuntime({ name: 'node-isolated', timeoutMs: 20_000 })],
    });

    // Pinned so the regression cannot come back silently: without
    // packDirByFunction the module is looked for under core.
    await expect(executor.execute('Doubler', { value: 21 })).rejects.toThrow(/Cannot find module/);
  }, 30_000);
});
