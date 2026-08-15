/**
 * A function must be able to change the ontology — through the action pipeline.
 *
 * 2deda98 gave functions reads. Writes are the other half of the backlog item
 * ("ontology edits from functions"), and the obvious implementation is the
 * wrong one: handing pack code a storage handle would skip validation,
 * authorization, preconditions, side-effects, audit and events — the whole
 * eight-stage pipeline every other mutation path goes through.
 *
 * So a function does not write. It asks the host to run a *declared* action,
 * and the host runs it under the invoking user through the same ActionExecutor
 * the REST and GraphQL surfaces use. Everything already governed stays
 * governed, and a function gets no privilege its caller lacks.
 */

import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ParsedSchema, FunctionType } from '@altius/odl';

import { FunctionExecutor } from '../functions/function-executor.js';
import { IsolatedNodeFunctionRuntime } from '../functions/isolated-node-runtime.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const applyFn: FunctionType = {
  kind: 'functionType',
  name: 'AdmitViaFunction',
  fields: [
    { name: 'patientId', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
    { name: 'wardId', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
  ],
  directives: [],
  runtime: 'node-isolated',
  entry: 'apply-action.mjs',
  requiredRoles: ['clinician'],
};

const schema: ParsedSchema = {
  objectTypes: [], linkTypes: [], actionTypes: [],
  functionTypes: [applyFn],
  enums: [], interfaces: [], scalars: [],
};

function makeExecutor(applyAction: (name: string, params: Record<string, unknown>) => Promise<unknown>) {
  return new FunctionExecutor({
    schema,
    packDir: FIXTURES,
    runtimes: [new IsolatedNodeFunctionRuntime({ name: 'node-isolated', packDir: FIXTURES, timeoutMs: 15_000 })],
    ontology: {
      getObject: async () => null,
      applyAction,
    },
  });
}

describe('function ontology edits', () => {
  it('routes a change through the host action pipeline', async () => {
    const applyAction = vi.fn(async () => ({ success: true, actionId: 'act-1' }));

    const out = await makeExecutor(applyAction).execute('AdmitViaFunction', { patientId: 'p-1', wardId: 'w-1' });

    expect(applyAction).toHaveBeenCalledWith('AdmitPatient', { patientId: 'p-1', wardId: 'w-1' });
    expect(out.result).toEqual({ applied: true, actionId: 'act-1' });
  });

  it('surfaces a refused action as a function failure', async () => {
    const applyAction = vi.fn(async () => { throw new Error('Access denied to action AdmitPatient'); });

    await expect(makeExecutor(applyAction).execute('AdmitViaFunction', { patientId: 'p-1', wardId: 'w-1' }))
      .rejects.toThrow(/Access denied to action AdmitPatient/);
  });

  it('fails closed when the host offers no action path', async () => {
    const executor = new FunctionExecutor({
      schema,
      packDir: FIXTURES,
      runtimes: [new IsolatedNodeFunctionRuntime({ name: 'node-isolated', packDir: FIXTURES, timeoutMs: 15_000 })],
      ontology: { getObject: async () => null },
    });

    await expect(executor.execute('AdmitViaFunction', { patientId: 'p-1', wardId: 'w-1' }))
      .rejects.toThrow(/applyAction/i);
  });
});
