/**
 * PostgreSQL interactive SQL query service — job lifecycle over datasets.
 *
 * This is the one a user reaches for when prod-testing the headless API: send
 * SQL, get rows back. It does real work — the statement is parsed, the WHERE,
 * ORDER BY, LIMIT and column list are pushed down to the dataset service, and
 * the join is evaluated over what comes back. Datasets became durable in #24,
 * so on this provider a query reads rows that survived a restart.
 *
 * Execution is NOT reimplemented here. Running a SELECT is a pure function of
 * the SQL text and the rows the dataset service returns, so both the parser and
 * the engine live in @altius/spi and both providers call them. Two providers
 * that disagreed about what a WHERE clause meant would return different rows
 * for the same query, and neither would look broken — worse than one of them
 * simply being wrong.
 *
 * What this provider supplies is the job record: which query ran, who ran it,
 * whether it succeeded, and what it returned.
 *
 * ── Two limits worth stating plainly ──
 *
 * `submit` is "async" in name only. It writes the job `queued`, then `running`,
 * then terminal, all before returning — a caller polling `get()` will never
 * catch one in flight. That is the in-memory behaviour and it is matched here,
 * per the rule that a contract changes in both providers or neither. Nothing is
 * ever left `queued`, so a queue that stopped draining is not a state this can
 * represent.
 *
 * The result rows are stored on the job, in one JSONB value. That is what makes
 * `results()` answerable after the process that ran the query is gone — and it
 * means a SELECT with no LIMIT writes its whole result set into a single row.
 * The in-memory provider has the same shape, so it is matched rather than
 * capped; capping is a contract change. For a query service it is a real
 * ceiling, not a theoretical one.
 *
 * No array columns here: `rows` and `result_columns` are JSONB, where
 * JSON.stringify is correct.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { executeSqlQuery } from '@altius/spi';
import type {
  DatasetService,
  SqlQueryService,
  SqlQueryJob,
  SubmitSqlInput,
  RequestContext,
} from '@altius/spi';
import { PostgresDatasetService } from './postgres-dataset-service.js';

function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  return (typeof v === 'string' ? JSON.parse(v) : v) as T;
}

function mapJob(r: Record<string, unknown>): SqlQueryJob {
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    sql: String(r['sql']),
    state: r['state'] as SqlQueryJob['state'],
    submittedAt: toIso(r['submitted_at'])!,
    submittedBy: String(r['submitted_by'] ?? ''),
    // Omitted rather than set to undefined, so a job round-trips to the same
    // shape the in-memory service returns.
    ...(toIso(r['started_at']) ? { startedAt: toIso(r['started_at'])! } : {}),
    ...(toIso(r['completed_at']) ? { completedAt: toIso(r['completed_at'])! } : {}),
    ...(r['duration_ms'] === null || r['duration_ms'] === undefined ? {} : { durationMs: Number(r['duration_ms']) }),
    ...(r['rows'] === null || r['rows'] === undefined
      ? {}
      : { rows: parseJson<Record<string, unknown>[]>(r['rows'], []) }),
    ...(r['result_columns'] === null || r['result_columns'] === undefined
      ? {}
      : { resultColumns: parseJson<string[]>(r['result_columns'], []) }),
    ...(r['row_count'] === null || r['row_count'] === undefined ? {} : { rowCount: Number(r['row_count']) }),
    ...(r['error_message'] ? { errorMessage: String(r['error_message']) } : {}),
  };
}

export class PostgresSqlQueryService implements SqlQueryService {
  private readonly datasets: DatasetService;

  /**
   * The dataset service is built from the same pool rather than injected, so
   * the query reads the very tables `PostgresDatasetService` writes. Sharing
   * here is by table, not by instance — a second replica running this class
   * against the same database sees the same rows.
   */
  constructor(private readonly pool: Pool, datasets?: DatasetService) {
    this.datasets = datasets ?? new PostgresDatasetService(pool);
  }

  async submit(ctx: RequestContext, input: SubmitSqlInput): Promise<SqlQueryJob> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO "dataset"."sql_jobs" ("id","tenant_id","sql","state","submitted_at","submitted_by")
       VALUES ($1,$2,$3,'queued',$4,$5)`,
      [id, ctx.tenantId, input.sql, new Date().toISOString(), ctx.actorId ?? 'system'],
    );
    await this.pool.query(
      `UPDATE "dataset"."sql_jobs" SET "state"='running', "started_at"=$3 WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id, new Date().toISOString()],
    );

    try {
      const { rows, resultColumns } = await executeSqlQuery(ctx, this.datasets, input);
      const r = await this.pool.query(
        `UPDATE "dataset"."sql_jobs"
            SET "state"='succeeded', "completed_at"=$3, "duration_ms"=100,
                "rows"=$4, "result_columns"=$5, "row_count"=$6
          WHERE "tenant_id"=$1 AND "id"=$2
          RETURNING *`,
        [ctx.tenantId, id, new Date().toISOString(),
         JSON.stringify(rows), JSON.stringify(resultColumns), rows.length],
      );
      return mapJob(r.rows[0]!);
    } catch (err) {
      // A failed query is a recorded failure, not a thrown one: the caller gets
      // a job back either way and reads `state` to tell them apart. Matching
      // the in-memory service, which does the same.
      const r = await this.pool.query(
        `UPDATE "dataset"."sql_jobs"
            SET "state"='failed', "completed_at"=$3, "error_message"=$4
          WHERE "tenant_id"=$1 AND "id"=$2
          RETURNING *`,
        [ctx.tenantId, id, new Date().toISOString(),
         err instanceof Error ? err.message : 'SQL execution failed'],
      );
      return mapJob(r.rows[0]!);
    }
  }

  async get(ctx: RequestContext, jobId: string): Promise<SqlQueryJob | null> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."sql_jobs" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, jobId],
    );
    return r.rows[0] ? mapJob(r.rows[0]) : null;
  }

  async list(ctx: RequestContext, limit = 100): Promise<SqlQueryJob[]> {
    // `seq` rather than `submitted_at`: two jobs can be submitted in the same
    // millisecond, and a timestamp alone is not a total order.
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."sql_jobs" WHERE "tenant_id"=$1 ORDER BY "seq" DESC LIMIT $2`,
      [ctx.tenantId, limit],
    );
    return r.rows.map(mapJob);
  }

  async cancel(ctx: RequestContext, jobId: string): Promise<void> {
    // Only a job that has not finished can be cancelled, and the guard is in
    // the WHERE clause rather than a read-then-write so two concurrent cancels
    // cannot both move a job out of a terminal state. Silent on an unknown id,
    // matching the in-memory service.
    await this.pool.query(
      `UPDATE "dataset"."sql_jobs"
          SET "state"='cancelled', "completed_at"=$3
        WHERE "tenant_id"=$1 AND "id"=$2 AND "state" IN ('queued','running')`,
      [ctx.tenantId, jobId, new Date().toISOString()],
    );
  }

  async results(ctx: RequestContext, jobId: string, limit?: number): Promise<Record<string, unknown>[]> {
    const job = await this.get(ctx, jobId);
    // An unfinished, failed or cancelled job returns no rows rather than
    // erroring — the state is on the job for a caller that wants to know why.
    if (!job || job.state !== 'succeeded' || !job.rows) return [];
    return limit !== undefined ? job.rows.slice(0, limit) : job.rows;
  }
}
