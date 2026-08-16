/**
 * `@display` metadata is surfaced on the public OpenAPI document.
 *
 * A client fetching GET /api/v1/openapi.json can read type- and field-level
 * presentation hints as an `x-altius-display` vendor extension, so labels,
 * icons, grouping, and title/status pointers are consumable without platform
 * code. Before the display layer existed the directive was dropped at parse
 * time and never reached the document.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import { generateOpenApiSpec } from '../rest/openapi.js';

const ODL = `
type Widget @objectType @display(label: "Widget", pluralLabel: "Widgets", icon: "cube", titleProperty: "name") {
  id: ID! @primary
  name: String! @display(label: "Name", group: "Basics", order: 1)
  price: Float @display(renderHint: "currency", format: "0.00")
  plain: String
}
`;

function widgetSchema(): Record<string, unknown> {
  const spec = generateOpenApiSpec(parseOdl(ODL)) as {
    components: { schemas: Record<string, Record<string, unknown>> };
  };
  return spec.components.schemas['Widget']!;
}

describe('OpenAPI x-altius-display', () => {
  it('emits type-level display metadata on the object schema', () => {
    expect(widgetSchema()['x-altius-display']).toEqual({
      label: 'Widget',
      pluralLabel: 'Widgets',
      icon: 'cube',
      titleProperty: 'name',
    });
  });

  it('emits field-level display metadata on properties', () => {
    const props = widgetSchema()['properties'] as Record<string, Record<string, unknown>>;
    expect(props['name']!['x-altius-display']).toEqual({
      label: 'Name',
      group: 'Basics',
      order: 1,
    });
    expect(props['price']!['x-altius-display']).toEqual({
      renderHint: 'currency',
      format: '0.00',
    });
  });

  it('omits the extension on fields and types without @display', () => {
    const schema = widgetSchema();
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['plain']!['x-altius-display']).toBeUndefined();
    // The system fields never carry display metadata.
    expect(props['_consentRestricted']!['x-altius-display']).toBeUndefined();
  });
});
