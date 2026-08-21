/**
 * @altius/storage-postgres
 *
 * PostgreSQL 17 + Apache AGE 1.5 storage provider for Altius.
 * Provides schema management, DDL generation, object CRUD, and transactions.
 */

// ─── StorageProvider implementation ───
export { PostgresStorageProvider } from './postgres-storage-provider.js';
export type { PostgresStorageConfig } from './postgres-storage-provider.js';

// ─── Schema / DDL ───
export {
  generateDDL,
  generateObjectTableDDL,
  generateLinkTableDDL,
  generateAuditDDL,
  generateConsentDDL,
  generateLineageDDL,
  pgType,
  pgIdent,
  snakeCase,
  pgIndexMethod,
} from './schema/index.js';

export type {
  DDLGenerationOptions,
  GeneratedDDL,
} from './schema/index.js';

// ─── Object CRUD ───
export {
  createObject,
  getObject,
  updateObject,
  softDeleteObject,
  hardDeleteObject,
  queryObjects,
  filterToSql,
} from './objects/index.js';

export type { SqlFragment } from './objects/index.js';

// ─── Link CRUD ───
export {
  createLink,
  getLink,
  updateLink,
  deleteLink,
  getLinks,
  traverse,
} from './links/index.js';

// ─── Temporal ───
export {
  getObjectAtVersion,
  getObjectAtTime,
} from './temporal/index.js';

// ─── Audit ───
export { PostgresAuditStore } from './audit/postgres-audit-store.js';
export type { AuditQueryFilter as PostgresAuditQueryFilter } from './audit/postgres-audit-store.js';

// ─── Consent ───
export { PostgresConsentStore } from './consent/postgres-consent-store.js';
export type { ConsentStoreInterface } from './consent/postgres-consent-store.js';

// ─── Schema Registry (persistent ODL SchemaRegistry) ───
export { PostgresSchemaRegistry } from './schema-registry/postgres-schema-registry.js';

// ─── Object Sets (persistent ObjectSetStore) ───
export { PostgresObjectSetStore } from './object-sets/postgres-object-set-store.js';

// ─── Transactions ───
export { PgTransaction, resolveQueryable } from './transactions/index.js';
export type { Queryable } from './transactions/index.js';

// ─── Retry ───
export { withRetry } from './retry.js';
export type { RetryOptions } from './retry.js';

export { PostgresLineageStore } from './lineage/postgres-lineage-store.js';

// ─── LLM governance (usage tracking + rate limiting) ───
export { PostgresLLMUsageTracker } from './llm/postgres-llm-usage-tracker.js';
export { PostgresLLMRateLimiter } from './llm/postgres-llm-rate-limiter.js';
export { generateLLMDDL } from './schema/ddl-llm.js';

// ─── Embeddings (pgvector) ───
export { PostgresEmbeddingStore } from './embeddings/postgres-embedding-store.js';
export { generateEmbeddingsDDL } from './schema/ddl-embeddings.js';

// ─── Platform stores (blob, time-series, branch, comment, notification) ───
export { PostgresBlobStore } from './blob/postgres-blob-store.js';
export { PostgresTimeSeriesStore } from './timeseries/postgres-time-series-store.js';
export { PostgresBranchStore } from './branch/postgres-branch-store.js';
export { PostgresCommentStore } from './comment/postgres-comment-store.js';
export { PostgresNotificationStore } from './notification/postgres-notification-store.js';
export { PostgresChangeProposalStore } from './governance/postgres-change-proposal-store.js';
export { PostgresMultiOntologyGovernanceService } from './governance/postgres-multi-ontology-governance-service.js';
export { PostgresHumanInTheLoopService } from './governance/postgres-human-in-the-loop-service.js';
export { PostgresApprovalWorkflowService } from './governance/postgres-approval-workflow-service.js';
export { PostgresBusinessRulesService } from './governance/postgres-business-rules-service.js';
export { PostgresKioskService } from './governance/postgres-kiosk-service.js';
export { PostgresSavedViewStore } from './governance/postgres-saved-view-store.js';
export { PostgresUserDirectoryService } from './governance/postgres-user-directory-service.js';
export { PostgresDesignSystemService } from './governance/postgres-design-system-service.js';
export { PostgresLayoutDeviceCaptureService } from './governance/postgres-layout-device-capture-service.js';
export { PostgresConflictResolutionService } from './sync/postgres-conflict-resolution-service.js';
export { PostgresWorkshopUxService } from './governance/postgres-workshop-ux-service.js';
export { PostgresDatasetService } from './dataset/postgres-dataset-service.js';
export { PostgresSqlQueryService } from './dataset/postgres-sql-query-service.js';
export { generatePlatformDDL } from './schema/ddl-platform.js';
export {
  PostgresAlertingService,
  PostgresDataFreshnessService,
  PostgresDatasetMetadataService,
  PostgresGeospatialMapService,
  PostgresJustificationStore,
  PostgresOntologySqlService,
  PostgresOntologyUsageMetricsService,
  PostgresScopedSessionStore,
} from './postgres-platform-stores.js';
export {
  PostgresAgentThreadStore,
  PostgresObjectSetFilterStore,
  PostgresDataExpectationsService,
  PostgresModelRegistryService,
  PostgresModelInferenceService,
  PostgresModelChainService,
  PostgresConnectorCatalogService,
  PostgresCommandService,
} from './postgres-platform-stores-batch2.js';
