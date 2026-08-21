/**
 * invokeFunction effect — an action manifest can declare an effect that
 * invokes a FunctionType by name, with inputs resolved from the action
 * context, and optionally bind the result for a later effect.
 *
 * Parity: Foundry Automate "Function effects".
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryStorageProvider } from '@altius/storage-memory';
import type { ParsedSchema } from '@altius/odl';
import type { OntologySchema, RequestContext } from '@altius/spi';

import { parseActionManifest } from '../../parser/index.js';
import { ActionExecutor } from '../action-executor.js';
import type { ActionActor, ActionContext, SecurityLayer, CelEvaluator, ActionFunctionExecutor } from '../types.js';

const REQ_CTX: RequestContext = {
  tenantId: 'nhs-trust-01',
  actorId: 'dr-smith',
  traceId: 'trace-fn-effect',
};

const ACTOR: ActionActor = { id: 'dr-smith', type: 'user', roles: ['clinician'] };
const ACTION_CTX: ActionContext = { requestContext: REQ_CTX };

const SCHEMA: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Patient',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
        { name: 'triageScore', type: { name: 'Int', nonNull: false, isList: false, listElementNonNull: false }, directives: [] },
        { name: 'riskLevel', type: { name: 'Int', nonNull: false, isList: false, listElementNonNull: false }, directives: [] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
  ],
  linkTypes: [],
  actionTypes: [
    {
      kind: 'actionType',
      name: 'AssessRisk',
      fields: [
        { name: 'patient', type: { name: 'Patient', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'severityMultiplier', type: { name: 'Float', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
      ],
      directives: [{ kind: 'actionType' }],
    },
  ],
  functionTypes: [
    {
      kind: 'functionType',
      name: 'ComputeRiskScore',
      fields: [
        { name: 'triageScore', type: { name: 'Int', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'severityMultiplier', type: { name: 'Float', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
      ],
      directives: [],
      runtime: 'cel',
      entry: 'triageScore * severityMultiplier',
    },
  ],
  enums: [],
  interfaces: [],
  scalars: [],
};

const SPI_SCHEMA: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Patient',
      properties: [
        { name: 'triageScore', type: 'Int' },
        { name: 'riskLevel', type: 'Int' },
      ],
    },
  ],
  linkTypes: [],
};

const ASSESS_YAML = `
action: AssessRisk
version: 1
reversible: false

effects:
  - type: invokeFunction
    function: "ComputeRiskScore"
    inputs:
      triageScore: "patient.triageScore"
      severityMultiplier: "params.severityMultiplier"
    resultKey: "riskResult"
  - type: updateObject
    target: "patient"
    set:
      riskLevel: "riskResult"
`;

function createAllowAllSecurity(): SecurityLayer {
  return { async checkPermission() { return { allowed: true }; } };
}

function createStubCel(): CelEvaluator {
  return {
    async evaluate(expr: string, context: Record<string, unknown>) {
      // Handle simple comparison: "params.X > N"
      const match = /^params\.(\w+)\s*>\s*([\d.]+)$/.exec(expr);
      if (match && match[1] && match[2]) {
        const paramKey = match[1];
        const threshold = parseFloat(match[2]);
        const val = (context['params'] as Record<string, unknown>)?.[paramKey];
        return { value: typeof val === 'number' && val > threshold };
      }
      return { value: true };
    },
  };
}

/** Mock function executor — records calls and returns a computed score. */
function createMockFunctionExecutor(): ActionFunctionExecutor & { calls: ReturnType<typeof vi.fn> } {
  const calls = vi.fn();
  const executor: ActionFunctionExecutor & { calls: typeof calls } = {
    calls,
    async execute(name: string, inputs: Record<string, unknown>) {
      calls(name, inputs);
      // Mirror the CEL expression: triageScore * severityMultiplier
      const score = (inputs['triageScore'] as number) * (inputs['severityMultiplier'] as number);
      return { result: score };
    },
  };
  return executor;
}

