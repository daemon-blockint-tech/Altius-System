import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryStorageProvider } from '@altius/storage-memory';
import type { RequestContext, OntologySchema } from '@altius/spi';
import type { ParsedSchema } from '@altius/odl';
import { ObjectManager, type CelEvaluator } from '../objects/index.js';
import { validateObjectProperties } from '../objects/validation.js';
import { EngineEventEmitter } from '../events/event-emitter.js';
import { InMemoryEventBus } from '../events/event-bus.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ctx: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1' };

/**
 * Schema with field-level and type-level @constraint directives.
 * - `age` uses a simple comparison the inline evaluator can handle.
 * - `email` uses a regex match that ONLY the CEL sidecar can evaluate.
 * - `Account` has a type-level cross-field constraint (balance <= creditLimit)
 *   that the inline evaluator cannot handle.
 */
const parsedSchema: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Patient',
      fields: [
        {
          name: 'id',
          type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false },
          directives: [{ kind: 'primary' }],
        },
        {
          name: 'nhsNumber',
          type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false },
          directives: [{ kind: 'unique' }],
        },
        {
          name: 'name',
          type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false },
          directives: [],
        },
        {
          name: 'age',
          type: { name: 'Int', nonNull: false, isList: false, listElementNonNull: false },
          directives: [{ kind: 'constraint', expr: 'this.age >= 0' }],
        },
        {
          name: 'email',
          type: { name: 'String', nonNull: false, isList: false, listElementNonNull: false },
          directives: [
            { kind: 'constraint', expr: 'value.matches("^[^@]+@[^@]+\\\\.[^@]+$")' },
          ],
        },
        {
          name: 'status',
          type: { name: 'PatientStatus', nonNull: true, isList: false, listElementNonNull: false },
          directives: [],
        },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
    {
      kind: 'objectType',
      name: 'Account',
      fields: [
        {
          name: 'id',
          type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false },
          directives: [{ kind: 'primary' }],
        },
        {
          name: 'holder',
          type: { name: 'String', nonNull: true, isList: false, listElementNonNull: false },
          directives: [],
        },
        {
          name: 'balance',
          type: { name: 'Float', nonNull: true, isList: false, listElementNonNull: false },
          directives: [],
        },
        {
          name: 'creditLimit',
          type: { name: 'Float', nonNull: true, isList: false, listElementNonNull: false },
          directives: [],
        },
      ],
      interfaces: [],
      directives: [
        { kind: 'objectType' },
        { kind: 'constraint', expr: 'this.balance <= this.creditLimit' },
      ],
    },
  ],
  linkTypes: [],
  actionTypes: [],
  functionTypes: [],
  enums: [
    {
      kind: 'enum',
      name: 'PatientStatus',
      values: [
        { name: 'ACTIVE', directives: [] },
        { name: 'DISCHARGED', directives: [] },
      ],
    },
  ],
  interfaces: [],
  scalars: [],
};

const spiSchema: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Patient',
      properties: [
        { name: 'nhsNumber', type: 'string', required: true },
        { name: 'name', type: 'string', required: true },
        { name: 'age', type: 'integer' },
        { name: 'email', type: 'string' },
        { name: 'status', type: 'string', required: true },
      ],
    },
    {
      name: 'Account',
      properties: [
        { name: 'holder', type: 'string', required: true },
        { name: 'balance', type: 'number', required: true },
        { name: 'creditLimit', type: 'number', required: true },
      ],
    },
  ],
  linkTypes: [],
};

// ---------------------------------------------------------------------------
// Mock CelEvaluator
// ---------------------------------------------------------------------------

/**
 * A mock CelEvaluator that interprets a small subset of CEL the way the
 * real Go sidecar would. Used to verify the validation pipeline routes
 * expressions through the evaluator and respects its verdicts.
 */
