/**
 * A @readonly required field must not make its type uncreatable.
 *
 * The core `Auditable` interface declares createdAt/createdBy/updatedAt/
 * updatedBy as `DateTime!`/`String!` AND @readonly. The write paths refuse a
 * caller-supplied value for a readonly field, and nothing in the platform
 * populates these — the real audit values live in the _created_at/_updated_at/
 * _actor_id system columns. So every type implementing Auditable, Patient
 * among them, could not be created by anyone: not the seed loader, not an
 * action, not the API.
 *
 * It showed up as "Seed: failed to create Patient ... Required field
 * 'createdAt' is missing" on every boot of the shipped packs.
 */
import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import { validateSchemaFields } from '../validation.js';

const schema = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Note @objectType {
  id: ID! @primary
  body: String!
  createdAt: DateTime! @readonly
  createdBy: String! @readonly
}
`);


describe('@readonly required fields', () => {
  it('does not demand a value the caller is forbidden to supply', () => {
    const failures = validateSchemaFields(schema, 'Note', { body: 'hello' });

    expect(failures).toEqual([]);
  });

  it('still demands a required field the caller CAN supply', () => {
    const failures = validateSchemaFields(schema, 'Note', {});

    expect(failures.map(f => f.field)).toEqual(['body']);
  });
});
