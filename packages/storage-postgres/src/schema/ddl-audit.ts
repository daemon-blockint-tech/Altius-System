/**
 * DDL generation for audit schema.
 *
 * Creates a separate 'audit' schema with:
 * - audit_records table matching all AuditRecord fields
 * - Indexes for common query patterns
 */

/**
 * Generate DDL for the audit schema and tables.
 */
export function generateAuditDDL(): string[] {
  const statements: string[] = [];

  // Create audit schema
  statements.push(`CREATE SCHEMA IF NOT EXISTS "audit";`);

  // Audit records table
  // Maps to: AuditRecord { id, timestamp, traceId, actor, operation, detail }
  // Actor is flattened: actor_type, actor_id, actor_roles, actor_ip
  // Operation is flattened: op_type, op_object_type, op_object_id, op_action_type, op_action_id
  // Detail is stored as JSONB (variable structure with before/after snapshots)
  statements.push(`CREATE TABLE IF NOT EXISTS "audit"."audit_records" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "timestamp" TIMESTAMPTZ NOT NULL,
  "trace_id" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "actor_roles" TEXT[] NOT NULL DEFAULT '{}',
  "actor_ip" TEXT,
  "op_type" TEXT NOT NULL,
  "op_object_type" TEXT,
  "op_object_id" TEXT,
  "op_action_type" TEXT,
  "op_action_id" TEXT,
  "detail" JSONB NOT NULL DEFAULT '{}'
);`);

  // Index for time-range queries
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_audit_records_timestamp" ON "audit"."audit_records" ("timestamp");`
  );

  // Index for actor lookups
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_audit_records_actor" ON "audit"."audit_records" ("actor_id", "actor_type");`
  );

  // Index for trace correlation
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_audit_records_trace" ON "audit"."audit_records" ("trace_id");`
  );

  // Index for object-specific audit trail
  statements.push(
    `CREATE INDEX IF NOT EXISTS "idx_audit_records_object" ON "audit"."audit_records" ("op_object_type", "op_object_id");`
  );

  // Append-only enforcement at the database level. The application never
  // updates or deletes audit records; these triggers turn that convention
  // into a hard guarantee against application bugs and ad-hoc SQL.
  // (A table owner can still drop the trigger — this guards against
  // accident, not a malicious superuser.)
  statements.push(`CREATE OR REPLACE FUNCTION "audit".reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit.audit_records is append-only';
END;
$$ LANGUAGE plpgsql;`);
  statements.push(
    `CREATE OR REPLACE TRIGGER "audit_records_immutable_row" BEFORE UPDATE OR DELETE ON "audit"."audit_records" FOR EACH ROW EXECUTE FUNCTION "audit".reject_mutation();`
  );
  statements.push(
    `CREATE OR REPLACE TRIGGER "audit_records_immutable_stmt" BEFORE TRUNCATE ON "audit"."audit_records" FOR EACH STATEMENT EXECUTE FUNCTION "audit".reject_mutation();`
  );
  statements.push(
    `REVOKE UPDATE, DELETE, TRUNCATE ON "audit"."audit_records" FROM PUBLIC;`
  );

  return statements;
}
