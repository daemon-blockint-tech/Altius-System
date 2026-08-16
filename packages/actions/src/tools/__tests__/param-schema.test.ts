/**
 * Action parameter JSON Schema — the metadata a UI generates a form from.
 *
 * `fieldToJsonSchema` mapped anything outside SCALAR_TYPE_MAP to
 * `{ type: 'string', description: 'ID reference to <T>' }`. Enums are not in
 * that map, so an enum param was advertised as free text AND mislabelled as an
 * object reference: a generated form rendered a text box instead of a dropdown,
 * the caller could not discover the valid members from the schema at all, and
 * every wrong value cost a round trip to find out.
 *
 * Dates had the quieter version of the same problem — `type: 'string'` with no
 * `format`, so a date field is a text box and the value is rejected later by
 * something that names a column rather than the field the user typed into.
 */

import { describe, it, expect } from 'vitest';
import type { ParsedSchema } from '@altius/odl';
import { ToolRegistry } from '../tool-registry.js';

function param(name: string, typeName: string, opts: { nonNull?: boolean; isList?: boolean } = {}) {
  return {
    name,
    type: {
      name: typeName,
      nonNull: opts.nonNull ?? false,
      isList: opts.isList ?? false,
      listElementNonNull: false,
    },
    directives: [{ kind: 'param' }],
  };
}

const SCHEMA: ParsedSchema = {
  objectTypes: [
    {
      kind: 'objectType',
      name: 'Patient',
      fields: [
        { name: 'id', type: { name: 'ID', nonNull: true, isList: false, listElementNonNull: false }, directives: [{ kind: 'primary' }] },
      ],
      interfaces: [],
      directives: [{ kind: 'objectType' }],
    },
  ],
  linkTypes: [],
  actionTypes: [
    {
      kind: 'actionType',
      name: 'TriagePatient',
      description: 'Set triage category',
      fields: [
        param('patient', 'Patient', { nonNull: true }),
        param('category', 'TriageCategory', { nonNull: true }),
        param('secondaryCategories', 'TriageCategory', { isList: true }),
        param('assessedAt', 'DateTime', { nonNull: true }),
        param('reviewDate', 'Date'),
        param('note', 'String'),
      ],
      directives: [{ kind: 'actionType' }],
    },
  ],
  functionTypes: [],
  enums: [
    {
      kind: 'enum',
      name: 'TriageCategory',
      values: [{ name: 'IMMEDIATE' }, { name: 'URGENT' }, { name: 'STANDARD' }],
      directives: [],
    },
  ],
  interfaces: [],
  scalars: [],
} as unknown as ParsedSchema;

function paramsOf() {
  const registry = new ToolRegistry({ schema: SCHEMA, manifests: new Map() });
  const tool = registry.availableTools().find(t => t.name.includes('TriagePatient'));
  expect(tool, 'TriagePatient tool was not registered').toBeDefined();
  return tool!.parameters.properties!;
}

describe('action parameter schema', () => {
  it('advertises an enum param as a closed set, not free text', () => {
    const category = paramsOf()['category']!;

    expect(category.type).toBe('string');
    expect(category.enum).toEqual(['IMMEDIATE', 'URGENT', 'STANDARD']);
    // The old output claimed this was an object reference, which is not merely
    // unhelpful — it tells a client to send an id for something that has none.
    expect(category.description ?? '').not.toMatch(/ID reference/);
  });

  it('keeps enum members on the element schema inside a list', () => {
    // Handling enums only on the scalar branch is how `[TriageCategory!]!`
    // silently became an array of free text.
    const secondary = paramsOf()['secondaryCategories']!;

    expect(secondary.type).toBe('array');
    expect(secondary.items?.type).toBe('string');
    expect(secondary.items?.enum).toEqual(['IMMEDIATE', 'URGENT', 'STANDARD']);
  });

  it('gives temporal scalars a JSON Schema format', () => {
    const params = paramsOf();

    expect(params['assessedAt']).toMatchObject({ type: 'string', format: 'date-time' });
    expect(params['reviewDate']).toMatchObject({ type: 'string', format: 'date' });
  });

  it('leaves plain scalars and object references as they were', () => {
    const params = paramsOf();

    expect(params['note']).toMatchObject({ type: 'string' });
    expect(params['note']!.format).toBeUndefined();
    expect(params['note']!.enum).toBeUndefined();

    // An ObjectType param really is an id reference, and must stay one.
    expect(params['patient']!.type).toBe('string');
    expect(params['patient']!.description).toMatch(/ID reference to Patient/);
  });

  it('still marks non-null params required', () => {
    const registry = new ToolRegistry({ schema: SCHEMA, manifests: new Map() });
    const tool = registry.availableTools().find(t => t.name.includes('TriagePatient'))!;

    expect(tool.parameters.required).toEqual(
      expect.arrayContaining(['patient', 'category', 'assessedAt']),
    );
    expect(tool.parameters.required).not.toContain('note');
  });
});
