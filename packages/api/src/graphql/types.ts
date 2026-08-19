import type { ObjectManager, LinkManager, ObjectSetManager, FunctionExecutor, FunctionRegistry, WorkflowGraphBuilder, WorkflowMonitor } from '@altius/engine';
import type { FunctionAuthzMapping } from '@altius/odl';
import type { ActionExecutor, ActionManifest } from '@altius/actions';
import type {
  AuthorizationService,
  OidcAuthenticator,
  ConsentService,
  AuditWriter,
  AuditStore,
  MarkingPolicy,
} from '@altius/security';
import type { ParsedSchema } from '@altius/odl';
import type { RequestContext, StorageProvider, LLMClient, BlobStore, TimeSeriesStore, BranchStore, CommentStore, NotificationStore, EmbeddingStore, AlertingService, LLMGateway, DataFreshnessService, JustificationStore, AccessExplanationService, ScopedSessionStore, OntologySqlService, DatasetService, DatasetMetadataService, OntologyUsageMetricsService, GeospatialMapService, ScenarioService, ModelInferenceService, ModelChainService, WorkshopPlatformService, EmbeddingService, PlatformResourceService, SavedViewStore, UserDirectoryService, KioskService, LayoutDeviceCaptureService, OntologyManagerService, WorkshopUxService, ValueFormattingService, DesignSystemService, OntologyChangeHistoryService, CommandExchangeService, ObjectSetFilterStore, GraphService, ChangeProposalStore, BusinessRulesService, AgentEvaluationService, AgentThreadStore, ConflictResolutionService, ConnectorCatalogService, DataExpectationsService, EmbeddedCopilotService, EventObjectService, GraphAnalysisService, MultiOntologyGovernanceService, PipelineBuildService, PlatformAssistantService, ProcessMiningService } from '@altius/spi';
import { DataPurpose } from '@altius/spi';

/**
 * Registry that resolves action names to parsed YAML manifests.
 * Loaded at startup from domain-pack action files.
 */
export interface ManifestRegistry {
  get(actionName: string): ActionManifest | undefined;
}

/**
 * Dependencies injected into the GraphQL API layer.
 */
