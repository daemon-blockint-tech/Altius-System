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
  statements.push(`CREATE TABLE IF NOT EXISTS "dataset"."rows" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "dataset_name" TEXT NOT NULL,
  "branch" TEXT NOT NULL DEFAULT 'main',
  "data" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_dataset_rows_tenant_name_branch" ON "dataset"."rows" ("tenant_id", "dataset_name", "branch");`);

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

  // ── Agent threads ──
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

  // ── Change proposals ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "change_proposals";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "change_proposals"."proposals" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "type" TEXT NOT NULL,
  "changes" JSONB NOT NULL DEFAULT '[]',
  "state" TEXT NOT NULL DEFAULT 'draft',
  "submitted_by" TEXT NOT NULL,
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
  "tags" TEXT[] NOT NULL DEFAULT '{}'
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_proposals_tenant_state" ON "change_proposals"."proposals" ("tenant_id", "state");`);

  // ── Saved views ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "saved_views";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "saved_views"."views" (
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
  "page_size" INTEGER,
  "widget_config" JSONB,
  "is_public" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_saved_views_tenant" ON "saved_views"."views" ("tenant_id");`);

  // ── Object set filter states ──
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

  // ── Approval workflows ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "approval_workflows";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "approval_workflows"."workflows" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "action_type" TEXT NOT NULL,
  "criteria" JSONB NOT NULL DEFAULT '[]',
  "approver_attributes" JSONB NOT NULL DEFAULT '[]',
  "multi_step" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE
);`);
  statements.push(`CREATE TABLE IF NOT EXISTS "approval_workflows"."submissions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "action_type" TEXT NOT NULL,
  "parameters" JSONB NOT NULL DEFAULT '{}',
  "submitter_attributes" JSONB NOT NULL DEFAULT '{}',
  "resource_attributes" JSONB NOT NULL DEFAULT '{}',
  "risk_level" TEXT NOT NULL DEFAULT 'low',
  "state" TEXT NOT NULL DEFAULT 'pending',
  "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "decided_at" TIMESTAMPTZ,
  "submitted_by" TEXT NOT NULL,
  "decided_by" TEXT,
  "decision_notes" TEXT,
  "criteria_passed" BOOLEAN NOT NULL DEFAULT FALSE,
  "criteria_details" JSONB NOT NULL DEFAULT '[]'
);`);
  statements.push(`CREATE INDEX IF NOT EXISTS "idx_aw_sub_tenant_state" ON "approval_workflows"."submissions" ("tenant_id", "state");`);

  // ── Data expectations ──
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

  // ── Design system themes ──
  statements.push(`CREATE SCHEMA IF NOT EXISTS "design_system";`);
  statements.push(`CREATE TABLE IF NOT EXISTS "design_system"."themes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "dark_mode" BOOLEAN NOT NULL DEFAULT FALSE,
  "density" TEXT NOT NULL DEFAULT 'comfortable',
  "palette" JSONB NOT NULL DEFAULT '{}',
  "typography" JSONB NOT NULL DEFAULT '{}',
  "module_palettes" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by" TEXT NOT NULL DEFAULT ''
);`);

  // ── Model registry ──
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

  // ── Connector catalog ──
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
  "UNIQUE ("tenant_id", "instance_name")
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

  // ── Commands ──
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

  return statements;
}
