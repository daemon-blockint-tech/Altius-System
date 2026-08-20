/**
 * PostgreSQL versioned transactional dataset service.
 *
 * The one platform store #18 deliberately left in memory, because rows and a
 * transaction log are harder than a metadata table. Until now `datasetService`
 * sat in `nonDurableServices`, so a Postgres deployment answered 404 on every
 * dataset route — honest, and useless. This makes those routes work.
 *
 * Four tables, all tenant-scoped (DDL in schema/ddl-platform.ts):
 *
 *   dataset.metadata      one row per (name, branch); carries schema + row count
 *   dataset.rows          current rows per branch, keyed by the schema's PK
 *   dataset.transactions  append-only log, ordered by `seq` within a branch
 *   dataset.branches      branch registry; the home branch is self-parented
 *
 * Row identity, filtering, ordering and projection come from @altius/spi so
 * this and the in-memory service cannot answer the same read differently.
 *
 * Two things are deliberately faithful to the in-memory service rather than
 * "better", because a provider-dependent contract is the defect class this
 * line of work exists to remove — dev and prod must agree. Both are contract
 * questions for the lead, to be changed in BOTH providers or neither:
 *
 *   - `create` on an existing name replaces it, discarding rows and log. In
 *     memory that is a dev annoyance; on Postgres it is real data loss, so it
 *     is the more urgent of the two to revisit.
 *   - a write to any branch advances the dataset-wide `latestTransactionId`
 *     that `get` and `read` report, not just the written branch's.
 *
 * Known limitation, stated plainly: a read materialises the branch's rows and
 * filters in process. Scoping to (tenant, dataset, branch) happens in SQL, so
 * no unrelated dataset is ever loaded, but filter/sort pushdown into SQL is
 * not implemented. That is a scale limit, not a correctness one, and it is the
 * natural follow-up.
 */

import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import {
  datasetRowKey,
  datasetRowMatches,
  datasetSortRows,
  datasetProjectColumns,
} from '@altius/spi';
import type {
  DatasetService,
  Dataset,
  DatasetSchema,
  DatasetTransaction,
  CreateDatasetInput,
  WriteRowsInput,
  WriteResult,
  ReadOptions,
  ReadResult,
  DatasetBranch,
  RequestContext,
} from '@altius/spi';
import { PgTransaction } from '../transactions/pg-transaction.js';

/** Something that can run parameterised queries — Pool or in-transaction client. */
type Q = Pool | PoolClient;

/**
 * TIMESTAMPTZ comes back from pg as a Date, but the SPI types every timestamp
 * as an ISO 8601 string. Converting at the boundary keeps that promise true.
 */
function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  return typeof v === 'string' ? (JSON.parse(v) as T) : (v as T);
}

/** A metadata row for one (dataset, branch) pair. */
interface MetaRow {
  datasetId: string;
  name: string;
  branch: string;
  description: string;
  schema: DatasetSchema;
  latestTransactionId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

function mapMeta(r: Record<string, unknown>): MetaRow {
  return {
    datasetId: String(r['dataset_id'] ?? r['id']),
    name: String(r['name']),
    branch: String(r['branch']),
    description: String(r['description'] ?? ''),
    schema: parseJson<DatasetSchema>(r['schema'], { columns: [], version: 1 }),
    latestTransactionId: String(r['latest_transaction_id'] ?? ''),
    createdAt: toIso(r['created_at']),
    updatedAt: toIso(r['updated_at']),
    createdBy: String(r['created_by'] ?? ''),
  };
}

function toDataset(m: MetaRow, tenantId: string, branch?: string): Dataset {
  return {
    id: m.datasetId,
    tenantId,
    name: m.name,
    description: m.description,
    schema: m.schema,
    branch: branch ?? m.branch,
    latestTransactionId: m.latestTransactionId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    createdBy: m.createdBy,
  };
}

function mapTransaction(r: Record<string, unknown>, tenantId: string): DatasetTransaction {
  const snapshot = parseJson<DatasetSchema | null>(r['schema_snapshot'], null);
  const previous = parseJson<DatasetSchema | null>(r['previous_schema_snapshot'], null);
  const message = r['message'];
  return {
    id: String(r['id']),
    tenantId,
    datasetId: String(r['dataset_id'] ?? ''),
    type: r['type'] as DatasetTransaction['type'],
    rows: parseJson<Record<string, unknown>[]>(r['rows'], []),
    schemaVersion: Number(r['schema_version'] ?? 0),
    ...(snapshot ? { schemaSnapshot: snapshot } : {}),
    ...(previous ? { previousSchemaSnapshot: previous } : {}),
    timestamp: toIso(r['timestamp']),
    actorId: String(r['actor_id'] ?? ''),
    branch: String(r['branch']),
    ...(message === null || message === undefined ? {} : { message: String(message) }),
  };
}

export class PostgresDatasetService implements DatasetService {
  constructor(private readonly pool: Pool) {}

