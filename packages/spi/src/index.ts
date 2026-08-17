/**
 * @altius/spi - Storage Provider Interface
 *
 * Core type definitions for the Altius platform.
 * This package defines the contracts that all storage providers,
 * consent managers, and platform components implement.
 */

// Scalar types
export type { DateTime, Duration } from './scalars.js';

// Error model (Section 8.8)
export type { ErrorCategory, ErrorCode, PlatformError } from './errors.js';

// Core ontology types (Section 3.2)
export type {
  OntologyObject,
  OntologyLink,
  FilterExpression,
  FieldPredicate,
  GeoBoundingBox,
  LogicalPredicate,
  TraversalPath,
  TraversalStep,
  TraversalOptions,
  QueryOptions,
  RequestContext,
  BulkMutationRequest,
  BulkOperation,
  BulkMutationResult,
  BulkMutationError,
  ObjectPage,
  LinkPage,
  TraversalResult,
  OntologySchema,
  ObjectTypeDefinition,
  LinkTypeDefinition,
  PropertyDefinition,
  IndexDefinition,
  IndexType,
  MigrationResult,
  HealthStatus,
  ReplicationCapability,
  StorageCapabilities,
  AggregateFunction,
  AggregateField,
  AggregateQuery,
  AggregateGroup,
  AggregateResult,
  BucketInterval,
  DateBucket,
  NumericBucket,
  SearchQuery,
  SearchHit,
  SearchResult,
} from './ontology.js';

// Link paging bounds — values, not types: both providers must enforce the same
// ceiling and the same default, so the numbers live in the contract.
export { MAX_LINK_QUERY_LIMIT, DEFAULT_LINK_QUERY_LIMIT, encodePageCursor, decodePageCursor } from './ontology.js';

// Transaction (Section 3.4)
export type { Transaction } from './transaction.js';

// Storage Provider (Section 3.1)
export type { StorageProvider } from './storage-provider.js';

// Blob Store (media/attachment properties)
export type { BlobStore, AttachmentRef, BlobPutResult, BlobContent } from './blob-store.js';

// LLM Client (Section AIP)
export type {
  LLMClient,
  LLMCompleteOptions,
  LLMResponse,
  LLMEmbedOptions,
  LLMEmbedResult,
  VectorSearchOptions,
  VectorSearchHit,
  VectorSearchResult,
  LLMSchema,
} from './llm-client.js';

// CloudEvents (Section 4.2)
export type { CloudEvent, CloudEventType } from './events.js';

// Audit (Section 7.2)
export type {
  AuditRecord,
  AuditActor,
  AuditOperation,
  AuditDetail,
  AuditStore,
  AuditFilter,
  AuditQueryOptions,
  AuditPage,
} from './audit.js';

// Field provenance (Section 4.6)
export type { FieldProvenance, ProvenanceSource } from './provenance.js';

// Consent (Section 7.3)
export { DataPurpose, STANDARD_DATA_PURPOSES, resolveConsentPurpose } from './consent.js';
export type {
  ConsentDecision,
  ConsentManager,
  ConsentRecord,
  FieldRestriction,
  RevocationResult,
} from './consent.js';

// Backup/Restore (Section 3.9)
export type {
  BackupCapability,
  BackupOptions,
  BackupFilter,
  BackupHandle,
  RestoreOptions,
  RestoreResult,
} from './backup.js';

// Object Sets (Section 8.3)
export type {
  ObjectSetDefinition,
  ObjectSetStore,
  SetAlgebraOp,
  SetAlgebraInput,
} from './object-set.js';

export { stepDepth, totalHops } from './traversal-depth.js';

// Agent threads (durable conversation persistence)
export type {
  MessageRole,
  ThreadMessage,
  AgentThread,
  AgentThreadStore,
} from './agent-threads.js';
export { parseSearchQuery } from './search-query-parser.js';
export type { ParsedSearchQuery, SearchTerm } from './search-query-parser.js';