export interface ApiDependencies {
  schema: ParsedSchema;
  objectManager: ObjectManager;
  linkManager: LinkManager;
  actionExecutor: ActionExecutor;
  authorizationService: AuthorizationService;
  authenticator: OidcAuthenticator;
  consentService?: ConsentService;
  /** Mandatory marking policy; absent means no markings are configured. */
  markingPolicy?: MarkingPolicy;
  /**
   * Live-subscription registry, so consent revocation can close the streams
   * about the revoking subject. Absent means revocation still takes effect —
   * the per-event consent gate withholds their events either way — but the
   * client is not told.
   */
  subscriptionRegistry?: { register(sub: { tenantId: string; subjectId: string | null; terminate: () => void }): () => void; terminateForSubject(tenantId: string, subjectId: string): number };
  auditWriter?: AuditWriter;
  /**
   * Read-side audit store. When present, the REST /api/v1/audit route queries
   * it with the caller's tenantId enforced — a deployment without audit reads
   * simply omits the dependency and the route is not registered.
   */
  auditStore?: AuditStore;
  storage: StorageProvider;
  manifestRegistry?: ManifestRegistry;
  objectSetManager?: ObjectSetManager;
  /**
   * Function executor for FunctionType invocations (Section 6 — Functions).
   * When present, the GraphQL schema's `${name}Function` mutation fields
   * resolve through this executor. Absent → function mutations are not
   * registered (the SDL still declares them, but resolution errors).
   */
  functionExecutor?: FunctionExecutor;
  /**
   * Allowlist of directly-grantable `[user]` relations per object type (snake),
   * derived from the merged FGA model. Powers the relationship grant/revoke
   * API (REST + GraphQL). Absent → the grant surface rejects everything.
   */
  grantAllowlist?: Map<string, Set<string>>;
  /**
   * Platform roles permitted to grant/revoke relationships. Deployment policy
   * (env RELATIONSHIP_GRANTER_ROLES). Absent → generic default (`admin`). NHS
   * deployments add clinical roles (e.g. nurse_in_charge) via config.
   */
  granterRoles?: readonly string[];
  /**
   * Platform roles permitted to record consent decisions. Deployment policy
   * (env CONSENT_RECORDER_ROLES). Absent → generic default (`admin`).
   */
  consentRecorderRoles?: readonly string[];
  /**
   * Roles allowed to read the audit trail over HTTP.
   *
   * Unset falls back to DEFAULT_AUDIT_READER_ROLES; an empty array denies
   * everyone. See rest/audit-routes.ts.
   */
  auditReaderRoles?: readonly string[];
  /**
   * Roles allowed to explain another principal's access via
   * POST /api/v1/security/explain with `subjectUserId`. Defaults to ['admin'].
   * An explicitly empty array disables simulation entirely.
   */
  accessExplanationSimulationRoles?: readonly string[];
  /**
   * Allowed consent-purpose vocabulary for this deployment (env CONSENT_PURPOSES).
   * `DataPurpose` is an open string type; this is the set accepted when recording
   * consent. Absent → the standard NHS/UK-IG preset (back-compat). A non-NHS
   * deployment sets its own (e.g. `KYC,AML_MONITORING`).
   */
  consentPurposes?: readonly string[];
  /**
   * Object types that act as an action's consent subject when present as a
   * `@param` (env CONSENT_SUBJECT_TYPES). Absent → `['Patient']` (back-compat).
   * A non-NHS deployment sets its own subject type(s), e.g. `Customer`.
   */
  consentSubjectTypes?: readonly string[];
  /**
   * Whether the FDP/CDM projection surface (REST `/api/v1/cdm/*` + the GraphQL
   * cdm* queries) is enabled — true only when a loaded pack declares the `cdm`
   * capability. `false` omits the CDM resolvers (and the server omits the SDL
   * fields + REST mount), so non-NHS deployments expose no CDM surface.
   * Absent/undefined is treated as enabled (back-compat for tests/spec dumps).
   */
  cdmEnabled?: boolean;
  /**
   * LLM client for AIP/generation endpoints (POST /api/v1/llm/generate,
   * POST /api/v1/llm/embed, GraphQL generate/embed mutations). When absent,
   * the endpoints return a "not configured" error. Deployments inject a
   * provider-specific client (OpenAI, Anthropic, local model).
   */
  llmClient?: LLMClient;
  /**
   * Function registry for user-authored function lifecycle management
   * (draft → publish → deprecate, test execution, rollback).
   * When present, REST /api/v1/functions-lifecycle/* and GraphQL
   * functionRevision/functionRevisions/publishFunctionRevision/
   * testFunctionRevision/rollbackFunction mutations are registered.
   */
  functionRegistry?: FunctionRegistry;
  /**
   * Per-function ReBAC authorization mappings, derived from the ODL schema.
   * Maps function name → FGA relation + object type + objectIdParam.
   * When present, invokeFunction checks the relation on the target object
   * BEFORE the role-membership gate, so a function with an ObjectType @param
   * is authorized per-object (like actions) rather than by role alone.
   */
  functionAuthzMappings?: Map<string, FunctionAuthzMapping>;
  /**
   * Workflow graph builder for the provenance visualization surface
   * (GET /api/v1/workflow/graph, GraphQL workflowGraph query). When absent,
   * the workflow graph endpoints are not registered. Requires both an
   * auditStore and a lineage store to be useful.
   */
  workflowGraphBuilder?: WorkflowGraphBuilder;
  /**
   * Workflow monitor for the workflow event log and metrics surface
   * (GET /api/v1/workflow/events, GET /api/v1/workflow/workflows/:id,
   * GraphQL workflowEvents/workflowLog queries). When absent, the workflow
   * monitoring endpoints are not registered.
   */
  workflowMonitor?: WorkflowMonitor;
  /**
   * Blob store for media/attachment properties. When present, the REST
   * upload/download endpoints are registered:
   *   POST   /api/v1/attachments         (multipart upload)
   *   GET    /api/v1/attachments/:blobId (download)
   *   DELETE /api/v1/attachments/:blobId (delete)
   * Absent → attachment endpoints are not registered and Attachment
   * properties cannot be written with actual blob content.
   */
  blobStore?: BlobStore;
  /**
   * Time-series store for @timeSeries properties. When present, REST
   * endpoints for reading/writing time-series data are registered:
   *   GET    /api/v1/{plural}/:id/series/:property
   *   POST   /api/v1/{plural}/:id/series/:property
   *   DELETE /api/v1/{plural}/:id/series/:property
   * Absent → time-series endpoints are not registered.
   */
  timeSeriesStore?: TimeSeriesStore;
  /**
   * Branch store for ontology branching. When present, REST endpoints
   * for branch management and merge proposals are registered:
   *   GET/POST /api/v1/branches
   *   GET/DELETE /api/v1/branches/:name
   *   POST /api/v1/branches/:name/merge
   *   GET/POST /api/v1/proposals
   *   POST /api/v1/proposals/:id/submit|approve|reject
   */
  branchStore?: BranchStore;
  /**
   * Comment store for threads and @-mentions on ontology objects.
   * When present, REST endpoints for comments and notifications are
   * registered:
   *   GET/POST /api/v1/{plural}/:id/comments
   *   PUT/DELETE /api/v1/comments/:commentId
   *   POST /api/v1/comments/:commentId/resolve|unresolve
   *   GET /api/v1/notifications
   *   POST /api/v1/notifications/:id/read
   */
  commentStore?: CommentStore;
  /**
   * Platform notification store. When present, REST endpoints for
   * notifications and user preferences are registered:
   *   GET    /api/v1/notifications
   *   POST   /api/v1/notifications/:id/read
   *   POST   /api/v1/notifications/read-all
   *   DELETE /api/v1/notifications/:id
   *   GET/PUT /api/v1/notifications/preferences
   */
  notificationStore?: NotificationStore;
  /**
   * Embedding store for vector similarity search. When present, REST
   * endpoints for embedding upsert/search are registered:
   *   PUT    /api/v1/embeddings/:type/:id/:field
   *   GET    /api/v1/embeddings/:type/:id/:field
   *   DELETE /api/v1/embeddings/:type/:id/:field
   *   POST   /api/v1/embeddings/:type/:field/search
   */
  embeddingStore?: EmbeddingStore;
  /**
   * Alerting service for time-series threshold rules. When present, REST
   * endpoints for rule and alert management are registered:
   *   POST   /api/v1/alerting/rules
   *   GET    /api/v1/alerting/rules
   *   GET    /api/v1/alerting/rules/:id
   *   PATCH  /api/v1/alerting/rules/:id
   *   DELETE /api/v1/alerting/rules/:id
   *   GET    /api/v1/alerting/alerts
   *   POST   /api/v1/alerting/alerts/:id/acknowledge
   *   POST   /api/v1/alerting/alerts/:id/resolve
   *   POST   /api/v1/alerting/evaluate
   */
  alertingService?: AlertingService;
  /**
   * Governed LLM gateway. When present, OpenAI-compatible chat completions
   * and model catalog endpoints are registered:
   *   GET  /api/v1/llm/models
   *   POST /api/v1/llm/chat/completions
   *   GET  /api/v1/llm/usage
   *   GET  /api/v1/llm/usage/summary
   *   GET/PUT /api/v1/llm/rate-limits
   */
  llmGateway?: LLMGateway;
  /**
   * Geospatial map service — map layers, saved maps, annotations,
   * spatial search, geocoding, and geometry helpers. When present,
   * REST endpoints for map operations are registered:
   *   POST   /api/v1/geo/layers
   *   GET    /api/v1/geo/layers
   *   GET    /api/v1/geo/layers/:id
   *   PATCH  /api/v1/geo/layers/:id
   *   DELETE /api/v1/geo/layers/:id
   *   POST   /api/v1/geo/maps
   *   GET    /api/v1/geo/maps
   *   GET    /api/v1/geo/maps/:id
   *   PATCH  /api/v1/geo/maps/:id
   *   DELETE /api/v1/geo/maps/:id
   *   POST   /api/v1/geo/maps/:id/share
   *   POST   /api/v1/geo/annotations
   *   GET    /api/v1/geo/annotations
   *   DELETE /api/v1/geo/annotations/:id
   *   POST   /api/v1/geo/search/intersect
   *   POST   /api/v1/geo/search/around
   *   POST   /api/v1/geo/search/bbox
   *   GET    /api/v1/geo/geocode?q=...
   *   GET    /api/v1/geo/reverse-geocode?lat=...&lng=...
   *   POST   /api/v1/geo/geometry/buffer
   *   POST   /api/v1/geo/geometry/area
   *   POST   /api/v1/geo/geometry/distance
   *   POST   /api/v1/geo/geometry/contains
   */
  geospatialMapService?: GeospatialMapService;
  /**
   * Model inference service — executes ML model inference. Required by
   * the scenario service for running what-if scenarios against models.
   */
  modelInferenceService?: ModelInferenceService;
  /**
   * Model chain service — executes chained model orchestration. Required
   * by the scenario service for running what-if scenarios against chains.
   */
  modelChainService?: ModelChainService;
  /**
   * Scenario simulation service — manages what-if scenarios, execution,
   * comparison, and persistence. When present, REST endpoints for
   * scenario management are registered:
   *   POST   /api/v1/scenarios              (create scenario)
   *   GET    /api/v1/scenarios              (list scenarios)
   *   GET    /api/v1/scenarios/:id          (get scenario)
   *   PATCH  /api/v1/scenarios/:id          (update scenario)
   *   DELETE /api/v1/scenarios/:id          (delete scenario)
   *   POST   /api/v1/scenarios/:id/run      (run scenario)
   *   POST   /api/v1/scenarios/:id/duplicate (duplicate scenario)
   *   GET    /api/v1/scenarios/:id/results  (get scenario results)
   *   POST   /api/v1/scenarios/compare      (compare two scenarios)
   *   POST   /api/v1/scenarios/:id/stage    (stage actions for apply)
   *   POST   /api/v1/scenarios/:id/apply    (apply staged actions)
   */
  scenarioService?: ScenarioService;
  /**
   * Workshop platform service — manages app definitions, pages, widgets,
   * variables, modules, templates, and mobile config. When present, REST
   * endpoints for workshop app management are registered:
   *   POST   /api/v1/workshop/apps              (create app)
   *   GET    /api/v1/workshop/apps              (list apps)
   *   GET    /api/v1/workshop/apps/:id          (get app)
   *   PATCH  /api/v1/workshop/apps/:id          (update app)
   *   DELETE /api/v1/workshop/apps/:id          (delete app)
   *   POST   /api/v1/workshop/apps/:id/share    (share app)
   *   POST   /api/v1/workshop/apps/:id/duplicate (duplicate app)
   *   POST   /api/v1/workshop/apps/:id/pages    (add page)
   *   PATCH  /api/v1/workshop/apps/:id/pages/:pid (update page)
   *   DELETE /api/v1/workshop/apps/:id/pages/:pid (remove page)
   *   POST   /api/v1/workshop/apps/:id/widgets  (add widget)
   *   PATCH  /api/v1/workshop/apps/:id/widgets/:wid (update widget)
   *   DELETE /api/v1/workshop/apps/:id/widgets/:wid (remove widget)
   *   GET    /api/v1/workshop/apps/:id/variables (list variables)
   *   POST   /api/v1/workshop/apps/:id/variables (create variable)
   *   GET    /api/v1/workshop/apps/:id/lineage  (get variable lineage)
   *   POST   /api/v1/workshop/variables/:vid/evaluate (evaluate variable)
   *   GET    /api/v1/workshop/modules            (list modules)
   *   POST   /api/v1/workshop/modules            (create module)
   *   GET    /api/v1/workshop/templates           (list templates)
   *   POST   /api/v1/workshop/templates/:tid/instantiate (create from template)
   *   POST   /api/v1/workshop/state/encode        (encode state to URL)
   *   POST   /api/v1/workshop/state/decode        (decode state from URL)
   */
  workshopPlatformService?: WorkshopPlatformService;
  /**
   * Data freshness service — per-type and per-datasource last-synced
   * timestamps. When present, REST endpoints for freshness queries are
   * registered:
   *   POST   /api/v1/data-freshness/sync        (record a sync)
   *   GET    /api/v1/data-freshness/:type        (freshness for object type)
   *   GET    /api/v1/data-freshness              (query freshness records)
   *   GET    /api/v1/data-freshness/summary      (freshness summary)
   *   DELETE /api/v1/data-freshness/:type        (delete freshness record)
   */
  dataFreshnessService?: DataFreshnessService;
  /**
   * Security governance services. When present, REST endpoints for
   * access explanation, justification capture, and scoped sessions
   * are registered:
   *   POST   /api/v1/security/explain              (explain access decision)
   *   POST   /api/v1/security/justifications       (record justification)
   *   GET    /api/v1/security/justifications        (query justifications)
   *   GET    /api/v1/security/justifications/:id    (get justification)
   *   POST   /api/v1/security/justifications/:id/approve (approve)
   *   POST   /api/v1/security/sessions              (create scoped session)
   *   GET    /api/v1/security/sessions              (list scoped sessions)
   *   GET    /api/v1/security/sessions/:id          (get scoped session)
   *   POST   /api/v1/security/sessions/:id/revoke   (revoke scoped session)
   *   GET    /api/v1/security/sessions/:id/check    (check marking allowed)
   */
  justificationStore?: JustificationStore;
  accessExplanationService?: AccessExplanationService;
  scopedSessionStore?: ScopedSessionStore;
  /**
   * Ad-hoc SQL analytics over the ontology — SQL Studio. When present,
   * REST endpoints for SQL query execution, explanation, validation,
   * saved query CRUD, and virtual table discovery are registered:
   *   POST   /api/v1/sql/execute           (execute SQL)
   *   POST   /api/v1/sql/explain            (explain SQL plan)
   *   POST   /api/v1/sql/validate           (validate SQL)
   *   GET    /api/v1/sql/tables             (list virtual tables)
   *   GET    /api/v1/sql/tables/:type       (describe virtual table)
   *   GET    /api/v1/sql/saved              (list saved queries)
   *   POST   /api/v1/sql/saved              (create saved query)
   *   GET    /api/v1/sql/saved/:id          (get saved query)
   *   PUT    /api/v1/sql/saved/:id          (update saved query)
   *   DELETE /api/v1/sql/saved/:id          (delete saved query)
   *   POST   /api/v1/sql/saved/:id/execute  (execute saved query)
   *   POST   /api/v1/sql/saved/:id/share    (share saved query)
   */
  ontologySqlService?: OntologySqlService;
  /**
   * Versioned transactional dataset service — branchable, transaction-log-backed
   * tabular resources. When present, REST endpoints for dataset CRUD, row
   * reads/writes, transaction log, and branching are registered:
   *   POST   /api/v1/datasets                    (create dataset)
   *   GET    /api/v1/datasets                     (list datasets)
   *   GET    /api/v1/datasets/:name               (get dataset)
   *   DELETE /api/v1/datasets/:name               (drop dataset)
   *   PUT    /api/v1/datasets/:name/schema         (update schema)
   *   POST   /api/v1/datasets/:name/insert        (insert rows)
   *   POST   /api/v1/datasets/:name/update        (update rows)
   *   POST   /api/v1/datasets/:name/delete        (delete rows)
   *   POST   /api/v1/datasets/:name/truncate      (truncate)
   *   GET    /api/v1/datasets/:name/read          (read rows)
   *   GET    /api/v1/datasets/:name/transactions  (list transactions)
   *   GET    /api/v1/datasets/:name/transactions/:tid (get transaction)
   *   POST   /api/v1/datasets/:name/branches      (create branch)
   *   GET    /api/v1/datasets/:name/branches      (list branches)
   *   POST   /api/v1/datasets/:name/merge         (merge branch)
   */
  datasetService?: DatasetService;
  /**
   * Dataset metadata/schema retrieval service. When present two read routes
   * are registered alongside the dataset routes above:
   *   GET    /api/v1/datasets/:name/metadata   (metadata incl. rowCount)
   *   GET    /api/v1/datasets/:name/schema     (schema by branch/version/transaction)
   */
  datasetMetadataService?: DatasetMetadataService;
  /**
   * Ontology usage metrics service. When present, REST endpoints for
   * metrics aggregation, event querying, and monitoring rules are
   * registered. The record() method is NOT exposed as a REST endpoint —
   * it is an instrumentation hook called internally by the API layer.
   *   GET    /api/v1/usage/object-types       (per-type metrics)
   *   GET    /api/v1/usage/actions             (per-action/function metrics)
   *   GET    /api/v1/usage/summary             (full usage summary)
   *   GET    /api/v1/usage/events              (query raw events)
   *   GET    /api/v1/usage/active-users        (active user count)
   *   POST   /api/v1/usage/rules               (create monitoring rule)
   *   GET    /api/v1/usage/rules               (list monitoring rules)
   *   DELETE /api/v1/usage/rules/:id           (delete monitoring rule)
   *   POST   /api/v1/usage/rules/evaluate      (evaluate monitoring rules)
   */
  usageMetricsService?: OntologyUsageMetricsService;
  /**
   * App embedding & cross-app service — app registry, embedding manifests,
   * cross-app commands, and app pairing. When present, REST endpoints
   * under /api/v1/embedding/* are registered:
   *   POST   /api/v1/embedding/apps             (register app)
   *   GET    /api/v1/embedding/apps             (list apps)
   *   GET    /api/v1/embedding/apps/:id         (get app)
   *   GET    /api/v1/embedding/apps/by-name/:name (get app by name)
   *   PATCH  /api/v1/embedding/apps/:id         (update app)
   *   DELETE /api/v1/embedding/apps/:id         (delete app)
   *   GET    /api/v1/embedding/apps/:id/manifest (get embedding manifest)
   *   POST   /api/v1/embedding/commands         (send cross-app command)
   *   GET    /api/v1/embedding/commands         (list commands)
   *   GET    /api/v1/embedding/commands/:id     (get command)
   *   PATCH  /api/v1/embedding/commands/:id     (update command status)
   *   POST   /api/v1/embedding/pairings         (create app pairing)
   *   GET    /api/v1/embedding/pairings         (list pairings)
   *   GET    /api/v1/embedding/pairings/:id     (get pairing)
   *   DELETE /api/v1/embedding/pairings/:id     (delete pairing)
   *   POST   /api/v1/embedding/pairings/:id/sync (sync shared state)
   */
  embeddingService?: EmbeddingService;
  /**
   * Platform resource service — resource catalog, resource-to-object links,
   * browse, search, and upload-and-link. When present, REST endpoints
   * under /api/v1/resources/* are registered:
   *   POST   /api/v1/resources                  (create resource)
   *   GET    /api/v1/resources                  (list resources)
   *   GET    /api/v1/resources/browse           (browse by path)
   *   GET    /api/v1/resources/search           (search by name/tag)
   *   GET    /api/v1/resources/:id              (get resource)
   *   PATCH  /api/v1/resources/:id              (update resource)
   *   DELETE /api/v1/resources/:id              (delete resource)
   *   POST   /api/v1/resources/:id/links        (link resource to object)
   *   GET    /api/v1/resources/:id/links        (get links for resource)
   *   GET    /api/v1/resources/links            (get links for object)
   *   DELETE /api/v1/resources/links/:linkId    (unlink)
   *   POST   /api/v1/resources/upload-and-link  (upload and link)
   */
  platformResourceService?: PlatformResourceService;
  /**
   * Saved view store — per-user and shared widget view configurations
   * (column config, filters, sort order, density). When present, REST
   * endpoints under /api/v1/saved-views/* are registered:
   *   POST   /api/v1/saved-views               (create saved view)
   *   GET    /api/v1/saved-views               (list saved views)
   *   GET    /api/v1/saved-views/:id           (get saved view)
   *   PATCH  /api/v1/saved-views/:id           (update saved view)
   *   DELETE /api/v1/saved-views/:id           (delete saved view)
   */
  savedViewStore?: SavedViewStore;
  /**
   * User directory service — lists platform users for User Select widgets.
   * When present, REST endpoint is registered:
   *   GET    /api/v1/users                      (list users, optional ?q=)
   *   GET    /api/v1/users/:id                  (get user)
   */
  userDirectoryService?: UserDirectoryService;