  // ── Dataset CRUD ──────────────────────────────────────────────────────────

  async create(ctx: RequestContext, input: CreateDatasetInput): Promise<Dataset> {
    const branch = input.branch ?? 'main';
    const datasetId = randomUUID();
    const now = new Date().toISOString();
    const tx = await PgTransaction.begin(this.pool);
    try {
      const c = tx.client;
      // The in-memory service replaces any dataset already under this name, so
      // the old rows and log must go too or they would resurface under the new
      // dataset id. See the header note — this is a contract worth revisiting.
      await this.deleteDataset(c, ctx.tenantId, input.name);
      await c.query(
        `INSERT INTO "dataset"."metadata"
           ("id","dataset_id","tenant_id","name","branch","schema","description",
            "latest_transaction_id","row_count","created_by","created_at","updated_at")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          randomUUID(), datasetId, ctx.tenantId, input.name, branch,
          JSON.stringify(input.schema), input.description ?? '',
          'init', 0, ctx.actorId ?? 'system', now,
        ],
      );
      // The home branch is self-parented, which is how it is identified later.
      await c.query(
        `INSERT INTO "dataset"."branches"
           ("id","tenant_id","dataset_id","dataset_name","name","parent_branch",
            "parent_transaction_id","created_at","created_by")
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8)`,
        [randomUUID(), ctx.tenantId, datasetId, input.name, branch, 'init', now, ctx.actorId ?? 'system'],
      );
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    return {
      id: datasetId,
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? '',
      schema: input.schema,
      branch,
      latestTransactionId: 'init',
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
  }

  async get(ctx: RequestContext, name: string, branch?: string): Promise<Dataset | null> {
    const home = await this.homeMeta(this.pool, ctx.tenantId, name);
    if (!home) return null;
    return toDataset(home, ctx.tenantId, branch);
  }

  async list(ctx: RequestContext): Promise<Dataset[]> {
    // One Dataset per name: join each metadata row to the self-parented branch
    // row so only the home branch's metadata is returned.
    const r = await this.pool.query(
      `SELECT m.* FROM "dataset"."metadata" m
         JOIN "dataset"."branches" b
           ON b."tenant_id" = m."tenant_id"
          AND b."dataset_name" = m."name"
          AND b."name" = m."branch"
        WHERE m."tenant_id" = $1 AND b."name" = b."parent_branch"
        ORDER BY m."name"`,
      [ctx.tenantId],
    );
    return r.rows.map(row => toDataset(mapMeta(row), ctx.tenantId));
  }

  async drop(ctx: RequestContext, name: string, branch?: string): Promise<void> {
    const tx = await PgTransaction.begin(this.pool);
    try {
      const c = tx.client;
      if (branch && branch !== 'main') {
        for (const table of ['rows', 'transactions'] as const) {
          await c.query(
            `DELETE FROM "dataset"."${table}" WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3`,
            [ctx.tenantId, name, branch],
          );
        }
        await c.query(
          `DELETE FROM "dataset"."branches" WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "name"=$3`,
          [ctx.tenantId, name, branch],
        );
        await c.query(
          `DELETE FROM "dataset"."metadata" WHERE "tenant_id"=$1 AND "name"=$2 AND "branch"=$3`,
          [ctx.tenantId, name, branch],
        );
      } else {
        await this.deleteDataset(c, ctx.tenantId, name);
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async updateSchema(ctx: RequestContext, name: string, schema: DatasetSchema, branch?: string): Promise<Dataset> {
    const tx = await PgTransaction.begin(this.pool);
    try {
      const c = tx.client;
      const home = await this.requireHome(c, ctx.tenantId, name);
      const br = branch ?? home.branch;
      const next: DatasetSchema = { ...schema, version: schema.version };
      const txId = randomUUID();
      const now = new Date().toISOString();
      // Both sides are snapshotted so getSchema can reconstruct any version
      // from the log alone — the outgoing schema is otherwise lost.
      await this.appendTransaction(c, ctx, home.datasetId, name, br, {
        id: txId,
        type: 'schema_change',
        rows: [],
        schemaVersion: next.version,
        schemaSnapshot: next,
        previousSchemaSnapshot: home.schema,
        timestamp: now,
        message: `Schema updated to v${next.version}`,
      });
      // Schema is dataset-wide in the in-memory service (a branch-scoped
      // updateSchema still moves the shared schema), so every branch's row is
      // kept consistent rather than letting branches disagree.
      await c.query(
        `UPDATE "dataset"."metadata"
            SET "schema"=$3, "latest_transaction_id"=$4, "updated_at"=$5
          WHERE "tenant_id"=$1 AND "name"=$2`,
        [ctx.tenantId, name, JSON.stringify(next), txId, now],
      );
      await tx.commit();
      return { ...toDataset(home, ctx.tenantId), schema: next, latestTransactionId: txId, updatedAt: now };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // ── Row writes ────────────────────────────────────────────────────────────

  async insert(ctx: RequestContext, name: string, input: WriteRowsInput, branch?: string): Promise<WriteResult> {
    return this.write(ctx, name, branch, async (c, home, br) => {
      let written = 0;
      let upserted = 0;
      for (const row of input.rows) {
        const key = datasetRowKey(home.schema, row);
        if (key === null) {
          // No primary key: every row gets a fresh identity, so the dataset is
          // append-only and an identical row inserted twice stays two rows.
          await c.query(
            `INSERT INTO "dataset"."rows" ("id","tenant_id","dataset_name","branch","row_key","data")
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [randomUUID(), ctx.tenantId, name, br, randomUUID(), JSON.stringify(row)],
          );
        } else {
          // A primary-key collision always replaces; `upsert` only decides
          // whether the replacement is *reported* as an upsert.
          if (input.upsert) {
            const existing = await c.query(
              `SELECT 1 FROM "dataset"."rows"
                WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3 AND "row_key"=$4`,
              [ctx.tenantId, name, br, key],
            );
            if (existing.rowCount) upserted++;
          }
          await c.query(
            `INSERT INTO "dataset"."rows" ("id","tenant_id","dataset_name","branch","row_key","data")
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT ("tenant_id","dataset_name","branch","row_key")
             DO UPDATE SET "data" = EXCLUDED."data"`,
            [randomUUID(), ctx.tenantId, name, br, key, JSON.stringify(row)],
          );
        }
        written++;
      }
      return {
        rows: input.rows,
        type: 'insert' as const,
        result: { rowsWritten: written, rowsUpserted: upserted },
        ...(input.message === undefined ? {} : { message: input.message }),
      };
    });
  }

  async update(
    ctx: RequestContext,
    name: string,
    filter: Record<string, unknown>,
    patch: Record<string, unknown>,
    branch?: string,
  ): Promise<WriteResult> {
    return this.write(ctx, name, branch, async (c, _home, br) => {
      const current = await this.branchRows(c, ctx.tenantId, name, br);
      const updated: Record<string, unknown>[] = [];
      for (const { rowKey, data } of current) {
        if (!datasetRowMatches(data, filter)) continue;
        const next = { ...data, ...patch };
        // Keyed by the original row_key even when the patch touches primary-key
        // columns: a row keeps the identity it was written with.
        await c.query(
          `UPDATE "dataset"."rows" SET "data"=$5
            WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3 AND "row_key"=$4`,
          [ctx.tenantId, name, br, rowKey, JSON.stringify(next)],
        );
        updated.push(next);
      }
      return {
        rows: updated,
        type: 'update' as const,
        result: { rowsWritten: updated.length, rowsUpserted: 0 },
      };
    });
  }

  async delete(
    ctx: RequestContext,
    name: string,
    filter: Record<string, unknown>,
    branch?: string,
  ): Promise<WriteResult> {
    return this.write(ctx, name, branch, async (c, _home, br) => {
      const current = await this.branchRows(c, ctx.tenantId, name, br);
      const removed: Record<string, unknown>[] = [];
      for (const { rowKey, data } of current) {
        if (!datasetRowMatches(data, filter)) continue;
        await c.query(
          `DELETE FROM "dataset"."rows"
            WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3 AND "row_key"=$4`,
          [ctx.tenantId, name, br, rowKey],
        );
        removed.push(data);
      }
      return {
        rows: removed,
        type: 'delete' as const,
        result: { rowsWritten: removed.length, rowsUpserted: 0 },
      };
    });
  }

  async truncate(ctx: RequestContext, name: string, branch?: string): Promise<WriteResult> {
    return this.write(ctx, name, branch, async (c, _home, br) => {
      const r = await c.query(
        `DELETE FROM "dataset"."rows"
          WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3`,
        [ctx.tenantId, name, br],
      );
      return {
        rows: [],
        type: 'truncate' as const,
        result: { rowsWritten: r.rowCount ?? 0, rowsUpserted: 0 },
      };
    });
  }

  // ── Row reads ─────────────────────────────────────────────────────────────

  async read(ctx: RequestContext, name: string, options?: ReadOptions, branch?: string): Promise<ReadResult> {
    const home = await this.requireHome(this.pool, ctx.tenantId, name);
    const br = branch ?? home.branch;

    let rows: Record<string, unknown>[];
    if (options?.asOfTransactionId) {
      rows = await this.replayTo(ctx.tenantId, name, br, home.schema, options.asOfTransactionId)
        ?? (await this.branchRows(this.pool, ctx.tenantId, name, br)).map(r => r.data);
    } else {
      rows = (await this.branchRows(this.pool, ctx.tenantId, name, br)).map(r => r.data);
    }

    if (options?.filter) rows = rows.filter(r => datasetRowMatches(r, options.filter));
    rows = datasetSortRows(rows, options?.orderBy);
    const total = rows.length;
    if (options?.offset) rows = rows.slice(options.offset);
    if (options?.limit !== undefined) rows = rows.slice(0, options.limit);
    rows = datasetProjectColumns(rows, options?.columns);

    return {
      rows,
      total,
      transactionId: options?.asOfTransactionId ?? home.latestTransactionId,
    };
  }

  // ── Transaction log ───────────────────────────────────────────────────────

  async listTransactions(ctx: RequestContext, name: string, branch?: string, limit = 100): Promise<DatasetTransaction[]> {
    const home = await this.requireHome(this.pool, ctx.tenantId, name);
    const br = branch ?? home.branch;
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transactions"
        WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3
        ORDER BY "seq" DESC LIMIT $4`,
      [ctx.tenantId, name, br, limit],
    );
    return r.rows.map(row => mapTransaction(row, ctx.tenantId));
  }

  async getTransaction(ctx: RequestContext, name: string, transactionId: string): Promise<DatasetTransaction | null> {
    await this.requireHome(this.pool, ctx.tenantId, name);
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transactions"
        WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "id"=$3`,
      [ctx.tenantId, name, transactionId],
    );
    return r.rows[0] ? mapTransaction(r.rows[0], ctx.tenantId) : null;
  }

  // ── Branching ─────────────────────────────────────────────────────────────

  async createBranch(ctx: RequestContext, name: string, branchName: string, fromTransactionId?: string): Promise<DatasetBranch> {
    const tx = await PgTransaction.begin(this.pool);
    try {
      const c = tx.client;
      const home = await this.requireHome(c, ctx.tenantId, name);
      const exists = await c.query(
        `SELECT 1 FROM "dataset"."branches" WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "name"=$3`,
        [ctx.tenantId, name, branchName],
      );
      if (exists.rowCount) throw new Error(`Branch already exists: ${branchName}`);

      const parentBranch = home.branch;
      const parentTxId = fromTransactionId ?? home.latestTransactionId;
      const now = new Date().toISOString();
      const id = randomUUID();

      // Snapshot the parent's rows. `ORDER BY seq` so the copies take their new
      // seq values in the same relative order, keeping unordered reads stable.
      await c.query(
        `INSERT INTO "dataset"."rows" ("id","tenant_id","dataset_name","branch","row_key","data")
         SELECT gen_random_uuid()::text, "tenant_id", "dataset_name", $4, "row_key", "data"
           FROM "dataset"."rows"
          WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3
          ORDER BY "seq"`,
        [ctx.tenantId, name, parentBranch, branchName],
      );
      // A metadata row per branch is what makes the branch visible to
      // DatasetMetadataService.list(branch) and listBranches.
      await c.query(
        `INSERT INTO "dataset"."metadata"
           ("id","dataset_id","tenant_id","name","branch","schema","description",
            "latest_transaction_id","row_count","created_by","created_at","updated_at")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         ON CONFLICT ("tenant_id","name","branch") DO NOTHING`,
        [
          randomUUID(), home.datasetId, ctx.tenantId, name, branchName,
          JSON.stringify(home.schema), home.description,
          parentTxId, 0, ctx.actorId ?? 'system', now,
        ],
      );
      await c.query(
        `INSERT INTO "dataset"."branches"
           ("id","tenant_id","dataset_id","dataset_name","name","parent_branch",
            "parent_transaction_id","created_at","created_by")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, ctx.tenantId, home.datasetId, name, branchName, parentBranch, parentTxId, now, ctx.actorId ?? 'system'],
      );
      await this.syncRowCount(c, ctx.tenantId, name, branchName);
      await tx.commit();
      return {
        id,
        tenantId: ctx.tenantId,
        datasetId: home.datasetId,
        name: branchName,
        parentBranch,
        parentTransactionId: parentTxId,
        createdAt: now,
        createdBy: ctx.actorId ?? 'system',
      };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async listBranches(ctx: RequestContext, name: string): Promise<DatasetBranch[]> {
    await this.requireHome(this.pool, ctx.tenantId, name);
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."branches"
        WHERE "tenant_id"=$1 AND "dataset_name"=$2
        ORDER BY "created_at", "name"`,
      [ctx.tenantId, name],
    );
    return r.rows.map(row => ({
      id: String(row['id']),
      tenantId: ctx.tenantId,
      datasetId: String(row['dataset_id'] ?? ''),
      name: String(row['name']),
      parentBranch: String(row['parent_branch']),
      parentTransactionId: String(row['parent_transaction_id'] ?? ''),
      createdAt: toIso(row['created_at']),
      createdBy: String(row['created_by'] ?? ''),
    }));
  }

  async mergeBranch(
    ctx: RequestContext,
    name: string,
    sourceBranch: string,
    targetBranch?: string,
  ): Promise<{ transactionsApplied: number; mergedAt: string }> {
    const target = targetBranch ?? 'main';
    const tx = await PgTransaction.begin(this.pool);
    try {
      const c = tx.client;
      const home = await this.requireHome(c, ctx.tenantId, name);
      for (const [branch, label] of [[sourceBranch, 'Source'], [target, 'Target']] as const) {
        const found = await c.query(
          `SELECT 1 FROM "dataset"."branches" WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "name"=$3`,
          [ctx.tenantId, name, branch],
        );
        if (!found.rowCount) throw new Error(`${label} branch not found: ${branch}`);
      }

      // Last-write-wins: the source's version of a row replaces the target's.
      await c.query(
        `INSERT INTO "dataset"."rows" ("id","tenant_id","dataset_name","branch","row_key","data")
         SELECT gen_random_uuid()::text, "tenant_id", "dataset_name", $4, "row_key", "data"
           FROM "dataset"."rows"
          WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3
          ORDER BY "seq"
         ON CONFLICT ("tenant_id","dataset_name","branch","row_key")
         DO UPDATE SET "data" = EXCLUDED."data"`,
        [ctx.tenantId, name, sourceBranch, target],
      );

      const sourceTxs = await c.query(
        `SELECT * FROM "dataset"."transactions"
          WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3
          ORDER BY "seq"`,
        [ctx.tenantId, name, sourceBranch],
      );
      const now = new Date().toISOString();
      let lastId = home.latestTransactionId;
      for (const row of sourceTxs.rows) {
        const original = mapTransaction(row, ctx.tenantId);
        lastId = original.id;
        await this.appendTransaction(c, ctx, home.datasetId, name, target, {
          id: randomUUID(),
          type: original.type,
          rows: original.rows,
          schemaVersion: original.schemaVersion,
          ...(original.schemaSnapshot ? { schemaSnapshot: original.schemaSnapshot } : {}),
          ...(original.previousSchemaSnapshot ? { previousSchemaSnapshot: original.previousSchemaSnapshot } : {}),
          timestamp: now,
          message: `Merged from ${sourceBranch}: ${original.message ?? original.type}`,
        });
      }

      await c.query(
        `UPDATE "dataset"."metadata" SET "latest_transaction_id"=$3, "updated_at"=$4
          WHERE "tenant_id"=$1 AND "name"=$2 AND "branch" IN ($5, $6)`,
        [ctx.tenantId, name, lastId, now, home.branch, target],
      );
      await this.syncRowCount(c, ctx.tenantId, name, target);
      await tx.commit();
      return { transactionsApplied: sourceTxs.rowCount ?? 0, mergedAt: now };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Run a write inside one database transaction: mutate rows, append the log
   * entry, and move the metadata pointers together or not at all. A partial
   * write would leave the log disagreeing with the rows it describes, and the
   * log is the only thing a snapshot read can be reconstructed from.
   */
  private async write(
    ctx: RequestContext,
    name: string,
    branch: string | undefined,
    apply: (
      c: PoolClient,
      home: MetaRow,
      br: string,
    ) => Promise<{
      rows: Record<string, unknown>[];
      type: DatasetTransaction['type'];
      result: { rowsWritten: number; rowsUpserted: number };
      message?: string;
    }>,
  ): Promise<WriteResult> {
    const tx = await PgTransaction.begin(this.pool);
    try {
      const c = tx.client;
      const home = await this.requireHome(c, ctx.tenantId, name);
      const br = branch ?? home.branch;
      const outcome = await apply(c, home, br);

      const txId = randomUUID();
      const now = new Date().toISOString();
      await this.appendTransaction(c, ctx, home.datasetId, name, br, {
        id: txId,
        type: outcome.type,
        rows: outcome.rows,
        schemaVersion: home.schema.version,
        timestamp: now,
        ...(outcome.message === undefined ? {} : { message: outcome.message }),
      });
      // Both the written branch's row and the home row advance, mirroring the
      // in-memory service's single shared latestTransactionId (header note).
      await c.query(
        `UPDATE "dataset"."metadata" SET "latest_transaction_id"=$3, "updated_at"=$4
          WHERE "tenant_id"=$1 AND "name"=$2 AND "branch" IN ($5, $6)`,
        [ctx.tenantId, name, txId, now, br, home.branch],
      );
      await this.syncRowCount(c, ctx.tenantId, name, br);
      await tx.commit();
      return { transactionId: txId, ...outcome.result };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  private async appendTransaction(
    c: Q,
    ctx: RequestContext,
    datasetId: string,
    name: string,
    branch: string,
    entry: {
      id: string;
      type: DatasetTransaction['type'];
      rows: Record<string, unknown>[];
      schemaVersion: number;
      schemaSnapshot?: DatasetSchema;
      previousSchemaSnapshot?: DatasetSchema;
      timestamp: string;
      message?: string;
    },
  ): Promise<void> {
    await c.query(
      `INSERT INTO "dataset"."transactions"
         ("id","tenant_id","dataset_id","dataset_name","branch","type","rows",
          "schema_version","schema_snapshot","previous_schema_snapshot",
          "timestamp","actor_id","message")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        entry.id, ctx.tenantId, datasetId, name, branch, entry.type,
        JSON.stringify(entry.rows), entry.schemaVersion,
        entry.schemaSnapshot ? JSON.stringify(entry.schemaSnapshot) : null,
        entry.previousSchemaSnapshot ? JSON.stringify(entry.previousSchemaSnapshot) : null,
        entry.timestamp, ctx.actorId ?? 'system', entry.message ?? null,
      ],
    );
  }

  /** Current rows of a branch in insertion order, with their identity keys. */
  private async branchRows(
    c: Q,
    tenantId: string,
    name: string,
    branch: string,
  ): Promise<Array<{ rowKey: string; data: Record<string, unknown> }>> {
    const r = await c.query(
      `SELECT "row_key", "data" FROM "dataset"."rows"
        WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3
        ORDER BY "seq"`,
      [tenantId, name, branch],
    );
    return r.rows.map(row => ({
      rowKey: String(row['row_key']),
      data: parseJson<Record<string, unknown>>(row['data'], {}),
    }));
  }

  /**
   * Rebuild a branch's rows as of a transaction by replaying its log, or null
   * when that transaction is not on this branch (the caller then falls back to
   * the live rows, as the in-memory service does).
   */
  private async replayTo(
    tenantId: string,
    name: string,
    branch: string,
    schema: DatasetSchema,
    asOfTransactionId: string,
  ): Promise<Record<string, unknown>[] | null> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transactions"
        WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3
        ORDER BY "seq"`,
      [tenantId, name, branch],
    );
    const idx = r.rows.findIndex(row => String(row['id']) === asOfTransactionId);
    if (idx < 0) return null;
    const snap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i <= idx; i++) {
      const entry = mapTransaction(r.rows[i]!, tenantId);
      if (entry.type === 'insert' || entry.type === 'update') {
        for (const row of entry.rows) snap.set(datasetRowKey(schema, row) ?? randomUUID(), { ...row });
      } else if (entry.type === 'delete') {
        for (const row of entry.rows) snap.delete(datasetRowKey(schema, row) ?? randomUUID());
      } else if (entry.type === 'truncate') {
        snap.clear();
      }
    }
    return Array.from(snap.values());
  }

  /** Keep DatasetMetadata.rowCount honest instead of leaving it at its default. */
  private async syncRowCount(c: Q, tenantId: string, name: string, branch: string): Promise<void> {
    await c.query(
      `UPDATE "dataset"."metadata" SET "row_count" = (
         SELECT COUNT(*) FROM "dataset"."rows"
          WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3)
        WHERE "tenant_id"=$1 AND "name"=$2 AND "branch"=$3`,
      [tenantId, name, branch],
    );
  }

  /** The metadata row of the dataset's home branch — its identity and schema. */
  private async homeMeta(c: Q, tenantId: string, name: string): Promise<MetaRow | null> {
    const r = await c.query(
      `SELECT m.* FROM "dataset"."metadata" m
         JOIN "dataset"."branches" b
           ON b."tenant_id" = m."tenant_id"
          AND b."dataset_name" = m."name"
          AND b."name" = m."branch"
        WHERE m."tenant_id" = $1 AND m."name" = $2 AND b."name" = b."parent_branch"`,
      [tenantId, name],
    );
    return r.rows[0] ? mapMeta(r.rows[0]) : null;
  }

  private async requireHome(c: Q, tenantId: string, name: string): Promise<MetaRow> {
    const home = await this.homeMeta(c, tenantId, name);
    if (!home) throw new Error(`Dataset not found: ${name}`);
    return home;
  }

  private async deleteDataset(c: Q, tenantId: string, name: string): Promise<void> {
    for (const table of ['rows', 'transactions'] as const) {
      await c.query(
        `DELETE FROM "dataset"."${table}" WHERE "tenant_id"=$1 AND "dataset_name"=$2`,
        [tenantId, name],
      );
    }
    await c.query(
      `DELETE FROM "dataset"."branches" WHERE "tenant_id"=$1 AND "dataset_name"=$2`,
      [tenantId, name],
    );
    await c.query(
      `DELETE FROM "dataset"."metadata" WHERE "tenant_id"=$1 AND "name"=$2`,
      [tenantId, name],
    );
  }
}
