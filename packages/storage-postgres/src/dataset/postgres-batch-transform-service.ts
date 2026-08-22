/**
 * PostgreSQL batch transform service — transforms, build history, schedules.
 *
 * A transform reads one or more datasets, applies logic, and writes an output
 * dataset. Three things were living in a `Map`, each with a different cost:
 *
 *   - schedules — a cron registration that silently stops firing looks like
 *     nothing happening rather than like a failure
 *   - build history — the record of what ran, when, and how many rows moved
 *   - the transforms themselves
 *
 * #14's gate withheld the service under Postgres rather than let it accept
 * registrations it would drop, so the routes answered 404. This makes them
 * work. Datasets are already durable (#24), so a build now reads and writes
 * durable data on both sides.
 *
 * ── The executor registry is deliberately still in memory ──
 *
 * `registerExecutor` takes a `TransformExecutor` — a live object with an
 * `execute` method. A function cannot be written to a table, so this registry
 * is per-process in BOTH providers, and that is a property of the SPI shape
 * rather than a shortcut taken here.
 *
 * It matters on more than one replica: an executor registered against replica
 * A is not visible to a build started on replica B, which silently falls back
 * to the built-in pass-through instead of failing. Making that honest needs a
 * contract change — executors named and resolved from a registry, or transform
 * `source` actually interpreted — not a storage change, so it is recorded
 * rather than papered over.
 *
 * ── Two in-memory quirks matched rather than fixed ──
 *
 * Per the standing rule, a contract changes in both providers or neither, so
 * these are filed rather than silently improved here:
 *
 *   - `durationMs` is hardcoded to 100 on a successful build rather than
 *     measured.
 *   - a build that throws part-way leaves its row in `running` forever; there
 *     is no failure path. Harmless in a Map that dies with the process,
 *     considerably less so in a table.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  BatchTransformService,
  BatchTransform,
  TransformBuild,
  CreateTransformInput,
  TransformExecutor,
  DatasetService,
  RequestContext,
} from '@altius/spi';

function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function mapTransform(r: Record<string, unknown>): BatchTransform {
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    name: String(r['name']),
    description: String(r['description'] ?? ''),
    inputs: (r['inputs'] ?? []) as string[],
    output: String(r['output']),
    kind: r['kind'] as BatchTransform['kind'],
    source: String(r['source'] ?? ''),
    incremental: r['incremental'] === true,
    createdAt: toIso(r['created_at'])!,
    updatedAt: toIso(r['updated_at'])!,
    createdBy: String(r['created_by'] ?? ''),
    ...(r['last_build_state'] ? { lastBuildState: r['last_build_state'] as BatchTransform['lastBuildState'] } : {}),
    ...(r['last_build_id'] ? { lastBuildId: String(r['last_build_id']) } : {}),
  };
}

function mapBuild(r: Record<string, unknown>): TransformBuild {
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    transformId: String(r['transform_id'] ?? ''),
    transformName: String(r['transform_name']),
    state: r['state'] as TransformBuild['state'],
    trigger: r['trigger'] as TransformBuild['trigger'],
    startedAt: toIso(r['started_at'])!,
    ...(toIso(r['ended_at']) ? { endedAt: toIso(r['ended_at'])! } : {}),
    ...(r['duration_ms'] === null || r['duration_ms'] === undefined ? {} : { durationMs: Number(r['duration_ms']) }),
    triggeredBy: String(r['triggered_by'] ?? ''),
    rowsRead: Number(r['rows_read'] ?? 0),
    rowsWritten: Number(r['rows_written'] ?? 0),
    ...(r['error_message'] ? { errorMessage: String(r['error_message']) } : {}),
    incremental: r['incremental'] === true,
    ...(r['checkpoint'] ? { checkpoint: String(r['checkpoint']) } : {}),
  };
}

export class PostgresBatchTransformService implements BatchTransformService {
  /**
   * Per-process executor registry. See the header: a TransformExecutor is a
   * live object, so this cannot be a table, in this provider or any other.
   */
  private readonly executors = new Map<string, Map<string, TransformExecutor>>();

  constructor(
    private readonly pool: Pool,
    private readonly datasets: DatasetService,
  ) {}

  async create(ctx: RequestContext, input: CreateTransformInput): Promise<BatchTransform> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO "dataset"."transforms"
         ("id","tenant_id","name","description","inputs","output","kind","source",
          "incremental","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)
       RETURNING *`,
      [
        id, ctx.tenantId, input.name, input.description ?? '',
        // TEXT[] — bound as an array, never JSON.stringify'd. See the header.
        input.inputs ?? [],
        input.output, input.kind, input.source,
        input.incremental ?? false, now, ctx.actorId ?? 'system',
      ],
    );
    return mapTransform(r.rows[0]!);
  }

  async get(ctx: RequestContext, name: string): Promise<BatchTransform | null> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transforms" WHERE "tenant_id"=$1 AND "name"=$2`,
      [ctx.tenantId, name],
    );
    return r.rows[0] ? mapTransform(r.rows[0]) : null;
  }

  async list(ctx: RequestContext): Promise<BatchTransform[]> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transforms" WHERE "tenant_id"=$1 ORDER BY "name"`,
      [ctx.tenantId],
    );
    return r.rows.map(mapTransform);
  }

  async update(ctx: RequestContext, name: string, updates: Partial<CreateTransformInput>): Promise<BatchTransform> {
    const current = await this.require(ctx, name);
    const r = await this.pool.query(
      `UPDATE "dataset"."transforms"
          SET "description"=$3, "inputs"=$4, "output"=$5, "kind"=$6, "source"=$7,
              "incremental"=$8, "updated_at"=$9
        WHERE "tenant_id"=$1 AND "name"=$2
        RETURNING *`,
      [
        ctx.tenantId, name,
        updates.description ?? current.description,
        updates.inputs ?? current.inputs,
        updates.output ?? current.output,
        updates.kind ?? current.kind,
        updates.source ?? current.source,
        updates.incremental ?? current.incremental,
        new Date().toISOString(),
      ],
    );
    return mapTransform(r.rows[0]!);
  }

  async delete(ctx: RequestContext, name: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "dataset"."transforms" WHERE "tenant_id"=$1 AND "name"=$2`,
      [ctx.tenantId, name],
    );
    this.executors.get(ctx.tenantId)?.delete(name);
  }

  async registerExecutor(ctx: RequestContext, name: string, executor: TransformExecutor): Promise<void> {
    let m = this.executors.get(ctx.tenantId);
    if (!m) { m = new Map(); this.executors.set(ctx.tenantId, m); }
    m.set(name, executor);
  }

  async startBuild(ctx: RequestContext, name: string, trigger: TransformBuild['trigger']): Promise<TransformBuild> {
    const t = await this.require(ctx, name);
    const id = randomUUID();
    const now = new Date().toISOString();

    // The build row is written as `running` before the work starts, so a build
    // that never finishes is at least visible as one that never finished.
    await this.pool.query(
      `INSERT INTO "dataset"."transform_builds"
         ("id","tenant_id","transform_id","transform_name","state","trigger",
          "started_at","triggered_by","rows_read","rows_written","incremental")
       VALUES ($1,$2,$3,$4,'running',$5,$6,$7,0,0,$8)`,
      [id, ctx.tenantId, t.id, name, trigger, now, ctx.actorId ?? 'system', t.incremental],
    );

    const inputs: Record<string, unknown>[][] = [];
    for (const inputName of t.inputs) {
      const result = await this.datasets.read(ctx, inputName);
      inputs.push(result.rows);
    }

    let outputRows: Record<string, unknown>[] = [];
    const executor = this.executors.get(ctx.tenantId)?.get(name);
    if (executor) {
      outputRows = executor.execute(inputs);
    } else if (t.kind === 'join') {
      // No executor registered: join concatenates every input, anything else
      // passes the first input through.
      outputRows = inputs.length > 0 ? inputs[0]! : [];
      for (let i = 1; i < inputs.length; i++) outputRows = [...outputRows, ...inputs[i]!];
    } else {
      outputRows = inputs.length > 0 ? inputs[0]! : [];
    }

    const writeResult = await this.datasets.insert(ctx, t.output, { rows: outputRows, upsert: true });
    const endedAt = new Date().toISOString();
    const rowsRead = inputs.reduce((s, r) => s + r.length, 0);

    const done = await this.pool.query(
      `UPDATE "dataset"."transform_builds"
          SET "state"='succeeded', "ended_at"=$3, "duration_ms"=$4,
              "rows_read"=$5, "rows_written"=$6
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      // durationMs is 100 rather than measured, matching the in-memory
      // service. Flagged in the header as a contract question, not fixed here.
      [ctx.tenantId, id, endedAt, 100, rowsRead, writeResult.rowsWritten],
    );
    await this.pool.query(
      `UPDATE "dataset"."transforms" SET "last_build_state"='succeeded', "last_build_id"=$3
        WHERE "tenant_id"=$1 AND "name"=$2`,
      [ctx.tenantId, name, id],
    );
    return mapBuild(done.rows[0]!);
  }

  async getBuild(ctx: RequestContext, buildId: string): Promise<TransformBuild | null> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transform_builds" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, buildId],
    );
    return r.rows[0] ? mapBuild(r.rows[0]) : null;
  }

  async listBuilds(ctx: RequestContext, name: string, limit = 100): Promise<TransformBuild[]> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transform_builds"
        WHERE "tenant_id"=$1 AND "transform_name"=$2
        ORDER BY "seq" DESC LIMIT $3`,
      [ctx.tenantId, name, limit],
    );
    return r.rows.map(mapBuild);
  }

  async abortBuild(ctx: RequestContext, buildId: string): Promise<void> {
    await this.pool.query(
      `UPDATE "dataset"."transform_builds"
          SET "state"='aborted', "ended_at"=$3
        WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, buildId, new Date().toISOString()],
    );
  }

  async schedule(ctx: RequestContext, name: string, cronExpression: string): Promise<{ scheduleId: string }> {
    const scheduleId = randomUUID();
    await this.pool.query(
      `INSERT INTO "dataset"."transform_schedules"
         ("id","tenant_id","transform_name","cron_expression","enabled")
       VALUES ($1,$2,$3,$4,TRUE)`,
      [scheduleId, ctx.tenantId, name, cronExpression],
    );
    return { scheduleId };
  }

  async listSchedules(ctx: RequestContext): Promise<Array<{ id: string; transformName: string; cronExpression: string; enabled: boolean }>> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transform_schedules" WHERE "tenant_id"=$1 ORDER BY "created_at", "id"`,
      [ctx.tenantId],
    );
    return r.rows.map((row: Record<string, unknown>) => ({
      id: String(row['id']),
      transformName: String(row['transform_name']),
      cronExpression: String(row['cron_expression']),
      enabled: row['enabled'] === true,
    }));
  }

  async deleteSchedule(ctx: RequestContext, scheduleId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "dataset"."transform_schedules" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, scheduleId],
    );
  }

  private async require(ctx: RequestContext, name: string): Promise<BatchTransform> {
    const t = await this.get(ctx, name);
    if (!t) throw new Error(`Transform not found: ${name}`);
    return t;
  }
}
