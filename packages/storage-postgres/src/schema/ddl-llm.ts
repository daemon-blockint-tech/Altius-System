/**
 * DDL generation for LLM governance schema.
 *
 * Creates a separate 'llm' schema with:
 * - llm_usage_records: token usage per tenant/user/model for metering
 * - llm_rate_limit_windows: sliding-window rate limit counters per tenant
 * - llm_rate_limit_configs: per-tenant rate limit configuration
 */

export function generateLLMDDL(): string[] {
  const statements: string[] = [];

  statements.push(`CREATE SCHEMA IF NOT EXISTS "llm";`);

  // Usage records — append-only, one row per LLM call.
  statements.push(`CREATE TABLE IF NOT EXISTS "llm"."usage_records" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);

  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_llm_usage_tenant_time" ON "llm"."usage_records" ("tenant_id", "timestamp");`,
  );
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_llm_usage_user" ON "llm"."usage_records" ("tenant_id", "user_id");`,
  );
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_llm_usage_model" ON "llm"."usage_records" ("tenant_id", "model");`,
  );

  // Rate limit configs — one row per tenant, overrides the platform default.
  statements.push(`CREATE TABLE IF NOT EXISTS "llm"."rate_limit_configs" (
  "tenant_id" TEXT NOT NULL PRIMARY KEY,
  "requests_per_minute" INTEGER NOT NULL,
  "tokens_per_minute" INTEGER NOT NULL,
  "requests_per_day" INTEGER NOT NULL,
  "tokens_per_day" INTEGER NOT NULL
);`);

  // Rate limit windows — sliding window entries for request/token counting.
  // Each row is one request; tokens are the estimated or actual token count.
  // Old rows are cleaned up by the check() method.
  statements.push(`CREATE TABLE IF NOT EXISTS "llm"."rate_limit_windows" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "tokens" INTEGER NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);

  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_llm_rate_window_tenant_time" ON "llm"."rate_limit_windows" ("tenant_id", "timestamp");`,
  );

  return statements;
}
