/**
 * CheckpointStore conformance — the same assertions against every provider.
 *
 * Sync checkpoints are a RELIABILITY store: the scheduler resumes from
 * getCheckpoint after a restart. Two providers that disagree here disagree
 * about where to resume a daily NHS PAS sync. The semantics pinned:
 *  - getCheckpoint returns null when no checkpoint exists (first run);
 *  - saveCheckpoint is idempotent (re-saving the same datasource updates, not duplicates);
 *  - checkpoints are per-datasource (saving one does not affect another);
 *  - the checkpoint value can be a string, number, or object.
 *
 * The memory half always runs. The Postgres half runs when PG_TEST_URL is set.
 */

import { describe, it, expect, afterAll } from 'vitest';
import type { CheckpointStore } from '@altius/sync';
import { InMemoryCheckpointStore, PostgresCheckpointStore } from '@altius/sync';
import { PostgresStorageProvider } from '@altius/storage-postgres';
import { pgTestUrl, parsePgUrl } from './pg-gate.js';

function runTests(name: string, factory: () => Promise<CheckpointStore>): void {
  describe(`[${name}] SPI Conformance: CheckpointStore`, () => {
    it('getCheckpoint returns null when no checkpoint exists', async () => {
      const store = await factory();
      const cp = await store.getCheckpoint('datasource-1');
      expect(cp).toBeNull();
    });

    it('saveCheckpoint stores a string checkpoint; getCheckpoint returns it', async () => {
      const store = await factory();
      await store.saveCheckpoint('ds-1', '2024-01-01T00:00:00Z');
      const cp = await store.getCheckpoint('ds-1');
      expect(cp).toBe('2024-01-01T00:00:00Z');
    });

    it('saveCheckpoint stores a number checkpoint', async () => {
      const store = await factory();
      await store.saveCheckpoint('ds-1', 42);
      const cp = await store.getCheckpoint('ds-1');
      expect(cp).toBe(42);
    });

    it('saveCheckpoint stores an object checkpoint', async () => {
      const store = await factory();
      const obj = { lsn: '0/16A1B90', offset: 12345 };
      await store.saveCheckpoint('ds-1', obj);
      const cp = await store.getCheckpoint('ds-1') as Record<string, unknown>;
      expect(cp).toEqual(obj);
    });

    it('saveCheckpoint is idempotent — re-saving updates, not duplicates', async () => {
      const store = await factory();
      await store.saveCheckpoint('ds-1', 'v1');
      await store.saveCheckpoint('ds-1', 'v2');
      const cp = await store.getCheckpoint('ds-1');
      expect(cp).toBe('v2');
    });

    it('checkpoints are per-datasource — saving one does not affect another', async () => {
      const store = await factory();
      await store.saveCheckpoint('ds-1', 'pos-1');
      await store.saveCheckpoint('ds-2', 'pos-2');
      expect(await store.getCheckpoint('ds-1')).toBe('pos-1');
      expect(await store.getCheckpoint('ds-2')).toBe('pos-2');
    });
  });
}

runTests('Memory', async () => new InMemoryCheckpointStore());

const url = pgTestUrl;
if (url) {
  let provider: PostgresStorageProvider | null = null;
  afterAll(async () => {
    if (provider) await provider.close();
  });

  runTests('Postgres', async () => {
    provider = new PostgresStorageProvider(parsePgUrl(url));
    return new PostgresCheckpointStore(provider.pool, 'test-tenant');
  });
} else if (process.env['REQUIRE_PG'] === 'true') {
  describe('[Postgres] SPI Conformance: CheckpointStore', () => {
    it('fails when REQUIRE_PG is set but PG_TEST_URL is not', () => {
      throw new Error('REQUIRE_PG=true but PG_TEST_URL is not set');
    });
  });
}
