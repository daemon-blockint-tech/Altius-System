/**
 * PostgreSQL variable transform pipelines — named, ordered declarative steps.
 *
 * A pipeline is a list of `TransformStep`s (upper, round, formatDate,
 * pickFields, coalesce…) reduced over an input value. The definitions lived in
 * a `Map`, so #14's gate withheld the service under Postgres and its routes
 * answered 404.
 *
 * Losing a pipeline here is **loud**, unlike most of the services converted
 * before it: `execute` throws `Transform pipeline not found`. The reason to
 * persist it anyway is that a pipeline is user-authored configuration — someone
 * sat down and composed those steps — and a restart eating it is not something
 * a caller can recover from by retrying.
 *
 * Step execution is NOT reimplemented here. It is a pure function of the step
 * and the value, so it lives in @altius/spi's variable-transforms and both
 * providers call it. The reason matters more than usual: **the output is
 * data**. A pipeline is run to produce a value something downstream then uses,
 * so two providers disagreeing about what `round` or `dateDiff` means would
 * produce different values from the same pipeline and the same input, with
 * neither erring.
 *
 * ── Keyed by name, matching the in-memory map ──
 *
 * Every read is by name, and `create` with an existing name REPLACES rather
 * than erroring — that is the in-memory behaviour, so the table's primary key
 * is `(tenant_id, lookup_key)` and `create` upserts. A surrogate key would let
 * two pipelines share a name here while the other provider allows only one.
 *
 * ── One sharp edge reproduced rather than smoothed ──
 *
 * `update` can change a pipeline's `name` field, and the in-memory service
 * stores the result back under the OLD map key. The pipeline stays reachable
 * only under its old name while reporting the new one. Renaming through
 * `update` therefore does not rename anything; it desynchronises the record
 * from its key.
 *
 * That is why `lookup_key` and `name` are separate columns. A single `name`
 * column would make the UPDATE move the row and the two providers would
 * disagree — the first version of this store did exactly that, and the
 * conformance case caught it. Reproducing the quirk faithfully is the choice
 * here; it is pinned by that case and raised as a contract question, because
 * fixing it would change which name an existing caller has to use.
 *
 * No array columns: `steps` is JSONB, where JSON.stringify is correct.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { applyTransformStep } from '@altius/spi';
import type {
  VariableTransformService,
  TransformPipeline,
  TransformStep,
  CreateTransformPipelineInput,
  RequestContext,
} from '@altius/spi';

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function mapPipeline(r: Record<string, unknown>): TransformPipeline {
  const steps = r['steps'];
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    name: String(r['name']),
    description: String(r['description'] ?? ''),
    steps: (typeof steps === 'string' ? JSON.parse(steps) : steps ?? []) as TransformStep[],
    createdAt: toIso(r['created_at']),
    createdBy: String(r['created_by'] ?? ''),
  };
}

export class PostgresVariableTransformService implements VariableTransformService {
  constructor(private readonly pool: Pool) {}

  async create(ctx: RequestContext, input: CreateTransformPipelineInput): Promise<TransformPipeline> {
    // Upsert, not insert: the in-memory service overwrites on a repeated name
    // rather than refusing, so refusing here would reject a write the other
    // provider accepts. A replaced pipeline gets a fresh id and timestamp,
    // which is also what re-creating it in a Map does.
    const r = await this.pool.query(
      `INSERT INTO "dataset"."transform_pipelines"
         ("tenant_id","lookup_key","name","id","description","steps","created_at","created_by")
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7)
       ON CONFLICT ("tenant_id","lookup_key") DO UPDATE SET
         "name"=EXCLUDED."name",
         "id"=EXCLUDED."id",
         "description"=EXCLUDED."description",
         "steps"=EXCLUDED."steps",
         "created_at"=EXCLUDED."created_at",
         "created_by"=EXCLUDED."created_by"
       RETURNING *`,
      [
        ctx.tenantId, input.name, randomUUID(), input.description ?? '',
        JSON.stringify(input.steps), new Date().toISOString(), ctx.actorId ?? 'system',
      ],
    );
    return mapPipeline(r.rows[0]!);
  }

  async get(ctx: RequestContext, name: string): Promise<TransformPipeline | null> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transform_pipelines" WHERE "tenant_id"=$1 AND "lookup_key"=$2`,
      [ctx.tenantId, name],
    );
    return r.rows[0] ? mapPipeline(r.rows[0]) : null;
  }

  async list(ctx: RequestContext): Promise<TransformPipeline[]> {
    // Insertion order, which is what iterating the in-memory Map gives.
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transform_pipelines" WHERE "tenant_id"=$1 ORDER BY "seq"`,
      [ctx.tenantId],
    );
    return r.rows.map(mapPipeline);
  }

  async update(
    ctx: RequestContext,
    name: string,
    updates: Partial<CreateTransformPipelineInput>,
  ): Promise<TransformPipeline> {
    const current = await this.require(ctx, name);
    // `lookup_key` is deliberately left alone while the `name` column takes the
    // update. See the header: renaming through update desynchronises the record
    // from its key in both providers, and matching that is the point of having
    // two columns.
    const r = await this.pool.query(
      `UPDATE "dataset"."transform_pipelines"
          SET "name"=$3, "description"=$4, "steps"=$5
        WHERE "tenant_id"=$1 AND "lookup_key"=$2
        RETURNING *`,
      [
        ctx.tenantId, name,
        updates.name ?? current.name,
        updates.description ?? current.description,
        JSON.stringify(updates.steps ?? current.steps),
      ],
    );
    return mapPipeline(r.rows[0]!);
  }

  async delete(ctx: RequestContext, name: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "dataset"."transform_pipelines" WHERE "tenant_id"=$1 AND "lookup_key"=$2`,
      [ctx.tenantId, name],
    );
  }

  async execute(ctx: RequestContext, name: string, input: unknown): Promise<unknown> {
    const pipeline = await this.require(ctx, name);
    return this.executeInline(ctx, pipeline.steps, input);
  }

  async executeBatch(ctx: RequestContext, name: string, inputs: unknown[]): Promise<unknown[]> {
    // Read once, then run each input through the same steps — a batch must not
    // be able to see a pipeline change halfway through.
    const pipeline = await this.require(ctx, name);
    return inputs.map(i => pipeline.steps.reduce((acc, step) => applyTransformStep(step, acc), i));
  }

  async executeInline(_ctx: RequestContext, steps: TransformStep[], input: unknown): Promise<unknown> {
    // Nothing is stored: inline execution is the escape hatch for a pipeline
    // you do not want to name.
    return steps.reduce((acc, step) => applyTransformStep(step, acc), input);
  }

  private async require(ctx: RequestContext, name: string): Promise<TransformPipeline> {
    const found = await this.get(ctx, name);
    if (!found) throw new Error(`Transform pipeline not found: ${name}`);
    return found;
  }
}
