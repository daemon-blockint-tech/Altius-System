/**
 * PostgreSQL data expectations service — quality checks that gate builds.
 *
 * An expectation is a rule about data — not null, unique, in range, matching a
 * regex — and a failing one marked `blocking` stops a build. So the set of
 * expectations *is* the quality gate.
 *
 * Losing it does not error. `gateBuild` simply finds nothing to check and
 * passes everything, so bad data flows through a gate that looks closed. That
 * is the same failure shape as a business rule losing its `active` state, and
 * the reason this is worth persisting: the definitions lived in a `Map`, so
 * #14's gate withheld the service under Postgres and its routes answered 404.
 *
 * Evaluation is NOT reimplemented here. Running a check is a pure function of
 * the expectation and the rows handed to it, so it lives in @altius/spi's
 * data-expectation-engine and both providers call it. Two providers that
 * disagreed about whether a check passed would disagree about whether bad data
 * reached production — worse than losing the expectation, because a lost one is
 * visibly gone.
 *
 * No array columns here: `params` is JSONB, where JSON.stringify is correct.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { evaluateDataExpectation } from '@altius/spi';
import type {
  DataExpectationsService,
  DataExpectation,
  ExpectationResult,
  ExpectationType,
  CreateExpectationInput,
  RequestContext,
} from '@altius/spi';

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function mapExpectation(r: Record<string, unknown>): DataExpectation {
  const params = r['params'];
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    name: String(r['name']),
    description: String(r['description'] ?? ''),
    targetType: String(r['target_type']),
    // Omitted rather than set to undefined, so an expectation round-trips to
    // the same shape the in-memory service returns.
    ...(r['field'] ? { field: String(r['field']) } : {}),
    type: r['type'] as ExpectationType,
    params: (typeof params === 'string' ? JSON.parse(params) : params ?? {}) as Record<string, unknown>,
    blocking: r['blocking'] === true,
    enabled: r['enabled'] === true,
    createdAt: toIso(r['created_at']),
  };
}

export class PostgresDataExpectationsService implements DataExpectationsService {
  constructor(private readonly pool: Pool) {}

  async create(ctx: RequestContext, input: CreateExpectationInput): Promise<DataExpectation> {
    const r = await this.pool.query(
      `INSERT INTO "quality"."expectations"
         ("id","tenant_id","name","description","target_type","field","type",
          "params","blocking","enabled","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        randomUUID(), ctx.tenantId, input.name, input.description,
        input.targetType, input.field ?? null, input.type,
        JSON.stringify(input.params ?? {}),
        // Both default to true: an expectation you bothered to write is
        // presumed to be one you want enforced.
        input.blocking ?? true, input.enabled ?? true,
        new Date().toISOString(),
      ],
    );
    return mapExpectation(r.rows[0]!);
  }

  async get(ctx: RequestContext, id: string): Promise<DataExpectation | null> {
    const r = await this.pool.query(
      `SELECT * FROM "quality"."expectations" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
    return r.rows[0] ? mapExpectation(r.rows[0]) : null;
  }

  async list(ctx: RequestContext, targetType?: string): Promise<DataExpectation[]> {
    const params: unknown[] = [ctx.tenantId];
    let sql = `SELECT * FROM "quality"."expectations" WHERE "tenant_id"=$1`;
    if (targetType) { params.push(targetType); sql += ` AND "target_type"=$${params.length}`; }
    // `id` breaks ties on created_at: expectations created in the same
    // millisecond would otherwise come back in an arbitrary order each call.
    sql += ` ORDER BY "created_at" DESC, "id" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapExpectation);
  }

  async update(ctx: RequestContext, id: string, updates: Partial<CreateExpectationInput>): Promise<DataExpectation> {
    const current = await this.require(ctx, id);
    const r = await this.pool.query(
      `UPDATE "quality"."expectations"
          SET "name"=$3, "description"=$4, "field"=$5, "type"=$6,
              "params"=$7, "blocking"=$8, "enabled"=$9
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [
        ctx.tenantId, id,
        updates.name ?? current.name,
        updates.description ?? current.description,
        updates.field ?? current.field ?? null,
        updates.type ?? current.type,
        JSON.stringify(updates.params ?? current.params),
        updates.blocking ?? current.blocking,
        updates.enabled ?? current.enabled,
      ],
    );
    return mapExpectation(r.rows[0]!);
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "quality"."expectations" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
  }

  async evaluate(ctx: RequestContext, targetType: string, data: Record<string, unknown>[]): Promise<ExpectationResult[]> {
    // Disabled expectations are skipped rather than evaluated-and-ignored, so
    // a disabled check cannot appear in the results as a passing one.
    const enabled = (await this.list(ctx, targetType)).filter(e => e.enabled);
    return enabled.map(exp => evaluateDataExpectation(exp, data));
  }

  async gateBuild(
    ctx: RequestContext,
    targetType: string,
    data: Record<string, unknown>[],
  ): Promise<{ passed: boolean; results: ExpectationResult[]; blockingFailures: ExpectationResult[] }> {
    const all = await this.list(ctx, targetType);
    const results = await this.evaluate(ctx, targetType, data);
    // Only a failing expectation marked `blocking` stops the build; the rest
    // are reported and allowed through.
    const blockingFailures = results.filter(r => {
      if (r.passed) return false;
      return all.find(e => e.id === r.expectationId)?.blocking ?? false;
    });
    return { passed: blockingFailures.length === 0, results, blockingFailures };
  }

  private async require(ctx: RequestContext, id: string): Promise<DataExpectation> {
    const found = await this.get(ctx, id);
    if (!found) throw new Error(`Expectation not found: ${id}`);
    return found;
  }
}