function createMockCelEvaluator(): CelEvaluator & { calls: ReturnType<typeof vi.fn> } {
  const calls = vi.fn();
  const evaluator: CelEvaluator = {
    async evaluate(expression, variables) {
      calls(expression, variables);
      // Field-level: 'value.matches("...")'
      const matchRegex = expression.match(/^value\.matches\("(.+?)"\)$/);
      if (matchRegex) {
        const pattern = new RegExp(matchRegex[1]!.replace(/\\\\/g, '\\'));
        const value = variables['value'];
        if (typeof value !== 'string') return { value: true };
        return { value: pattern.test(value) };
      }
      // 'this.field OP this.field2' or 'this.field OP N'
      const crossFieldMatch = expression.match(
        /^this\.(\w+)\s*(>=|<=|!=|==|>|<)\s*this\.(\w+)$/,
      );
      if (crossFieldMatch) {
        const [, leftName, op, rightName] = crossFieldMatch;
        const thisObj = variables['this'] as Record<string, unknown>;
        const left = thisObj[leftName!];
        const right = thisObj[rightName!];
        if (typeof left !== 'number' || typeof right !== 'number') {
          return { error: 'type mismatch' };
        }
        return { value: applyOp(left, op!, right) };
      }
      // 'this.field OP N'
      const fieldCompare = expression.match(/^this\.(\w+)\s*(>=|<=|!=|==|>|<)\s*(.+)$/);
      if (fieldCompare) {
        const [, fieldName, op, rawRight] = fieldCompare;
        const thisObj = variables['this'] as Record<string, unknown>;
        const left = thisObj[fieldName!];
        if (typeof left !== 'number') return { error: 'not a number' };
        const right = Number(rawRight!.trim());
        return { value: applyOp(left, op!, right) };
      }
      return { error: `mock cannot evaluate: ${expression}` };
    },
  };
  return Object.assign(evaluator, { calls });
}

