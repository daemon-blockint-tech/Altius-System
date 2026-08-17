/**
 * Tests for ToolRegistry (Section 5.7).
 *
 * Verifies tool descriptor generation from ODL ActionTypes, JSON Schema
 * parameter mapping, filtering, and dry-run execution mode.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { ParsedSchema } from '@altius/odl';
import type { ActionManifest } from '../../parser/types.js';
import { ToolRegistry } from '../tool-registry.js';
import type { AgentContext, PolicyGuard, PolicyGuardResult } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures: NHS Schema (same structure as action-executor tests)
// ---------------------------------------------------------------------------

const NHS_SCHEMA: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Patient',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
        { name: 'status', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
        { name: 'name', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
    {
      kind: 'objectType',
      name: 'Ward',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
        { name: 'name', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
    {
      kind: 'objectType',
      name: 'Bed',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
        { name: 'status', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
    {
      kind: 'objectType',
      name: 'Consultant',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
        { name: 'name', type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false }, directives: [] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
  ],
  linkTypes: [],
  actionTypes: [
    {
      kind: 'actionType',
      name: 'AdmitPatient',
      description: 'Admit a patient to a ward',
      fields: [
        { name: 'patient', type: { name: 'Patient', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'ward', type: { name: 'Ward', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'consultant', type: { name: 'Consultant', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'bed', type: { name: 'Bed', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'reason', type: { name: 'String', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
      ],
      directives: [{ kind: 'actionType' }],
    },
    {
      kind: 'actionType',
      name: 'DischargePatient',
      description: 'Discharge a patient from the hospital',
      fields: [
        { name: 'patient', type: { name: 'Patient', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'destination', type: { name: 'String', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'notes', type: { name: 'String', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
      ],
      directives: [{ kind: 'actionType' }],
    },
    {
      kind: 'actionType',
      name: 'TransferWard',
      description: 'Transfer a patient between wards',
      fields: [
        { name: 'patient', type: { name: 'Patient', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'toWard', type: { name: 'Ward', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'toBed', type: { name: 'Bed', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
        { name: 'reason', type: { name: 'String', nonNull: false, isList: false, listElementNonNull: false }, directives: [{ kind: 'param' }] },
      ],
      directives: [{ kind: 'actionType' }],
    },
  ],
  functionTypes: [],
  enums: [],
  interfaces: [],
  scalars: [],
};

// ---------------------------------------------------------------------------
// Fixtures: Manifests
// ---------------------------------------------------------------------------

const ADMIT_MANIFEST: ActionManifest = {
  action: 'AdmitPatient',
  version: 1,
  reversible: false,
  preconditions: [
    { expr: "patient.status != 'ACTIVE'", error: 'Patient already admitted' },
  ],
  effects: [],
  sideEffects: [],
};

const DISCHARGE_MANIFEST: ActionManifest = {
  action: 'DischargePatient',
  version: 1,
  reversible: true,
  preconditions: [],
  effects: [],
  sideEffects: [],
};

const TRANSFER_MANIFEST: ActionManifest = {
  action: 'TransferWard',
  version: 1,
  reversible: false,
  preconditions: [],
  effects: [],
  sideEffects: [],
};

function createManifestMap(): Map<string, ActionManifest> {
  const map = new Map<string, ActionManifest>();
  map.set('AdmitPatient', ADMIT_MANIFEST);
  map.set('DischargePatient', DISCHARGE_MANIFEST);
  map.set('TransferWard', TRANSFER_MANIFEST);
  return map;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry({
      schema: NHS_SCHEMA,
      manifests: createManifestMap(),
    });
  });

  describe('availableTools', () => {
    it('returns 3 descriptors for NHS actions', () => {
      const tools = registry.availableTools();

      expect(tools).toHaveLength(3);

      const names = tools.map((t) => t.name);
      expect(names).toContain('AdmitPatient');
      expect(names).toContain('DischargePatient');
      expect(names).toContain('TransferWard');
    });

    it('all descriptors have kind ACTION', () => {
      const tools = registry.availableTools();
      for (const tool of tools) {
        expect(tool.kind).toBe('ACTION');
      }
    });

    it('uses ActionType description for tool description', () => {
      const tools = registry.availableTools();
      const admit = tools.find((t) => t.name === 'AdmitPatient')!;
      expect(admit.description).toBe('Admit a patient to a ward');
    });

    it('all actions support dry-run', () => {
      const tools = registry.availableTools();
      for (const tool of tools) {
        expect(tool.dryRunSupported).toBe(true);
      }
    });

    it('reflects reversible from manifest', () => {
      const tools = registry.availableTools();
      const admit = tools.find((t) => t.name === 'AdmitPatient')!;
      const discharge = tools.find((t) => t.name === 'DischargePatient')!;

      expect(admit.reversible).toBe(false);
      expect(discharge.reversible).toBe(true);
    });

    it('includes required permissions', () => {
      const tools = registry.availableTools();
      const admit = tools.find((t) => t.name === 'AdmitPatient')!;

      expect(admit.requiredPermissions).toContain('action:AdmitPatient:execute');
    });
  });

  describe('ToolDescriptor.parameters (JSON Schema)', () => {
    it('generates valid JSON Schema for AdmitPatient params', () => {
      const tools = registry.availableTools();
      const admit = tools.find((t) => t.name === 'AdmitPatient')!;
      const params = admit.parameters;

      expect(params.type).toBe('object');
      expect(params.properties).toBeDefined();
      expect(Object.keys(params.properties!)).toHaveLength(5);
    });

    it('marks non-null fields as required', () => {
      const tools = registry.availableTools();
      const admit = tools.find((t) => t.name === 'AdmitPatient')!;

      // patient, ward, consultant are non-null -> required
      expect(admit.parameters.required).toContain('patient');
      expect(admit.parameters.required).toContain('ward');
      expect(admit.parameters.required).toContain('consultant');
      // bed and reason are nullable -> not required
      expect(admit.parameters.required).not.toContain('bed');
      expect(admit.parameters.required).not.toContain('reason');
    });

    it('maps scalar types to JSON Schema types', () => {
      const tools = registry.availableTools();
      const admit = tools.find((t) => t.name === 'AdmitPatient')!;
      const props = admit.parameters.properties!;

      // String field -> type: string
      expect(props['reason']!.type).toBe('string');
    });

    it('maps object type references to string IDs', () => {
      const tools = registry.availableTools();
      const admit = tools.find((t) => t.name === 'AdmitPatient')!;
      const props = admit.parameters.properties!;

      // Patient (object type) -> type: string with ID reference description
      expect(props['patient']!.type).toBe('string');
      expect(props['patient']!.description).toContain('Patient');
    });

    it('parameters schema has proper structure for each action', () => {
      const tools = registry.availableTools();

      for (const tool of tools) {
        expect(tool.parameters.type).toBe('object');
        expect(tool.parameters.properties).toBeDefined();
        // All params should have a type
        for (const [_name, propSchema] of Object.entries(tool.parameters.properties!)) {
          expect(propSchema.type).toBeDefined();
          expect(['string', 'integer', 'number', 'boolean', 'array', 'object']).toContain(propSchema.type);
        }
      }
    });
  });

  describe('ToolDescriptor.returnType', () => {
    it('has standard ActionResult JSON Schema', () => {
      const tools = registry.availableTools();
      const admit = tools.find((t) => t.name === 'AdmitPatient')!;

      expect(admit.returnType.type).toBe('object');
      expect(admit.returnType.properties).toBeDefined();
      expect(admit.returnType.properties!['success']!.type).toBe('boolean');
      expect(admit.returnType.properties!['actionId']!.type).toBe('string');
      expect(admit.returnType.properties!['errors']!.type).toBe('array');
      expect(admit.returnType.properties!['affectedObjects']!.type).toBe('array');
    });
  });

  describe('filtering', () => {
    it('filters by kind', () => {
      const tools = registry.availableTools({ kind: 'ACTION' });
      expect(tools).toHaveLength(3);

      const queryTools = registry.availableTools({ kind: 'QUERY' });
      expect(queryTools).toHaveLength(0);
    });

    it('filters by name pattern', () => {
      const tools = registry.availableTools({ namePattern: 'Patient' });
      expect(tools).toHaveLength(2); // AdmitPatient, DischargePatient

      const names = tools.map((t) => t.name);
      expect(names).toContain('AdmitPatient');
      expect(names).toContain('DischargePatient');
    });

    it('name pattern is case-insensitive', () => {
      const tools = registry.availableTools({ namePattern: 'patient' });
      expect(tools).toHaveLength(2);
    });
  });

  describe('dry-run mode', () => {
    it('validates without committing (missing required param)', async () => {
      const registry = new ToolRegistry({
        schema: NHS_SCHEMA,
        manifests: createManifestMap(),
        executor: {} as any, // mock executor — dry-run doesn't use it
      });

      const agentContext: AgentContext = {
        agentId: 'agent-1',
        dryRun: true,
      };

      const result = await registry.executeForAgent(
        'AdmitPatient',
        { reason: 'test' }, // missing patient, ward, consultant
        { id: 'agent-1', type: 'system', roles: ['admin'] },
        { requestContext: { tenantId: 't1' } },
        agentContext,
      );

      expect(result.dryRun).toBe(true);
      expect(result.result.success).toBe(false);
      expect(result.result.errors.length).toBeGreaterThan(0);
      expect(result.result.errors[0]!.code).toBe('MISSING_REQUIRED_PARAM');
    });

    it('succeeds when all required params provided', async () => {
      const registry = new ToolRegistry({
        schema: NHS_SCHEMA,
        manifests: createManifestMap(),
        executor: {} as any,
      });

      const agentContext: AgentContext = {
        agentId: 'agent-1',
        dryRun: true,
      };

      const result = await registry.executeForAgent(
        'AdmitPatient',
        { patient: 'p1', ward: 'w1', consultant: 'c1' },
        { id: 'agent-1', type: 'system', roles: ['admin'] },
        { requestContext: { tenantId: 't1' } },
        agentContext,
      );

      expect(result.dryRun).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.errors).toHaveLength(0);
      expect(result.result.actionId).toMatch(/^dryrun_/);
    });

    it('dry-run does not produce affected objects', async () => {
      const registry = new ToolRegistry({
        schema: NHS_SCHEMA,
        manifests: createManifestMap(),
        executor: {} as any,
      });

      const result = await registry.executeForAgent(
        'DischargePatient',
        { patient: 'p1' },
        { id: 'agent-1', type: 'system', roles: [] },
        { requestContext: { tenantId: 't1' } },
        { agentId: 'agent-1', dryRun: true },
      );

      expect(result.dryRun).toBe(true);
      expect(result.result.affectedObjects).toHaveLength(0);
    });
  });

  describe('policy guard', () => {
    it('holds high-risk actions for approval', async () => {
      const mockGuard: PolicyGuard = {
        async evaluate(_actionName, _riskLevel, _agentCtx): Promise<PolicyGuardResult> {
          return {
            allowed: false,
            holdId: 'hold_123',
            reason: 'High-risk action requires human approval',
          };
        },
      };

      const registry = new ToolRegistry({
        schema: NHS_SCHEMA,
        manifests: createManifestMap(),
        executor: {} as any,
        policyGuard: mockGuard,
        riskLevels: new Map([['AdmitPatient', 'high']]),
      });

      const result = await registry.executeForAgent(
        'AdmitPatient',
        { patient: 'p1', ward: 'w1', consultant: 'c1' },
        { id: 'agent-1', type: 'system', roles: [] },
        { requestContext: { tenantId: 't1' } },
        { agentId: 'agent-1', dryRun: false },
      );

      expect(result.held).toBe(true);
      expect(result.holdId).toBe('hold_123');
      expect(result.result.success).toBe(false);
      expect(result.result.errors[0]!.code).toBe('POLICY_HOLD');
    });

    it('allows low-risk actions without guard check', async () => {
      let guardCalled = false;
      const mockGuard: PolicyGuard = {
        async evaluate(): Promise<PolicyGuardResult> {
          guardCalled = true;
          return { allowed: false };
        },
      };

      const registry = new ToolRegistry({
        schema: NHS_SCHEMA,
        manifests: createManifestMap(),
        executor: {} as any,
        policyGuard: mockGuard,
        riskLevels: new Map([['AdmitPatient', 'low']]),
      });

      // Low-risk action should not trigger guard, goes straight to dry-run
      const result = await registry.executeForAgent(
        'AdmitPatient',
        { patient: 'p1', ward: 'w1', consultant: 'c1' },
        { id: 'agent-1', type: 'system', roles: [] },
        { requestContext: { tenantId: 't1' } },
        { agentId: 'agent-1', dryRun: true },
      );

      expect(guardCalled).toBe(false);
      expect(result.dryRun).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // T5: Provider-format tool mappings
  // ─────────────────────────────────────────────────────────────────────

  describe('toAnthropicTools', () => {
    it('maps every available tool to Anthropic format', () => {
      const tools = registry.toAnthropicTools();
      expect(tools).toHaveLength(3);

      for (const t of tools) {
        expect(t.name).toBeTruthy();
        expect(typeof t.description).toBe('string');
        expect(t.input_schema).toBeDefined();
        expect(t.input_schema.type).toBe('object');
        expect(t.input_schema.properties).toBeDefined();
      }
    });

    it('respects the filter', () => {
      const tools = registry.toAnthropicTools({ namePattern: 'Admit' });
      expect(tools).toHaveLength(1);
      expect(tools[0]!.name).toBe('AdmitPatient');
    });

    it('does not include internal-only fields (returnType, permissions)', () => {
      const tools = registry.toAnthropicTools();
      const t = tools[0]!;
      expect(t).not.toHaveProperty('returnType');
      expect(t).not.toHaveProperty('requiredPermissions');
      expect(t).not.toHaveProperty('dryRunSupported');
      expect(t).not.toHaveProperty('reversible');
    });
  });

  describe('toOpenAiTools', () => {
    it('maps every available tool to OpenAI function-calling format', () => {
      const tools = registry.toOpenAiTools();
      expect(tools).toHaveLength(3);

      for (const t of tools) {
        expect(t.type).toBe('function');
        expect(t.function.name).toBeTruthy();
        expect(typeof t.function.description).toBe('string');
        expect(t.function.parameters).toBeDefined();
        expect(t.function.parameters.type).toBe('object');
      }
    });

    it('respects the filter', () => {
      const tools = registry.toOpenAiTools({ namePattern: 'Discharge' });
      expect(tools).toHaveLength(1);
      expect(tools[0]!.function.name).toBe('DischargePatient');
    });
  });

  describe('toLangChainTools', () => {
    const actor = { id: 'agent-1', type: 'system' as const, roles: ['admin'] };
    const ctx = { requestContext: { tenantId: 't1' } };

    /** Registry with an executor, which the exporter requires. */
    const executable = () => new ToolRegistry({
      schema: NHS_SCHEMA,
      manifests: createManifestMap(),
      executor: {} as any,
    });

    it('maps every available tool to the shape LangChain tool() accepts', () => {
      const tools = executable().toLangChainTools(actor, ctx, { agentId: 'agent-1', dryRun: true });
      expect(tools).toHaveLength(3);

      for (const t of tools) {
        expect(t.name).toBeTruthy();
        expect(typeof t.description).toBe('string');
        // JSON Schema, which LangChain accepts in place of a Zod schema — so
        // no conversion step and no @langchain/core dependency in this package.
        expect(t.schema.type).toBe('object');
        expect(t.schema.properties).toBeDefined();
        expect(typeof t.invoke).toBe('function');
      }
    });

    it('respects the filter', () => {
      const tools = executable().toLangChainTools(
        actor, ctx, { agentId: 'agent-1', dryRun: true }, { namePattern: 'Admit' },
      );
      expect(tools).toHaveLength(1);
      expect(tools[0]!.name).toBe('AdmitPatient');
    });

    it('refuses to export without an executor, at export rather than mid-conversation', () => {
      // `registry` (outer fixture) is descriptor-only: no executor.
      expect(() => registry.toLangChainTools(actor, ctx, { agentId: 'agent-1', dryRun: true }))
        .toThrow(/requires an executor/);
    });

    it('refuses to export a high-risk tool when no PolicyGuard is configured', () => {
      // The guard would be skipped by ABSENCE and nothing would say so, which
      // is the exact silent bypass this exporter exists to prevent.
      const unguarded = new ToolRegistry({
        schema: NHS_SCHEMA,
        manifests: createManifestMap(),
        executor: {} as any,
        riskLevels: new Map([['AdmitPatient', 'high']]),
      });

      expect(() => unguarded.toLangChainTools(actor, ctx, { agentId: 'agent-1', dryRun: false }))
        .toThrow(/high-risk: AdmitPatient/);
    });

    it('allows the export when the high-risk tool is filtered out', () => {
      const unguarded = new ToolRegistry({
        schema: NHS_SCHEMA,
        manifests: createManifestMap(),
        executor: {} as any,
        riskLevels: new Map([['AdmitPatient', 'high']]),
      });

      const tools = unguarded.toLangChainTools(
        actor, ctx, { agentId: 'agent-1', dryRun: false }, { namePattern: 'Discharge' },
      );
      expect(tools.map(t => t.name)).toEqual(['DischargePatient']);
    });

    it('routes invoke through executeForAgent, so dry-run is honoured', async () => {
      const bound = new ToolRegistry({
        schema: NHS_SCHEMA,
        manifests: createManifestMap(),
        executor: {} as any, // dry-run never reaches the executor
      });

      const [admit] = bound.toLangChainTools(
        actor, ctx, { agentId: 'agent-1', dryRun: true }, { namePattern: 'Admit' },
      );

      const result = await admit!.invoke({ reason: 'test' }); // missing required params

      expect(result.dryRun).toBe(true);
      expect(result.result.success).toBe(false);
      expect(result.result.errors[0]!.code).toBe('MISSING_REQUIRED_PARAM');
    });

    // The reason this exporter binds execution instead of returning bare
    // descriptors. A caller who wired LangChain straight to
    // ActionExecutor.execute would skip the guard entirely and an agent would
    // commit a high-risk write that policy says needs a human.
    it('still holds a high-risk action for approval when invoked as a tool', async () => {
      const guard: PolicyGuard = {
        async evaluate(): Promise<PolicyGuardResult> {
          return { allowed: false, holdId: 'hold_123', reason: 'needs human approval' };
        },
      };

      const guarded = new ToolRegistry({
        schema: NHS_SCHEMA,
        manifests: createManifestMap(),
        executor: {} as any,
        policyGuard: guard,
        riskLevels: new Map([['AdmitPatient', 'high']]),
      });

      const [admit] = guarded.toLangChainTools(
        actor, ctx, { agentId: 'agent-1', dryRun: false }, { namePattern: 'Admit' },
      );

      const result = await admit!.invoke({ patient: 'p1', ward: 'w1', consultant: 'c1' });

      // Held is neither success nor failure: the agent has to learn it needs an
      // approval rather than a retry, which is why invoke resolves with the
      // whole AgentExecutionResult instead of a string.
      expect(result.held).toBe(true);
      expect(result.holdId).toBe('hold_123');
      expect(result.result.errors[0]!.code).toBe('POLICY_HOLD');
    });

    it('treats a tool call with no arguments as empty params, not a crash', async () => {
      const bound = new ToolRegistry({
        schema: NHS_SCHEMA,
        manifests: createManifestMap(),
        executor: {} as any,
      });

      const [admit] = bound.toLangChainTools(
        actor, ctx, { agentId: 'agent-1', dryRun: true }, { namePattern: 'Admit' },
      );

      // A model can emit a tool call with no input; that must surface as
      // missing-parameter validation, not a TypeError.
      const result = await admit!.invoke(undefined as unknown as Record<string, unknown>);
      expect(result.result.errors[0]!.code).toBe('MISSING_REQUIRED_PARAM');
    });
  });
});