  /** Kiosk mode service — long-lived read-only display sessions. */
  kioskService?: KioskService;

  /** Layout and device capture service — QR/camera/deep-link state. */
  layoutDeviceCaptureService?: LayoutDeviceCaptureService;

  /** Ontology manager service — type/action/function discovery and change proposals. */
  ontologyManagerService?: OntologyManagerService;

  /** Workshop UX service — state saving, redact, profiler, i18n. */
  workshopUxService?: WorkshopUxService;

  /** Value and conditional formatting service. */
  valueFormattingService?: ValueFormattingService;

  /** Design system theming service — saved module colour palettes. */
  designSystemService?: DesignSystemService;

  /** Ontology change history service — read and restore schema versions. */
  ontologyChangeHistoryService?: OntologyChangeHistoryService;

  /** Fase 22 — Cross-application command exchange. */
  commandExchangeService?: CommandExchangeService;
  /** Fase 22 — Object-set filter state store. */
  objectSetFilterStore?: ObjectSetFilterStore;
  /** Fase 22 — Interactive graph visualization service. */
  graphService?: GraphService;
  /** Change proposal store for AI/human-in-the-loop governance. */
  changeProposalStore?: ChangeProposalStore;
  /** Business rules service for no-code rule authoring. */
  businessRulesService?: BusinessRulesService;
  /** Agent evaluation service for AIP Evals. */
  agentEvaluationService?: AgentEvaluationService;
  /** Agent thread store for durable conversation persistence. */
  agentThreadStore?: AgentThreadStore;
  /** Conflict resolution service for sync-vs-edit reconciliation. */
  conflictResolutionService?: ConflictResolutionService;
  /** Connector catalog service for prebuilt source connectors. */
  connectorCatalogService?: ConnectorCatalogService;
  /** Data expectations service for quality checks that gate builds. */
  dataExpectationsService?: DataExpectationsService;
  /** Embedded copilot service for in-app AI assistants. */
  embeddedCopilotService?: EmbeddedCopilotService;
  /** Event object service for timeline analytics. */
  eventObjectService?: EventObjectService;
  /** Graph analysis service for saved graph explorations. */
  graphAnalysisService?: GraphAnalysisService;
  /** Multi-ontology governance service for org-scoped ontologies. */
  multiOntologyGovernanceService?: MultiOntologyGovernanceService;
  /** Pipeline build service for batch pipeline orchestration. */
  pipelineBuildService?: PipelineBuildService;
  /** Platform assistant service for AI FDE agentic assistance. */
  platformAssistantService?: PlatformAssistantService;
  /** Process mining service for process model discovery. */
  processMiningService?: ProcessMiningService;
}

