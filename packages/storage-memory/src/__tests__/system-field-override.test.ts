/**
 * Caller properties must not overwrite system columns.
 *
 * `_doCreateObject` spread `...properties` AFTER the system fields, so a
 * caller-supplied `_type` beat the `type` argument. That is a mandatory
 * access-control bypass, not a cosmetic one: an action declaring
 * `objectType: "Note"` wrote a row into `Patient`, every check that ran against
 * the DECLARED type validated the wrong thing, and the audit trail recorded
 * `Note` — so the write was invisible to anyone later asking who touched
 * Patient records.
 *
 * It is not specific to markings. Any control keyed on the declared type — FGA,
 * consent, field redaction — was checking a type the row did not end up having.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { RequestContext } from '@altius/spi';
import { MemoryStorageProvider } from '../memory-storage-provider.js';

const CTX: RequestContext = { tenantId: 'tenant-1', actorId: 'user-1', traceId: 'trace-1' };

describe('system fields are not overridable by caller properties', () => {
  let storage: MemoryStorageProvider;

  beforeEach(async () => {
    storage = new MemoryStorageProvider();
    await storage.applySchema(CTX, {
      version: 1,
      objectTypes: [
        { name: 'Note', properties: [{ name: 'text', type: 'String' }] },
        { name: 'Patient', properties: [{ name: 'text', type: 'String' }] },
      ],
      linkTypes: [],
    });
  });

  it('stores the declared type even when properties carry a forged _type', async () => {
    const created = await storage.createObject(CTX, 'Note', { text: 'forged', _type: 'Patient' });

    expect(created._type).toBe('Note');
  });

  it('does not put the row in the forged type', async () => {
    // The assertion that makes this a security test rather than a field check:
    // the row must not be READABLE as the type it was disguised as.
    await storage.createObject(CTX, 'Note', { text: 'forged', _type: 'Patient' });

    const patients = await storage.queryObjects(CTX, 'Patient', {
      field: 'text', operator: 'neq', value: '__never__',
    });
    const notes = await storage.queryObjects(CTX, 'Note', {
      field: 'text', operator: 'neq', value: '__never__',
    });

    expect(patients.items).toHaveLength(0);
    expect(notes.items).toHaveLength(1);
  });

  it('ignores a forged tenant, id, version and actor too', async () => {
    // _tenantId is the one that would cross a customer boundary, so the rule has
    // to cover every system column rather than the one that was exploited.
    const created = await storage.createObject(CTX, 'Note', {
      text: 'x',
      _tenantId: 'other-tenant',
      _id: 'chosen-id',
      _version: 99,
      _actorId: 'someone-else',
    });

    expect(created._tenantId).toBe('tenant-1');
    expect(created._id).not.toBe('chosen-id');
    expect(created._version).toBe(1);
    expect(created._actorId).toBe('user-1');
  });

  it('still stores ordinary properties', async () => {
    const created = await storage.createObject(CTX, 'Note', { text: 'kept' });
    expect(created['text']).toBe('kept');
  });
});
