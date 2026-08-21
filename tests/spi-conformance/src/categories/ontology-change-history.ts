/**
 * OntologyChangeHistoryService conformance — the same assertions against every
 * provider.
 *
 * This is the audit trail for schema change: who changed it, when, under which
 * migration class, and a full snapshot of what it looked like.
 *
 * Two of its six methods do not do what their names say, in **both** providers.
 * `restore` restores nothing and reports success; `applyChange` applies nothing
 * to the ontology and reports success, bumping only the record's own version.
 * The cases below pin that behaviour as it stands rather than asserting the
 * behaviour the names imply — a conformance suite that quietly encoded the
 * hoped-for semantics would be the worst of both, passing while the system did
 * nothing. Where a case pins a lie, it says so.
 */

import { describe, it, expect } from 'vitest';
import type {
  OntologyChangeHistoryService,
  OntologyChangeRecord,
  RequestContext,
} from '@altius/spi';

/** Built with an optional reader so the merge path can be exercised on both providers. */
export type ChangeHistoryReader = (ctx: RequestContext) => Promise<OntologyChangeRecord[]>;
export type ChangeHistoryFactory = (reader?: ChangeHistoryReader) =>
  | OntologyChangeHistoryService
  | Promise<OntologyChangeHistoryService>;

const SNAPSHOT = {
  objectTypes: [{ name: 'Patient', properties: [{ name: 'nhsNumber', type: 'String' }] }],
  linkTypes: [],
};