/**
 * Resolved context available in every GraphQL resolver.
 */
export interface ResolverContext {
  requestContext: RequestContext;
  user: AuthenticatedUserInfo;
  deps: ApiDependencies;
}

/**
 * Minimal authenticated user info passed through context.
 */
export interface AuthenticatedUserInfo {
  id: string;
  name: string;
  email: string;
  roles: string[];
  groups: string[];
  tenantId: string;
  /** Mandatory access-control markings held by the caller. */
  markings?: string[];
}

/**
 * Relay-style pagination arguments.
 */
export interface PaginationArgs {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
}

/**
 * Relay-style connection result.
 */
export interface Connection<T> {
  edges: Edge<T>[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface Edge<T> {
  node: T;
  cursor: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

/**
 * Consent purpose used for data access checks.
 */
export type ConsentPurpose = DataPurpose;

/**
 * Resolve the default consent purpose from an env value. `DataPurpose` is an
 * open string type, so ANY non-empty purpose is accepted (the consent vocabulary
 * is deployment-defined via CONSENT_PURPOSES, validated separately at boot).
 * Unset/blank → `DIRECT_CARE` (the NHS-preset back-compat default).
 */
export function resolveDefaultConsentPurpose(value: string | undefined): DataPurpose {
  return value && value.trim() !== '' ? value.trim() : DataPurpose.DIRECT_CARE;
}

/**
 * Default consent purpose applied to read/list access checks (REST + GraphQL)
 * and as the fallback when recording consent without an explicit purpose.
 *
 * Deployment policy: a non-NHS deployment sets `DEFAULT_CONSENT_PURPOSE` to a
 * purpose in its own vocabulary (e.g. `KYC`); the built-in default `DIRECT_CARE`
 * is the NHS-preset back-compat value. Resolved once at module load.
 */
export const DEFAULT_CONSENT_PURPOSE: DataPurpose =
  resolveDefaultConsentPurpose(process.env['DEFAULT_CONSENT_PURPOSE']);

/**
 * Object types whose presence as an action `@param` marks the action's consent
 * subject (consent is checked for that object before the action runs). Default
 * `Patient` (the NHS subject); a deployment overrides via `deps.consentSubjectTypes`
 * (env CONSENT_SUBJECT_TYPES), e.g. `Customer` for an AML deployment.
 */
export const DEFAULT_CONSENT_SUBJECT_TYPES: readonly string[] = ['Patient'];

/**
 * Whether reads of `typeName` are subject to a consent decision.
 *
 * Consent is a property of a data *subject*, so only the configured subject
 * types carry it. Applying it to every ObjectType empties the read paths for
 * everything else: checkConsent default-denies when no record exists, so a
 * Ward, Bed or Supplier — which can never have a consent record — would be
 * filtered out entirely.
 */
export function isConsentSubjectType(
  typeName: string,
  configured?: readonly string[],
): boolean {
  return (configured ?? DEFAULT_CONSENT_SUBJECT_TYPES).includes(typeName);
}

/**
 * Default page size when first/last not specified.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Maximum page size.
 */
export const MAX_PAGE_SIZE = 100;