function applyOp(left: number, op: string, right: number): boolean {
  switch (op) {
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '==': return left === right;
    case '!=': return left !== right;
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let storage: MemoryStorageProvider;
let eventBus: InMemoryEventBus;

function setup(celEvaluator?: CelEvaluator) {
  storage = new MemoryStorageProvider();
  eventBus = new InMemoryEventBus();
  const emitter = new EngineEventEmitter(eventBus);
  return new ObjectManager({
    storage,
    schema: parsedSchema,
    eventEmitter: emitter,
    ...(celEvaluator ? { celEvaluator } : {}),
  });
}

describe('CEL-backed constraint evaluation', () => {
  beforeEach(async () => {
    storage = new MemoryStorageProvider();
    await storage.applySchema(ctx, spiSchema);
  });

  describe('without CelEvaluator (inline fallback)', () => {
    it('enforces simple numeric comparisons inline', async () => {
      const manager = setup();
      await expect(
        manager.create('Patient', {
          nhsNumber: '123', name: 'Jane', age: -5, status: 'ACTIVE',
        }, ctx),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { failures: expect.arrayContaining([
          expect.objectContaining({ step: 'constraint', field: 'age' }),
        ]) },
      });
    });

    it('rejects regex constraints it cannot evaluate inline (fail-closed)', async () => {
      const manager = setup();
      // Should FAIL because the inline evaluator cannot handle
      // value.matches(...) and the constraint is now an error, not a warning.
      // A constraint that cannot be evaluated must block the write, not pass.
      await expect(
        manager.create('Patient', {
          nhsNumber: '123', name: 'Jane', email: 'not-an-email', status: 'ACTIVE',
        }, ctx),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { failures: expect.arrayContaining([
          expect.objectContaining({ step: 'constraint', field: 'email' }),
        ]) },
      });
    });

    it('rejects type-level cross-field constraints it cannot evaluate inline (fail-closed)', async () => {
      const manager = setup();
      // The inline evaluator cannot handle cross-field references like
      // `this.balance <= this.creditLimit`. Fail-closed: the write must be
      // blocked, not silently allowed.
      await expect(
        manager.create('Account', {
          holder: 'Alice', balance: 200, creditLimit: 100,
        }, ctx),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { failures: expect.arrayContaining([
          expect.objectContaining({ step: 'constraint' }),
        ]) },
      });
    });
  });

  describe('with CelEvaluator', () => {
    it('routes field-level constraints through the evaluator', async () => {
      const cel = createMockCelEvaluator();
      const manager = setup(cel);
      await manager.create('Patient', {
        nhsNumber: '123', name: 'Jane', age: 42, status: 'ACTIVE',
      }, ctx);
      // The age constraint expression should have been routed through cel
      expect(cel.calls).toHaveBeenCalledWith(
        'this.age >= 0',
        expect.objectContaining({ this: expect.any(Object), value: 42 }),
      );
    });

    it('enforces regex constraints the inline evaluator cannot handle', async () => {
      const cel = createMockCelEvaluator();
      const manager = setup(cel);
      await expect(
        manager.create('Patient', {
          nhsNumber: '123', name: 'Jane', email: 'not-an-email', status: 'ACTIVE',
        }, ctx),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { failures: expect.arrayContaining([
          expect.objectContaining({ step: 'constraint', field: 'email' }),
        ]) },
      });
    });

    it('accepts a valid email when the CEL evaluator approves', async () => {
      const cel = createMockCelEvaluator();
      const manager = setup(cel);
      const obj = await manager.create('Patient', {
        nhsNumber: '123', name: 'Jane', email: 'jane@example.com', status: 'ACTIVE',
      }, ctx);
      expect(obj.email).toBe('jane@example.com');
    });

    it('enforces type-level cross-field constraints via CEL', async () => {
      const cel = createMockCelEvaluator();
      const manager = setup(cel);
      // balance exceeds creditLimit — should fail
      await expect(
        manager.create('Account', {
          holder: 'Alice', balance: 200, creditLimit: 100,
        }, ctx),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { failures: expect.arrayContaining([
          expect.objectContaining({ step: 'constraint' }),
        ]) },
      });
    });

    it('accepts when type-level cross-field constraint is satisfied', async () => {
      const cel = createMockCelEvaluator();
      const manager = setup(cel);
      const obj = await manager.create('Account', {
        holder: 'Alice', balance: 50, creditLimit: 100,
      }, ctx);
      expect(obj.balance).toBe(50);
    });

    it('surfaces CEL evaluation errors as constraint failures', async () => {
      const cel: CelEvaluator = {
        async evaluate() { return { error: 'syntax error: unexpected token' }; },
      };
      const manager = setup(cel);
      await expect(
        manager.create('Patient', {
          nhsNumber: '123', name: 'Jane', age: 42, status: 'ACTIVE',
        }, ctx),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { failures: expect.arrayContaining([
          expect.objectContaining({
            step: 'constraint',
            field: 'age',
            message: expect.stringContaining('syntax error'),
          }),
        ]) },
      });
    });

    it('only evaluates field-level constraints for patched fields on update', async () => {
      const cel = createMockCelEvaluator();
      const manager = setup(cel);
      const created = await manager.create('Patient', {
        nhsNumber: '123', name: 'Jane', age: 42, email: 'jane@example.com', status: 'ACTIVE',
      }, ctx);
      cel.calls.mockClear();
      // Patch only `name` — age and email constraints should NOT be re-evaluated
      await manager.update('Patient', created._id, { name: 'Jane Smith' }, ctx);
      const expressions = cel.calls.mock.calls.map((c: unknown[]) => c[0]);
      expect(expressions).not.toContain('this.age >= 0');
      expect(expressions).not.toContain('value.matches("^[^@]+@[^@]+\\\\.[^@]+$")');
    });
  });

  describe('validateObjectProperties direct call', () => {
    it('passes celEvaluator through to the pipeline', async () => {
      const cel = createMockCelEvaluator();
      const result = await validateObjectProperties(
        parsedSchema,
        'Patient',
        { nhsNumber: '123', name: 'Jane', age: -1, status: 'ACTIVE' },
        ctx,
        storage,
        undefined,
        undefined,
        cel,
      );
      expect(result.valid).toBe(false);
      expect(result.failures).toContainEqual(
        expect.objectContaining({ step: 'constraint', field: 'age' }),
      );
      expect(cel.calls).toHaveBeenCalledWith(
        'this.age >= 0',
        expect.objectContaining({ value: -1 }),
      );
    });
  });
});