export function registerChangeHistoryTests(providerName: string, factory: ChangeHistoryFactory): void {
  describe(`[${providerName}] SPI Conformance: OntologyChangeHistoryService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_och_${label}_${counter++}`, actorId: 'u1' });

    describe('saving and reading', () => {
      it('saves a draft at version 1, attributed to the acting user', async () => {
        const svc = await factory();
        const ctx = ctxFor('save');
        const record = await svc.saveChange(ctx, {
          migrationClass: 'additive',
          diffSummary: 'added Patient.nhsNumber',
          snapshot: SNAPSHOT,
        });
        expect(record.version).toBe(1);
        expect(record.appliedBy).toBe('u1');
        expect(record.migrationClass).toBe('additive');
        expect(record.diffSummary).toBe('added Patient.nhsNumber');
        expect(record.tenantId).toBe(ctx.tenantId);
        expect(record.appliedAt).toBeTruthy();
      });

      it('defaults an omitted diff summary to empty rather than undefined', async () => {
        const svc = await factory();
        const ctx = ctxFor('save_nodiff');
        const record = await svc.saveChange(ctx, { migrationClass: 'manual', snapshot: {} });
        expect(record.diffSummary).toBe('');
      });

      it('round-trips the full schema snapshot', async () => {
        // The snapshot is the whole point of the record — a change history that
        // lost what the schema looked like is a list of timestamps.
        const svc = await factory();
        const ctx = ctxFor('snapshot');
        const record = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: SNAPSHOT });
        const found = await svc.getChange(ctx, record.id);
        expect(found!.snapshot).toEqual(SNAPSHOT);
      });

      it('returns null for an unknown id', async () => {
        const svc = await factory();
        expect(await svc.getChange(ctxFor('missing'), 'no-such-change')).toBeNull();
      });

      it('overwrites an existing record when handed a full one', async () => {
        const svc = await factory();
        const ctx = ctxFor('overwrite');
        const record = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: SNAPSHOT });
        const updated = await svc.saveChange(ctx, {
          ...record,
          diffSummary: 'revised summary',
          snapshot: { objectTypes: [] },
        });
        expect(updated.id).toBe(record.id);
        expect(updated.diffSummary).toBe('revised summary');
        expect((await svc.getChange(ctx, record.id))!.snapshot).toEqual({ objectTypes: [] });
        expect(await svc.listChanges(ctx)).toHaveLength(1);
      });

      it('creates a record when handed a full one with an id nothing holds yet', async () => {
        const svc = await factory();
        const ctx = ctxFor('overwrite_new');
        const saved = await svc.saveChange(ctx, {
          id: 'caller-chosen-id',
          tenantId: ctx.tenantId,
          version: 7,
          appliedAt: '2026-08-20T09:00:00.000Z',
          appliedBy: 'migration-tool',
          migrationClass: 'breaking',
          diffSummary: 'dropped a column',
          snapshot: SNAPSHOT,
        });
        expect(saved.id).toBe('caller-chosen-id');
        // A caller-supplied version and timestamp are honoured, so a record can
        // be backfilled rather than only appended.
        expect(saved.version).toBe(7);
        expect(saved.appliedBy).toBe('migration-tool');
        expect((await svc.getChange(ctx, 'caller-chosen-id'))!.version).toBe(7);
      });

      it('takes the tenant from the request, not from the record handed in', async () => {
        // NARROWED DELIBERATELY, IN BOTH PROVIDERS. The record form carries a
        // `tenantId`, and honouring it would let a caller write into another
        // tenant's history — in a table the tenant is a column rather than a map
        // key, so the in-memory service was insulated only by accident.
        const svc = await factory();
        const ctx = ctxFor('tenant_narrow');
        const saved = await svc.saveChange(ctx, {
          id: 'spoofed',
          tenantId: 't_och_not_yours',
          version: 1,
          appliedAt: new Date().toISOString(),
          appliedBy: 'u1',
          migrationClass: 'additive',
          diffSummary: '',
          snapshot: {},
        });
        expect(saved.tenantId).toBe(ctx.tenantId);
        expect(await svc.getChange(ctx, 'spoofed')).not.toBeNull();
        expect(await svc.getChange({ tenantId: 't_och_not_yours', actorId: 'u1' }, 'spoofed')).toBeNull();
      });

      it('lets two tenants each hold a record under the same id', async () => {
        // The in-memory service keys its records per tenant, so a caller-chosen
        // id is only unique within a tenant. Pinned because it is the reason
        // the Postgres table keys on (tenant_id, id) rather than id alone.
        const svc = await factory();
        const a = ctxFor('shared_id_a');
        const b = ctxFor('shared_id_b');
        const base = {
          id: 'v1', tenantId: 'ignored', version: 1,
          appliedAt: new Date().toISOString(), appliedBy: 'u1',
          migrationClass: 'additive', snapshot: {},
        };
        await svc.saveChange(a, { ...base, diffSummary: 'tenant a' });
        await svc.saveChange(b, { ...base, diffSummary: 'tenant b' });
        expect((await svc.getChange(a, 'v1'))!.diffSummary).toBe('tenant a');
        expect((await svc.getChange(b, 'v1'))!.diffSummary).toBe('tenant b');
      });

      it('keeps history in separate tenants apart', async () => {
        const svc = await factory();
        const a = ctxFor('iso_a');
        const b = ctxFor('iso_b');
        const record = await svc.saveChange(a, { migrationClass: 'additive', snapshot: SNAPSHOT });
        expect(await svc.getChange(b, record.id)).toBeNull();
        expect(await svc.listChanges(b)).toHaveLength(0);
      });
    });

    describe('listing and filtering', () => {
      it('lists highest version first, insertion order breaking ties', async () => {
        // Ties are the norm here rather than the edge case: every draft is
        // created at version 1, so a page of fresh records is entirely ties. A
        // provider ordering only by version would return them arbitrarily.
        const svc = await factory();
        const ctx = ctxFor('order');
        const first = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: {} });
        const second = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: {} });
        const third = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: {} });
        expect((await svc.listChanges(ctx)).map(r => r.id)).toEqual([first.id, second.id, third.id]);

        // Raising one record's version floats it to the front.
        await svc.applyChange(ctx, second.id);
        expect((await svc.listChanges(ctx)).map(r => r.id)).toEqual([second.id, first.id, third.id]);
      });

      it('filters by migration class', async () => {
        const svc = await factory();
        const ctx = ctxFor('filter_class');
        await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: {} });
        await svc.saveChange(ctx, { migrationClass: 'breaking', snapshot: {} });
        expect(await svc.listChanges(ctx, { migrationClass: 'breaking' })).toHaveLength(1);
        expect(await svc.listChanges(ctx, { migrationClass: 'nothing' })).toHaveLength(0);
      });

      it('filters by version range, inclusive at both ends', async () => {
        const svc = await factory();
        const ctx = ctxFor('filter_version');
        const mk = async (version: number, id: string) => svc.saveChange(ctx, {
          id, tenantId: ctx.tenantId, version,
          appliedAt: new Date().toISOString(), appliedBy: 'u1',
          migrationClass: 'additive', diffSummary: '', snapshot: {},
        });
        await mk(1, 'a'); await mk(2, 'b'); await mk(3, 'c');
        expect((await svc.listChanges(ctx, { fromVersion: 2 })).map(r => r.id)).toEqual(['c', 'b']);
        expect((await svc.listChanges(ctx, { toVersion: 2 })).map(r => r.id)).toEqual(['b', 'a']);
        expect((await svc.listChanges(ctx, { fromVersion: 2, toVersion: 2 })).map(r => r.id)).toEqual(['b']);
      });

      it('filters by an object type named in the snapshot', async () => {
        const svc = await factory();
        const ctx = ctxFor('filter_type');
        await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: SNAPSHOT });
        await svc.saveChange(ctx, {
          migrationClass: 'additive',
          snapshot: { objectTypes: [{ name: 'Order' }] },
        });
        expect(await svc.listChanges(ctx, { objectType: 'Patient' })).toHaveLength(1);
        expect(await svc.listChanges(ctx, { objectType: 'Order' })).toHaveLength(1);
        expect(await svc.listChanges(ctx, { objectType: 'Nothing' })).toHaveLength(0);
      });

      it('skips a record whose snapshot has no object types at all', async () => {
        // The guard matters: a snapshot with no `objectTypes`, or one that is
        // not an array, must be skipped rather than throw.
        const svc = await factory();
        const ctx = ctxFor('filter_noshape');
        await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: {} });
        await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: { objectTypes: 'not-an-array' } });
        expect(await svc.listChanges(ctx, { objectType: 'Patient' })).toHaveLength(0);
      });

      it('pages with limit and offset, after filtering', async () => {
        const svc = await factory();
        const ctx = ctxFor('paging');
        const a = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: {} });
        const b = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: {} });
        const c = await svc.saveChange(ctx, { migrationClass: 'breaking', snapshot: {} });
        expect((await svc.listChanges(ctx, { limit: 2 })).map(r => r.id)).toEqual([a.id, b.id]);
        expect((await svc.listChanges(ctx, { offset: 2 })).map(r => r.id)).toEqual([c.id]);
        // Paging applies to the filtered set, not the whole table.
        expect((await svc.listChanges(ctx, { migrationClass: 'breaking', limit: 2 })).map(r => r.id)).toEqual([c.id]);
      });

      it('merges records from a reader, letting stored ones win on id', async () => {
        const stored = ctxFor('reader');
        const external: OntologyChangeRecord = {
          id: 'from-registry', tenantId: stored.tenantId, version: 4,
          appliedAt: '2026-08-19T00:00:00.000Z', appliedBy: 'schema-registry',
          migrationClass: 'additive', diffSummary: 'from the registry', snapshot: SNAPSHOT,
        };
        const svc = await factory(async () => [external]);
        const own = await svc.saveChange(stored, { migrationClass: 'additive', snapshot: {} });
        const listed = await svc.listChanges(stored);
        // Version 4 outranks the freshly saved version 1.
        expect(listed.map(r => r.id)).toEqual(['from-registry', own.id]);
        expect(listed[0]!.appliedBy).toBe('schema-registry');
      });
    });

    describe('validation', () => {
      it('accepts a record with a migration class and an object snapshot', async () => {
        const svc = await factory();
        const ctx = ctxFor('valid');
        const record = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: SNAPSHOT });
        expect(await svc.validateChange(ctx, record.id)).toEqual({ valid: true, errors: [] });
      });

      it('reports a missing record as invalid rather than throwing', async () => {
        // validate answers a question; it does not perform an action, so a
        // missing record is an answer rather than an error.
        const svc = await factory();
        const result = await svc.validateChange(ctxFor('valid_missing'), 'no-such-change');
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(['Change record not found']);
      });

      it('rejects a record with no migration class', async () => {
        const svc = await factory();
        const ctx = ctxFor('valid_noclass');
        const record = await svc.saveChange(ctx, { migrationClass: '', snapshot: SNAPSHOT });
        const result = await svc.validateChange(ctx, record.id);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('migrationClass is required');
      });
    });

    describe('the two operations that report success without doing the work', () => {
      it('reports a restore that restores nothing', async () => {
        // PINNED AS-IS, NOT ENDORSED. `restore` reads the record, confirms it
        // exists, and returns `restored: true`. No schema is rolled back and no
        // object type is touched, in either provider. Asserted so the claim
        // cannot quietly become true — or quietly stay false while someone
        // believes otherwise.
        const svc = await factory();
        const ctx = ctxFor('restore');
        const record = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: SNAPSHOT });
        const result = await svc.restore(ctx, record.id, 'Patient');
        expect(result.restored).toBe(true);
        expect(result.changeId).toBe(record.id);
        expect(result.objectType).toBe('Patient');
        expect(result.version).toBe(record.version);
        // The record itself is untouched by the "restore" — the only observable
        // effect is the return value.
        expect(await svc.getChange(ctx, record.id)).toEqual(record);
      });

      it('reports a restore of an object type the snapshot never mentioned', async () => {
        // Nothing is checked against the snapshot, so a type that was never in
        // it still restores successfully. The clearest evidence that the
        // operation is a report rather than an action.
        const svc = await factory();
        const ctx = ctxFor('restore_absent');
        const record = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: SNAPSHOT });
        expect((await svc.restore(ctx, record.id, 'NeverExisted')).restored).toBe(true);
      });

      it('throws when restoring from a record that does not exist', async () => {
        const svc = await factory();
        await expect(svc.restore(ctxFor('restore_missing'), 'no-such-change', 'Patient'))
          .rejects.toThrow(/not found/i);
      });

      it('bumps the record version on apply, and changes no schema', async () => {
        // PINNED AS-IS, NOT ENDORSED. `applyChange` touches only this record.
        const svc = await factory();
        const ctx = ctxFor('apply');
        const record = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: SNAPSHOT });
        const result = await svc.applyChange(ctx, record.id);
        expect(result.applied).toBe(true);
        expect(result.changeId).toBe(record.id);
        expect(result.version).toBe(2);

        const after = await svc.getChange(ctx, record.id);
        expect(after!.version).toBe(2);
        expect(after!.appliedAt).toBe(result.appliedAt);
        // The snapshot is unchanged, because nothing was applied to anything.
        expect(after!.snapshot).toEqual(SNAPSHOT);
      });

      it('accumulates the version across repeated applies', async () => {
        const svc = await factory();
        const ctx = ctxFor('apply_twice');
        const record = await svc.saveChange(ctx, { migrationClass: 'additive', snapshot: {} });
        await svc.applyChange(ctx, record.id);
        expect((await svc.applyChange(ctx, record.id)).version).toBe(3);
      });

      it('refuses to apply a record that does not validate', async () => {
        const svc = await factory();
        const ctx = ctxFor('apply_invalid');
        const record = await svc.saveChange(ctx, { migrationClass: '', snapshot: {} });
        await expect(svc.applyChange(ctx, record.id)).rejects.toThrow(/not valid/i);
        // And the version is untouched by the refusal.
        expect((await svc.getChange(ctx, record.id))!.version).toBe(1);
      });

      it('throws when applying a record that does not exist', async () => {
        const svc = await factory();
        await expect(svc.applyChange(ctxFor('apply_missing'), 'no-such-change'))
          .rejects.toThrow(/not found/i);
      });
    });
  });
}
