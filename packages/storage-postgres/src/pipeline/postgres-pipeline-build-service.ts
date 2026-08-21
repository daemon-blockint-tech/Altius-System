/**
 * PostgreSQL pipeline build service — build history, schedules, action triggers.
 *
 * Three pieces of state, and two of them fail silently when lost:
 *
 *   - schedules — a cron registration that stops firing looks like nothing
 *     happening rather than like a failure
 *   - action triggers — the action→pipeline map; lose it and actions quietly
 *     stop kicking off pipelines, with nothing erroring
 *   - build history — the record of what ran and what it did
 *
 * All three lived in a `Map`, so #14's gate withheld the service under Postgres
 * and its routes answered 404. This makes them work.
 *
 * ── A stub, matched rather than fixed ──
 *
 * `startBuild` does not run a pipeline. It writes a `running` build, then
 * immediately rewrites it as `succeeded` with a hardcoded `durationMs` of 100
 * and a single synthetic `init` step. `retryBuild` does the same. That is the
 * in-memory service's behaviour and it is reproduced exactly here, because a
 * contract changes in both providers or neither.
 *
 * Being blunt about what that means: making this durable makes the *record* of
 * builds durable, not the execution. Every build still reports success without
 * work having happened. `BatchTransformService` is the one that actually reads
 * inputs and writes an output dataset. Anyone reading a `succeeded` row here
 * should know it attests to a row being written, nothing more — which is worth
 * saying out loud, because a persisted lie is more convincing than a
 * transient one.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  PipelineBuildService,
  PipelineBuild,
  PipelineSchedule,
  BuildState,
  BuildTrigger,
  CreateScheduleInput,
  ExpectationResult,
  RequestContext,
} from '@altius/spi';

function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  return (typeof v === 'string' ? JSON.parse(v) : v) as T;
}

function mapBuild(r: Record<string, unknown>): PipelineBuild {
  const expectationResults = r['expectation_results'];
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    pipelineName: String(r['pipeline_name']),
    state: r['state'] as BuildState,
    trigger: r['trigger'] as BuildTrigger,
    startedAt: toIso(r['started_at'])!,
    // Omitted rather than set to undefined, so a build round-trips to the same
    // shape the in-memory service returns.
    ...(toIso(r['ended_at']) ? { endedAt: toIso(r['ended_at'])! } : {}),
    ...(r['duration_ms'] === null || r['duration_ms'] === undefined ? {} : { durationMs: Number(r['duration_ms']) }),
    triggeredBy: String(r['triggered_by'] ?? ''),
    retryCount: Number(r['retry_count'] ?? 0),
    maxRetries: Number(r['max_retries'] ?? 3),
    ...(r['error_message'] ? { errorMessage: String(r['error_message']) } : {}),
    steps: parseJson<PipelineBuild['steps']>(r['steps'], []),
    expectationGated: r['expectation_gated'] === true,
    ...(expectationResults ? { expectationResults: parseJson<ExpectationResult[]>(expectationResults, []) } : {}),
  };
}

function mapSchedule(r: Record<string, unknown>): PipelineSchedule {
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    pipelineName: String(r['pipeline_name']),
    cronExpression: String(r['cron_expression']),
    enabled: r['enabled'] === true,
    maxRetries: Number(r['max_retries'] ?? 3),
    abortOnFailure: r['abort_on_failure'] === true,
    createdAt: toIso(r['created_at'])!,
    ...(toIso(r['last_run_at']) ? { lastRunAt: toIso(r['last_run_at'])! } : {}),
    ...(toIso(r['next_run_at']) ? { nextRunAt: toIso(r['next_run_at'])! } : {}),
    createdBy: String(r['created_by'] ?? ''),
  };
}

export class PostgresPipelineBuildService implements PipelineBuildService {
  constructor(private readonly pool: Pool) {}

  // ── Builds ────────────────────────────────────────────────────────────────

  async startBuild(ctx: RequestContext, pipelineName: string, trigger: BuildTrigger): Promise<PipelineBuild> {
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    // Written as `running` first so a build that never completes is at least
    // visible as one that never completed — even though, as the header says,
    // nothing here can actually fail to complete yet.
    await this.pool.query(
      `INSERT INTO "pipeline"."builds"
         ("id","tenant_id","pipeline_name","state","trigger","started_at",
          "triggered_by","retry_count","max_retries","steps","expectation_gated")
       VALUES ($1,$2,$3,'running',$4,$5,$6,0,3,$7,FALSE)`,
      [id, ctx.tenantId, pipelineName, trigger, startedAt, ctx.actorId ?? 'system',
       JSON.stringify([{ name: 'init', state: 'running' }])],
    );
    const r = await this.pool.query(
      `UPDATE "pipeline"."builds"
          SET "state"='succeeded', "ended_at"=$3, "duration_ms"=100, "steps"=$4
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [ctx.tenantId, id, new Date().toISOString(),
       JSON.stringify([{ name: 'init', state: 'succeeded', durationMs: 50 }])],
    );
    return mapBuild(r.rows[0]!);
  }

  async getBuild(ctx: RequestContext, buildId: string): Promise<PipelineBuild | null> {
    const r = await this.pool.query(
      `SELECT * FROM "pipeline"."builds" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, buildId],
    );
    return r.rows[0] ? mapBuild(r.rows[0]) : null;
  }

  async listBuilds(ctx: RequestContext, pipelineName?: string, limit = 100): Promise<PipelineBuild[]> {
    const params: unknown[] = [ctx.tenantId];
    let sql = `SELECT * FROM "pipeline"."builds" WHERE "tenant_id"=$1`;
    if (pipelineName) { params.push(pipelineName); sql += ` AND "pipeline_name"=$${params.length}`; }
    // `seq` rather than `started_at`: two builds can start in the same
    // millisecond, and a timestamp alone is not a total order.
    params.push(limit);
    sql += ` ORDER BY "seq" DESC LIMIT $${params.length}`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapBuild);
  }

  async abortBuild(ctx: RequestContext, buildId: string): Promise<void> {
    // Deliberately silent on an unknown id, matching the in-memory service:
    // aborting something that is not there is not an error.
    await this.pool.query(
      `UPDATE "pipeline"."builds" SET "state"='aborted', "ended_at"=$3
        WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, buildId, new Date().toISOString()],
    );
  }

  async retryBuild(ctx: RequestContext, buildId: string): Promise<PipelineBuild> {
    const build = await this.getBuild(ctx, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);
    if (build.retryCount >= build.maxRetries) throw new Error('Max retries exceeded');
    // A retry re-uses the build row rather than creating a new one, so
    // `retryCount` accumulates on the same record.
    const r = await this.pool.query(
      `UPDATE "pipeline"."builds"
          SET "retry_count"="retry_count"+1, "state"='succeeded',
              "started_at"=$3, "ended_at"=$4, "duration_ms"=100, "error_message"=NULL
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [ctx.tenantId, buildId, new Date().toISOString(), new Date().toISOString()],
    );
    return mapBuild(r.rows[0]!);
  }

  // ── Schedules ─────────────────────────────────────────────────────────────

  async createSchedule(ctx: RequestContext, input: CreateScheduleInput): Promise<PipelineSchedule> {
    const r = await this.pool.query(
      `INSERT INTO "pipeline"."schedules"
         ("id","tenant_id","pipeline_name","cron_expression","enabled",
          "max_retries","abort_on_failure","created_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        randomUUID(), ctx.tenantId, input.pipelineName, input.cronExpression,
        input.enabled ?? true, input.maxRetries ?? 3, input.abortOnFailure ?? false,
        new Date().toISOString(), ctx.actorId ?? 'system',
      ],
    );
    return mapSchedule(r.rows[0]!);
  }

  async listSchedules(ctx: RequestContext): Promise<PipelineSchedule[]> {
    const r = await this.pool.query(
      `SELECT * FROM "pipeline"."schedules" WHERE "tenant_id"=$1 ORDER BY "seq" DESC`,
      [ctx.tenantId],
    );
    return r.rows.map(mapSchedule);
  }

  async updateSchedule(ctx: RequestContext, scheduleId: string, updates: Partial<CreateScheduleInput>): Promise<PipelineSchedule> {
    const current = await this.requireSchedule(ctx, scheduleId);
    const r = await this.pool.query(
      `UPDATE "pipeline"."schedules"
          SET "pipeline_name"=$3, "cron_expression"=$4, "enabled"=$5,
              "max_retries"=$6, "abort_on_failure"=$7
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [
        ctx.tenantId, scheduleId,
        updates.pipelineName ?? current.pipelineName,
        updates.cronExpression ?? current.cronExpression,
        updates.enabled ?? current.enabled,
        updates.maxRetries ?? current.maxRetries,
        updates.abortOnFailure ?? current.abortOnFailure,
      ],
    );
    return mapSchedule(r.rows[0]!);
  }

  async deleteSchedule(ctx: RequestContext, scheduleId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "pipeline"."schedules" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, scheduleId],
    );
  }

  // ── Action triggers ───────────────────────────────────────────────────────

  async registerActionTrigger(ctx: RequestContext, actionName: string, pipelineName: string): Promise<void> {
    // The in-memory service keeps these in a Set, so registering the same pair
    // twice is a no-op rather than a duplicate or an error.
    await this.pool.query(
      `INSERT INTO "pipeline"."action_triggers" ("tenant_id","action_name","pipeline_name")
       VALUES ($1,$2,$3)
       ON CONFLICT ("tenant_id","action_name","pipeline_name") DO NOTHING`,
      [ctx.tenantId, actionName, pipelineName],
    );
  }

  async getActionTriggers(ctx: RequestContext, actionName: string): Promise<string[]> {
    const r = await this.pool.query(
      `SELECT "pipeline_name" FROM "pipeline"."action_triggers"
        WHERE "tenant_id"=$1 AND "action_name"=$2
        ORDER BY "created_at", "pipeline_name"`,
      [ctx.tenantId, actionName],
    );
    return r.rows.map((row: Record<string, unknown>) => String(row['pipeline_name']));
  }

  async triggerForAction(ctx: RequestContext, actionName: string): Promise<PipelineBuild[]> {
    const pipelines = await this.getActionTriggers(ctx, actionName);
    const builds: PipelineBuild[] = [];
    for (const pipelineName of pipelines) {
      builds.push(await this.startBuild(ctx, pipelineName, 'action'));
    }
    return builds;
  }

  private async requireSchedule(ctx: RequestContext, scheduleId: string): Promise<PipelineSchedule> {
    const r = await this.pool.query(
      `SELECT * FROM "pipeline"."schedules" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, scheduleId],
    );
    if (!r.rows[0]) throw new Error(`Schedule not found: ${scheduleId}`);
    return mapSchedule(r.rows[0]);
  }
}
