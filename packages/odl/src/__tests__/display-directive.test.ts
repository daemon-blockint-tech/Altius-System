/**
 * Property/type display metadata (@display).
 *
 * Presentation hints — labels, icons, grouping, ordering, render/format hints,
 * title/status property pointers — are declared in ODL and parsed into the AST
 * so a client can drive rendering without platform code. Before this directive
 * existed the parser dropped it silently; these pin that it is parsed and that
 * title/status pointers are validated against real fields.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '../parser/index.js';
import { validateSchema } from '../validator/index.js';

const SCHEMA = `
type Widget @objectType @display(label: "Widget", pluralLabel: "Widgets", icon: "cube", color: "blue", titleProperty: "name", statusProperty: "status") {
  id: ID! @primary
  name: String! @display(label: "Name", group: "Basics", order: 1, renderHint: "text")
  price: Float @display(format: "0.00", renderHint: "currency", group: "Pricing", order: 2)
  secret: String @display(hidden: true)
  status: String
}
`;

describe('@display directive', () => {
  it('parses type-level display metadata into the AST', () => {
    const widget = parseOdl(SCHEMA).objectTypes.find(t => t.name === 'Widget');
    expect(widget).toBeDefined();
    const display = widget!.directives.find(d => d.kind === 'display');
    expect(display).toMatchObject({
      kind: 'display',
      label: 'Widget',
      pluralLabel: 'Widgets',
      icon: 'cube',
      color: 'blue',
      titleProperty: 'name',
      statusProperty: 'status',
    });
  });

  it('parses field-level display metadata into the AST', () => {
    const widget = parseOdl(SCHEMA).objectTypes.find(t => t.name === 'Widget')!;
    const name = widget.fields.find(f => f.name === 'name')!;
    expect(name.directives.find(d => d.kind === 'display')).toMatchObject({
      kind: 'display',
      label: 'Name',
      group: 'Basics',
      order: 1,
      renderHint: 'text',
    });
    const price = widget.fields.find(f => f.name === 'price')!;
    expect(price.directives.find(d => d.kind === 'display')).toMatchObject({
      kind: 'display',
      format: '0.00',
      renderHint: 'currency',
      group: 'Pricing',
      order: 2,
    });
    const secret = widget.fields.find(f => f.name === 'secret')!;
    expect(secret.directives.find(d => d.kind === 'display')).toMatchObject({
      kind: 'display',
      hidden: true,
    });
  });

  it('accepts titleProperty/statusProperty that reference real fields', () => {
    const result = validateSchema(parseOdl(SCHEMA));
    expect(result.errors.filter(e => e.code === 'DISPLAY_UNKNOWN_PROPERTY')).toEqual([]);
  });

  it('rejects a titleProperty that references an unknown field', () => {
    const bad = `
type Gadget @objectType @display(titleProperty: "missing") {
  id: ID! @primary
  name: String!
}
`;
    const result = validateSchema(parseOdl(bad));
    const errs = result.errors.filter(e => e.code === 'DISPLAY_UNKNOWN_PROPERTY');
    expect(errs.length).toBe(1);
    expect(errs[0]!.typeName).toBe('Gadget');
    expect(result.valid).toBe(false);
  });
});
