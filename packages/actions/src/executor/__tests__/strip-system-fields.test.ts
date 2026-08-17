/**
 * Compensation must not send system fields back as user properties.
 *
 * This guards a failure that only appears on Postgres. storage-postgres builds
 * its SET clause with snakeCase(key), which drops the leading underscore, so a
 * leaked `_actorId` becomes `SET "actor_id"` against a column named
 * `"_actor_id"` — 42703, raised INSIDE the rollback loop. A failed action's
 * compensation then fails too and the partial writes stay committed.
 *
 * The memory provider overwrites system fields unconditionally, so it swallows
 * the leak entirely. That is why the previous hand-maintained list could go
 * stale — it never gained `_actorId` after that field was added to
 * OntologyObject — with every test still green.
 */

import { describe, it, expect } from 'vitest';
import { __stripSystemFieldsForTest as stripSystemFields } from '../action-executor.js';

describe('stripSystemFields', () => {
  it('strips _actorId, the field the enumerated list had missed', () => {
    const snapshot = { _id: 'p-1', _actorId: 'user-9', status: 'ACTIVE' };

    expect(stripSystemFields(snapshot)).toEqual({ status: 'ACTIVE' });
  });

  it('strips every system field on a realistic object snapshot', () => {
    const snapshot = {
      _id: 'p-1',
      _tenantId: 't-1',
      _type: 'Patient',
      _version: 3,
      _createdAt: '2026-01-01T00:00:00Z',
      _updatedAt: '2026-01-02T00:00:00Z',
      _deletedAt: null,
      _actorId: 'user-9',
      status: 'ACTIVE',
      nhsNumber: '123',
    };

    expect(stripSystemFields(snapshot)).toEqual({ status: 'ACTIVE', nhsNumber: '123' });
  });

  it('strips link system fields too', () => {
    const link = { _id: 'l-1', _fromId: 'a', _toId: 'b', _fromType: 'Patient', _toType: 'Ward', active: true };

    expect(stripSystemFields(link)).toEqual({ active: true });
  });

  it('strips a system field added in future without this test being updated', () => {
    // The point of the prefix rule: a field nobody here has heard of is still
    // recognised as system, which an enumerated list cannot do.
    expect(stripSystemFields({ _somethingAddedLater: 1, keep: 2 })).toEqual({ keep: 2 });
  });

  it('keeps user properties, including ones that merely contain an underscore', () => {
    const snapshot = { nhs_number: '123', date_of_birth: '1980-01-01', _id: 'p-1' };

    expect(stripSystemFields(snapshot)).toEqual({ nhs_number: '123', date_of_birth: '1980-01-01' });
  });
});
