import { describe, it, expect, beforeEach } from 'vitest';
import type { ParsedSchema } from '@altius/odl';
import {
  FunctionExecutor,
  NodeFunctionRuntime,
  CelFunctionRuntime,
} from '../functions/index.js';
import type { CelEvaluator } from '../objects/validation.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const schema: ParsedSchema = {
  objectTypes: [],
  linkTypes: [],
  actionTypes: [],
  functionTypes: [
    {
      kind: 'functionType',
      name: 'ScoreRisk',
      fields: [
        { name: 'patientId', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'age', type: { name: 'Int', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
      ],
      directives: [],
      runtime: 'node',
      entry: 'score-risk/index.js',
      requiredRoles: [],
    },
    {
      kind: 'functionType',
      name: 'DoubleScore',
      fields: [
        { name: 'score', type: { name: 'Float', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
      ],
      directives: [],
      runtime: 'cel',
      entry: 'score * 2',
      requiredRoles: [],
    },
  ],
  enums: [],
  interfaces: [],
  scalars: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FunctionExecutor', () => {
  describe('node runtime', () => {
    let executor: FunctionExecutor;

    beforeEach(() => {
      const nodeRt = new NodeFunctionRuntime({
        handlers: {
          'score-risk/index.js': async (inputs) => {
            const age = inputs['age'] as number | undefined;
            return { riskScore: (age ?? 0) * 1.5 };
          },
        },
      });
      executor = new FunctionExecutor({
        schema,
        runtimes: [nodeRt, new CelFunctionRuntime()],
      });
    });

    it('executes a registered handler', async () => {
      const result = await executor.execute('ScoreRisk', { patientId: 'p1', age: 70 });
      expect(result.result).toEqual({ riskScore: 105 });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.logs).toEqual([]);
    });

    it('captures logs from the handler', async () => {
      const nodeRt = new NodeFunctionRuntime({
        handlers: {
          'score-risk/index.js': async (_inputs, { log }) => {
            log('INFO', 'computing risk');
            return 42;
          },
        },
      });
      executor = new FunctionExecutor({ schema, runtimes: [nodeRt, new CelFunctionRuntime()] });
      const result = await executor.execute('ScoreRisk', { patientId: 'p1' });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]!.message).toBe('computing risk');
    });

    it('throws on unknown function', async () => {
      await expect(executor.execute('Unknown', {})).rejects.toThrow(/unknown function/);
    });

    it('throws on missing required param', async () => {
      await expect(executor.execute('ScoreRisk', { age: 50 })).rejects.toThrow(/missing required param "patientId"/);
    });

    it('throws on unknown runtime', async () => {
      const badSchema: ParsedSchema = {
        ...schema,
        functionTypes: [{
          ...schema.functionTypes[0]!,
          runtime: 'wasm',
        }],
      };
      const executor2 = new FunctionExecutor({ schema: badSchema });
      await expect(executor2.execute('ScoreRisk', { patientId: 'p1' })).rejects.toThrow(/no runtime registered for "wasm"/);
    });
  });

  describe('cel runtime', () => {
    it('delegates to the CEL evaluator', async () => {
      const cel: CelEvaluator = {
        async evaluate(expression: string, variables: Record<string, unknown>) {
          expect(expression).toBe('score * 2');
          expect(variables['score']).toBe(21);
          return { value: 42 };
        },
      };
      const executor = new FunctionExecutor({ schema, celEvaluator: cel });
      const result = await executor.execute('DoubleScore', { score: 21 });
      expect(result.result).toBe(42);
    });

    it('throws when no CEL evaluator is configured', async () => {
      const executor = new FunctionExecutor({ schema });
      await expect(executor.execute('DoubleScore', { score: 21 })).rejects.toThrow(/no CelEvaluator/);
    });

    it('surfaces CEL evaluation errors', async () => {
      const cel: CelEvaluator = {
        async evaluate() { return { error: 'type mismatch' }; },
      };
      const executor = new FunctionExecutor({ schema, celEvaluator: cel });
      await expect(executor.execute('DoubleScore', { score: 21 })).rejects.toThrow(/type mismatch/);
    });
  });

  describe('getFunction', () => {
    it('looks up by name', () => {
      const executor = new FunctionExecutor({ schema });
      expect(executor.getFunction('ScoreRisk')?.name).toBe('ScoreRisk');
      expect(executor.getFunction('Nonexistent')).toBeUndefined();
    });
  });

  describe('registerRuntime', () => {
    it('overrides a built-in runtime', async () => {
      const executor = new FunctionExecutor({ schema });
      // Use the public registerRuntime path with a proper FunctionRuntime
      executor.registerRuntime({
        name: 'cel',
        async execute() { return 'custom-result'; },
      });
      const result = await executor.execute('DoubleScore', { score: 1 });
      expect(result.result).toBe('custom-result');
    });
  });
});
