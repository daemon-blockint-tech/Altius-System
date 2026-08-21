/**
 * Postgres checkpoint store for sync CDC offset persistence.
 *
 * Table: sync.checkpoints, PK (tenant_id, datasource) — one row per
 * datasource per tenant. The checkpoint value is stored as JSONB so it
 * can be a string, number, or object (e.g. WAL LSN, timestamp, offset).
 *
 * Without this store, the scheduler defaults to InMemoryCheckpointStore,
 * which loses position on restart — a daily NHS PAS sync would re-scan
 * from scratch after every process restart.
 */
import type { Pool } from 'pg';
import type { Checkpoint } from '../connectors/connector.js';
import type { CheckpointStore } from './cdc-consumer.js';

export class PostgresCheckpointStore implements CheckpointStore {
  constructor(
    private readonly pool: Pool,
    private readonly tenantId: string,
  ) {}

  async getCheckpoint(datasource: string): Promise<Checkpoint | null> {
    const res = await this.pool.query(
      `SELECT "checkpoint" FROM "sync"."checkpoints"
       WHERE "tenant_id" = $1 AND "datasource" = $2`,
      [this.tenantId, datasource],
    );
    if (res.rows.length === 0) return null;
    const cp = res.rows[0]!['checkpoint'];
    // JSONB returns the value as-is (parsed); a string checkpoint is stored
    // as a JSON string, a number as a JSON number, an object as a JSON object.
    return cp as Checkpoint;
  }

  async saveCheckpoint(datasource: string, checkpoint: Checkpoint): Promise<void> {
    await this.pool.query(
      `INSERT INTO "sync"."checkpoints" ("tenant_id", "datasource", "checkpoint", "updated_at")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("tenant_id", "datasource")
       DO UPDATE SET "checkpoint" = EXCLUDED."checkpoint", "updated_at" = NOW()`,
      [this.tenantId, datasource, JSON.stringify(checkpoint)],
    );
  }
}
