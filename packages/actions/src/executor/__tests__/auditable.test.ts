/**
 * `@readonly` Auditable fields must be populated by the platform.
 *
 * altius.core declares:
 *
 *   interface Auditable {
 *     createdAt: DateTime! @readonly
 *     createdBy: String!   @readonly
 *     updatedAt: DateTime! @readonly
 *     updatedBy: String!   @readonly
 *   }
 *
 * They are non-null, so Postgres emits NOT NULL, and `@readonly` means a caller
 * may not supply them — so nothing could. `RegisterPatient` therefore failed on
 * the real stack with SQLSTATE 23502 (`null value in column "created_at"`),
 * while succeeding on the memory provider, which enforces no NOT NULL.
 *
 * Keyed off the declared `implements Auditable` clause rather than field names,
 * so this honours a contract the schema states rather than guessing at any
 * field that happens to be called `createdAt`.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import type { ParsedSchema } from '@altius/odl';
import { auditableDefaults } from '../auditable.js';

const ODL = `
extend schema @namespace(name: "test", version: "1.0.0")

interface Auditable {
  createdAt: DateTime! @readonly
  createdBy: String! @readonly
  updatedAt: DateTime! @readonly
  updatedBy: String! @readonly
}

type Patient implements Auditable @objectType {
  id: ID! @primary
  name: String!
  createdAt: DateTime! @readonly
  createdBy: String! @readonly
  updatedAt: DateTime! @readonly
  updatedBy: String! @readonly
}

type Ward @objectType {
  id: ID! @primary
  name: String!
}
`;

const NOW = '2026-08-15T12:00:00.000Z';
const ACTOR = 'dr-smith';

function schema(): ParsedSchema {
  return parseOdl(ODL);
}

describe('auditableDefaults — create', () => {
  it('fills every readonly audit field for a type implementing Auditable', () => {
    const filled = auditableDefaults(schema(), 'Patient', { name: 'Alice' }, ACTOR, NOW, 'create');

    expect(filled).toEqual({
      createdAt: NOW,
      createdBy: ACTOR,
      updatedAt: NOW,
      updatedBy: ACTOR,
    });
  });

  it('leaves a type that does not implement Auditable alone', () => {
    expect(auditableDefaults(schema(), 'Ward', { name: 'Cardiology' }, ACTOR, NOW, 'create')).toEqual({});
  });

  it('does not overwrite a value the effect already supplied', () => {
    const filled = auditableDefaults(
      schema(),
      'Patient',
      { name: 'Alice', createdBy: 'migration' },
      ACTOR,
      NOW,
      'create',
    );

    expect(filled.createdBy).toBeUndefined();
    expect(filled.createdAt).toBe(NOW);
  });

  it('is empty for an unknown type rather than throwing', () => {
    expect(auditableDefaults(schema(), 'Nope', {}, ACTOR, NOW, 'create')).toEqual({});
  });
});

describe('auditableDefaults — update', () => {
  it('touches only the updated* fields, never the created* ones', () => {
    const filled = auditableDefaults(schema(), 'Patient', { name: 'Alice B' }, ACTOR, NOW, 'update');

    expect(filled).toEqual({ updatedAt: NOW, updatedBy: ACTOR });
  });
});
