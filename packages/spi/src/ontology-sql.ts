/**
 * Ad-hoc SQL analytics over the ontology — SQL Studio / Ontology SQL.
 *
 * Translates SQL queries over object types into ontology reads,
 * supporting joins, aggregations, and saved queries.
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// SQL query types
// ===========================================================================

/** A saved SQL query. */
export interface SavedSqlQuery {
  id: string;
  tenantId: string;
  /** Query name. */
  name: string;
  description: string;
  /** The SQL statement. */
  sql: string;
  /** Object types referenced in the query (auto-detected). */
  objectTypes: string[];
  /** Whether the query is parameterized. */
  parameterized: boolean;
  /** Parameter definitions (if parameterized). */
  parameters?: SqlQueryParameter[];
  /** Owner user ID. */
  ownerId: string;
  /** Shared with user IDs. */
  sharedWith: string[];
  /** Whether the query is public within the tenant. */
  isPublic: boolean;
  /** Tags. */
  tags: string[];
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** A parameter for a SQL query. */
export interface SqlQueryParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

/** Input for creating a saved SQL query. */
export interface CreateSavedSqlQueryInput {
  name: string;
  description?: string;
  sql: string;
  isPublic?: boolean;
  tags?: string[];
}

// ===========================================================================
// Query execution
// ===========================================================================

/** Result of executing a SQL query over the ontology. */
export interface OntologySqlResult {
  /** Column names. */
  columns: Array<{ name: string; type: string }>;
  /** Result rows. */
  rows: Record<string, unknown>[][];
  /** Total row count (before LIMIT). */
  totalRowCount: number;
  /** Whether results were truncated. */
  truncated: boolean;
  /** Execution time in ms. */
  executionTimeMs: number;
  /** Object types that were accessed. */
  accessedObjectTypes: string[];
}

/** Options for executing a SQL query. */
export interface SqlExecutionOptions {
  /** Max rows to return. Default: 1000. */
  limit?: number;
  /** Timeout in ms. Default: 30000. */
  timeoutMs?: number;
  /** Parameter values (for parameterized queries). */
  parameters?: Record<string, unknown>;
}

// ===========================================================================
// Query explanation
// ===========================================================================

/** An explanation of how a SQL query will be executed over the ontology. */
export interface SqlQueryExplanation {
  /** The parsed SQL AST (simplified). */
  parsed: {
    select: string[];
    from: string[];
    joins: Array<{ type: string; table: string; on: string }>;
    where?: string;
    groupBy?: string[];
    orderBy?: Array<{ field: string; direction: 'ASC' | 'DESC' }>;
    limit?: number;
  };
  /** Object types that will be accessed. */
  objectTypes: string[];
  /** Estimated row count. */
  estimatedRows: number;
  /** Whether the query requires a full scan. */
  fullScan: boolean;
  /** Warnings about the query. */
  warnings: string[];
}

// ===========================================================================
// Ontology SQL service
// ===========================================================================

/**
 * Ad-hoc SQL analytics over the ontology — translates SQL queries over
 * object types into ontology reads, with saved queries and explanation.
 */
export interface OntologySqlService {
  // ── Query execution ──
  /** Execute a SQL query over the ontology. */
  execute(ctx: RequestContext, sql: string, options?: SqlExecutionOptions): Promise<OntologySqlResult>;
  /** Explain how a SQL query will be executed. */
  explain(ctx: RequestContext, sql: string): Promise<SqlQueryExplanation>;
  /** Validate a SQL query without executing it. */
  validate(ctx: RequestContext, sql: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;

  // ── Saved queries ──
  createSavedQuery(ctx: RequestContext, input: CreateSavedSqlQueryInput): Promise<SavedSqlQuery>;
  getSavedQuery(ctx: RequestContext, id: string): Promise<SavedSqlQuery | null>;
  listSavedQueries(ctx: RequestContext, tags?: string[]): Promise<SavedSqlQuery[]>;
  updateSavedQuery(ctx: RequestContext, id: string, updates: Partial<CreateSavedSqlQueryInput>): Promise<SavedSqlQuery>;
  deleteSavedQuery(ctx: RequestContext, id: string): Promise<void>;
  shareSavedQuery(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedSqlQuery>;
  /** Execute a saved query by ID. */
  executeSavedQuery(ctx: RequestContext, id: string, options?: SqlExecutionOptions): Promise<OntologySqlResult>;

  // ── Schema discovery ──
  /** List object types available for SQL queries (as virtual tables). */
  listVirtualTables(ctx: RequestContext): Promise<Array<{ name: string; columns: Array<{ name: string; type: string }> }>>;
  /** Get the virtual table schema for an object type. */
  describeVirtualTable(ctx: RequestContext, objectType: string): Promise<{ name: string; columns: Array<{ name: string; type: string }> } | null>;
}
