/**
 * A function's entry module must resolve against the pack that declared it.
 *
 * Production passed a single directory — packInfos[0].packDir — for every
 * function, and schema-loader forces `core` to load first, so every
 * pack-declared function resolved its entry inside domain-packs/core. core
 * ships no functions, so any pack function failed to load in any multi-pack
 * deployment, which is all of them.
 */

import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FunctionExecutor } from '../functions/index.js';
import type { ParsedSchema } from '@altius/odl';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PACK_A = FIXTURES;              // stands in for domain-packs/core
const PACK_B = resolve(FIXTURES, 'pack-b');

/** One FunctionType declared by "pack B", entry relative to that pack. */
const schema = {
  objectTypes: [], linkTypes: [], actionTypes: [], enums: [], interfaces: [], scalars: [],
  functionTypes: [{
    kind: 'functionType',
    name: 'Double',
    fields: [{ name: 'value', type: { name: 'Float', nonNull: true, isList: false }, directives: [{ kind: 'param' }] }],
    directives: [],
    runtime: 'node',
    entry: 'double.mjs',
    requiredRoles: ['analyst'],
  }],
} as unknown as ParsedSchema;

describe('function entry resolution across packs', () => {
  it('resolves the entry against the declaring pack, not the first-loaded one', async () => {
    const executor = new FunctionExecutor({
      schema,
      packDir: PACK_A,
      packDirByFunction: { Double: PACK_B },
    });

    const { result } = await executor.execute('Double', { value: 21 });

    expect(result).toEqual({ doubled: 42 });
  });

  it('falls back to the shared packDir when a function has no mapping', async () => {
    const executor = new FunctionExecutor({ schema, packDir: PACK_B });

    const { result } = await executor.execute('Double', { value: 5 });

    expect(result).toEqual({ doubled: 10 });
  });
});
