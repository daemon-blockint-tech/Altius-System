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
  // ── Batch transforms, builds and schedules ──
  //
  // `inputs` is a real TEXT[] and must be bound as a JS array, never
  // JSON.stringify'd — the #19 defect, which made two stores unwritable on
  // Postgres while their suites stayed green.
  //
  // A schedule that silently stops firing looks like nothing happening rather
  // than like a failure, which is why these are worth persisting at all.
  statements.push(`CREATE TABLE IF NOT EXISTS "dataset"."transforms" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "inputs" TEXT[] NOT NULL DEFAULT '{}',
  "output" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT '',
  "incremental" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  "last_build_state" TEXT,
  "last_build_id" TEXT,
  UNIQUE ("tenant_id", "name")
);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "dataset"."transform_builds" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "transform_id" TEXT NOT NULL DEFAULT '',
  "transform_name" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "trigger" TEXT NOT NULL DEFAULT 'manual',
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ended_at" TIMESTAMPTZ,
  "duration_ms" BIGINT,
  "triggered_by" TEXT NOT NULL DEFAULT '',
  "rows_read" BIGINT NOT NULL DEFAULT 0,
  "rows_written" BIGINT NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "incremental" BOOLEAN NOT NULL DEFAULT FALSE,
  "checkpoint" TEXT
);`);
  // listBuilds returns newest first within a transform; `seq` gives that a
  // total order, since two builds can start in the same millisecond.
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_builds_tenant_name_seq" ON "dataset"."transform_builds" ("tenant_id", "transform_name", "seq" DESC);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "dataset"."transform_schedules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "transform_name" TEXT NOT NULL,
  "cron_expression" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_schedules_tenant" ON "dataset"."transform_schedules" ("tenant_id");`);

  // ── No-code variable transform pipelines ──
  //
  // A pipeline is a named, ordered list of declarative steps applied to a value.
  // Losing one is loud — `execute` throws "Transform pipeline not found" — but
  // the definition is user-authored configuration, so it is exactly the kind of
  // thing a restart should not eat.
  //
  // Keyed on (tenant_id, lookup_key) rather than id, because that is how the
  // in-memory service keys its map: `create` with an existing name REPLACES it
  // rather than erroring, and every read is by name. A surrogate primary key
  // would let two pipelines share a name here while the other provider allows
  // only one.
  //
  // `lookup_key` and `name` are separate columns, and the difference is not
  // cosmetic. The in-memory service writes an updated record back under the
  // OLD map key, so changing a pipeline's `name` through `update` renames the
  // record without moving it: it stays reachable under the old name while
  // reporting the new one. Modelling the map key as its own column is the only
  // way to reproduce that faithfully — a single `name` column would move the
  // row and diverge. The quirk is matched, pinned by a conformance case, and
  // raised as a contract question rather than fixed here, since fixing it would
  // change which name an existing caller has to use.
  statements.push(`CREATE TABLE IF NOT EXISTS "dataset"."transform_pipelines" (
  "tenant_id" TEXT NOT NULL,
  "lookup_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "seq" BIGSERIAL,
  "description" TEXT NOT NULL DEFAULT '',
  "steps" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("tenant_id", "lookup_key")
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_transform_pipelines_tenant_seq" ON "dataset"."transform_pipelines" ("tenant_id", "seq");`);

  // ── Interactive SQL query jobs ──
  //
  // The job record carries its own result rows in `rows`, which is how
  // `results()` answers after the process that ran the query is gone. It also
  // means a SELECT with no LIMIT writes its entire result set into one JSONB
  // value — matched from the in-memory provider rather than capped here,
  // because capping is a contract change, but a real limit for a query
  // service. Noted in the store header too.
  statements.push(`CREATE TABLE IF NOT EXISTS "dataset"."sql_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "sql" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'queued',
  "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "duration_ms" BIGINT,
  "submitted_by" TEXT NOT NULL DEFAULT '',
  "rows" JSONB,
  "result_columns" JSONB,
  "row_count" BIGINT,
  "error_message" TEXT
);`);
  // list() returns newest first; `seq` gives that a total order, since two
  // jobs can be submitted within the same millisecond.
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_sql_jobs_tenant_seq" ON "dataset"."sql_jobs" ("tenant_id", "seq" DESC);`);

  // ── Data expectations (quality checks that gate builds) ──
  //
  // `blocking` is what makes a failing check stop a build. An expectation that
  // vanishes does not error — the gate simply passes everything, which is why
  // this is worth persisting.
  statements.push(`CREATE SCHEMA IF NOT EXISTS "quality";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "quality"."expectations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "target_type" TEXT NOT NULL,
  "field" TEXT,
  "type" TEXT NOT NULL,
  "params" JSONB NOT NULL DEFAULT '{}',
  "blocking" BOOLEAN NOT NULL DEFAULT TRUE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_expectations_tenant_target" ON "quality"."expectations" ("tenant_id", "target_type");`);

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

  // ── Kiosk sessions ──
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."kiosk_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "kiosk_user_id" TEXT NOT NULL,
  "permissions" JSONB NOT NULL DEFAULT '{}',
  "state" TEXT NOT NULL DEFAULT 'active',
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expires_at" TIMESTAMPTZ NOT NULL,
  "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "admin_allowlisted" BOOLEAN NOT NULL DEFAULT TRUE,
  "launch_history" JSONB NOT NULL DEFAULT '[]',
  "allowed_origins" TEXT[] NOT NULL DEFAULT '{}',
  "created_by" TEXT
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_kiosk_sessions_tenant" ON "governance"."kiosk_sessions" ("tenant_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_kiosk_sessions_tenant_state" ON "governance"."kiosk_sessions" ("tenant_id", "state");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_kiosk_sessions_tenant_started" ON "governance"."kiosk_sessions" ("tenant_id", "started_at" DESC);`);

  // ── Business rules (no-code rule DAGs, approval-gated) ──
  //
  // `state` is what governs runtime behaviour: only an `active` rule applies.
  // Losing it silently reverts a rule to draft, which looks like nothing
  // happening rather than like a failure.
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."business_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "nodes" JSONB NOT NULL DEFAULT '[]',
  "state" TEXT NOT NULL DEFAULT 'draft',
  "is_time_series_board" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  "review_notes" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMPTZ
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_rules_tenant_state" ON "governance"."business_rules" ("tenant_id", "state");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_rules_tenant_created" ON "governance"."business_rules" ("tenant_id", "created_at" DESC);`);

  // ── Saved views ──
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."saved_views" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "object_type" TEXT,
  "widget_type" TEXT,
  "app_id" TEXT,
  "columns" JSONB,
  "filter" JSONB,
  "order_by" JSONB,
  "density" TEXT,
  "page_size" INT,
  "widget_config" JSONB,
  "is_public" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_saved_views_tenant" ON "governance"."saved_views" ("tenant_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_saved_views_tenant_created_by" ON "governance"."saved_views" ("tenant_id", "created_by");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_saved_views_tenant_object_type" ON "governance"."saved_views" ("tenant_id", "object_type");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_saved_views_tenant_widget_type" ON "governance"."saved_views" ("tenant_id", "widget_type");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_saved_views_tenant_app_id" ON "governance"."saved_views" ("tenant_id", "app_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_saved_views_tenant_is_public" ON "governance"."saved_views" ("tenant_id", "is_public");`);

  // ── Design system themes ──
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."design_system_themes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "dark_mode" BOOLEAN NOT NULL DEFAULT FALSE,
  "density" TEXT NOT NULL DEFAULT 'comfortable',
  "palette" JSONB NOT NULL DEFAULT '{}',
  "typography" JSONB NOT NULL DEFAULT '{}',
  "module_palettes" JSONB NOT NULL DEFAULT '{}',
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_design_system_themes_tenant" ON "governance"."design_system_themes" ("tenant_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_design_system_themes_tenant_name" ON "governance"."design_system_themes" ("tenant_id", "name");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_design_system_themes_tenant_default" ON "governance"."design_system_themes" ("tenant_id", "is_default");`);

  // ── User directory ──
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."user_directory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "email" TEXT,
  "display_name" TEXT,
  "roles" JSONB NOT NULL DEFAULT '[]',
  "groups" JSONB NOT NULL DEFAULT '[]',
  "attributes" JSONB NOT NULL DEFAULT '{}',
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_user_directory_tenant" ON "governance"."user_directory" ("tenant_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_user_directory_tenant_user" ON "governance"."user_directory" ("tenant_id", "user_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_user_directory_tenant_email" ON "governance"."user_directory" ("tenant_id", "email");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_user_directory_tenant_active" ON "governance"."user_directory" ("tenant_id", "is_active");`);

  // ── Layout / device / deep-link state ──
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."layout_device_state" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "device_id" TEXT,
  "session_id" TEXT,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT,
  "expires_at" TIMESTAMPTZ
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_layout_device_state_tenant" ON "governance"."layout_device_state" ("tenant_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_layout_device_state_tenant_device" ON "governance"."layout_device_state" ("tenant_id", "device_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_layout_device_state_tenant_session" ON "governance"."layout_device_state" ("tenant_id", "session_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_layout_device_state_tenant_kind" ON "governance"."layout_device_state" ("tenant_id", "kind");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_layout_device_state_tenant_expires" ON "governance"."layout_device_state" ("tenant_id", "expires_at");`);
  // ── Process-mining event objects and their breach thresholds ──
  //
  // The events are the process-mining input; a model discovered from a log that
  // lost half its events is not wrong-looking, it is just a smaller model. And a
  // lost threshold does not error either — new events simply stop being flagged
  // as breaches, which is the same silent-gate shape as losing a data
  // expectation.
  statements.push(`CREATE SCHEMA IF NOT EXISTS "process";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "process"."events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "object_id" TEXT,
  "object_type" TEXT,
  -- Timestamps are TEXT, not TIMESTAMPTZ: the query filters compare them as
  -- strings against caller-supplied bounds, and the in-memory provider does a
  -- lexicographic compare. Storing them as instants would re-order events whose
  -- strings differ but whose instants match, and the two providers would part
  -- company on the boundaries.
  "start_time" TEXT NOT NULL,
  "end_time" TEXT,
  "duration_ms" BIGINT,
  "actor_id" TEXT,
  "badges" JSONB NOT NULL DEFAULT '[]',
  "threshold_breached" BOOLEAN,
  "threshold_details" JSONB,
  "attributes" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  // list() orders by start_time ascending; `seq` breaks the ties, which are
  // common because events are frequently stamped from the same clock reading.
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_events_tenant_start" ON "process"."events" ("tenant_id", "start_time", "seq");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_events_tenant_case" ON "process"."events" ("tenant_id", "case_id");`);

  // One threshold per (tenant, event type), replaced rather than accumulated.
  statements.push(`CREATE TABLE IF NOT EXISTS "process"."event_thresholds" (
  "tenant_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "direction" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("tenant_id", "event_type")
  // ── Ontology change history ──
  //
  // The record of who changed the schema, when, and what it looked like before.
  // `seq` is not decoration: listChanges orders by version descending, and every
  // record is created at version 1, so ties are the common case rather than the
  // edge case. The in-memory sort is stable, which means ties come back in
  // insertion order — `seq ASC` is how Postgres says the same thing.
  //
  // The primary key is composite, unlike the other governance tables. Their ids
  // are UUIDs this code generates, so a global key is safe; here `saveChange`
  // accepts a caller-supplied id, and the in-memory service keys its map per
  // tenant — so two tenants each holding a record called "v1" is legal there. A
  // global key would make it a conflict here and reject a write the other
  // provider accepts.
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."ontology_change_history" (
  "id" TEXT NOT NULL,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "applied_by" TEXT NOT NULL DEFAULT '',
  "migration_class" TEXT NOT NULL DEFAULT '',
  "diff_summary" TEXT NOT NULL DEFAULT '',
  "snapshot" JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY ("tenant_id", "id")
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_ont_change_tenant_version" ON "governance"."ontology_change_history" ("tenant_id", "version" DESC, "seq");`);
  // ── Data conflicts and the tenant's default resolution strategy ──
  //
  // Two pieces of state, both of which fail silently when lost. An unresolved
  // conflict is a datasource sync and a user edit disagreeing about a field:
  // lose it and the discrepancy is never surfaced, so the data quietly diverges
  // with nothing erroring. And the default strategy falls back to
  // `user_edits_win` when absent, so a tenant that chose otherwise does not get
  // an error after a restart — it gets the other answer.
  //
  // The three value columns are JSONB rather than TEXT because a conflict can be
  // over an object — the merge strategy exists precisely for that case — and
  // because JSONB keeps "no value" distinguishable from "the value null", which
  // matters since resolving manually without a value is legal.
  statements.push(`CREATE SCHEMA IF NOT EXISTS "sync";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "sync"."data_conflicts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "object_type" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "datasource_value" JSONB,
  "user_value" JSONB,
  "datasource_timestamp" TEXT NOT NULL DEFAULT '',
  "user_timestamp" TEXT NOT NULL DEFAULT '',
  "resolved_value" JSONB,
  "resolved_by" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT FALSE,
  "detected_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolved_at" TIMESTAMPTZ
);`);
  // listUnresolved returns newest first; `seq` gives that a total order, since
  // two conflicts can be detected within the same millisecond.
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_conflicts_tenant_unresolved" ON "sync"."data_conflicts" ("tenant_id", "resolved", "detected_at" DESC, "seq" DESC);`);

  // One row per tenant: the strategy applied when none is named per call.
  statements.push(`CREATE TABLE IF NOT EXISTS "sync"."conflict_settings" (
  "tenant_id" TEXT NOT NULL PRIMARY KEY,
  "default_strategy" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);

  // ── Agent threads (Batch 2 — not in upstream) ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "agent_threads";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "agent_threads"."threads" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "model" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_agent_threads_tenant_user" ON "agent_threads"."threads" ("tenant_id", "user_id");`);
  statements.push(`CREATE TABLE IF NOT EXISTS "agent_threads"."messages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "thread_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT,
  "tool_calls" JSONB,
  "tool_result" JSONB,
  "model" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_agent_msgs_thread" ON "agent_threads"."messages" ("tenant_id", "thread_id", "created_at");`);

  // ── Object set filter states (Batch 2 — not in upstream) ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "object_set_filters";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "object_set_filters"."states" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "object_set_id" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "chips" JSONB NOT NULL DEFAULT '[]',
  "variables" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_osf_tenant_set" ON "object_set_filters"."states" ("tenant_id", "object_set_id");`);

  // ── Data expectations (Batch 2 — not in upstream) ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "data_expectations";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "data_expectations"."expectations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "target_type" TEXT NOT NULL,
  "field" TEXT,
  "type" TEXT NOT NULL,
  "params" JSONB NOT NULL DEFAULT '{}',
  "blocking" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_de_tenant_target" ON "data_expectations"."expectations" ("tenant_id", "target_type");`);

  // ── Model registry (Batch 2 — not in upstream) ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "model_registry";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "model_registry"."models" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "display_name" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "source" TEXT NOT NULL,
  "adapter" JSONB NOT NULL DEFAULT '{}',
  "state" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 0,
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  "released_by" TEXT,
  "released_at" TIMESTAMPTZ,
  "upstream_model_ids" TEXT[] NOT NULL DEFAULT '{}',
  "modeling_objective_id" TEXT
);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "model_registry"."deployments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "model_version" INTEGER NOT NULL DEFAULT 0,
  "name" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "batch_mode" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  "endpoint_url" TEXT,
  "error_message" TEXT
);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "model_registry"."inference_history" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "model_version" INTEGER NOT NULL DEFAULT 0,
  "deployment_id" TEXT,
  "user_id" TEXT,
  "inputs" JSONB NOT NULL DEFAULT '{}',
  "outputs" JSONB NOT NULL DEFAULT '{}',
  "success" BOOLEAN NOT NULL DEFAULT TRUE,
  "duration_ms" INTEGER,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "error_message" TEXT
);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "model_registry"."chains" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "steps" JSONB NOT NULL DEFAULT '[]',
  "state" TEXT NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT ''
);`);

  // ── Connector catalog (Batch 2 — not in upstream) ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "connector_catalog";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "connector_catalog"."configured" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "vendor_connector_id" TEXT NOT NULL,
  "instance_name" TEXT NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "auth" JSONB NOT NULL DEFAULT '{}',
  "egress_policy_id" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  "last_validation" JSONB,
  UNIQUE ("tenant_id", "instance_name")
);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "connector_catalog"."egress_policies" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "allowed_hosts" TEXT[] NOT NULL DEFAULT '{}',
  "denied_hosts" TEXT[] NOT NULL DEFAULT '{}',
  "require_on_prem_proxy" BOOLEAN NOT NULL DEFAULT FALSE,
  "on_prem_proxy" JSONB,
  "max_throughput_mbps" DOUBLE PRECISION,
  "require_tls" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE
);`);

  // ── Commands (Batch 2 — not in upstream) ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "commands";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "commands"."commands" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "source_app" TEXT NOT NULL,
  "icon" TEXT,
  "input_schema" JSONB NOT NULL DEFAULT '{}',
  "output_schema" JSONB NOT NULL DEFAULT '{}',
  "available_as_tool" BOOLEAN NOT NULL DEFAULT FALSE,
  "chainable" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE
);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "commands"."chains" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "steps" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE
);`);
  // ── Workshop UX state ──
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."workshop_ux_state" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "session_id" TEXT,
  "kind" TEXT NOT NULL,
  "app_id" TEXT,
  "user_id" TEXT,
  "name" TEXT,
  "key" TEXT,
  "locale" TEXT,
  "value" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "shared_with" TEXT[] NOT NULL DEFAULT '{}',
  "redacted_fields" TEXT[] NOT NULL DEFAULT '{}',
  "allowed_fields" TEXT[] NOT NULL DEFAULT '{}',
  "is_public" BOOLEAN,
  "is_default" BOOLEAN,
  "version" INTEGER,
  "auto_translated" BOOLEAN,
  "source" TEXT,
  "duration_ms" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT,
  UNIQUE ("tenant_id", "key", "locale")
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_workshop_ux_tenant_kind" ON "governance"."workshop_ux_state" ("tenant_id", "kind");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_workshop_ux_tenant_app" ON "governance"."workshop_ux_state" ("tenant_id", "app_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_workshop_ux_tenant_user" ON "governance"."workshop_ux_state" ("tenant_id", "user_id");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_workshop_ux_tenant_name" ON "governance"."workshop_ux_state" ("tenant_id", "name");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_workshop_ux_tenant_key_locale" ON "governance"."workshop_ux_state" ("tenant_id", "key", "locale");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_workshop_ux_tenant_created" ON "governance"."workshop_ux_state" ("tenant_id", "created_at" DESC);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_workshop_ux_tenant_updated" ON "governance"."workshop_ux_state" ("tenant_id", "updated_at" DESC);`);

  // ── Multi-ontology governance: spaces, ontologies, cross-org sharing rules ──
  //
  // The sharing rules are an access-control surface: `checkAccess` fails closed,
  // so losing them costs partner orgs their access rather than granting anyone
  // more. Loud in the right direction, and still worth persisting — a cross-org
  // arrangement that evaporates on restart takes its audit trail with it.
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."ontology_spaces" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "org_scope" TEXT NOT NULL,
  "shared" BOOLEAN NOT NULL DEFAULT FALSE,
  "shared_with_orgs" JSONB,
  "default_markings" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT ''
);`);
  // No UNIQUE on (tenant_id, name): the in-memory service does not enforce it
  // either — a second space with the same name simply wins the name lookup.
  // Matched rather than tightened, since adding a constraint here would reject
  // writes the other provider accepts.
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_ont_spaces_tenant_name" ON "governance"."ontology_spaces" ("tenant_id", "name");`);

  // `markings` and `shared_with_orgs` are JSONB, not TEXT[] — see #19: binding a
  // JS array into a TEXT[] with JSON.stringify fails at runtime, and JSONB is
  // the shape JSON.stringify is actually correct for.
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."ontology_entities" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "display_name" TEXT NOT NULL DEFAULT '',
  "space_id" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "markings" JSONB NOT NULL DEFAULT '[]',
  "read_only" BOOLEAN NOT NULL DEFAULT FALSE,
  "org_scope" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT ''
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_ont_entities_tenant_space" ON "governance"."ontology_entities" ("tenant_id", "space_id");`);

  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."sharing_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "source_space_id" TEXT NOT NULL,
  "target_org_scope" TEXT NOT NULL,
  "ontology_ids" JSONB NOT NULL DEFAULT '[]',
  "allowed_markings" JSONB NOT NULL DEFAULT '[]',
  "bidirectional" BOOLEAN NOT NULL DEFAULT FALSE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT ''
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_sharing_rules_tenant_source" ON "governance"."sharing_rules" ("tenant_id", "source_space_id");`);

  // ── Ontology change history ──
  //
  // The record of who changed the schema, when, and what it looked like before.
  // `seq` is not decoration: listChanges orders by version descending, and every
  // record is created at version 1, so ties are the common case rather than the
  // edge case. The in-memory sort is stable, which means ties come back in
  // insertion order — `seq ASC` is how Postgres says the same thing.
  //
  // The primary key is composite, unlike the other governance tables. Their ids
  // are UUIDs this code generates, so a global key is safe; here `saveChange`
  // accepts a caller-supplied id, and the in-memory service keys its map per
  // tenant — so two tenants each holding a record called "v1" is legal there. A
  // global key would make it a conflict here and reject a write the other
  // provider accepts.
  statements.push(`CREATE TABLE IF NOT EXISTS "governance"."ontology_change_history" (
  "id" TEXT NOT NULL,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "applied_by" TEXT NOT NULL DEFAULT '',
  "migration_class" TEXT NOT NULL DEFAULT '',
  "diff_summary" TEXT NOT NULL DEFAULT '',
  "snapshot" JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY ("tenant_id", "id")
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_ont_change_tenant_version" ON "governance"."ontology_change_history" ("tenant_id", "version" DESC, "seq");`);

  // ── Data conflicts and the tenant's default resolution strategy ──
  //
  // Two pieces of state, both of which fail silently when lost. An unresolved
  // conflict is a datasource sync and a user edit disagreeing about a field:
  // lose it and the discrepancy is never surfaced, so the data quietly diverges
  // with nothing erroring. And the default strategy falls back to
  // `user_edits_win` when absent, so a tenant that chose otherwise does not get
  // an error after a restart — it gets the other answer.
  //
  // The three value columns are JSONB rather than TEXT because a conflict can be
  // over an object — the merge strategy exists precisely for that case — and
  // because JSONB keeps "no value" distinguishable from "the value null", which
  // matters since resolving manually without a value is legal.
  statements.push(`CREATE SCHEMA IF NOT EXISTS "sync";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "sync"."data_conflicts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "object_type" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "datasource_value" JSONB,
  "user_value" JSONB,
  "datasource_timestamp" TEXT NOT NULL DEFAULT '',
  "user_timestamp" TEXT NOT NULL DEFAULT '',
  "resolved_value" JSONB,
  "resolved_by" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT FALSE,
  "detected_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolved_at" TIMESTAMPTZ
);`);
  // listUnresolved returns newest first; `seq` gives that a total order, since
  // two conflicts can be detected within the same millisecond.
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_conflicts_tenant_unresolved" ON "sync"."data_conflicts" ("tenant_id", "resolved", "detected_at" DESC, "seq" DESC);`);

  // One row per tenant: the strategy applied when none is named per call.
  statements.push(`CREATE TABLE IF NOT EXISTS "sync"."conflict_settings" (
  "tenant_id" TEXT NOT NULL PRIMARY KEY,
  "default_strategy" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);

  // ── Process-mining event objects and their breach thresholds ──
  //
  // The events are the process-mining input; a model discovered from a log that
  // lost half its events is not wrong-looking, it is just a smaller model. And a
  // lost threshold does not error either — new events simply stop being flagged
  // as breaches, which is the same silent-gate shape as losing a data
  // expectation.
  statements.push(`CREATE SCHEMA IF NOT EXISTS "process";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "process"."events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seq" BIGSERIAL,
  "tenant_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "object_id" TEXT,
  "object_type" TEXT,
  -- Timestamps are TEXT, not TIMESTAMPTZ: the query filters compare them as
  -- strings against caller-supplied bounds, and the in-memory provider does a
  -- lexicographic compare. Storing them as instants would re-order events whose
  -- strings differ but whose instants match, and the two providers would part
  -- company on the boundaries.
  "start_time" TEXT NOT NULL,
  "end_time" TEXT,
  "duration_ms" BIGINT,
  "actor_id" TEXT,
  "badges" JSONB NOT NULL DEFAULT '[]',
  "threshold_breached" BOOLEAN,
  "threshold_details" JSONB,
  "attributes" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  // list() orders by start_time ascending; `seq` breaks the ties, which are
  // common because events are frequently stamped from the same clock reading.
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_events_tenant_start" ON "process"."events" ("tenant_id", "start_time", "seq");`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_events_tenant_case" ON "process"."events" ("tenant_id", "case_id");`);

  // One threshold per (tenant, event type), replaced rather than accumulated.
  statements.push(`CREATE TABLE IF NOT EXISTS "process"."event_thresholds" (
  "tenant_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "direction" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("tenant_id", "event_type")
);`);

  return statements;
}
