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
  GeoRadiusFilter,
  GeoPolygonFilter,
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

// Time Series Store (time-series properties)
export type {
  TimeSeriesStore,
  TimeSeriesPoint,
  TimeSeriesQuery,
  TimeSeriesBucket,
  TimeSeriesBucketPoint,
  TimeSeriesResult,
} from './time-series.js';

// Branching (ontology branches, proposals, merge)
export type {
  BranchStore,
  Branch,
  MergeProposal,
  MergeResult,
} from './branching.js';

// Comments and collaboration
export type {
  CommentStore,
  Comment,
  CommentQuery,
  CommentListResult,
  CommentNotification,
} from './comments.js';
export { parseMentions } from './comments.js';

// Platform notifications
export type {
  NotificationStore,
  PlatformNotification,
  NotificationPreferences,
  NotificationType,
  NotificationChannel,
  NotificationQuery,
} from './notifications.js';

// Embeddings and vector search
export type {
  EmbeddingStore,
  StoredEmbedding,
  CreateEmbeddingInput,
  EmbeddingSearchOptions,
  EmbeddingSearchHit,
  EmbeddingSearchResult,
} from './embeddings.js';
export { cosineSimilarity } from './embeddings.js';

// Time-series rules and alerting
export type {
  AlertingService,
  ThresholdRule,
  CreateThresholdRuleInput,
  Alert,
  AlertQuery,
  RuleEvaluationResult,
  ThresholdOperator,
} from './alerting.js';
export { pointSatisfies, findConsecutiveRun } from './alerting.js';

// Governed LLM gateway
export type {
  LLMGateway,
  ModelCatalogEntry,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResponse,
  LLMUsageRecord,
  UsageQuery,
  UsageSummary,
  LLMUsageTracker,
  RateLimitConfig,
  RateLimitResult,
  LLMRateLimiter,
} from './llm-gateway.js';
export { DEFAULT_RATE_LIMIT } from './llm-gateway.js';

// Security governance
export type {
  JustificationStore,
  JustificationRecord,
  CreateJustificationInput,
  JustificationQuery,
  AccessExplanationService,
  AccessExplanation,
  AccessExplanationReason,
  MarkingPropagationService,
  MarkingPropagationRule,
  PropagatedMarkings,
  ScopedSessionStore,
  ScopedSession,
  CreateScopedSessionInput,
} from './security-governance.js';

// Ontology usage metrics
export type {
  OntologyUsageMetricsService,
  OntologyUsageEvent,
  OntologyOperationType,
  ObjectTypeMetrics,
  ActionFunctionMetrics,
  OntologyUsageSummary,
  UsageMetricsQuery,
  UsageMonitoringRule,
  MonitoringRuleResult,
} from './usage-metrics.js';

// Time-series transforms
export type { SeriesSummary } from './ts-transforms.js';
export {
  resample,
  rollingAggregate,
  lag,
  diff,
  forwardFill,
  linearInterpolate,
  exponentialSmoothing,
  addSeries,
  subtractSeries,
  multiplySeries,
  divideSeries,
  summarize,
} from './ts-transforms.js';

// Change proposals (HITL)
export type {
  ChangeProposalStore,
  ChangeProposal,
  ProposalType,
  ProposalState,
  ProposalChange,
  CreateProposalInput,
  UpdateProposalInput,
  ProposalQuery,
} from './change-proposals.js';

// ML model registry, lifecycle, and inference
export type {
  ModelRegistryService,
  ModelInferenceService,
  ModelChainService,
  ModelingObjectiveService,
  ModelArtifact,
  ModelAdapter,
  ModelSource,
  ModelLifecycleState,
  ModelQuery,
  CreateModelInput,
  ModelDeployment,
  InferenceInput,
  InferenceResult,
  InferenceHistoryRecord,
  ModelChain,
  ModelChainStep,
  ModelChainResult,
  ModelingObjective,
} from './model-registry.js';

// Scenario simulation
export type {
  ScenarioService,
  Scenario,
  ScenarioResult,
  CreateScenarioInput,
  ScenarioQuery,
} from './scenarios.js';

// Data pipelines: quality, conflict resolution, build orchestration
export type {
  DataExpectationsService,
  DataExpectation,
  ExpectationType,
  ExpectationResult,
  CreateExpectationInput,
  ConflictResolutionService,
  DataConflict,
  ConflictStrategy,
  PipelineBuildService,
  PipelineBuild,
  BuildState,
  BuildTrigger,
  PipelineSchedule,
  CreateScheduleInput,
} from './data-pipelines.js';

// Process mining and event objects
export type {
  EventObjectService,
  ProcessMiningService,
  EventObject,
  CreateEventInput,
  EventQuery,
  ProcessModel,
  ProcessNode,
  ProcessEdge,
  ProcessVariant,
  ConformanceResult,
} from './process-mining.js';

// Business rules engine
export type {
  BusinessRulesService,
  BusinessRule,
  RuleNode,
  RuleNodeType,
  FilterCondition,
  ConditionOperator,
  JoinType,
  WindowType,
  RuleExecutionResult,
  CreateRuleInput,
} from './business-rules.js';

// Agent evaluation framework
export type {
  AgentEvaluationService,
  AgentExecutor,
  EvalSuite,
  EvalTestCase,
  EvalMetric,
  MetricType,
  TestCaseResult,
  EvalRunResult,
  CreateEvalSuiteInput,
} from './agent-evaluation.js';

// Platform governance: ABAC approvals, cross-app commands, kiosk mode
export type {
  ApprovalWorkflowService,
  CommandService,
  KioskService,
  ApprovalWorkflow,
  SubmissionCriterion,
  AttributeCondition,
  ApprovalSubmission,
  AppCommand,
  CommandChain,
  CommandChainResult,
  KioskSession,
  CreateKioskInput,
} from './platform-governance.js';

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