describe('invokeFunction effect', () => {
  let storage: MemoryStorageProvider;
  let patient: { _id: string };
  let executor: ActionExecutor;
  let fnExecutor: ReturnType<typeof createMockFunctionExecutor>;

  beforeEach(async () => {
    storage = new MemoryStorageProvider();
    await storage.applySchema(REQ_CTX, SPI_SCHEMA);
    patient = await storage.createObject(REQ_CTX, 'Patient', {
      triageScore: 3,
      riskLevel: 'UNKNOWN',
    }) as { _id: string };

    fnExecutor = createMockFunctionExecutor();
    executor = new ActionExecutor({
      storage,
      security: createAllowAllSecurity(),
      cel: createStubCel(),
      functionExecutor: fnExecutor,
    });
  });

  it('invokes the named function with inputs resolved from context', async () => {
    const { manifest } = parseActionManifest(ASSESS_YAML, SCHEMA);
    expect(manifest).toBeDefined();

    const result = await executor.execute(
      manifest!,
      { patient: patient._id, severityMultiplier: 2.0 },
      ACTOR,
      ACTION_CTX,
      SCHEMA,
    );

    expect(result.success).toBe(true);
    // Function was called with the right name and resolved inputs
    expect(fnExecutor.calls).toHaveBeenCalledWith('ComputeRiskScore', {
      triageScore: 3,
      severityMultiplier: 2.0,
    });
  });

  it('binds the function result under resultKey for a later effect', async () => {
    const { manifest } = parseActionManifest(ASSESS_YAML, SCHEMA);
    const result = await executor.execute(
      manifest!,
      { patient: patient._id, severityMultiplier: 2.0 },
      ACTOR,
      ACTION_CTX,
      SCHEMA,
    );

    expect(result.success).toBe(true);
    // The updateObject effect should have written riskResult (= 3 * 2.0 = 6)
    const updated = await storage.getObject(REQ_CTX, 'Patient', patient._id);
    expect(updated!['riskLevel']).toBe(6);
  });

  it('throws a clear error when no functionExecutor is wired', async () => {
    const executorWithoutFn = new ActionExecutor({
      storage,
      security: createAllowAllSecurity(),
      cel: createStubCel(),
      // No functionExecutor
    });

    const { manifest } = parseActionManifest(ASSESS_YAML, SCHEMA);
    const result = await executorWithoutFn.execute(
      manifest!,
      { patient: patient._id, severityMultiplier: 2.0 },
      ACTOR,
      ACTION_CTX,
      SCHEMA,
    );

    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.code).toBe('EFFECT_EXECUTION_ERROR');
    expect(result.errors?.[0]?.message).toContain('no functionExecutor wired');
  });

  it('skips the function when condition evaluates to false', async () => {
    const yaml = `
action: AssessRisk
version: 1
reversible: false

effects:
  - type: invokeFunction
    function: "ComputeRiskScore"
    inputs:
      triageScore: "patient.triageScore"
      severityMultiplier: "params.severityMultiplier"
    condition: "params.severityMultiplier > 5.0"
    resultKey: "riskResult"
  - type: updateObject
    target: "patient"
    set:
      riskLevel: "riskResult"
`;
    const { manifest } = parseActionManifest(yaml, SCHEMA);
    const result = await executor.execute(
      manifest!,
      { patient: patient._id, severityMultiplier: 2.0 },
      ACTOR,
      ACTION_CTX,
      SCHEMA,
    );

    // Condition was false (2.0 > 5.0 is false), so function was skipped.
    // riskResult was never bound — resolveExpression returns the literal
    // string "riskResult" (root key not in context), which fails validation
    // against Int. The action fails, which is the correct fail-closed behavior.
    expect(result.success).toBe(false);
    expect(fnExecutor.calls).not.toHaveBeenCalled();
  });
});
