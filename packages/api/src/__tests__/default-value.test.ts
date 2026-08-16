/**
 * `@default` was parsed, validated, and then dropped.
 *
 * convertObjectType never set PropertyDefinition.defaultValue, so the
 * directive reached neither provider: Postgres emitted NOT NULL with no
 * DEFAULT, and the memory provider's required-check had nothing to fall back
 * on. A field declared `String! @default(value: "DRAFT")` was therefore
 * REJECTED by both providers when a create omitted it — the exact opposite of
 * what the declaration promises. The engine validator even skipped its own
 * required-check for those fields, trusting a default that never arrived.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import { MemoryStorageProvider } from '@altius/storage-memory';
import type { RequestContext } from '@altius/spi';
import { toOntologySchema } from '../schema-loader.js';

const ctx: RequestContext = { tenantId: 't-1', actorId: 'u-1' };

const parsed = parseOdl(`
extend schema @namespace(name: "test", version: "0.1.0")

type Note @objectType {
  id: ID! @primary
  body: String!
  status: String! @default(value: "DRAFT")
}
`);

describe('@default materialisation', () => {
  it('carries the declared default across the SPI boundary', () => {
    const spi = toOntologySchema(parsed);
    const status = spi.objectTypes[0]!.properties.find(p => p.name === 'status');

    expect(status?.defaultValue).toBe('DRAFT');
  });

  it('accepts a create that omits a defaulted required field', async () => {
    const storage = new MemoryStorageProvider();
    await storage.applySchema(ctx, toOntologySchema(parsed));

    const obj = await storage.createObject(ctx, 'Note', { body: 'hello' });

    expect(obj['status']).toBe('DRAFT');
  });

  it('still rejects a required field with no default', async () => {
    const storage = new MemoryStorageProvider();
    await storage.applySchema(ctx, toOntologySchema(parsed));

    await expect(
      storage.createObject(ctx, 'Note', { status: 'OPEN' }),
    ).rejects.toThrow(/body/);
  });

  it('does not overwrite a value the caller supplied', async () => {
    const storage = new MemoryStorageProvider();
    await storage.applySchema(ctx, toOntologySchema(parsed));

    const obj = await storage.createObject(ctx, 'Note', { body: 'hi', status: 'OPEN' });

    expect(obj['status']).toBe('OPEN');
  });

  it('treats an explicit null as the caller refusing a value, not as absent', async () => {
    const storage = new MemoryStorageProvider();
    await storage.applySchema(ctx, toOntologySchema(parsed));

    // Postgres would reject this too: DEFAULT applies to an omitted column,
    // never to an explicit NULL against NOT NULL.
    await expect(
      storage.createObject(ctx, 'Note', { body: 'hi', status: null }),
    ).rejects.toThrow(/status/);
  });
});
