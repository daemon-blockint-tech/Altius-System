import { describe, it, expect } from 'vitest';
import { parseOdl, validateSchema, diff, classify } from '../index.js';

describe('FunctionType parsing', () => {
  it('routes @function (without @actionType) to functionTypes', () => {
    const odl = `
      type ComputeRiskScore @function(runtime: "node", entry: "risk-score/index.js") {
        patientId: ID @param
        age: Int @param
      }
    `;
    const schema = parseOdl(odl);
    expect(schema.functionTypes).toHaveLength(1);
    expect(schema.actionTypes).toHaveLength(0);
    expect(schema.objectTypes).toHaveLength(0);

    const fn = schema.functionTypes[0]!;
    expect(fn.kind).toBe('functionType');
    expect(fn.name).toBe('ComputeRiskScore');
    expect(fn.runtime).toBe('node');
    expect(fn.entry).toBe('risk-score/index.js');
    expect(fn.fields).toHaveLength(2);
    expect(fn.fields[0]!.name).toBe('patientId');
  });

  it('keeps @actionType @function as an ActionType (back-compat)', () => {
    const odl = `
      type AdmitPatient @actionType @function(runtime: "node", entry: "admit/index.js") {
        patient: Patient @param
      }
    `;
    const schema = parseOdl(odl);
    expect(schema.functionTypes).toHaveLength(0);
    expect(schema.actionTypes).toHaveLength(1);
    const action = schema.actionTypes[0]!;
    const fnDir = action.directives.find(d => d.kind === 'function');
    expect(fnDir).toBeDefined();
  });

  it('extracts description', () => {
    const odl = `
      "Computes a risk score."
      type ComputeRiskScore @function(runtime: "node", entry: "risk/index.js") {
        x: Int @param
      }
    `;
    const schema = parseOdl(odl);
    expect(schema.functionTypes[0]!.description).toBe('Computes a risk score.');
  });
});

describe('FunctionType validation', () => {
  it('accepts a well-formed function type', () => {
    const odl = `
      type ScoreRisk @function(runtime: "node", entry: "score/index.js") {
        patientId: ID @param
      }
    `;
    const schema = parseOdl(odl);
    const result = validateSchema(schema);
    expect(result.errors).toEqual([]);
  });

  it('rejects a function with no runtime', () => {
    const odl = `
      type ScoreRisk @function(entry: "score/index.js") {
        patientId: ID @param
      }
    `;
    const schema = parseOdl(odl);
    const result = validateSchema(schema);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'FUNCTION_MISSING_RUNTIME' }),
    );
  });

  it('rejects a function with no entry', () => {
    const odl = `
      type ScoreRisk @function(runtime: "node") {
        patientId: ID @param
      }
    `;
    const schema = parseOdl(odl);
    const result = validateSchema(schema);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'FUNCTION_MISSING_ENTRY' }),
    );
  });

  it('rejects an absolute entry path', () => {
    const odl = `
      type ScoreRisk @function(runtime: "node", entry: "/abs/path.js") {
        x: Int @param
      }
    `;
    const schema = parseOdl(odl);
    const result = validateSchema(schema);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'FUNCTION_ENTRY_ABSOLUTE' }),
    );
  });

  it('rejects a parent-traversal entry path', () => {
    const odl = `
      type ScoreRisk @function(runtime: "node", entry: "../escape.js") {
        x: Int @param
      }
    `;
    const schema = parseOdl(odl);
    const result = validateSchema(schema);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'FUNCTION_ENTRY_PARENT_TRAVERSAL' }),
    );
  });

  it('rejects an unsupported extension', () => {
    const odl = `
      type ScoreRisk @function(runtime: "node", entry: "score.py") {
        x: Int @param
      }
    `;
    const schema = parseOdl(odl);
    const result = validateSchema(schema);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'FUNCTION_ENTRY_EXTENSION' }),
    );
  });

  it('rejects name collision with an ObjectType', () => {
    const odl = `
      type Patient @objectType {
        id: ID! @primary
      }
      type Patient @function(runtime: "node", entry: "p/index.js") {
        x: Int @param
      }
    `;
    const schema = parseOdl(odl);
    // The parser will route the second `Patient` to functionTypes (since it
    // has @function and no @actionType). The validator should flag the
    // collision.
    const result = validateSchema(schema);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'FUNCTION_NAME_COLLISION' }),
    );
  });
});

describe('FunctionType diff', () => {
  it('detects added function types', () => {
    const oldSchema = parseOdl(`type Foo @objectType { id: ID! @primary }`);
    const newSchema = parseOdl(`
      type Foo @objectType { id: ID! @primary }
      type Bar @function(runtime: "node", entry: "bar/index.js") { x: Int @param }
    `);
    const d = diff(oldSchema, newSchema);
    expect(d.additions).toContainEqual(
      expect.objectContaining({ kind: 'type_addition', typeKind: 'functionType', name: 'Bar' }),
    );
    expect(classify(d)).toBe('SAFE');
  });

  it('detects removed function types', () => {
    const oldSchema = parseOdl(`
      type Foo @objectType { id: ID! @primary }
      type Bar @function(runtime: "node", entry: "bar/index.js") { x: Int @param }
    `);
    const newSchema = parseOdl(`type Foo @objectType { id: ID! @primary }`);
    const d = diff(oldSchema, newSchema);
    expect(d.removals).toContainEqual(
      expect.objectContaining({ kind: 'type_removal', typeKind: 'functionType', name: 'Bar' }),
    );
    expect(classify(d)).toBe('BREAKING');
  });

  it('detects runtime change as breaking', () => {
    const oldSchema = parseOdl(`
      type Bar @function(runtime: "node", entry: "bar/index.js") { x: Int @param }
    `);
    const newSchema = parseOdl(`
      type Bar @function(runtime: "cel", entry: "bar/index.js") { x: Int @param }
    `);
    const d = diff(oldSchema, newSchema);
    expect(d.modifications).toContainEqual(
      expect.objectContaining({ kind: 'function_modification', functionName: 'Bar' }),
    );
    expect(classify(d)).toBe('BREAKING');
  });

  it('detects entry change as breaking', () => {
    const oldSchema = parseOdl(`
      type Bar @function(runtime: "node", entry: "old/index.js") { x: Int @param }
    `);
    const newSchema = parseOdl(`
      type Bar @function(runtime: "node", entry: "new/index.js") { x: Int @param }
    `);
    const d = diff(oldSchema, newSchema);
    expect(d.modifications).toContainEqual(
      expect.objectContaining({ kind: 'function_modification', functionName: 'Bar' }),
    );
    expect(classify(d)).toBe('BREAKING');
  });

  it('reverse diff swaps old/new for function modifications', () => {
    const oldSchema = parseOdl(`
      type Bar @function(runtime: "node", entry: "old/index.js") { x: Int @param }
    `);
    const newSchema = parseOdl(`
      type Bar @function(runtime: "node", entry: "new/index.js") { x: Int @param }
    `);
    const d = diff(oldSchema, newSchema);
    const reversed = diff(newSchema, oldSchema);
    const fwdMod = d.modifications.find(m => m.kind === 'function_modification') as
      | { oldEntry?: string; newEntry?: string } | undefined;
    const revMod = reversed.modifications.find(m => m.kind === 'function_modification') as
      | { oldEntry?: string; newEntry?: string } | undefined;
    expect(fwdMod?.oldEntry).toBe('old/index.js');
    expect(fwdMod?.newEntry).toBe('new/index.js');
    expect(revMod?.oldEntry).toBe('new/index.js');
    expect(revMod?.newEntry).toBe('old/index.js');
  });
});
