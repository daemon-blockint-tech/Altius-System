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
  AggregateHaving,
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
export type { BlobStore, AttachmentRef, BlobPutResult, BlobContent, BlobMetadata } from './blob-store.js';

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
  AnomalyMethod,
  AnomalyDetectionConfig,
  AnomalyPoint,
  IntervalDetectionResult,
} from './alerting.js';
export {
  pointSatisfies,
  findConsecutiveRun,
  detectAnomalies,
  detectInterval,
} from './alerting.js';

// Governed LLM gateway
export type {
  LLMGateway,
  ModelCatalogEntry,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatCompletionStreamChunk,
  EmbeddingOptions,
  EmbeddingResult,
  EmbeddingVector,
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
  AccessExplanationField,
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

// Data-expectation evaluation, shared so two providers cannot disagree about
// whether a build gate passed.
export { evaluateDataExpectation } from './data-expectation-engine.js';

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

// Business rules engine — the DAG evaluator is shared by every provider, so
// two of them cannot store the same rule and disagree about what it produces.
export { executeBusinessRule, validateBusinessRule } from './business-rule-engine.js';
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

// Datasets: versioned tabular resources, transforms, projections, SQL, SDK, variable transforms
export type {
  DatasetService,
  Dataset,
  DatasetSchema,
  DatasetColumn,
  DatasetTransaction,
  CreateDatasetInput,
  WriteRowsInput,
  WriteResult,
  ReadOptions,
  ReadResult,
  DatasetBranch,
  BatchTransformService,
  BatchTransform,
  TransformBuild,
  CreateTransformInput,
  TransformExecutor,
  DatasetProjectionService,
  DatasetProjection,
  CreateProjectionInput,
  DatasetMetadataService,
  DatasetMetadata,
  SchemaRetrievalOptions,
  SqlQueryService,
  SqlQueryJob,
  SubmitSqlInput,
  TabularSdk,
  TabularReadBuilder,
  TabularWriteBuilder,
  VariableTransformService,
  TransformPipeline,
  TransformStep,
  TransformKind,
  CreateTransformPipelineInput,
} from './datasets.js';

// Dataset row semantics shared by every DatasetService implementation, so the
// in-memory and Postgres providers cannot drift on key derivation or filtering.
export {
  datasetRowKey,
  datasetRowMatches,
  datasetSortRows,
  datasetProjectColumns,
} from './dataset-rows.js';

// Shared DatasetService refusals, so a create/not-found means the same thing
// and carries the same status whichever provider is wired.
export {
  datasetAlreadyExistsError,
  datasetNotFoundError,
  datasetBranchExistsError,
  datasetBranchNotFoundError,
} from './dataset-contract.js';
export type { CodedError } from './dataset-contract.js';
// Cross-org ontology access is an authorization decision, so it is evaluated by
// one shared function rather than once per provider. Two providers that
// disagreed would mean one deployment granting access the other denies, with
// neither looking wrong from where it stands.
export { evaluateOntologyAccess } from './ontology-access.js';

// Enterprise connector catalog
export type {
  ConnectorCatalogService,
  VendorConnectorEntry,
  ConfiguredConnector,
  ConfigureConnectorInput,
  EnterpriseAuthScheme,
  AzureAdAuth,
  OAuth2AuthCodeAuth,
  ApiKeyAuth,
  ManagedIdentityAuth,
  EgressPolicy,
  CreateEgressPolicyInput,
  EgressValidationResult,
  ConnectorConfig,
} from './enterprise-connectors.js';

// Multi-ontology governance
export type {
  MultiOntologyGovernanceService,
  OntologySpace,
  CreateSpaceInput,
  OntologyEntity,
  CreateOntologyInput,
  SharingRule,
  CreateSharingRuleInput,
  OntologyAccessResult,
} from './multi-ontology.js';

// Marking policy — consolidated marking types (previously in multi-ontology.ts
// and security-governance.ts)
export type {
  MarkingRecord,
  CreateMarkingInput,
  MarkingPropagationRule,
  PropagatedMarkings,
} from './marking-policy.js';

// Backward-compatibility alias — MarkingDefinition was the old name for MarkingRecord
export type { MarkingRecord as MarkingDefinition } from './marking-policy.js';

// Time-aware graph analysis
export type {
  GraphAnalysisService,
  SavedAnalysis,
  CreateSavedAnalysisInput,
  UpdateSavedAnalysisInput,
  AnalysisTraversalStep,
  AnalysisFilter,
  AnalysisLayout,
  AnalysisTimeline,
  AnalysisVersion,
  TimelineSnapshot,
  TimelineComparison,
} from './graph-analysis.js';

// Value and conditional formatting — DELETED in §4D, folded into DisplayDirective
// (packages/odl/src/parser/types.ts) which now has formatKind, formatParams,
// and conditionalFormats fields.

// AI FDE agentic platform assistant
export type {
  PlatformAssistantService,
  AgentMode,
  AgentPlan,
  PlanStep,
  PlanStepResult,
  PlanExecutionResult,
  AgentSession,
  AgentMessage,
  AgentTool,
  ClarificationQuestion,
  StartSessionInput,
  SendMessageInput,
} from './platform-assistant.js';

// Data freshness
export type {
  DataFreshnessService,
  FreshnessRecord,
  FreshnessQuery,
  FreshnessSummary,
} from './data-freshness.js';

// Ontology change history
export type {
  OntologyChangeHistoryService,
  OntologyChangeRecord,
  OntologyChangeHistoryQuery,
  OntologyRestoreResult,
  OntologyChangeInput,
  OntologyChangeSave,
  OntologyChangeValidationResult,
  OntologyChangeApplyResult,
} from './ontology-change-history.js';

// Value and conditional formatting
export type {
  ValueFormattingService,
  FormatKind,
  FormatRule,
  ConditionalFormatRule,
  FormatValueInput,
  FormattedValue,
  FormatCollectionInput,
  FormatCollectionResult,
} from './value-formatting.js';

// Design system theming
export type {
  DesignSystemService,
  ColorPalette,
  TypographySettings,
  DesignSystemTheme,
  CreateThemeInput,
  SetModulePaletteInput,
} from './design-system.js';

// Geospatial maps
export type {
  GeospatialMapService,
  MapLayer,
  CreateMapLayerInput,
  MapLayerStyle,
  SavedMap,
  CreateSavedMapInput,
  MapViewport,
  MapAnnotation,
  CreateAnnotationInput,
  GeoShape,
  GeoPointValue,
  GeoBBox,
  GeoPolygonValue,
  GeoCircleValue,
  GeocodeResult,
  ReverseGeocodeResult,
  SpatialSearchResult,
  SearchAroundResult,
} from './geospatial-maps.js';

// Ontology SQL
export type {
  OntologySqlService,
  SavedSqlQuery,
  CreateSavedSqlQueryInput,
  SqlQueryParameter,
  OntologySqlResult,
  SqlExecutionOptions,
  SqlQueryExplanation,
} from './ontology-sql.js';

// Embedded copilots
export type {
  EmbeddedCopilotService,
  CopilotInstance,
  CreateCopilotInput,
  CopilotConversation,
  CopilotViewContext,
  CopilotMessage,
  CopilotActionSuggestion,
  CopilotAppContext,
  StartCopilotConversationInput,
  SendCopilotMessageInput,
} from './embedded-copilots.js';

// Embedding and cross-app
export type {
  EmbeddingService,
  RegisteredApp,
  RegisterAppInput,
  EmbeddingManifest,
  CrossAppCommand,
  SendCommandInput,
  AppPairing,
  CreateAppPairingInput,
} from './app-embedding.js';

// Layout and device capture
export type {
  LayoutDeviceCaptureService,
  UiStateEntry,
  SetUiStateInput,
  DeviceCapture,
  RecordCaptureInput,
  ResolvedDeepLink,
} from './layout-device-capture.js';

// Widget library — DELETED in §4C, consolidated onto workshop-platform.ts
// (WorkshopPlatformService already covers apps, templates, widgets, etc.)

// Platform resources
export type {
  PlatformResourceService,
  PlatformResource,
  CreateResourceInput,
  ResourceObjectLink,
  LinkResourceInput,
  UploadAndLinkResult,
  UploadAndLinkInput,
} from './platform-resources.js';

// Saved views
export type {
  SavedView,
  CreateSavedViewInput,
  SavedViewStore,
} from './saved-views.js';

// User directory
export type {
  DirectoryUser,
  ListUsersOptions,
  ListUsersResult,
  UserDirectoryService,
} from './user-directory.js';

// Ontology manager
export type {
  OntologyManagerService,
  OntologyTypeSummary,
  OntologyTypeDetail,
  OntologyPropertyDetail,
  OntologyLinkDetail,
  OntologyActionDetail,
  OntologyFunctionDetail,
  OntologyChangeProposal,
  CreateChangeProposalInput,
  TypeObservability,
  ActionObservability,
  FunctionObservability,
} from './ontology-manager.js';

// Workshop UX platform
export type {
  WorkshopUxService,
  SavedAppState,
  SaveAppStateInput,
  RedactModeConfig,
  UpdateRedactModeInput,
  PerformanceProfile,
  RecordProfileInput,
  TranslationEntry,
  SetTranslationInput,
  TranslationBundle,
} from './workshop-ux.js';

// Workshop platform
export type {
  WorkshopPlatformService,
  DragMediaType, DragEvent,
  WorkshopAppDefinition, WorkshopAppPage, WorkshopAppSection,
  WorkshopWidgetInstance, AppHeader, AppOverlay, AppTemplate,
  MobileAppConfig, MobileLaunchSession,
  AppModule, ModuleInterface, ModuleInstance,
  ReactiveVariable, VariableSource, VariableTransformation, VariableLineage,
  WidgetCatalogEntry,
  ObjectView, ObjectViewColumn, ObjectViewFilter, CreateObjectViewInput,
} from './workshop-platform.js';

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

// Workshop UI — Workshop UI hardening
export type {
  DeclaredCommand,
  DeclareCommandInput,
  CommandExecution,
  DragDropEvent,
  RecordDragDropInput,
  PairSyncEvent,
  RecordPairInput,
  CommandExchangeService,
} from './command-exchange.js';
export type {
  FilterChip,
  FilterState,
  SaveFilterStateInput,
  FilterSetOp,
  ObjectSetFilterStore,
} from './object-set-filter.js';
export type {
  GraphNode,
  GraphEdge,
  GraphLayout,
  GraphResult,
  SavedGraphView,
  BuildGraphInput,
  GraphService,
} from './graph-service.js';

// Ontology Schema — Ontology & schema tooling
export type {
  RichPropertyKind,
  PropertyRedactionConfig,
  PropertyConsentConfig,
  PropertyValidationRule,
  RichPropertyTypeInfo,
  FormValueSource,
  ActionFormField,
  ActionFormConfig,
  PropertyValidationResult,
} from './ontology.js';
export type {
  TransformFunction,
  TransformExpressionInput,
  TransformExpressionResult,
  TransformExpressionService,
} from './transform-expression.js';

// Pipeline Data Ops — Pipeline & Data Ops
export type {
  RulesEngineService,
  PipelineService,
  Pipeline,
  PipelineRun,
  CreatePipelineInput,
  SyncCdcService,
  CdcSyncJob,
  CdcCommit,
  DatasourceService,
  Datasource,
  PropertyColumnMapping,
  BuildTriggerService,
  BuildTriggerConfig,
  SqlAnalyticsService,
  SqlAnalyticsResult,
} from './pipeline-data-ops.js';

// AIP LLM — AIP/LLM Platform
export type {
  LLMGatewayService,
  AgentService,
  AgentDefinition,
  CreateAgentInput,
  AgentChatMessage,
  AgentChatThread,
  AgentTool as AipLlmAgentTool,
  AgentToolCall as AipLlmAgentToolCall,
  AgentPromptTemplate,
  AgentRunResult,
  AgentChatInput,
  ModelCatalogService,
  LlmApplication,
  CreateLlmApplicationInput,
  PromptPlaygroundInput,
  PromptPlaygroundResult,
  EvalService,
  EvalSuiteInput,
  HumanInTheLoopService,
  VectorSearchService,
  EmbeddingModel,
  GenerateEmbeddingInput,
  SemanticSearchInput,
  TokenMeteringService,
  CopilotService,
  CopilotSuggestInput,
  CopilotSuggestion,
  CopilotApplyInput,
  CopilotApplyResult,
} from './aip-llm.js';
