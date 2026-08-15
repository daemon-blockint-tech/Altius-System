import { describe, it, expect, beforeEach } from 'vitest';
import type { StorageProvider } from '@altius/spi';
import type { ProviderFactory } from '../suite.js';
import { tenantA, baseSchema } from '../fixtures.js';

/**
 * Required-property and unique-index enforcement.
 *
 * On Postgres these are column constraints: `required: true` becomes NOT NULL
 * and a unique IndexDefinition becomes a UNIQUE index, so the store refuses the
 * write itself. The engine's own checks are check-then-write and cannot be the
 * contract — a provider that only relies on them loses every race and admits
 * every write that bypasses the engine.
 */
export function registerConstraintTests(name: string, factory: ProviderFactory): void {
  describe(`[${name}] SPI Conformance: Constraints`, () => {
    let provider: StorageProvider;

    beforeEach(async () => {
      provider = await factory();
      await provider.applySchema(tenantA, baseSchema);
    });

    // ─── Required properties ───

    describe('required properties', () => {
      it('rejects createObject that omits a required property', async () => {
        await expect(
          provider.createObject(tenantA, 'Patient', { age: 30 }),
        ).rejects.toThrow();
      });

      it('rejects createObject that sets a required property to null', async () => {
        await expect(
          provider.createObject(tenantA, 'Patient', { name: null, age: 30 }),
        ).rejects.toThrow();
      });

      it('rejects updateObject that nulls a required property', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'Alice' });
        await expect(
          provider.updateObject(tenantA, 'Patient', p._id, { name: null }),
        ).rejects.toThrow();
      });

      it('allows an update that leaves the required property untouched', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'Alice' });
        const updated = await provider.updateObject(tenantA, 'Patient', p._id, { age: 31 });
        expect(updated.age).toBe(31);
        expect(updated.name).toBe('Alice');
      });

      it('allows an optional property to be omitted', async () => {
        const p = await provider.createObject(tenantA, 'Patient', { name: 'Alice' });
        expect(p.age ?? null).toBeNull();
      });
    });

    // ─── Unique indexes ───

    const uniqueNhs = { field: 'nhsNumber', indexType: 'BTREE', unique: true } as const;

    describe('unique indexes', () => {
      it('rejects a duplicate value once a unique index exists', async () => {
        await provider.ensureIndex(tenantA, 'Patient', uniqueNhs);
        await provider.createObject(tenantA, 'Patient', { name: 'A', nhsNumber: 'NHS-1' });
        await expect(
          provider.createObject(tenantA, 'Patient', { name: 'B', nhsNumber: 'NHS-1' }),
        ).rejects.toThrow();
      });

      it('allows distinct values under a unique index', async () => {
        await provider.ensureIndex(tenantA, 'Patient', uniqueNhs);
        await provider.createObject(tenantA, 'Patient', { name: 'A', nhsNumber: 'NHS-1' });
        const b = await provider.createObject(tenantA, 'Patient', { name: 'B', nhsNumber: 'NHS-2' });
        expect(b.nhsNumber).toBe('NHS-2');
      });

      it('allows repeated nulls under a unique index', async () => {
        await provider.ensureIndex(tenantA, 'Patient', uniqueNhs);
        await provider.createObject(tenantA, 'Patient', { name: 'A', nhsNumber: null });
        const b = await provider.createObject(tenantA, 'Patient', { name: 'B', nhsNumber: null });
        expect(b._id).toBeDefined();
      });

      it('rejects an update that collides with an existing value', async () => {
        await provider.ensureIndex(tenantA, 'Patient', uniqueNhs);
        await provider.createObject(tenantA, 'Patient', { name: 'A', nhsNumber: 'NHS-1' });
        const b = await provider.createObject(tenantA, 'Patient', { name: 'B', nhsNumber: 'NHS-2' });
        await expect(
          provider.updateObject(tenantA, 'Patient', b._id, { nhsNumber: 'NHS-1' }),
        ).rejects.toThrow();
      });

      it('lets an object keep its own value on update', async () => {
        await provider.ensureIndex(tenantA, 'Patient', uniqueNhs);
        const a = await provider.createObject(tenantA, 'Patient', { name: 'A', nhsNumber: 'NHS-1' });
        const updated = await provider.updateObject(tenantA, 'Patient', a._id, { nhsNumber: 'NHS-1', age: 40 });
        expect(updated.age).toBe(40);
      });

      it('refuses to build a unique index over data that already violates it', async () => {
        await provider.createObject(tenantA, 'Patient', { name: 'A', nhsNumber: 'NHS-1' });
        await provider.createObject(tenantA, 'Patient', { name: 'B', nhsNumber: 'NHS-1' });
        await expect(
          provider.ensureIndex(tenantA, 'Patient', uniqueNhs),
        ).rejects.toThrow();
      });

      it('stops enforcing after dropIndex', async () => {
        await provider.ensureIndex(tenantA, 'Patient', uniqueNhs);
        await provider.createObject(tenantA, 'Patient', { name: 'A', nhsNumber: 'NHS-1' });
        await provider.dropIndex(tenantA, 'Patient', 'nhsNumber');
        const b = await provider.createObject(tenantA, 'Patient', { name: 'B', nhsNumber: 'NHS-1' });
        expect(b.nhsNumber).toBe('NHS-1');
      });

      it('lists an index it was asked to build', async () => {
        await provider.ensureIndex(tenantA, 'Patient', uniqueNhs);
        const indexes = await provider.listIndexes(tenantA, 'Patient');
        expect(indexes.some(i => i.field === 'nhsNumber' && i.unique)).toBe(true);
      });
    });
  });
}
