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

  // ── Alerting service (threshold rules + alerts) ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "alerting";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "alerting"."rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "object_type" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "property" TEXT NOT NULL,
  "tag_filter" JSONB NOT NULL DEFAULT '{}',
  "operator" TEXT NOT NULL DEFAULT 'gt',
  "threshold" DOUBLE PRECISION NOT NULL,
  "consecutive_points" INTEGER NOT NULL DEFAULT 1,
  "min_duration_seconds" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_alert_rules_tenant" ON "alerting"."rules" ("tenant_id");`);
  statements.push(`CREATE TABLE IF NOT EXISTS "alerting"."alerts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "rule_name" TEXT NOT NULL DEFAULT '',
  "object_type" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "property" TEXT NOT NULL DEFAULT '',
  "triggered_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "operator" TEXT NOT NULL DEFAULT 'gt',
  "triggered_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "status" TEXT NOT NULL DEFAULT 'active',
  "acknowledged_by" TEXT,
  "notification_ids" JSONB NOT NULL DEFAULT '[]'
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_alerts_tenant_status" ON "alerting"."alerts" ("tenant_id", "status");`);

  // ── Data freshness ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "freshness";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "freshness"."records" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "object_type" TEXT,
  "datasource" TEXT,
  "last_synced_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "last_attempted_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "last_record_count" BIGINT NOT NULL DEFAULT 0,
  "last_sync_succeeded" BOOLEAN NOT NULL DEFAULT TRUE,
  "last_error" TEXT,
  "interval_ms" BIGINT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("tenant_id", "object_type", "datasource")
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_freshness_tenant" ON "freshness"."records" ("tenant_id");`);

  // ── Dataset metadata ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "dataset";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "dataset"."metadata" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "branch" TEXT NOT NULL DEFAULT 'main',
  "schema" JSONB NOT NULL DEFAULT '{}',
  "description" TEXT NOT NULL DEFAULT '',
  "latest_transaction_id" TEXT NOT NULL DEFAULT '',
  "row_count" BIGINT NOT NULL DEFAULT 0,
  "size_bytes" BIGINT,
  "created_by" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("tenant_id", "name", "branch")
);`);
  // `dataset_id` is the identity of the dataset itself, stable across every
  // branch; the per-row `id` is not, because metadata carries one row per
  // (name, branch). Transactions and branches reference the former.
  statements.push(`ALTER TABLE "dataset"."metadata" ADD COLUMN IF NOT EXISTS "dataset_id" TEXT;`);

  // Rows are keyed by the dataset's primary key so a re-insert of the same key
  // replaces rather than duplicates. `row_key` is the JSON-encoded PK tuple
  // (see datasetRowKey in @altius/spi); a schema with no primary key gets a
  // fresh UUID per row, which is what makes those datasets append-only.
  //
  // `seq` preserves insertion order. A read with no `orderBy` returns rows in
  // insertion order on the in-memory provider (Map iteration order), and
  // Postgres has no inherent row order at all — without this the two providers
  // answer the same unordered read differently.
  statements.push(`CREATE TABLE IF NOT EXISTS "dataset"."rows" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "dataset_name" TEXT NOT NULL,
  "branch" TEXT NOT NULL DEFAULT 'main',
  "row_key" TEXT NOT NULL DEFAULT '',
  "seq" BIGSERIAL,
  "data" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`ALTER TABLE "dataset"."rows" ADD COLUMN IF NOT EXISTS "row_key" TEXT NOT NULL DEFAULT '';`);
  statements.push(`ALTER TABLE "dataset"."rows" ADD COLUMN IF NOT EXISTS "seq" BIGSERIAL;`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_dataset_rows_tenant_name_branch" ON "dataset"."rows" ("tenant_id", "dataset_name", "branch");`);
  statements.push(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_dataset_rows_tenant_name_branch_key" ON "dataset"."rows" ("tenant_id", "dataset_name", "branch", "row_key");`);

  // Append-only transaction log. `seq` orders entries within a branch: the
  // snapshot read (`asOfTransactionId`) replays the log up to a transaction, so
  // it needs a total order, and `timestamp` alone ties when two writes land in
  // the same millisecond.
  statements.push(`CREATE TABLE IF NOT EXISTS "dataset"."transactions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "dataset_id" TEXT NOT NULL DEFAULT '',
  "dataset_name" TEXT NOT NULL,
  "branch" TEXT NOT NULL DEFAULT 'main',
  "type" TEXT NOT NULL,
  "rows" JSONB NOT NULL DEFAULT '[]',
  "schema_version" INTEGER NOT NULL DEFAULT 0,
  "schema_snapshot" JSONB,
  "previous_schema_snapshot" JSONB,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "actor_id" TEXT NOT NULL DEFAULT '',
  "message" TEXT
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_dataset_tx_tenant_name_branch_seq" ON "dataset"."transactions" ("tenant_id", "dataset_name", "branch", "seq");`);

  statements.push(`CREATE TABLE IF NOT EXISTS "dataset"."branches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "dataset_id" TEXT NOT NULL DEFAULT '',
  "dataset_name" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parent_branch" TEXT NOT NULL,
  "parent_transaction_id" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  UNIQUE ("tenant_id", "dataset_name", "name")
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_dataset_branches_tenant_name" ON "dataset"."branches" ("tenant_id", "dataset_name");`);

  // ── Geospatial maps ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "geospatial";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "geospatial"."layers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "object_type" TEXT NOT NULL,
  "geometry_field" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'point',
  "base_url" TEXT,
  "style" JSONB NOT NULL DEFAULT '{}',
  "filter" JSONB,
  "visible" BOOLEAN NOT NULL DEFAULT TRUE,
  "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "z_index" INTEGER DEFAULT 0,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "geospatial"."saved_maps" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "layer_ids" JSONB NOT NULL DEFAULT '[]',
  "viewport" JSONB NOT NULL DEFAULT '{}',
  "annotation_ids" JSONB NOT NULL DEFAULT '[]',
  "owner_id" TEXT NOT NULL,
  "shared_with" JSONB NOT NULL DEFAULT '[]',
  "is_public" BOOLEAN NOT NULL DEFAULT FALSE,
  "tags" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "geospatial"."annotations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "shape" JSONB NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'marker',
  "style" JSONB,
  "object_id" TEXT,
  "object_type" TEXT,
  "owner_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);

  // ── Justification store ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "justification";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "justification"."records" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "action_name" TEXT NOT NULL,
  "object_type" TEXT,
  "object_id" TEXT,
  "justification" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'routine',
  "approved" BOOLEAN NOT NULL DEFAULT FALSE,
  "approved_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_just_tenant_user" ON "justification"."records" ("tenant_id", "user_id");`);

  // ── Ontology SQL (saved queries) ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "ontology_sql";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "ontology_sql"."saved_queries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sql" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "object_types" TEXT[] NOT NULL DEFAULT '{}',
  "parameterized" BOOLEAN NOT NULL DEFAULT FALSE,
  "parameters" JSONB,
  "owner_id" TEXT NOT NULL,
  "shared_with" TEXT[] NOT NULL DEFAULT '{}',
  "is_public" BOOLEAN NOT NULL DEFAULT FALSE,
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_osql_tenant" ON "ontology_sql"."saved_queries" ("tenant_id");`);

  // ── Usage metrics ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "usage_metrics";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "usage_metrics"."events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT,
  "object_type" TEXT,
  "object_id" TEXT,
  "action_or_function_name" TEXT,
  "operation" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT TRUE,
  "duration_ms" INTEGER,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_usage_tenant_time" ON "usage_metrics"."events" ("tenant_id", "created_at");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_usage_tenant_type" ON "usage_metrics"."events" ("tenant_id", "object_type");`);
  statements.push(`CREATE TABLE IF NOT EXISTS "usage_metrics"."monitoring_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "object_type" TEXT NOT NULL DEFAULT '*',
  "operation" TEXT NOT NULL DEFAULT '*',
  "threshold" DOUBLE PRECISION NOT NULL,
  "operator" TEXT NOT NULL DEFAULT 'gt',
  "window_seconds" INTEGER NOT NULL DEFAULT 300,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);

  // ── Scoped sessions ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "scoped_session";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "scoped_session"."sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "allowed_markings" TEXT[] NOT NULL DEFAULT '{}',
  "excluded_markings" TEXT[] NOT NULL DEFAULT '{}',
  "label" TEXT NOT NULL DEFAULT '',
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "revoked" BOOLEAN NOT NULL DEFAULT FALSE
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_scoped_tenant_user" ON "scoped_session"."sessions" ("tenant_id", "user_id");`);

  // ── Change proposals (human-in-the-loop governance) ──
  //
  // The record of who approved which AI-proposed change, and when. `tags` is a
  // real TEXT[] and must be bound as a JS array, never JSON.stringify'd — that
  // is the #19 defect, which made two stores unwritable on Postgres while
  // their suites stayed green.
  statements.push(`CREATE SCHEMA IF NOT EXISTS "governance";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."change_proposals" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "type" TEXT NOT NULL,
  "changes" JSONB NOT NULL DEFAULT '[]',
  "state" TEXT NOT NULL DEFAULT 'draft',
  "submitted_by" TEXT NOT NULL DEFAULT '',
  "submitted_by_ai" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "submitted_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "reviewer_id" TEXT,
  "reviewer_comments" TEXT,
  "reviewed_at" TIMESTAMPTZ,
  "applied_at" TIMESTAMPTZ,
  "risk_level" TEXT,
  "hold_id" TEXT,
  "tags" TEXT[]
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_proposals_tenant_state" ON "governance"."change_proposals" ("tenant_id", "state");`);
  // list() orders by updated_at DESC within a tenant, which is also the shape
  // of the pending-review query.
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_proposals_tenant_updated" ON "governance"."change_proposals" ("tenant_id", "updated_at" DESC);`);

  // ── Approval workflows and submissions ──
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."approval_workflows" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "action_type" TEXT NOT NULL,
  "criteria" JSONB NOT NULL DEFAULT '[]',
  "approver_attributes" JSONB NOT NULL DEFAULT '[]',
  "multi_step" BOOLEAN NOT NULL DEFAULT FALSE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_approval_workflows_tenant" ON "governance"."approval_workflows" ("tenant_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_approval_workflows_tenant_action" ON "governance"."approval_workflows" ("tenant_id", "action_type");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_approval_workflows_tenant_created" ON "governance"."approval_workflows" ("tenant_id", "created_at" DESC);`);

  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."approval_submissions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "action_type" TEXT NOT NULL,
  "parameters" JSONB NOT NULL DEFAULT '{}',
  "submitter_attributes" JSONB NOT NULL DEFAULT '{}',
  "resource_attributes" JSONB NOT NULL DEFAULT '{}',
  "risk_level" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "submitted_by" TEXT NOT NULL DEFAULT '',
  "decided_at" TIMESTAMPTZ,
  "decided_by" TEXT,
  "decision_notes" TEXT,
  "criteria_passed" BOOLEAN NOT NULL DEFAULT FALSE,
  "criteria_details" JSONB NOT NULL DEFAULT '[]',
  FOREIGN KEY ("workflow_id") REFERENCES "governance"."approval_workflows" ("id")
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_approval_submissions_tenant" ON "governance"."approval_submissions" ("tenant_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_approval_submissions_tenant_state" ON "governance"."approval_submissions" ("tenant_id", "state");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_approval_submissions_tenant_workflow" ON "governance"."approval_submissions" ("tenant_id", "workflow_id");`);

  return statements;
}
