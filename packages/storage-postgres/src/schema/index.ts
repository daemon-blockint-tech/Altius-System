/**
 * Schema management and DDL generation for PostgreSQL 17 + Apache AGE 1.5.
 *
 * Generates complete DDL from an OntologySchema:
 * - Object tables with system columns and property columns
 * - History tables for temporal queries
 * - Link tables with directional references
 * - Audit schema and tables
 * - Lineage (provenance) schema and tables
 */

import type { OntologySchema } from '@altius/spi';
import { generateObjectTableDDL } from './ddl-objects.js';
import { generateLinkTableDDL } from './ddl-links.js';
import { generateAuditDDL } from './ddl-audit.js';
import { generateConsentDDL } from './ddl-consent.js';
import { generateLineageDDL } from './ddl-lineage.js';
import { generateLLMDDL } from './ddl-llm.js';
import { generateEmbeddingsDDL } from './ddl-embeddings.js';
import { generatePlatformDDL } from './ddl-platform.js';

export { generateObjectTableDDL } from './ddl-objects.js';
export { generateLinkTableDDL } from './ddl-links.js';
export { generateAuditDDL } from './ddl-audit.js';
export { generateConsentDDL } from './ddl-consent.js';
export { generateLineageDDL } from './ddl-lineage.js';
export { generateLLMDDL } from './ddl-llm.js';
export { generateEmbeddingsDDL } from './ddl-embeddings.js';
export { generatePlatformDDL } from './ddl-platform.js';
export { pgType, pgIdent, snakeCase, pgIndexMethod } from './type-mapping.js';

/**
 * Options for DDL generation.
 */
export interface DDLGenerationOptions {
  /** Schema name for object and link tables. Default: 'public'. */
  dataSchema?: string;
  /** Whether to include audit DDL. Default: true. */
  includeAudit?: boolean;
  /** Whether to include lineage DDL. Default: true. */
  includeLineage?: boolean;
  /** Whether to include consent DDL. Default: true. */
  includeConsent?: boolean;
  /** Whether to include LLM governance DDL (usage, rate limits). Default: true. */
  includeLLM?: boolean;
  /** Whether to include embeddings DDL (pgvector). Default: true. */
  includeEmbeddings?: boolean;
  /** Whether to include platform store DDL (blob, timeseries, branch, comment, notification). Default: true. */
  includePlatform?: boolean;
}

/**
 * Generated DDL result, organized by category.
 */
export interface GeneratedDDL {
  /** DDL for object tables and their history tables. */
  objectTables: string[];
  /** DDL for link tables. */
  linkTables: string[];
  /** DDL for audit schema and tables. */
  audit: string[];
  /** DDL for consent schema and tables. */
  consent: string[];
  /** DDL for lineage schema and tables. */
  lineage: string[];
  /** DDL for LLM governance schema (usage records, rate limits). */
  llm: string[];
  /** DDL for embeddings schema (pgvector). */
  embeddings: string[];
  /** DDL for platform stores (blob, timeseries, branch, comment, notification). */
  platform: string[];
  /** All statements in execution order. */
  all: string[];
}

/**
 * Generate complete DDL for an OntologySchema.
 */
export function generateDDL(
  schema: OntologySchema,
  options: DDLGenerationOptions = {},
): GeneratedDDL {
  const {
    dataSchema = 'public',
    includeAudit = true,
    includeLineage = true,
    includeConsent = true,
    includeLLM = true,
    includeEmbeddings = true,
    includePlatform = true,
  } = options;

  const result: GeneratedDDL = {
    objectTables: [],
    linkTables: [],
    audit: [],
    consent: [],
    lineage: [],
    llm: [],
    embeddings: [],
    platform: [],
    all: [],
  };

  // pg_trgm backs the trigram GIN indexes emitted for FULLTEXT index
  // definitions (trusted extension since PG13 — no superuser needed).
  const hasFulltext = schema.objectTypes.some(
    ot => ot.indexes?.some(i => i.indexType === 'FULLTEXT'),
  );
  if (hasFulltext) {
    result.objectTables.push(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  }

  // Struct type names — used to map struct-typed properties to JSONB columns.
  const structTypeNames = new Set(schema.structTypeNames ?? []);

  // Object tables + history tables
  for (const objectType of schema.objectTypes) {
    result.objectTables.push(...generateObjectTableDDL(objectType, dataSchema, structTypeNames));
  }

  // Link tables
  for (const linkType of schema.linkTypes) {
    result.linkTables.push(...generateLinkTableDDL(linkType, dataSchema));
  }

  // Audit
  if (includeAudit) {
    result.audit.push(...generateAuditDDL());
  }

  // Consent
  if (includeConsent) {
    result.consent.push(...generateConsentDDL());
  }

  // Lineage
  if (includeLineage) {
    result.lineage.push(...generateLineageDDL());
  }

  // LLM governance (usage tracking + rate limiting)
  if (includeLLM) {
    result.llm.push(...generateLLMDDL());
  }

  // Embeddings (pgvector)
  if (includeEmbeddings) {
    result.embeddings.push(...generateEmbeddingsDDL());
  }

  // Platform stores (blob, timeseries, branch, comment, notification)
  if (includePlatform) {
    result.platform.push(...generatePlatformDDL());
  }

  // Combine all in execution order:
  // 1. Platform schemas first (schema + extension creation)
  //    - audit, consent, lineage, llm, embeddings, platform
  // 2. Object tables
  // 3. Link tables
  result.all = [
    ...result.audit,
    ...result.consent,
    ...result.lineage,
    ...result.llm,
    ...result.embeddings,
    ...result.platform,
    ...result.objectTables,
    ...result.linkTables,
  ];

  return result;
}
