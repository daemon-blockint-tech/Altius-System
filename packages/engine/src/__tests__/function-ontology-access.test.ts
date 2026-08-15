/**
 * A function must be able to read the ontology — under the caller's identity.
 *
 * FunctionRuntimeContext carries fn, inputs, packDir, celEvaluator and log;
 * NodeRuntimeHelpers is `{ log }`, and function-worker.js builds the child's
 * helpers as `{ log }` too. So a pack function takes scalars and returns a
 * scalar and can never touch an object — which is the whole of what a Foundry
 * "function on objects" is for.
 *
 * The reader is injected per call rather than handed to the child directly:
 * the child runs with a scrubbed env precisely so it holds no database or
 * OpenFGA credentials, so the read has to travel back over the existing IPC
 * channel and be performed by the host, bound to the invoking user. A function
 * therefore cannot read anything its caller could not read.
 */

import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ParsedSchema, FunctionType } from '@altius/odl';

import { FunctionExecutor } from '../functions/function-executor.js';
import { IsolatedNodeFunctionRuntime } from '../functions/isolated-node-runtime.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const readObjectFn: FunctionType = {
  kind: 'functionType',
  name: 'ReadObject',
  fields: [
    { name: 'patientId', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
  ],
  directives: [],
  runtime: 'node-isolated',
  entry: 'read-object.mjs',
  requiredRoles: ['clinician'],
};

const schema: ParsedSchema = {
  objectTypes: [], linkTypes: [], actionTypes: [],
  functionTypes: [readObjectFn],
  enums: [], interfaces: [], scalars: [],
};

function makeExecutor(getObject: (type: string, id: string) => Promise<Record<string, unknown> | null>) {
  return new FunctionExecutor({
    schema,
    packDir: FIXTURES,
    runtimes: [new IsolatedNodeFunctionRuntime({ name: 'node-isolated', packDir: FIXTURES, timeoutMs: 15_000 })],
    ontology: { getObject },
  });
}

describe('function ontology access', () => {
  it('lets pack code read an object through the host', async () => {
    const getObject = vi.fn(async () => ({ _id: 'p-1', name: 'Ada' }));

    const out = await makeExecutor(getObject).execute('ReadObject', { patientId: 'p-1' });

    expect((out.result as { name: string }).name).toBe('Ada');
    expect(getObject).toHaveBeenCalledWith('Patient', 'p-1');
  });

  it('surfaces only what the host chose to return, so redaction holds', async () => {
    // The host applies the caller's field permissions before replying; the
    // child never sees the withheld column.
    const getObject = vi.fn(async () => ({ _id: 'p-1', name: 'Ada' }));

    const out = await makeExecutor(getObject).execute('ReadObject', { patientId: 'p-1' });

    expect((out.result as { sawFields: string[] }).sawFields).toEqual(['_id', 'name']);
  });

  it('propagates a denial as a function failure rather than a null object', async () => {
    const getObject = vi.fn(async () => { throw new Error('Access denied to Patient p-9'); });

    await expect(makeExecutor(getObject).execute('ReadObject', { patientId: 'p-9' }))
      .rejects.toThrow(/Access denied/);
  });

  it('fails the call when no ontology reader is configured', async () => {
    const executor = new FunctionExecutor({
      schema,
      packDir: FIXTURES,
      runtimes: [new IsolatedNodeFunctionRuntime({ name: 'node-isolated', packDir: FIXTURES, timeoutMs: 15_000 })],
    });

    // Fail-closed: no reader means no ontology, not a silent undefined that the
    // pack author reads as "object not found".
    await expect(executor.execute('ReadObject', { patientId: 'p-1' }))
      .rejects.toThrow(/ontology/i);
  });
});
