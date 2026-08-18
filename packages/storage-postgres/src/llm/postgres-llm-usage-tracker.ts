/**
 * PostgreSQL implementation of LLMUsageTracker.
 *
 * Stores usage records in "llm"."usage_records" (DDL from ddl-llm.ts).
 * Queries use parameterized WHERE clauses; summaries use aggregate queries.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  LLMUsageTracker,
  LLMUsageRecord,
  UsageQuery,
  UsageSummary,
} from '@altius/spi';

export class PostgresLLMUsageTracker implements LLMUsageTracker {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async record(record: LLMUsageRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO "llm"."usage_records"
        ("id", "tenant_id", "user_id", "model", "operation",
         "prompt_tokens", "completion_tokens", "total_tokens", "timestamp")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        record.tenantId,
        record.userId,
        record.model,
        record.operation,
        record.promptTokens,
        record.completionTokens,
        record.totalTokens,
        record.timestamp,
      ],
    );
  }

  async query(query: UsageQuery): Promise<{ records: LLMUsageRecord[]; totalCount: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.tenantId) {
      conditions.push(`"tenant_id" = $${idx++}`);
      params.push(query.tenantId);
    }
    if (query.userId) {
      conditions.push(`"user_id" = $${idx++}`);
      params.push(query.userId);
    }
    if (query.model) {
      conditions.push(`"model" = $${idx++}`);
      params.push(query.model);
    }
    if (query.startTime) {
      conditions.push(`"timestamp" >= $${idx++}`);
      params.push(query.startTime);
    }
    if (query.endTime) {
      conditions.push(`"timestamp" <= $${idx++}`);
      params.push(query.endTime);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit ?? 100;

    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM "llm"."usage_records" ${where}`,
      params,
    );
    const totalCount = countResult.rows[0]!.count;

    const result = await this.pool.query(
      `SELECT "tenant_id", "user_id", "model", "operation",
              "prompt_tokens", "completion_tokens", "total_tokens", "timestamp"
       FROM "llm"."usage_records" ${where}
       ORDER BY "timestamp" DESC
       LIMIT $${idx++}`,
      [...params, limit],
    );

    const records: LLMUsageRecord[] = result.rows.map((r) => ({
      tenantId: r['tenant_id'],
      userId: r['user_id'],
      model: r['model'],
      operation: r['operation'],
      promptTokens: r['prompt_tokens'],
      completionTokens: r['completion_tokens'],
      totalTokens: r['total_tokens'],
      timestamp: r['timestamp'],
    }));

    return { records, totalCount };
  }

  async summarize(tenantId: string, startTime?: string, endTime?: string): Promise<UsageSummary> {
    const conditions = [`"tenant_id" = $1`];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (startTime) {
      conditions.push(`"timestamp" >= $${idx++}`);
      params.push(startTime);
    }
    if (endTime) {
      conditions.push(`"timestamp" <= $${idx++}`);
      params.push(endTime);
    }

    const where = conditions.join(' AND ');

    const totalResult = await this.pool.query(
      `SELECT COUNT(*)::int AS requests,
              COALESCE(SUM("prompt_tokens"), 0)::int AS prompt_tokens,
              COALESCE(SUM("completion_tokens"), 0)::int AS completion_tokens,
              COALESCE(SUM("total_tokens"), 0)::int AS total_tokens
       FROM "llm"."usage_records" WHERE ${where}`,
      params,
    );

    const byModelResult = await this.pool.query(
      `SELECT "model",
              COUNT(*)::int AS requests,
              COALESCE(SUM("total_tokens"), 0)::int AS tokens
       FROM "llm"."usage_records" WHERE ${where}
       GROUP BY "model"`,
      params,
    );

    const byUserResult = await this.pool.query(
      `SELECT "user_id",
              COUNT(*)::int AS requests,
              COALESCE(SUM("total_tokens"), 0)::int AS tokens
       FROM "llm"."usage_records" WHERE ${where}
       GROUP BY "user_id"`,
      params,
    );

    const t = totalResult.rows[0]!;
    return {
      totalRequests: t['requests'],
      totalPromptTokens: t['prompt_tokens'],
      totalCompletionTokens: t['completion_tokens'],
      totalTokens: t['total_tokens'],
      byModel: byModelResult.rows.map((r) => ({
        model: r['model'],
        requests: r['requests'],
        tokens: r['tokens'],
      })),
      byUser: byUserResult.rows.map((r) => ({
        userId: r['user_id'],
        requests: r['requests'],
        tokens: r['tokens'],
      })),
    };
  }

  async getTotalTokens(tenantId: string, startTime?: string, endTime?: string): Promise<number> {
    const conditions = [`"tenant_id" = $1`];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (startTime) {
      conditions.push(`"timestamp" >= $${idx++}`);
      params.push(startTime);
    }
    if (endTime) {
      conditions.push(`"timestamp" <= $${idx++}`);
      params.push(endTime);
    }

    const result = await this.pool.query(
      `SELECT COALESCE(SUM("total_tokens"), 0)::bigint AS total
       FROM "llm"."usage_records" WHERE ${conditions.join(' AND ')}`,
      params,
    );

    return Number(result.rows[0]!.total);
  }
}
