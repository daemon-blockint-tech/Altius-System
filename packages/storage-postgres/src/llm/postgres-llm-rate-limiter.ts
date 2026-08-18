/**
 * PostgreSQL implementation of LLMRateLimiter.
 *
 * Uses "llm"."rate_limit_windows" for sliding-window counting and
 * "llm"."rate_limit_configs" for per-tenant configuration.
 *
 * Unlike the in-memory implementation, this is shared across server replicas
 * and survives restarts. The trade-off is a database round-trip per check.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  LLMRateLimiter,
  RateLimitConfig,
  RateLimitResult,
} from '@altius/spi';
import { DEFAULT_RATE_LIMIT } from '@altius/spi';

export class PostgresLLMRateLimiter implements LLMRateLimiter {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async check(tenantId: string, estimatedTokens: number): Promise<RateLimitResult> {
    const config = await this.getConfig(tenantId);
    const now = Date.now();
    const minuteAgo = new Date(now - 60_000).toISOString();
    const dayAgo = new Date(now - 86_400_000).toISOString();

    // Count requests and tokens in the current windows.
    const result = await this.pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM "llm"."rate_limit_windows"
         WHERE "tenant_id" = $1 AND "timestamp" > $2) AS minute_requests,
        (SELECT COALESCE(SUM("tokens"), 0)::int FROM "llm"."rate_limit_windows"
         WHERE "tenant_id" = $1 AND "timestamp" > $2) AS minute_tokens,
        (SELECT COUNT(*)::int FROM "llm"."rate_limit_windows"
         WHERE "tenant_id" = $1 AND "timestamp" > $3) AS day_requests,
        (SELECT COALESCE(SUM("tokens"), 0)::int FROM "llm"."rate_limit_windows"
         WHERE "tenant_id" = $1 AND "timestamp" > $3) AS day_tokens`,
      [tenantId, minuteAgo, dayAgo],
    );

    const r = result.rows[0]!;
    const currentRequestsPerMinute = r['minute_requests'];
    const currentTokensPerMinute = r['minute_tokens'];
    const currentRequestsPerDay = r['day_requests'];
    const currentTokensPerDay = r['day_tokens'];

    if (currentRequestsPerMinute >= config.requestsPerMinute) {
      return { allowed: false, reason: 'Rate limit exceeded: requests per minute', currentRequestsPerMinute, currentTokensPerMinute };
    }
    if (currentTokensPerMinute + estimatedTokens > config.tokensPerMinute) {
      return { allowed: false, reason: 'Rate limit exceeded: tokens per minute', currentRequestsPerMinute, currentTokensPerMinute };
    }
    if (currentRequestsPerDay >= config.requestsPerDay) {
      return { allowed: false, reason: 'Rate limit exceeded: requests per day', currentRequestsPerMinute, currentTokensPerMinute };
    }
    if (currentTokensPerDay + estimatedTokens > config.tokensPerDay) {
      return { allowed: false, reason: 'Rate limit exceeded: tokens per day', currentRequestsPerMinute, currentTokensPerMinute };
    }

    return { allowed: true, currentRequestsPerMinute, currentTokensPerMinute };
  }

  async recordUsage(tenantId: string, tokens: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO "llm"."rate_limit_windows" ("id", "tenant_id", "tokens", "timestamp")
       VALUES ($1, $2, $3, NOW())`,
      [randomUUID(), tenantId, tokens],
    );

    // Opportunistic cleanup: delete rows older than 24 hours.
    // This is not critical for correctness (old rows are filtered out by the
    // window queries) but keeps the table from growing without bound.
    await this.pool.query(
      `DELETE FROM "llm"."rate_limit_windows" WHERE "timestamp" < NOW() - INTERVAL '24 hours'`,
    );
  }

  async getConfig(tenantId: string): Promise<RateLimitConfig> {
    const result = await this.pool.query(
      `SELECT "requests_per_minute", "tokens_per_minute", "requests_per_day", "tokens_per_day"
       FROM "llm"."rate_limit_configs" WHERE "tenant_id" = $1`,
      [tenantId],
    );

    if (result.rows.length === 0) return DEFAULT_RATE_LIMIT;

    const r = result.rows[0]!;
    return {
      requestsPerMinute: r['requests_per_minute'],
      tokensPerMinute: r['tokens_per_minute'],
      requestsPerDay: r['requests_per_day'],
      tokensPerDay: r['tokens_per_day'],
    };
  }

  async setConfig(tenantId: string, config: RateLimitConfig): Promise<void> {
    await this.pool.query(
      `INSERT INTO "llm"."rate_limit_configs"
        ("tenant_id", "requests_per_minute", "tokens_per_minute", "requests_per_day", "tokens_per_day")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("tenant_id") DO UPDATE SET
        "requests_per_minute" = EXCLUDED."requests_per_minute",
        "tokens_per_minute" = EXCLUDED."tokens_per_minute",
        "requests_per_day" = EXCLUDED."requests_per_day",
        "tokens_per_day" = EXCLUDED."tokens_per_day"`,
      [tenantId, config.requestsPerMinute, config.tokensPerMinute, config.requestsPerDay, config.tokensPerDay],
    );
  }
}
