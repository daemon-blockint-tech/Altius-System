/**
 * DDL for platform stores: blob, time-series, branch, comment, notification.
 *
 * Each store gets its own schema for isolation. All tables are tenant-scoped.
 */

export function generatePlatformDDL(): string[] {
  const statements: string[] = [];

  // ── Blob store ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "blob";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "blob"."blobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "data" BYTEA NOT NULL,
  "sha256" TEXT,
  "uploaded_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_blobs_tenant" ON "blob"."blobs" ("tenant_id");`,
  );

  // ── Time-series store ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "timeseries";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "timeseries"."points" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "object_type" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL,
  "value" TEXT NOT NULL,
  "tags" JSONB
);`);
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_ts_tenant_object_field_time" ON "timeseries"."points" ("tenant_id", "object_type", "object_id", "field", "timestamp");`,
  );

  // ── Branch store (includes merge proposals) ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "branch";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "branch"."branches" (
  "name" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "parent" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "status" TEXT NOT NULL DEFAULT 'open',
  "description" TEXT,
  "merged_at" TIMESTAMPTZ,
  PRIMARY KEY ("tenant_id", "name")
);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "branch"."proposals" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "branch_name" TEXT NOT NULL,
  "target_branch" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMPTZ,
  "review_comment" TEXT,
  "summary" TEXT
);`);
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_proposals_tenant_branch" ON "branch"."proposals" ("tenant_id", "branch_name");`,
  );

  // ── Comment store ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "comment";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "comment"."comments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "object_type" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "parent_comment_id" TEXT,
  "body" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "author_name" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ,
  "edited" BOOLEAN NOT NULL DEFAULT FALSE,
  "resolved" BOOLEAN NOT NULL DEFAULT FALSE,
  "mentions" TEXT[] NOT NULL DEFAULT '{}'
);`);
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_comments_tenant_object" ON "comment"."comments" ("tenant_id", "object_type", "object_id");`,
  );
  // Comment notifications (for @-mention and reply notifications)
  statements.push(`CREATE TABLE IF NOT EXISTS "comment"."comment_notifications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "comment_id" TEXT NOT NULL,
  "object_type" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "read" BOOLEAN NOT NULL DEFAULT FALSE
);`);
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_comment_notif_tenant_user" ON "comment"."comment_notifications" ("tenant_id", "user_id");`,
  );

  // ── Notification store ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "notification";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "notification"."notifications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "source_object_type" TEXT,
  "source_object_id" TEXT,
  "link_url" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "channels" TEXT[] NOT NULL DEFAULT '{}'
);`);
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_notif_tenant_user" ON "notification"."notifications" ("tenant_id", "user_id");`,
  );
  statements.push(`CREATE TABLE IF NOT EXISTS "notification"."preferences" (
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "preferences" JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY ("tenant_id", "user_id")
);`);

  return statements;
}
