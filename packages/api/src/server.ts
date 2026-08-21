/**
 * Server entrypoint â€” starts the Altius API gateway.
 *
 * Mounts GraphQL, REST, and FHIR endpoints on a single Express server.
 * Used by the Dockerfile CMD and for local development.
 *
 * Configuration via environment variables:
 *   PORT                 â€” HTTP port (default: 4000)
 *   NODE_ENV             â€” 'production' enables real service wiring
 *   DOMAIN_PACKS_DIR     â€” Path to domain-packs directory (auto-detected if omitted)
 *   DOMAIN_PACKS         â€” Comma-separated or JSON array of pack names to load
 *   SEED_TENANT          â€” Tenant for domain-pack boot seeds (default: 'system', isolated from request tenants)
 *   SCHEMA_BREAKING_POLICY â€” 'warn' (default) records BREAKING schema changes and continues; 'block' fails boot without recording
 *   ALLOW_NON_DURABLE_SERVICES â€” 'true' serves the services that have no Postgres implementation (see
 *                          nonDurableServices below; the gateway names them at boot) from process memory on a
 *                          Postgres deployment. Lost on restart and not shared across replicas: single-replica
 *                          prod-testing only. Default off — those routes answer 404 instead
 *   SYNC_SCHEDULER_ENABLED — 'true' starts the sync poll loop for POLLING/CDC/BATCH pack connectors (default: off)
 *   AUTOMATION_ENABLED   — 'true' starts pack-declared automations (event + schedule); run on a SINGLE instance only (default: off)
 *   SYNC_TENANT          — Tenant for sync-ingested objects (default: SEED_TENANT, then 'system')
 *   DATA_CONNECTION_ENROLLMENT_SECRET — Shared secret Data Connection Agents present at enrollment;
 *                          setting it mounts the agent gateway at /api/v1/data-connection/* and leases
 *                          runtime-AGENT pack datasources to enrolled agents (default: off)
 *   OIDC_ISSUER          — OIDC provider issuer URL (matches Helm configmap)
 *   OIDC_CLIENT_ID       — OIDC client ID
 *   OIDC_JWKS_URI        — JWKS endpoint override for non-Keycloak issuers
 *   OIDC_DEFAULT_TENANT  — Opt-in fallback tenant for tokens without a tenant_id claim (unset = fail-closed)
 *   OPENFGA_URL          — OpenFGA API URL (matches Helm configmap / docker-compose)
 *   OPENFGA_STORE_IDS    — Per-tenant OpenFGA stores: 'tenantA=storeId,tenantB=storeId'. One store
 *                          per tenant; a tenant not listed here is denied all access (fail closed)
 *   OPENFGA_STORE_ID     â€” Single-tenant OpenFGA store ID; requires OIDC_DEFAULT_TENANT to name the
 *                          one tenant it serves. Use OPENFGA_STORE_IDS for multi-tenant deployments
 *   POSTGRES_URL         â€” PostgreSQL connection string (with ?sslmode= for TLS)
 *   CEL_EVALUATOR_URL    â€” CEL gRPC sidecar address (default: localhost:50051)
 *   CORS_ALLOWED_ORIGINS â€” Comma-separated allowed origins (empty = deny all in prod)
 *   FHIR_BASE_URL        â€” Externally routable FHIR base URL for Bundle links
 *   REDPANDA_BROKERS     â€” Comma-separated Kafka/Redpanda brokers (enables persistent events)
 *   REDIS_URL            â€” Redis connection URL (enables distributed rate limiting)
 */

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { GraphQLError } from 'graphql';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { MemoryStorageProvider } from '@altius/storage-memory';
import {
  InMemoryBlobStore,
  InMemoryTimeSeriesStore,
  InMemoryBranchStore,
  InMemoryCommentStore,
  InMemoryNotificationStore,
  InMemoryEmbeddingStore,
  InMemoryAlertingService,
  InMemoryLLMUsageTracker,
  InMemoryLLMRateLimiter,
  InMemoryGeospatialMapService,
  InMemoryModelRegistryService,
  InMemoryModelInferenceService,
  InMemoryModelChainService,
  InMemoryScenarioService,
  InMemoryWorkshopPlatformService,
  InMemoryDataFreshnessService,
  InMemoryJustificationStore,
  InMemoryScopedSessionStore,
  InMemoryOntologySqlService,
  InMemoryDatasetService,
  InMemoryDatasetMetadataService,
  InMemoryOntologyUsageMetricsService,
  InMemoryEmbeddingService,
  InMemoryPlatformResourceService,
  InMemorySavedViewStore,
  InMemoryUserDirectoryService,
  InMemoryKioskService,
  InMemoryLayoutDeviceCaptureService,
  InMemoryOntologyManagerService,
  InMemoryWorkshopUxService,
  InMemoryValueFormattingService,
  InMemoryDesignSystemService,
  InMemoryOntologyChangeHistoryService,
  InMemoryCommandExchangeService,
  InMemoryObjectSetFilterStore,
  InMemoryGraphService,
  InMemoryChangeProposalStore,
  InMemoryApprovalWorkflowService,
  InMemoryBusinessRulesService,
  InMemoryAgentEvaluationService,
  InMemoryCommandService,
  InMemoryDataExpectationsService,
  InMemoryConflictResolutionService,
  InMemoryPipelineBuildService,
  InMemoryEventObjectService,
  InMemoryProcessMiningService,
  InMemoryConnectorCatalogService,
  InMemoryMultiOntologyGovernanceService,
  InMemoryGraphAnalysisService,
  InMemoryPlatformAssistantService,
  InMemoryEmbeddedCopilotService,
  InMemorySqlQueryService,
  InMemoryVariableTransformService,
  InMemoryRulesEngineService,
  InMemoryPipelineService,
  InMemorySyncCdcService,
  InMemoryDatasourceService,
  InMemoryBuildTriggerService,
  InMemorySqlAnalyticsService,
  InMemoryAgentService,
  InMemoryModelCatalogService,
  InMemoryEvalService,
  InMemoryHumanInTheLoopService,
  InMemoryVectorSearchService,
  InMemoryCopilotService,
} from '@altius/storage-memory';
import { PostgresStorageProvider, PostgresLineageStore, PostgresAuditStore, PostgresConsentStore, PostgresSchemaRegistry, PostgresObjectSetStore,
  PostgresLLMUsageTracker, PostgresLLMRateLimiter,
  PostgresEmbeddingStore, PostgresBlobStore, PostgresTimeSeriesStore,
  PostgresBranchStore, PostgresCommentStore, PostgresNotificationStore,
  PostgresAlertingService, PostgresBusinessRulesService, PostgresKioskService, PostgresSavedViewStore, PostgresDataFreshnessService, PostgresDatasetMetadataService,
  PostgresGeospatialMapService, PostgresJustificationStore, PostgresOntologySqlService,
  PostgresOntologyUsageMetricsService, PostgresScopedSessionStore,
  PostgresAgentThreadStore,
  PostgresChangeProposalStore,
  PostgresObjectSetFilterStore, PostgresApprovalWorkflowService, PostgresDataExpectationsService,
  PostgresDesignSystemService,
  PostgresModelRegistryService, PostgresModelInferenceService,
  PostgresModelChainService, PostgresConnectorCatalogService, PostgresCommandService,
  PostgresDatasetService,
  PostgresUserDirectoryService,
  PostgresLayoutDeviceCaptureService,
  PostgresVariableTransformService,
  PostgresWorkshopUxService,
} from '@altius/storage-postgres';
import {
  ObjectManager, LineageRecorder,
  LinkManager,
  EngineEventEmitter,
  InMemoryObjectSetStore,
  ObjectSetManager,
  FunctionExecutor,
  FunctionRegistry,
  FunctionPipeline,
  GitFunctionSource,
  WebhookPipelineTrigger,
  IsolatedNodeFunctionRuntime,
  CelFunctionRuntime,
  ComputedFieldEvaluator,
  createLLMClient,
  DefaultLLMGateway,
  LLMFunctionRuntime,
  WorkflowGraphBuilder,
  WorkflowMonitor,
  InMemoryWorkflowEventStore,
  InMemoryLineageStore,
  InMemoryAgentThreadStore,
} from '@altius/engine';
import type { ModelCatalogEntry } from '@altius/spi';
import { ActionExecutor, CelClient, SideEffectExecutor } from '@altius/actions';
import type { SecurityLayer, CelEvaluator, EventBus as SideEffectEventBus, HttpClient as SideEffectHttpClient, LinkTupleMap } from '@altius/actions';
import { AuthorizationService, OidcAuthenticator, AuditWriter, MemoryAuditStore, ConsentService, MemoryConsentStore, MarkingPolicy, DefaultAccessExplanationService } from '@altius/security';
import type { OpenFgaClientInterface, FgaClientResolver } from '@altius/security';
import type { StorageProvider, RequestContext } from '@altius/spi';
import { createGraphQLServer, buildResolverContext } from './graphql/index.js';
import { guardWsOperation } from './graphql/ws-gate.js';
import { generateRestRoutes, generateOpenApiSpec, auditRead } from './rest/index.js';
import { writeReadAuditFor } from './rest/audit-read.js';
import { isTypeVisible, missingMarkings } from './markings/enforce.js';
import { invokeFunction } from './functions/invoke-function.js';
import { generateAuditRoutes } from './rest/audit-routes.js';
import { generateLlmRoutes, generateWorkflowRoutes } from './rest/index.js';
import { generateTraverseRoutes } from './rest/traverse-route.js';
import { recordRestUsage } from './rest/usage-recording.js';
import { generateSyncStatusRoutes } from './rest/sync-status-routes.js';
import { generateDataConnectionStatusRoutes } from './rest/data-connection-status-routes.js';
import { registerAttachmentRoutes } from './rest/attachment-routes.js';
import { registerTimeSeriesRoutes } from './rest/timeseries-routes.js';
import { registerBranchRoutes } from './rest/branch-routes.js';
import { registerCommentRoutes } from './rest/comment-routes.js';
import { registerNotificationRoutes } from './rest/notification-routes.js';
import { registerEmbeddingRoutes } from './rest/embedding-routes.js';
import { registerAlertingRoutes } from './rest/alerting-routes.js';
import { registerGeospatialRoutes } from './rest/geospatial-routes.js';
import { registerScenarioRoutes } from './rest/scenario-routes.js';
import { registerWorkshopRoutes } from './rest/workshop-routes.js';
import { registerLLMGatewayRoutes } from './rest/llm-gateway-routes.js';
import { registerAppEmbeddingRoutes } from './rest/app-embedding-routes.js';
import { registerPlatformResourceRoutes } from './rest/platform-resource-routes.js';
import { registerAbsentServiceRoutes } from './rest/absent-services-routes.js';
import { registerSavedViewRoutes } from './rest/saved-view-routes.js';
import { registerUserDirectoryRoutes } from './rest/user-directory-routes.js';
import { readPlatformVersion } from './version.js';
import { createFhirRouter } from './fhir/index.js';
import { createCdmRouter } from './cdm/index.js';
import { generateRelationshipRoutes, buildGrantAllowlist } from './relationships/router.js';
import { generateConsentRoutes, assertConsentConfig } from './consent/router.js';
import { InMemorySubscribableEventBus, SubscriptionManager, SubscriptionRegistry } from './subscriptions/index.js';
import type { SubscribableEventBus } from './subscriptions/index.js';
import { RedpandaEventBus } from './events/index.js';
import { AutomationRunner } from './automation/index.js';
import type { ApiDependencies, ResolverContext } from './graphql/types.js';
import { DEFAULT_CONSENT_PURPOSE } from './graphql/types.js';
import type { RestRequest } from './rest/types.js';
import {
  parsePostgresUrl,
  createFgaClientRegistry,
  parseFgaStoreMap,
  createSecurityLayer,
  assertActionAuthzCoverage,
  extractUser,
  parseSchemaBreakingPolicy,
  shouldRegisterNonDurableServices,
  REQUIRED_PROD_VARS,
} from './config.js';
import type { ActionAuthzMapping } from './config.js';
import { createActionEventPublisher } from './events/action-event-publisher.js';
import { loadDomainPacks } from './schema-loader.js';
import { generateOpenFGASchema, mergeOpenFGAOverrides, deriveActionAuthzMapping, deriveFunctionAuthzMapping, InMemorySchemaRegistry } from '@altius/odl';
import type { SchemaRegistry } from '@altius/odl';
import { recordSchemaVersion, BreakingSchemaChangeError } from './schema-registry-boot.js';
import { SlidingWindowRateLimiter, RedisRateLimiter } from './governance/index.js';
import type { RateLimiter, RateLimitIdentity } from './governance/index.js';
import { toSnakeCase } from './utils.js';
import { metricsMiddleware, metricsEndpoint, startStorageHealthGauge, startSyncMetricsGauge, syncSchedulerEnabled, packLoaded, podDirectOnly } from './metrics.js';
import { buildHealthReport } from './health.js';
import type { HealthProbe } from './health.js';
import { logger } from './logger.js';
import { pinoSideEffectLogger } from './side-effect-logger.js';

const PORT = parseInt(process.env['PORT'] ?? '4000', 10);

/**
 * Parse DOMAIN_PACKS env var which may be:
 *   - Comma-separated names: "nhs-acute,aml"
 *   - JSON array of objects from Helm: [{"name":"nhs-acute","version":"0.2.0"}]
 *   - undefined (returns undefined â†’ auto-discover)
 */
function parseDomainPacksEnv(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item: unknown) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && 'name' in item) return String((item as { name: unknown }).name);
            return '';
          })
          .filter(Boolean);
      }
    } catch {
      // Fall through to comma-split
    }
  }
  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * A readable description of anything that was thrown.
 *
 * `String(err)` on a non-Error object yields "[object Object]", which is what
 * the seed loader logged for every failure: the error was caught, reported,
 * and its content destroyed by the formatting. The engine's validation path
 * throws a structured object rather than an Error, so that was the common
 * case, not an edge one.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    // createAltiusError shapes carry the useful text under extensions.altius.
    const ext = (o['extensions'] as { altius?: { code?: unknown; message?: unknown } } | undefined)?.altius;
    const parts = [
      typeof o['code'] === 'string' ? o['code'] : undefined,
      typeof ext?.code === 'string' ? ext.code : undefined,
      typeof o['message'] === 'string' ? o['message'] : undefined,
      typeof ext?.message === 'string' ? ext.message : undefined,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(': ');
    try {
      return JSON.stringify(err);
    } catch {
      return Object.prototype.toString.call(err);
    }
  }
  return String(err);
}

/**
 * Build the LLM model catalog from the environment.
 *
 * The catalog is what the governed gateway exposes at GET /api/v1/llm/models.
 * Entries are derived from the configured providers â€” the primary and
 * fallback models are always listed, plus any extra models declared via
 * LLM_EXTRA_MODELS (a JSON array of ModelCatalogEntry).
 *
 * Without this, the gateway would have an empty catalog and reject every
 * chat completion with "Model not found in catalog".
 */
function buildLlmModelCatalog(env: NodeJS.ProcessEnv): ModelCatalogEntry[] {
  const models: ModelCatalogEntry[] = [];

  const provider = (env['LLM_PROVIDER'] ?? '').trim().toLowerCase();
  const fallbackProvider = (env['LLM_FALLBACK_PROVIDER'] ?? '').trim().toLowerCase();

  if (provider && provider !== 'none') {
    const entry = catalogEntryForProvider(provider, env, 'primary');
    if (entry) models.push(entry);
  }

  if (fallbackProvider && fallbackProvider !== 'none') {
    const entry = catalogEntryForProvider(fallbackProvider, env, 'fallback');
    if (entry) models.push(entry);
  }

  // Extra models declared via env (JSON array of ModelCatalogEntry).
  const extraRaw = env['LLM_EXTRA_MODELS']?.trim();
  if (extraRaw) {
    try {
      const extra = JSON.parse(extraRaw) as ModelCatalogEntry[];
      if (Array.isArray(extra)) models.push(...extra);
    } catch {
      logger.warn('LLM_EXTRA_MODELS is not valid JSON, ignoring');
    }
  }

  return models;
}

/**
 * Resolve a single model catalog entry for a completion provider.
 *
 * Mirrors the model-id resolution in `createLLMClient`'s `buildClient` so the
 * catalog advertises the same model the underlying client will actually use,
 * including provider-specific defaults. Without this, a deployment using
 * `LLM_PROVIDER=openai` or `anthropic` would get an empty or mislabeled
 * catalog and the gateway would reject every chat completion with
 * "Model not found in catalog".
 */
function catalogEntryForProvider(
  provider: string,
  env: NodeJS.ProcessEnv,
  role: 'primary' | 'fallback',
): ModelCatalogEntry | undefined {
  const p = role === 'fallback' ? 'LLM_FALLBACK_' : 'LLM_';
  let modelId: string;
  let displayName: string;

  switch (provider) {
    case 'anthropic':
      modelId = env[`${p}MODEL`]?.trim() || env['LLM_MODEL']?.trim() || 'claude-sonnet-4-5';
      displayName = `Anthropic â€” ${modelId}`;
      break;
    case 'daemon':
      modelId = (env['LLM_DAEMON_MODEL'] ?? 'oc/deepseek-v4-flash-free').trim();
      displayName = `Daemon Protocol â€” ${modelId}`;
      break;
    case 'openrouter':
      modelId = (env['LLM_OPENROUTER_MODEL'] ?? 'deepseek/deepseek-v4-flash').trim();
      displayName = `OpenRouter â€” ${modelId}`;
      break;
    case 'openai':
      modelId = (env['LLM_OPENAI_MODEL'] ?? 'gpt-4o').trim();
      displayName = `OpenAI â€” ${modelId}`;
      break;
    default:
      return undefined;
  }

  return {
    rid: `${provider}:${modelId}`,
    displayName,
    provider,
    modelId,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    supportsStreaming: true,
    supportsTools: false,
    zdr: false,
    geo: 'any',
    enabled: true,
  };
}

async function main(): Promise<void> {
  const isDev = process.env['NODE_ENV'] !== 'production';

  // â”€â”€ OpenTelemetry â”€â”€
  // Must be initialized before significant work starts so the global
  // TracerProvider is registered for all getTracer()/withSpan() calls.
  const { initTelemetry } = await import('@altius/observability');
  initTelemetry('altius-api');

  // â”€â”€ Validate production environment â”€â”€
  if (!isDev) {
    const missing = REQUIRED_PROD_VARS.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      logger.error(`FATAL: Production mode requires env vars: ${missing.join(', ')}`);
      process.exit(1);
    }
  }

  // â”€â”€ Rate Limiter â”€â”€
  // REDIS_URL â†’ distributed rate limiting across pods; otherwise in-memory per-pod.
  let rateLimiter: RateLimiter;
  let redisClient: import('ioredis').Redis | undefined;
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    // Dynamic import for optional dependency â€” cast needed for CJS/ESM interop
    const ioredis = await import('ioredis');
    const RedisClient = ioredis.default as unknown as new (url: string, opts: Record<string, unknown>) => import('ioredis').Redis;
    redisClient = new RedisClient(redisUrl, {
      // Fail fast: rate limiting is QoS, not a security boundary.
      // Default ioredis retries 20 times with offline queue, stalling requests for seconds.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3_000,
      commandTimeout: 1_000,
    });
    rateLimiter = new RedisRateLimiter(redisClient);
    logger.info(`Rate limiter: Redis @ ${redisUrl.replace(/\/\/.*@/, '//<redacted>@')}`);
  } else {
    rateLimiter = new SlidingWindowRateLimiter();
    if (!isDev) {
      logger.warn('WARNING: Rate limiter is in-memory â€” limits are per-pod. Set REDIS_URL for distributed rate limiting.');
    }
  }

  // â”€â”€ Storage â”€â”€
  // Use PostgreSQL when POSTGRES_URL is set, even in development mode.
  // This allows local Docker Compose setups to use persistent storage.
  let storage: StorageProvider;
  if (process.env['POSTGRES_URL']) {
    const config = parsePostgresUrl(process.env['POSTGRES_URL']);
    storage = new PostgresStorageProvider(config);
    logger.info(`Storage: PostgreSQL @ ${config.host}:${config.port}/${config.database}`);
  } else {
    storage = new MemoryStorageProvider();
    if (isDev) {
      logger.warn('Storage: in-memory (development mode)');
    }
  }

  // â”€â”€ Schema (load from domain packs) â”€â”€
  // DOMAIN_PACKS may be comma-separated names ("nhs-acute,aml") or JSON from Helm
  // ([{"name":"nhs-acute","version":"0.2.0"}]). Handle both formats.
  const packNames = parseDomainPacksEnv(process.env['DOMAIN_PACKS']);
  const {
    parsed: schema, spiSchema, packs, packInfos, manifestRegistry, functionPackDirs,
    fieldPermissions, markingConfig, permissionOverrides, connectorManifests, seedManifests,
    automationManifests,
  } = await loadDomainPacks(undefined, packNames);
  logger.info(
    `Schema: loaded ${packs.length} domain pack(s) â€” ` +
    `${schema.objectTypes.length} object types, ` +
    `${schema.linkTypes.length} link types, ` +
    `${schema.actionTypes.length} action types, ` +
    `${schema.functionTypes.length} function types, ` +
    `${schema.enums.length} enums`,
  );
  if (permissionOverrides.length > 0) {
    logger.info(`Schema: ${permissionOverrides.length} OpenFGA permission override(s) from domain packs`);
  }
  if (connectorManifests.length > 0) {
    logger.info(`Schema: ${connectorManifests.length} connector manifest(s) from domain packs`);
  }
  if (seedManifests.length > 0) {
    const totalSeedObjects = seedManifests.reduce((n, s) => n + s.objects.length, 0);
    const totalSeedLinks = seedManifests.reduce((n, s) => n + s.links.length, 0);
    logger.info(`Schema: ${seedManifests.length} seed manifest(s) â€” ${totalSeedObjects} object(s) + ${totalSeedLinks} link(s)`);
  }
  if (schema.objectTypes.length === 0) {
    logger.warn('WARNING: No object types loaded â€” check DOMAIN_PACKS configuration.');
  }

  // â”€â”€ Schema breaking-change gate (runs BEFORE DDL) â”€â”€
  // The breaking-change gate must run before storage.applySchema so a BREAKING
  // pack change fails boot before any DDL is applied to the database. Under
  // SCHEMA_BREAKING_POLICY=block (default) a BREAKING change fails boot and no
  // version is recorded; under 'warn' the change is recorded with a warning.
  const schemaBreakingPolicy = parseSchemaBreakingPolicy();
  const schemaRegistry: SchemaRegistry = storage instanceof PostgresStorageProvider
    ? new PostgresSchemaRegistry(storage.pool)
    : new InMemorySchemaRegistry();
  try {
    const result = await recordSchemaVersion(schemaRegistry, schema, schemaBreakingPolicy);
    if (result.breaking) {
      logger.warn('Schema registry: BREAKING schema change detected at boot â€” recorded under an auto-approved migration plan. Review schema history before promoting, or set SCHEMA_BREAKING_POLICY=block to fail boot instead.');
    }
    if (result.recorded) {
      const backend = storage instanceof PostgresStorageProvider ? 'PostgreSQL' : 'in-memory';
      logger.info(`Schema registry: recorded schema version ${result.version} (${backend})`);
    }
  } catch (err) {
    if (err instanceof BreakingSchemaChangeError) {
      // SCHEMA_BREAKING_POLICY=block: a BREAKING schema change must fail boot.
      throw err;
    }
    // Non-fatal: schema-history recording must not block startup.
    logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'Schema registry: failed to record schema version');
  }

  // Apply schema to storage (creates tables/indexes in Postgres, registers types in memory).
  // This runs AFTER the breaking-change gate so a BREAKING pack change fails boot
  // before any DDL touches the database.
  const bootCtx: RequestContext = { tenantId: 'system', actorId: 'boot' };
  await storage.applySchema(bootCtx, spiSchema);

  // Tenant for bootstrap seed data. Defaults to 'system' (isolated from ordinary
  // request tenants); set SEED_TENANT to the request tenant (e.g. 'default') when
  // seeded reference data must be readable through the API â€” otherwise seeds are
  // invisible to API reads in a different tenant.
  //
  // Treat blank as unset: compose/Helm pass through unset knobs as an empty
  // string (`SEED_TENANT: ${SEED_TENANT:-}`), and `?? 'system'` would not catch
  // that â€” seeds would land under a nameless tenant no request could ever read.
  const seedTenant = process.env['SEED_TENANT']?.trim();
  const seedCtx: RequestContext = {
    tenantId: seedTenant || 'system',
    actorId: 'boot',
  };

  // â”€â”€ Register loaded packs in _domain_packs table (Postgres only) â”€â”€
  //
  // The table is created here rather than assumed. It was only ever created
  // by the Helm init job, so every other deployment â€” docker-compose, a bare
  // Postgres, a managed instance â€” logged "relation _domain_packs does not
  // exist" at every boot and the table stayed permanently empty. Creating it
  // where it is written makes the feature real in all of them, and IF NOT
  // EXISTS keeps the Helm path unchanged.
  if (storage instanceof PostgresStorageProvider) {
    try {
      await storage.pool.query(
        `CREATE TABLE IF NOT EXISTS _domain_packs (
           name TEXT PRIMARY KEY,
           version TEXT NOT NULL,
           namespace TEXT NOT NULL,
           loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`,
      );
      for (const info of packInfos) {
        await storage.pool.query(
          `INSERT INTO _domain_packs (name, version, namespace)
           VALUES ($1, $2, $3)
           ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version, loaded_at = NOW()`,
          [info.manifest.name, info.manifest.version, info.manifest.namespace],
        );
      }
      logger.info(`Domain packs: registered ${packInfos.length} pack(s) in _domain_packs`);
    } catch (err) {
      // Still non-fatal: pack registration is bookkeeping, and a gateway that
      // cannot record which packs it loaded should still serve them.
      logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'Domain packs: failed to register in _domain_packs');
    }
  }

  // â”€â”€ Engine â”€â”€
  // REDPANDA_BROKERS â†’ persistent event streaming via Kafka protocol;
  // otherwise in-memory (events lost on restart).
  let eventBus: SubscribableEventBus;
  const redpandaBrokers = process.env['REDPANDA_BROKERS'];
  if (redpandaBrokers) {
    const rpBus = new RedpandaEventBus({
      brokers: redpandaBrokers.split(',').map(s => s.trim()),
    });
    await rpBus.connect();
    eventBus = rpBus;
    logger.info(`EventBus: Redpanda/Kafka @ ${redpandaBrokers}`);
  } else {
    eventBus = new InMemorySubscribableEventBus();
    if (!isDev) {
      logger.warn('WARNING: EventBus is in-memory â€” events will not survive restarts. Set REDPANDA_BROKERS to enable persistent streaming.');
    }
  }
  const emitter = new EngineEventEmitter(eventBus);

  // â”€â”€ CEL Evaluator â”€â”€
  // Constructed before the ObjectManager so the same instance can be
  // injected into the validation pipeline (field/type @constraint
  // evaluation) AND the action executor (preconditions/effect conditions).
  // Without this wiring, complex @constraint expressions emit a warning
  // and are NOT enforced (see packages/engine/src/objects/validation.ts).
  let cel: CelEvaluator;
  const celAddress = (process.env['CEL_EVALUATOR_URL'] ?? 'localhost:50051')
    .replace(/^grpc:\/\//, '');
  if (!isDev || process.env['CEL_EVALUATOR_URL']) {
    cel = new CelClient({ address: celAddress });
    logger.info(`CEL evaluator: gRPC @ ${celAddress}`);
  } else {
    // Dev stub: always evaluate to true
    cel = { async evaluate() { return { value: true }; } };
    logger.warn('CEL evaluator: allow-all stub (development mode)');
  }

  // â”€â”€ Function Executor â”€â”€
  // Constructed before the ObjectManager so the ComputedFieldEvaluator
  // can bridge @computed fields to user-authored functions (Section 6).
  // The same CEL evaluator instance is reused for cel-runtime functions
  // and for @constraint evaluation. Pack-relative module resolution uses
  // the first loaded pack's directory as a base.
  // Pack-authored function code runs in a forked child, never in this process.
  //
  // FunctionExecutor's built-in `node` runtime imports the entry module into the
  // API process, where it can read the Postgres URL, the OIDC client secret and
  // the OpenFGA store token straight out of process.env, and a non-terminating
  // function hangs the gateway for every tenant. IsolatedNodeFunctionRuntime
  // forks with a scrubbed env, a heap cap and a wall-clock timeout instead.
  //
  // Registered under the name 'node' on purpose: packs declare `runtime: "node"`
  // and get isolation without opting in. Leaving it under its default name
  // ('node-isolated') would make safety a per-pack decision, which is the wrong
  // default for code the platform operator did not write.
  //
  // Both runtimes are listed because `runtimes` REPLACES the built-in set rather
  // than extending it â€” omitting CEL here would silently remove cel-runtime
  // functions.
  const functionExecutor = new FunctionExecutor({
    schema,
    celEvaluator: cel,
    packDir: packInfos[0]?.packDir,
    // Per-function provenance: a single packDir resolves every pack's entry
    // against whichever pack loaded first (always `core`, which ships none).
    packDirByFunction: functionPackDirs,
    runtimes: [
      new IsolatedNodeFunctionRuntime({ name: 'node', packDir: packInfos[0]?.packDir }),
      new CelFunctionRuntime(),
    ],
    // AI-driven logic building: when an LLM provider is configured, functions
    // declared with `@function(runtime: "llm")` are executable through the
    // LLMFunctionRuntime. Without a provider the runtime is not registered,
    // and an AI function fails at invocation with a clear error rather than
    // silently no-op'ing.
    llmRuntime: new LLMFunctionRuntime({ client: createLLMClient() }),
  });
  if (schema.functionTypes.length > 0) {
    logger.info(`Functions: ${schema.functionTypes.length} function type(s) declared`);
  }

  // â”€â”€ Function Lifecycle Registry â”€â”€
  // Manages draft/publish/test/rollback revisions for user-authored functions.
  // The REST lifecycle routes at /api/v1/functions-lifecycle/* and the GraphQL
  // lifecycle mutations delegate to this registry.
  const functionRegistry = new FunctionRegistry();

  // â”€â”€ Function Pipeline + Webhook Trigger â”€â”€
  // The pipeline orchestrates sourceâ†’draftâ†’testâ†’publish. The webhook trigger
  // receives Git push events and runs the pipeline for matching functions.
  // Enabled when FUNCTION_WEBHOOK_SECRET is set; otherwise advisory-only.
  const gitSource = new GitFunctionSource(process.env['FUNCTION_GIT_BASE_DIR'] ?? '/tmp/altius-git');
  const functionPipeline = new FunctionPipeline(gitSource, functionRegistry, functionExecutor, schema);
  const webhookSecret = process.env['FUNCTION_WEBHOOK_SECRET'];
  const webhookTrigger = webhookSecret
    ? new WebhookPipelineTrigger(functionPipeline, {
        secret: webhookSecret,
        pipelines: [], // Configured per-deployment via FUNCTION_WEBHOOK_PIPELINES env
      })
    : undefined;

  // â”€â”€ Computed Field Evaluator â”€â”€
  // Bridges @computed fields to built-ins (countLinks, lookupField) and
  // to user-authored FunctionTypes when the fn name matches a declared
  // function. Passed into the ObjectManager so LAZY computed fields
  // resolve on read.
  const computedFieldEvaluator = new ComputedFieldEvaluator({
    storage,
    schema,
    functionExecutor,
  });

  // Field provenance: who last wrote each field. ObjectManager has always
  // called a LineageRecorder on create and update, but production never
  // supplied one, so lineage.field_provenance was created by the DDL and
  // stayed empty. Sync conflict resolution reads this to decide whether an
  // incoming source value may overwrite an action's edit; with no producer,
  // both declarable strategies have no input and sync clobbers user edits.
  //
  // Postgres only: the in-memory provider has no provenance table, and a
  // recorder writing nowhere is worse than none â€” it would make the strategy
  // look enforced. Without a recorder the sync path stays refused (sync-boot).
  const lineageRecorder = storage instanceof PostgresStorageProvider
    ? new LineageRecorder({ store: new PostgresLineageStore(storage.pool) })
    : undefined;

  const objectManager = new ObjectManager({
    storage,
    schema,
    eventEmitter: emitter,
    celEvaluator: cel,
    computedFieldEvaluator,
    lineageRecorder,
  });
  const linkManager = new LinkManager({ storage, schema, eventEmitter: emitter });

  // â”€â”€ Bootstrap Seeds â”€â”€
  // Apply seed data from domain packs (idempotent â€” skips objects that already exist).
  // Runs through ObjectManager/LinkManager for full validation, events, and audit.
  // Objects can declare a `ref` label; links reference objects by `ref` or literal ID.
  //
  // Seeded links bypass the action executor, so their ReBAC tuples aren't minted
  // by the pipeline. We capture the resolved (type, fromId, toId) here and mint
  // the matching tuples once the authz layer + linkTupleMap are available below â€”
  // keeping seeded links consistent with runtime-created ones.
  const seededLinkTuples: Array<{ type: string; fromId: string; toId: string }> = [];
  if (seedManifests.length > 0) {
    let seededObjects = 0;
    let seededLinks = 0;
    let skippedObjects = 0;
    // ref â†’ generated _id, shared across all seeds for cross-pack references
    const refMap = new Map<string, string>();

    for (const seed of seedManifests) {
      // Phase 1: Create objects
      for (const obj of seed.objects) {
        // Idempotency: if this ref was seeded in a prior run, try to find it
        // by a unique field. For objects with a `name` field we use that as
        // the natural key. This is best-effort â€” packs with non-unique fields
        // will re-create on each boot (ObjectManager deduplication protects
        // unique-indexed fields from duplicates).
        const nameValue = obj.fields['name'] ?? obj.fields['title'];
        if (nameValue && typeof nameValue === 'string') {
          try {
            const results = await storage.queryObjects(seedCtx, obj.type,
              { field: 'name', operator: 'eq', value: nameValue },
              { limit: 1 },
            );
            if (results.items.length > 0) {
              const existingId = results.items[0]!._id;
              if (obj.ref) refMap.set(obj.ref, existingId);
              skippedObjects++;
              continue;
            }
          } catch {
            // Type may not support filter or field doesn't exist â€” proceed to create
          }
        }
        try {
          const created = await objectManager.create(obj.type, obj.fields, seedCtx);
          const createdId = created['_id'] as string;
          if (obj.ref) refMap.set(obj.ref, createdId);
          logger.info(`Seed: created ${obj.type} '${createdId}' (ref: ${obj.ref ?? 'none'}) from pack '${seed.packName}'`);
          seededObjects++;
        } catch (err) {
          logger.warn({ err }, `Seed: failed to create ${obj.type} from pack '${seed.packName}': ${describeError(err)}`);
        }
      }

      // Phase 2: Create links (after all objects in this seed exist)
      for (const lnk of seed.links) {
        const fromId = refMap.get(lnk.from) ?? lnk.from;
        const toId = refMap.get(lnk.to) ?? lnk.to;
        // Record for tuple minting regardless of create/exists (writes are
        // idempotent), so re-boots backfill tuples for pre-existing seed links.
        seededLinkTuples.push({ type: lnk.type, fromId, toId });
        try {
          await linkManager.createLink(lnk.type, fromId, toId, lnk.fields, seedCtx);
          seededLinks++;
        } catch (err) {
          const msg = describeError(err);
          // Duplicate link is expected on re-run â€” don't warn loudly
          if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('cardinality')) {
            logger.info(`Seed: link ${lnk.type} ${fromId}â†’${toId} already exists, skipping`);
          } else {
            logger.warn({ err }, `Seed: failed to create link ${lnk.type} from pack '${seed.packName}': ${msg}`);
          }
        }
      }
    }

    if (seededObjects > 0 || seededLinks > 0 || skippedObjects > 0) {
      // Always name the tenant: seeds written under the isolating 'system'
      // default are invisible to API reads in another tenant, which otherwise
      // looks like "the seed silently did nothing".
      logger.info(
        `Seed: created ${seededObjects} object(s) + ${seededLinks} link(s), ` +
        `skipped ${skippedObjects} existing (tenant '${seedCtx.tenantId}')`,
      );
      if (!seedTenant) {
        logger.warn(
          `Seed: SEED_TENANT is unset, so seeds were written under the isolated 'system' tenant â€” ` +
          `API reads in another tenant will NOT see them. Set SEED_TENANT to the request tenant ` +
          `(e.g. 'default') if this reference data should be readable through the API.`,
        );
      }
    }
  }

  // â”€â”€ Authentication â”€â”€
  const oidcIssuer = process.env['OIDC_ISSUER'] ?? 'http://localhost:8180/realms/altius';
  const authenticator = new OidcAuthenticator();
  authenticator.configure({
    issuer: oidcIssuer,
    clientId: process.env['OIDC_CLIENT_ID'] ?? 'altius',
    // OIDC_JWKS_URI overrides for non-Keycloak issuers (e.g. NHS CIS2).
    // Default: Keycloak-style path. Set OIDC_JWKS_URI for other providers.
    jwksUri: process.env['OIDC_JWKS_URI'] ?? `${oidcIssuer}/protocol/openid-connect/certs`,
    // Opt-in fallback tenant for IdP tokens that carry no `tenant_id` claim.
    // Unset (undefined) is normalized to null by configure(), preserving the
    // documented fail-closed posture (MISSING_TENANT -> 401). Single-tenant
    // deployments set OIDC_DEFAULT_TENANT=default; multi-tenant deployments leave
    // it unset and map real tenants via a tenant_id claim. See issue #1.
    defaultTenantId: process.env['OIDC_DEFAULT_TENANT'],
  });

  // â”€â”€ Authorization (OpenFGA) â”€â”€
  // One store per tenant: tuples carry no tenant qualifier and object ids are
  // unique only per tenant (storage PK is (_tenant_id, _id)), so a single shared
  // store would let a grant in one tenant authorize the same object id in
  // another. Store ids come from explicit config (parseFgaStoreMap); tenants
  // with no store resolve to undefined and are denied â€” never a default store.
  let fgaClient: OpenFgaClientInterface | FgaClientResolver;
  let fgaStores: ReadonlyMap<string, string> = new Map();
  if (!isDev && process.env['OPENFGA_URL']) {
    fgaStores = parseFgaStoreMap();
    fgaClient = createFgaClientRegistry(process.env['OPENFGA_URL'], fgaStores);
    logger.info(
      `Authorization: OpenFGA @ ${process.env['OPENFGA_URL']} â€” ` +
      `${fgaStores.size} tenant store(s): ${[...fgaStores.keys()].join(', ')}`,
    );
  } else if (isDev) {
    // Dev stub: allow everything.
    // listObjects returns ['*'] sentinel â€” resolvers interpret this as
    // "all objects authorized" and skip the ID-based filter.
    fgaClient = {
      check: async () => ({ allowed: true }),
      listObjects: async () => ({ objects: ['*'] }),
      writeTuples: async () => ({}),
      deleteTuples: async () => ({}),
    };
    logger.warn('Authorization: allow-all stub (development mode)');
  } else {
    // Unreachable in normal operation: the REQUIRED_PROD_VARS guard above exits
    // the process if OPENFGA_URL is missing in production (the store mapping is
    // validated by parseFgaStoreMap). Defence in depth â€” fail closed rather than
    // silently installing an allow-all authorizer if that guard is ever bypassed.
    throw new Error(
      'FATAL: production authorization requires OPENFGA_URL and OPENFGA_STORE_IDS (or OPENFGA_STORE_ID)',
    );
  }
  // Merged OpenFGA model (schema + pack permission overrides). Pure/cheap, so
  // computed unconditionally â€” the relationship grant API derives its allowlist
  // from it even in dev (where the OpenFGA client is the allow-all stub).
  const mergedFgaDsl = permissionOverrides.length > 0
    ? mergeOpenFGAOverrides(generateOpenFGASchema(schema), permissionOverrides)
    : generateOpenFGASchema(schema);
  const fgaModelJson = fgaDslToJson(mergedFgaDsl);
  // Allowlist of directly-grantable [user] relations (e.g. patient.clinician,
  // ward.assigned) for the /api/v1/relationships grant API (Epic A1).
  const grantAllowlist = buildGrantAllowlist(fgaModelJson);

  // Fail fast when the merged model lacks a relation the runtime will check.
  // A pack's permissions/*.fga REPLACES the generated type block, so an override
  // that omits e.g. `viewer` silently removes it â€” every read then hits an
  // OpenFGA 400 and surfaced as a retryable 500 (issue #3). Catch it at boot,
  // naming the type and relation, instead of at request time.
  assertFgaModelCoverage(fgaModelJson, schema, isDev);

  // Deployment policy: which platform roles may grant relationships / record
  // consent. Generic default is `admin` only; an NHS deployment broadens these
  // via env (e.g. RELATIONSHIP_GRANTER_ROLES=admin,nurse_in_charge) rather than
  // forcing clinical role names on every deployment.
  const parseRoles = (v: string | undefined): string[] | undefined => {
    const roles = (v ?? '').split(',').map(r => r.trim()).filter(Boolean);
    return roles.length > 0 ? roles : undefined;
  };
  const granterRoles = parseRoles(process.env['RELATIONSHIP_GRANTER_ROLES']) ?? ['admin'];
  const consentRecorderRoles = parseRoles(process.env['CONSENT_RECORDER_ROLES']) ?? ['admin'];
  // Audit reads expose before/after object snapshots, so they are gated like
  // the other administrative surfaces rather than left open to any caller.
  const auditReaderRoles = parseRoles(process.env['AUDIT_READER_ROLES']) ?? ['admin'];

  // Deployment-defined consent-purpose vocabulary (env CONSENT_PURPOSES). Unset â†’
  // the consent router falls back to the standard NHS/UK-IG preset (back-compat).
  // `DataPurpose` is an open string type, so a non-NHS deployment can define e.g.
  // CONSENT_PURPOSES=KYC,AML_MONITORING. Warn if the default purpose used for
  // read access checks is outside the configured vocabulary.
  const consentPurposes = parseRoles(process.env['CONSENT_PURPOSES']);
  // Object types whose @param marks an action's consent subject (env
  // CONSENT_SUBJECT_TYPES). Unset â†’ ['Patient'] (back-compat); a non-NHS
  // deployment sets its own subject type(s), e.g. Customer.
  const consentSubjectTypes = parseRoles(process.env['CONSENT_SUBJECT_TYPES']);
  const exemptionEnabled = process.env['CONSENT_DIRECT_CARE_EXEMPTION'] === 'true';

  // Fail fast on impossible/ambiguous consent configuration rather than booting
  // into a state operators cannot fix through the API.
  assertConsentConfig({
    consentPurposes,
    defaultPurpose: DEFAULT_CONSENT_PURPOSE,
    exemptionEnabled,
    consentSubjectTypes,
  });

  // Capability-gated facades. The FHIR (/fhir/*) and FDP/CDM (REST /api/v1/cdm/*
  // + the GraphQL cdm* queries) surfaces are NHS-shaped and only enabled when a
  // loaded pack opts in via `capabilities:` in pack.yaml. Computed before the
  // GraphQL schema is built so the SDL, resolvers, and REST mount stay in lockstep.
  const packCapabilities = new Set(packs.flatMap(p => p.capabilities ?? []));
  const cdmEnabled = packCapabilities.has('cdm');
  const fhirEnabled = packCapabilities.has('fhir');
  const mcpEnabled = packCapabilities.has('mcp');
  logger.info(`Capabilities: cdm=${cdmEnabled} fhir=${fhirEnabled} mcp=${mcpEnabled} (declared by loaded packs)`);

  // â”€â”€ OpenFGA Authorization Model Sync â”€â”€
  // Push the merged model to OpenFGA so all pack types are authorized.
  let linkTupleMap: LinkTupleMap | undefined;
  if (!isDev && process.env['OPENFGA_URL'] && fgaStores.size > 0) {
    try {
      const modelJson = fgaModelJson;
      // Derive which ontology links map to ReBAC tuples, so the action pipeline
      // can mint them on link create/delete (only links whose snake(linkType)
      // relation exists in the merged model are synced).
      linkTupleMap = buildLinkTupleMap(schema, modelJson);
      if (linkTupleMap.size > 0) {
        logger.info(`Authorization: ${linkTupleMap.size} link type(s) sync ReBAC tuples (${[...linkTupleMap.keys()].join(', ')})`);
      }
      const fgaUrl = process.env['OPENFGA_URL'];
      // Every tenant has its own store, so the model must be pushed to each one
      // â€” a store without the model answers every check with a 400 and the
      // tenant is (safely, but unusably) denied everything.
      for (const [tenant, storeId] of fgaStores) {
        const resp = await fetch(
          `${fgaUrl}/stores/${storeId}/authorization-models`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(modelJson),
          },
        );
        if (resp.ok) {
          logger.info(`Authorization: OpenFGA model synced to tenant '${tenant}' (${modelJson.type_definitions.length} types)`);
        } else {
          const body = await resp.text();
          logger.warn(`Authorization: OpenFGA model sync failed for tenant '${tenant}' (${resp.status}): ${body}`);
        }
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'Authorization: OpenFGA model sync failed');
    }
  }

  const authorizationService = new AuthorizationService(fgaClient, fieldPermissions);

  // Mandatory markings. Left undefined when no pack declares any, so the
  // enforcement path short-circuits and deployments without markings pay
  // nothing for the feature.
  const markingPolicy = markingConfig.markings.length > 0 || Object.keys(markingConfig.byObjectType).length > 0
    ? new MarkingPolicy({
        markings: markingConfig.markings,
        categories: markingConfig.categories,
        byObjectType: markingConfig.byObjectType,
      })
    : undefined;
  if (markingPolicy) {
    logger.info(
      { markings: markingConfig.markings.length, markedTypes: Object.keys(markingConfig.byObjectType).length },
      'Mandatory markings enabled',
    );
  }

  // â”€â”€ Backfill ReBAC tuples for seeded links â”€â”€
  // Seeded links bypass the action executor (which mints tuples at runtime), so
  // mint their tuples here now that the model + authz layer are ready. Mirrors
  // the executor's syncLinkTuple. Prod-only (linkTupleMap is built from the
  // merged FGA model); idempotent; best-effort.
  if (linkTupleMap && linkTupleMap.size > 0 && seededLinkTuples.length > 0) {
    let minted = 0;
    for (const l of seededLinkTuples) {
      const m = linkTupleMap.get(l.type);
      if (!m || !l.fromId || !l.toId) continue;
      try {
        // Seeded objects live in seedCtx.tenantId, so their tuples belong in
        // that tenant's store. If SEED_TENANT has no store configured this
        // throws and is caught below as a per-tuple warning â€” the same
        // fail-closed posture as a request-time grant for an unmapped tenant.
        await authorizationService.writeRelationship(`${m.toType}:${l.toId}`, m.relation, `${m.fromType}:${l.fromId}`, seedCtx.tenantId);
        minted++;
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : 'unknown', linkType: l.type }, 'Seed: failed to mint ReBAC tuple');
      }
    }
    if (minted > 0) logger.info(`Seed: minted ${minted} ReBAC tuple(s) for seeded links`);
  }

  // â”€â”€ Security Layer (for action pipeline) â”€â”€
  // Derive action-to-FGA mappings from schema actionTypes.
  // E.g., AdmitPatient â†’ check can_admit on patient:<id>
  const actionMappings = deriveActionAuthzMappings(schema);
  // Actions with no ObjectType @param are allowed by the ReBAC layer by design;
  // their only gate is the manifest's preconditions, so verify one exists.
  assertActionAuthzCoverage(schema, manifestRegistry, actionMappings, isDev);
  let security: SecurityLayer;
  if (!isDev) {
    security = createSecurityLayer(authorizationService, actionMappings);
  } else {
    security = { async checkPermission() { return { allowed: true }; } };
  }

  // â”€â”€ Function ReBAC mappings â”€â”€
  // Derive per-function FGA mappings from schema functionTypes, mirroring
  // actionMappings. A function with an ObjectType-typed @param (e.g.
  // ComputeTriageScore with patient: Patient! @param) gets a mapping so
  // invokeFunction checks can_compute_triage_score on patient:<id> before
  // the role-membership gate. Functions without an ObjectType @param have
  // no mapping and fall through to role-only authz.
  const functionAuthzMappings = deriveFunctionAuthzMappings(schema);
  if (functionAuthzMappings.size > 0) {
    logger.info({ count: functionAuthzMappings.size }, 'Function ReBAC mappings derived');
  }

  // â”€â”€ Audit Trail â”€â”€
  const auditStore = (storage instanceof PostgresStorageProvider)
    ? new PostgresAuditStore(storage.pool)
    : new MemoryAuditStore();
  const securityAuditWriter = new AuditWriter(auditStore);
  // Adapt return type: security AuditWriter returns AuditRecord, action pipeline expects void
  const auditWriter = { async write(record: Parameters<typeof securityAuditWriter.write>[0]) { await securityAuditWriter.write(record); } };
  if (storage instanceof PostgresStorageProvider) {
    logger.info('Audit: PostgreSQL (persistent)');
  } else {
    logger.warn('Audit: in-memory (development mode)');
  }

  // â”€â”€ Workflow visualization & monitoring â”€â”€
  // The graph builder derives a provenance graph from the lineage and audit
  // stores. Both are required: a graph from lineage alone misses actions that
  // read without writing, and a graph from audit alone misses the field-level
  // provenance that links a function output to a specific object field.
  //
  // The monitor is an in-memory event store for MVP; a production deployment
  // backs it with the audit table. Both are tenant-scoped and opt-in: a
  // deployment without an audit store or lineage store does not register the
  // workflow routes (the deps are undefined and the routes return
  // "not configured" rather than 500'ing).
  const workflowLineageStore = lineageRecorder
    ? (lineageRecorder as unknown as { store: import('@altius/engine').LineageStore }).store
    : new InMemoryLineageStore();
  const workflowGraphBuilder = new WorkflowGraphBuilder({
    lineageStore: workflowLineageStore,
    auditStore,
  });
  const workflowMonitor = new WorkflowMonitor({ store: new InMemoryWorkflowEventStore() });

  // â”€â”€ Consent Service (Section 7.3) â”€â”€
  // PostgresConsentStore accepts a constructor-level default tenantId but all
  // methods also accept per-call tenantId, threaded from RequestContext by each
  // API layer (GraphQL, REST, FHIR, Actions).
  const consentStore = (storage instanceof PostgresStorageProvider)
    ? new PostgresConsentStore(storage.pool)
    : new MemoryConsentStore();
  // Legitimate-relationship consent exemption (NHS s251 is the reference case).
  // Generic default OFF â€” a deployment opts in via CONSENT_DIRECT_CARE_EXEMPTION
  // and may set the purpose it applies to (CONSENT_EXEMPTION_PURPOSE, default
  // DIRECT_CARE). The NHS reference stack enables it (see docker-compose).
  // (exemptionEnabled + the impossible-config guards are resolved above.)
  // FGA subject-type prefix for the exemption ReBAC check (bare subject id â†’
  // `${type}:${id}`). Derived from the configured action consent-subject type so
  // a non-NHS deployment (CONSENT_SUBJECT_TYPES=Customer) checks `customer:<id>`,
  // not `patient:<id>`. Single entry (validated above); snake-cased; unset â†’
  // ConsentService default 'patient'.
  const exemptionSubjectType = consentSubjectTypes && consentSubjectTypes.length > 0
    ? toSnakeCase(consentSubjectTypes[0]!)
    : undefined;
  const consentService = new ConsentService(consentStore, authorizationService, {
    directCareExemptionEnabled: exemptionEnabled,
    ...(process.env['CONSENT_EXEMPTION_PURPOSE']
      ? { exemptionPurpose: process.env['CONSENT_EXEMPTION_PURPOSE'] }
      : {}),
    ...(exemptionSubjectType ? { subjectType: exemptionSubjectType } : {}),
  });
  logger.info(`Consent: relationship-exemption ${exemptionEnabled ? 'enabled' : 'disabled'}`);
  if (storage instanceof PostgresStorageProvider) {
    logger.info('Consent: PostgreSQL (persistent)');
  } else {
    logger.warn('Consent: in-memory (development mode)');
  }

  // â”€â”€ Action Executor â”€â”€
  const actionEventPublisher = createActionEventPublisher(emitter, schema.linkTypes);
  // â”€â”€ Side-effect handler (webhooks + CloudEvents after action commit) â”€â”€
  const sideEffectHttpClient: SideEffectHttpClient = {
    async post(url, body, options) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 10_000);
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...options?.headers },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        return { status: resp.status };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
  const sideEffectBus: SideEffectEventBus = {
    async emit(event) {
      await eventBus.publish(event as unknown as import('@altius/spi').CloudEvent);
    },
  };
  const sideEffectHandler = new SideEffectExecutor({
    httpClient: sideEffectHttpClient,
    eventBus: sideEffectBus,
    env: process.env,
    // Without this the executor's failure logging is dead code â€” `logger?.` on
    // an unset field â€” and a webhook that exhausts its retries returns
    // success:true with no trace anywhere in the running system.
    logger: pinoSideEffectLogger(logger),
  });

  const actionExecutor = new ActionExecutor({
    storage, security, cel, auditWriter,
    ...(markingPolicy ? { markingPolicy } : {}),
    eventPublisher: actionEventPublisher,
    consentManager: consentService,
    sideEffectHandler,
    // Mint graph-derived ReBAC tuples from link effects (prod only; map is
    // built from the merged OpenFGA model above).
    relationshipWriter: authorizationService,
    linkTupleMap,
  });

  // â”€â”€ Operational automation â”€â”€
  // Declared in pack YAML; runs governed actions on object-change events or a
  // fixed schedule, through the same ActionExecutor under a declared actor.
  // Gated by AUTOMATION_ENABLED (default off): event & schedule triggers must
  // run on ONE instance, not every replica, or each object change fires the
  // action once per pod. Run automation on a single-replica worker deployment.
  let automationRunner: AutomationRunner | null = null;
  if (automationManifests.length > 0 && process.env['AUTOMATION_ENABLED'] === 'true') {
    automationRunner = new AutomationRunner({
      automations: automationManifests,
      subscribe: (handler) => eventBus.subscribe(handler),
      manifestRegistry,
      executor: actionExecutor,
      schema,
      cel,
      storage,
      logger,
      ...(consentSubjectTypes ? { consentSubjectTypes } : {}),
      consentPurpose: DEFAULT_CONSENT_PURPOSE as string,
    });
    automationRunner.start();
    logger.info(`Automation: ${automationManifests.length} automation(s) active`);
  } else if (automationManifests.length > 0) {
    logger.info(
      `Automation: ${automationManifests.length} manifest(s) loaded but AUTOMATION_ENABLED!='true' â€” not started. ` +
      `Enable on a single instance (running on every replica would fire each trigger N times).`,
    );
  }

  // â”€â”€ Object Sets â”€â”€
  // Persistent (durable across restarts, shared across pods) when backed by
  // PostgreSQL; in-memory otherwise.
  const objectSetStore = (storage instanceof PostgresStorageProvider)
    ? new PostgresObjectSetStore(storage.pool)
    : new InMemoryObjectSetStore();
  const objectSetManager = new ObjectSetManager(objectSetStore, objectManager);

  // â”€â”€ Connector Registry â”€â”€
  // Create the default registry (jdbc + rest built-in), then validate that
  // all pack-declared connectors reference a registered plugin type.
  const { createDefaultRegistry } = await import('@altius/sync');
  const connectorRegistry = createDefaultRegistry();
  for (const cm of connectorManifests) {
    if (connectorRegistry.has(cm.connector)) {
      logger.info(`Connector: '${cm.config['datasource'] ?? cm.connector}' (${cm.connector}) from pack '${cm.packName}'`);
    } else {
      logger.warn(`Connector: unknown type '${cm.connector}' in pack '${cm.packName}', skipping`);
    }
  }

  // â”€â”€ Sync Scheduler â”€â”€
  // Opt-in driver loop for POLLING/CDC/BATCH datasources (OVERLAY stays a
  // read-through cache). Writes bypass the action pipeline by design
  // (Spec Section 6) under the sync tenant/actor.
  let syncBoot: import('./sync-boot.js').SyncBootResult = { scheduler: null, scheduled: [], stop: async () => {} };
  if (process.env.SYNC_SCHEDULER_ENABLED === 'true') {
    const { startSyncScheduler } = await import('./sync-boot.js');
    syncBoot = await startSyncScheduler({
      connectorManifests: connectorManifests.filter(cm => connectorRegistry.has(cm.connector)),
      registry: connectorRegistry,
      objectManager,
      tenantId: process.env.SYNC_TENANT || process.env.SEED_TENANT || 'system',
    });
  }
  // Always exported, 0 or 1. The per-datasource sync gauges only exist once a
  // scheduler has registered a datasource, so without this a deployment with
  // ingestion off emits no sync series at all and every sync alert stays silent
  // rather than firing.
  syncSchedulerEnabled.set(syncBoot.scheduler ? 1 : 0);
  const stopSyncMetricsGauge = syncBoot.scheduler ? startSyncMetricsGauge(syncBoot.scheduler) : (() => {});

  // ── Data Connection Gateway ──
  // Agent-based counterpart of the scheduler: runtime-AGENT datasources are
  // leased to Data Connection Agents enrolled from inside customer networks
  // (outbound-only HTTPS — the platform never dials into the customer side).
  // The HTTP endpoints are mounted further down, next to the ingest webhook.
  let dataConnectionBoot: import('./data-connection-boot.js').DataConnectionBootResult = {
    gateway: null,
    leasable: [],
  };
  const dataConnectionSecret = process.env.DATA_CONNECTION_ENROLLMENT_SECRET;
  if (dataConnectionSecret) {
    const { startAgentGateway } = await import('./data-connection-boot.js');
    dataConnectionBoot = await startAgentGateway({
      // Deliberately NOT filtered by the platform's connectorRegistry: an
      // AGENT datasource's plugin has to exist in the *agent's* local
      // registry (lease eligibility checks the agent's reported list), not
      // in this process.
      connectorManifests,
      enrollmentSecret: dataConnectionSecret,
      objectManager,
      tenantId: process.env.SYNC_TENANT || process.env.SEED_TENANT || 'system',
    });
  }

  // ── API Dependencies ──

  // LLM client selected from LLM_PROVIDER / LLM_FALLBACK_PROVIDER /
  // LLM_EMBEDDING_PROVIDER. The no-op when all are unset, so a platform with
  // no provider still boots and answers 503 on the LLM routes.
  const llmClient = createLLMClient();

  // LLM gateway â€” wraps the client with a model catalog, usage tracking, and
  // rate limiting. Only constructed when the client is configured (not the
  // no-op); a deployment without a provider skips the gateway and the
  // /api/v1/llm/models, /chat/completions, /usage, /rate-limits routes are
  // not registered.
  //
  // Usage tracking and rate limiting use Postgres-backed implementations when
  // a Postgres storage provider is configured (durable, shared across replicas);
  // in-memory otherwise (lost on restart, single-replica only).
  const isPostgres = storage instanceof PostgresStorageProvider;
  const pgPool = isPostgres ? (storage as PostgresStorageProvider).pool : null;
  const approvalWorkflowService = pgPool
    ? new PostgresApprovalWorkflowService(pgPool)
    : new InMemoryApprovalWorkflowService();
  const embeddingStore = pgPool ? new PostgresEmbeddingStore(pgPool) : new InMemoryEmbeddingStore();

  // Services with no Postgres implementation keep their state in process memory.
  // Without a Postgres pool that is the only option and matches the deployment
  // (single process, nothing durable claimed). With one, the deployment does
  // claim durability, so they are withheld unless the operator opts in.
  const nonDurableServicesEnabled = shouldRegisterNonDurableServices(pgPool !== null);

  let llmGateway: ApiDependencies['llmGateway'];
  if (llmClient.isConfigured()) {
    const llmModels = buildLlmModelCatalog(process.env);
    const usageTracker = pgPool
      ? new PostgresLLMUsageTracker(pgPool)
      : new InMemoryLLMUsageTracker();
    const rateLimiter = pgPool
      ? new PostgresLLMRateLimiter(pgPool)
      : new InMemoryLLMRateLimiter();
    llmGateway = new DefaultLLMGateway({
      llmClient,
      models: llmModels,
      usageTracker,
      rateLimiter,
    });
  }

  // â”€â”€ Non-durable platform services â”€â”€
  // These have no Postgres implementation: each keeps per-tenant state in a
  // process-local Map, so it is lost on restart and NOT shared across replicas.
  // Under Postgres they are withheld unless explicitly allowed â€” registering
  // them there would answer 200 while dropping the write, and the shipped Helm
  // values run the gateway at minReplicas 2, so a write served by one pod would
  // already be invisible to the next read. Withholding leaves each route
  // module's own dep check to skip registration, which is a clean 404. See
  // shouldRegisterNonDurableServices in config.ts.
  //
  // Every entry here is non-durable by definition: give a service a Postgres
  // implementation and it moves out of this object, up to the `pgPool ? â€¦ : â€¦`
  // stores below â€” which is exactly what a Postgres-backing PR should do to it.
  // The boot log names whatever is in here, so it stays accurate as the set
  // changes.
  //
  // Services that have since gained a Postgres implementation (see the
  // `pgPool ? â€¦ : â€¦` stores in the deps literal below) graduate OUT of this
  // object â€” they are durable and belong on the always-registered path. This
  // object holds only what is still memory-only.
  //
  // The in-memory DatasetService is now only the non-Postgres fallback (see
  // the `datasetService` entry in the deps literal). It is still built here
  // because the in-memory metadata service reads dataset state through this
  // same instance.
  const datasets = new InMemoryDatasetService();
  // Built above the gate so both copilot surfaces can be handed the same store.
  // Non-durable either way â€” there is no Postgres copilot implementation yet â€”
  // so it stays inside `nonDurableServices` below rather than graduating.
  const copilots = new InMemoryEmbeddedCopilotService();

  const nonDurableServices = nonDurableServicesEnabled
    ? {
      // Model inference and chain services â€” in-memory only.
      // Model services â€” Postgres-backed when available; scenario service
      // wires to the inference/chain services regardless of backing.
      ...(() => {
        if (pgPool) {
          const registry = new PostgresModelRegistryService(pgPool);
          const inference = new PostgresModelInferenceService(pgPool);
          const chain = new PostgresModelChainService(pgPool);
          const scenarios = new InMemoryScenarioService({ inferenceService: inference, chainService: chain });
          return { modelRegistryService: registry, modelInferenceService: inference, modelChainService: chain, scenarioService: scenarios };
        }
        const registry = new InMemoryModelRegistryService();
        const inference = new InMemoryModelInferenceService(registry);
        const chain = new InMemoryModelChainService(inference);
        const scenarios = new InMemoryScenarioService({ inferenceService: inference, chainService: chain });
        return { modelRegistryService: registry, modelInferenceService: inference, modelChainService: chain, scenarioService: scenarios };
      })(),
      // Workshop platform service â€” in-memory app definition persistence.
      workshopPlatformService: new InMemoryWorkshopPlatformService(),
      // App embedding & cross-app widgets â€” in-memory app registry, commands, pairing.
      embeddingService: new InMemoryEmbeddingService(),
      // Platform resources â€” in-memory resource catalog and object linking.
      platformResourceService: new InMemoryPlatformResourceService(),
      // Saved views, design system, approval workflows, change proposals â€”
      // graduated to durable services (see deps literal below).
      // User directory â€” graduated to durable service above.
      // Layout/device-capture â€” graduated to durable service above.
      // API Tooling services â€” in-memory only (no Postgres implementations yet).
      ontologyManagerService: new InMemoryOntologyManagerService(),
      valueFormattingService: new InMemoryValueFormattingService(),
      ontologyChangeHistoryService: new InMemoryOntologyChangeHistoryService(),
      // Workshop UI services.
      commandExchangeService: new InMemoryCommandExchangeService(),
      graphService: new InMemoryGraphService(),
      // Previously-unreachable services â€” in-memory only, wired so they have a
      // REST surface when the non-durable gate is open.
      agentEvaluationService: new InMemoryAgentEvaluationService(),
      conflictResolutionService: new InMemoryConflictResolutionService(),
      connectorCatalogService: new InMemoryConnectorCatalogService(),
      dataExpectationsService: new InMemoryDataExpectationsService(),
      // One copilot store, two surfaces. `embeddedCopilotService` configures
      // copilots; `copilotService` is the view-facing suggest/apply half, and it
      // is handed the same instance. They used not to be: the second built its
      // own private store, so a copilot configured with `canExecuteActions:`n      // false` was never found and suggestions came from a fabricated copilot
      // with it set true â€” bypassing the one place the flag is enforced.
      embeddedCopilotService: copilots,
      eventObjectService: new InMemoryEventObjectService(),
      graphAnalysisService: new InMemoryGraphAnalysisService(),
      multiOntologyGovernanceService: new InMemoryMultiOntologyGovernanceService(),
      pipelineBuildService: new InMemoryPipelineBuildService(),
      platformAssistantService: new InMemoryPlatformAssistantService(),
      processMiningService: new InMemoryProcessMiningService(),
      // Pipeline Data Ops â€” Pipeline & Data Ops.
      sqlQueryService: new InMemorySqlQueryService(datasets),
      rulesEngineService: new InMemoryRulesEngineService(),
      pipelineService: new InMemoryPipelineService(),
      syncCdcService: new InMemorySyncCdcService(),
      datasourceService: new InMemoryDatasourceService(),
      buildTriggerService: new InMemoryBuildTriggerService(),
      sqlAnalyticsService: new InMemorySqlAnalyticsService(),
      // AIP LLM â€” AIP/LLM Platform.
      agentService: new InMemoryAgentService(llmClient),
      modelCatalogService: new InMemoryModelCatalogService(llmClient),
      evalService: new InMemoryEvalService(),
      humanInTheLoopService: new InMemoryHumanInTheLoopService(),
      vectorSearchService: new InMemoryVectorSearchService(embeddingStore, llmClient),
      copilotService: new InMemoryCopilotService(copilots),
      }
    : {};

  if (pgPool) {
    const names = Object.keys(nonDurableServices).sort().join(', ');
    if (nonDurableServicesEnabled) {
      logger.warn(
        `ALLOW_NON_DURABLE_SERVICES=true â€” these are served from process memory on a Postgres deployment: ${names}. ` +
          'Their state is lost on restart and is not shared across replicas, so run a single gateway replica and do not keep real data in them.',
      );
    } else {
      logger.info(
        'Non-durable services withheld: they have no Postgres implementation, so their routes are not registered and answer 404. ' +
          'Set ALLOW_NON_DURABLE_SERVICES=true to serve them from process memory on a single-replica prod-test stack.',
      );
    }
  }

  const deps: ApiDependencies = {
    schema,
    objectManager,
    linkManager,
    actionExecutor,
    authorizationService,
    authenticator,
    consentService,

    ...(markingPolicy ? { markingPolicy } : {}),
    storage,
    manifestRegistry,
    objectSetManager,
    functionExecutor,
    functionAuthzMappings,
    functionRegistry,
    auditWriter: securityAuditWriter,
    auditStore,
    grantAllowlist,
    granterRoles,
    consentRecorderRoles,
    auditReaderRoles,
    consentPurposes,
    ...(consentSubjectTypes ? { consentSubjectTypes } : {}),
    cdmEnabled,
    llmClient,
    // Governed LLM gateway â€” only when a provider is configured.
    ...(llmGateway ? { llmGateway } : {}),
    // Workflow visualization & monitoring surfaces. Both are opt-in: a
    // deployment without an audit store or lineage store does not register
    // the workflow routes.
    ...(workflowGraphBuilder ? { workflowGraphBuilder } : {}),
    workflowMonitor,

    // â”€â”€ Platform stores â”€â”€
    // Postgres-backed when a Postgres storage provider is configured
    // (durable, shared across replicas); in-memory otherwise (lost on
    // restart, single-replica only). The REST routes are registered
    // unconditionally â€” each route handler checks for the dep and returns
    // 503 when absent.
    blobStore: pgPool ? new PostgresBlobStore(pgPool) : new InMemoryBlobStore(),
    timeSeriesStore: pgPool ? new PostgresTimeSeriesStore(pgPool) : new InMemoryTimeSeriesStore(),
    branchStore: pgPool ? new PostgresBranchStore(pgPool) : new InMemoryBranchStore(),
    commentStore: pgPool ? new PostgresCommentStore(pgPool) : new InMemoryCommentStore(),
    notificationStore: pgPool ? new PostgresNotificationStore(pgPool) : new InMemoryNotificationStore(),
    embeddingStore,
    // Services that graduated from non-durable to durable: these now have
    // Postgres implementations and are always registered. The in-memory
    // fallback is for development (no pgPool); under Postgres the durable
    // implementation serves the route.
    alertingService: pgPool ? new PostgresAlertingService(pgPool) : new InMemoryAlertingService(),
    // Geospatial map service â€” Postgres-backed when available.
    geospatialMapService: pgPool ? new PostgresGeospatialMapService(pgPool) : new InMemoryGeospatialMapService(),
    // Data freshness â€” Postgres-backed when available.
    dataFreshnessService: pgPool ? new PostgresDataFreshnessService(pgPool) : new InMemoryDataFreshnessService(),
    // Security governance â€” JustificationStore is Postgres-backed when
    // available; ScopedSessionStore is below. The AccessExplanationService
    // runs the live marking policy and consent service (next block).
    justificationStore: pgPool ? new PostgresJustificationStore(pgPool) : new InMemoryJustificationStore(),
    // The explanation runs the live marking policy and consent service, not a
    // default-allow placeholder â€” an explanation that disagrees with the read
    // path sends the operator to debug the wrong layer.
    accessExplanationService: new DefaultAccessExplanationService({
      authorizationService,
      ...(markingPolicy ? { markingPolicy } : {}),
      ...(consentSubjectTypes ? { consentSubjectTypes } : {}),
      ...(consentService ? { consent: consentService } : {}),
    }),
    // ScopedSessionStore â€” Postgres-backed when available.
    scopedSessionStore: pgPool ? new PostgresScopedSessionStore(pgPool) : new InMemoryScopedSessionStore(),
    // Ontology SQL â€” Postgres-backed when available; falls back to in-memory
    // with ObjectManager delegation for ontology reads.
    ontologySqlService: pgPool ? new PostgresOntologySqlService(pgPool) : new InMemoryOntologySqlService(async (ctx, objectType) => {
      const page = await objectManager.query(objectType, {}, { limit: 10000 }, ctx);
      return page.items.map((obj: Record<string, unknown>) => ({
        id: obj['_id'] as string,
        properties: obj,
      }));
    }),
    // Datasets â€” Postgres-backed when available, so rows, the transaction log
    // and branches survive a restart and are shared across replicas. This
    // graduated out of `nonDurableServices`: the dataset routes answered 404 on
    // a Postgres deployment until there was somewhere durable to put the rows.
    datasetService: pgPool ? new PostgresDatasetService(pgPool) : datasets,
    // Dataset metadata â€” Postgres-backed when available. It reads the same
    // `dataset.metadata` table PostgresDatasetService writes; before that store
    // existed nothing populated it, so this answered 200 with an empty list on
    // every Postgres deployment. The in-memory fallback shares the `datasets`
    // instance above for the same reason.
    datasetMetadataService: pgPool ? new PostgresDatasetMetadataService(pgPool) : new InMemoryDatasetMetadataService(datasets),
    // Variable transform pipelines — Postgres-backed when available. The
    // definitions are user-authored configuration, so a restart eating them is
    // not something a caller can retry past. Step execution itself is shared
    // code in @altius/spi, because a pipeline produces a value something
    // downstream uses and the two providers must not disagree about it.
    // Graduated out of `nonDurableServices`.
    variableTransformService: pgPool ? new PostgresVariableTransformService(pgPool) : new InMemoryVariableTransformService(),
    // Change proposals — Postgres-backed when available. This is the audit
    // Change proposals â€” Postgres-backed when available. This is the audit
    // trail for AI-driven changes: who approved what, and when. It graduated
    // out of `nonDurableServices`, where the gate withheld it under Postgres
    // rather than accept approvals it would lose on restart.
    changeProposalStore: pgPool ? new PostgresChangeProposalStore(pgPool) : new InMemoryChangeProposalStore(),
    // Business rules â€” Postgres-backed when available. `state` is what decides
    // whether a rule governs anything, so losing it silently reverts a rule to
    // draft: nothing looks broken, the rule just stops applying.
    businessRulesService: pgPool ? new PostgresBusinessRulesService(pgPool) : new InMemoryBusinessRulesService(),
    // Usage metrics â€” Postgres-backed when available. The record() method is
    // an instrumentation hook; query/summary endpoints read from Postgres.
    usageMetricsService: pgPool ? new PostgresOntologyUsageMetricsService(pgPool) : new InMemoryOntologyUsageMetricsService(),
    // Approval workflows â€” Postgres-backed when available. The workflow and
    // submission tables are tenant-scoped and the same state machine as the
    // in-memory service.
    approvalWorkflowService,
    // Kiosk sessions â€” Postgres-backed when available. Long-lived read-only
    // display sessions are durable and shared across replicas.
    kioskService: pgPool ? new PostgresKioskService(pgPool) : new InMemoryKioskService(),
    // Saved views â€” Postgres-backed when available; private views are owner-only.
    savedViewStore: pgPool ? new PostgresSavedViewStore(pgPool) : new InMemorySavedViewStore(),
    // User directory â€” Postgres-backed when available; read-only SPI plus
    // tenant-isolated administrative group membership.
    userDirectoryService: pgPool ? new PostgresUserDirectoryService(pgPool) : new InMemoryUserDirectoryService(),
    // Design system themes â€” Postgres-backed when available.
    designSystemService: pgPool ? new PostgresDesignSystemService(pgPool) : new InMemoryDesignSystemService(),
    // Layout, device-capture, and deep-link resolution â€” Postgres-backed when available.
    layoutDeviceCaptureService: pgPool ? new PostgresLayoutDeviceCaptureService(pgPool) : new InMemoryLayoutDeviceCaptureService(),
    // Agent threads â€” Postgres-backed when available.
    agentThreadStore: pgPool ? new PostgresAgentThreadStore(pgPool) : new InMemoryAgentThreadStore(),
    // Object set filter states â€” Postgres-backed when available.
    objectSetFilterStore: pgPool ? new PostgresObjectSetFilterStore(pgPool) : new InMemoryObjectSetFilterStore(),
    // Data expectations â€” Postgres-backed when available; evaluation is computational.
    dataExpectationsService: pgPool ? new PostgresDataExpectationsService(pgPool) : new InMemoryDataExpectationsService(),
    // Connector catalog â€” Postgres-backed when available; vendor catalog is static.
    connectorCatalogService: pgPool ? new PostgresConnectorCatalogService(pgPool) : new InMemoryConnectorCatalogService(),
    // Commands and chains â€” Postgres-backed when available; execution is delegated.
    commandService: pgPool ? new PostgresCommandService(pgPool) : new InMemoryCommandService(),
    // Workshop UX — state saving, redact mode, performance profiles, and i18n — Postgres-backed when available.
    workshopUxService: pgPool ? new PostgresWorkshopUxService(pgPool) : new InMemoryWorkshopUxService(),

    // Non-durable platform services â€” withheld under Postgres unless opted in.
    // Built and explained above.
    ...nonDurableServices,
  };

  // â”€â”€ Express + HTTP Server â”€â”€
  const app = express();

  // Trust proxy headers (X-Forwarded-For) when behind ingress/load balancer.
  // Required for req.ip to reflect the real client IP, not the proxy IP.
  // In production, Kubernetes ingress terminates TLS and forwards traffic.
  if (!isDev) {
    app.set('trust proxy', 1); // trust first hop (ingress controller)
  }

  const httpServer = http.createServer(app);

  // â”€â”€ GraphQL (Apollo Server + WebSocket Subscriptions) â”€â”€
  // Single executable schema shared by both Apollo (HTTP) and graphql-ws (WS)
  // transports. This guarantees mutations and subscriptions use the same PubSub.
  const { server: apolloServer, pubsub, executableSchema, complexityAnalyzer } = createGraphQLServer({ schema, deps, isDev });

  // WebSocket server for GraphQL subscriptions (graphql-ws protocol)
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
    maxPayload: 64 * 1024, // 64 KB â€” GraphQL subscription payloads are small
  });
  const subscriptionRegistry = new SubscriptionRegistry();
  deps.subscriptionRegistry = subscriptionRegistry;
  // Close a subject's live streams when their consent is revoked. Injected
  // here rather than at ConsentService construction because the subscription
  // layer is built later in boot and depends on the consent service.
  consentService?.setSubscriptionTerminator(
    (tenantId, subjectId) => subscriptionRegistry.terminateForSubject(tenantId, subjectId),
  );

  const subscriptionManager = new SubscriptionManager({
    pubsub,
    eventBus,
    authenticate: async (connectionParams) => {
      const token = connectionParams?.['Authorization'] ?? connectionParams?.['authorization'];
      if (!token || typeof token !== 'string') {
        // Dev mode is allow-all: HTTP requests without a bearer token get a
        // synthetic dev user (extractUser). Mirror that for WebSocket
        // subscriptions so the dev experience is consistent â€” otherwise
        // subscriptions fail closed (the change-event filters require a user)
        // even though every other surface is open. Production still requires a
        // token (fail closed below).
        if (isDev) {
          const user = await extractUser({ headers: {} } as import('express').Request, authenticator, isDev);
          return { authenticated: true, user };
        }
        return { authenticated: false, error: 'Missing Authorization in connection params' };
      }
      try {
        const user = await extractUser(
          { headers: { authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } } as import('express').Request,
          authenticator,
          isDev,
        );
        return { authenticated: true, user };
      } catch {
        return { authenticated: false, error: 'Invalid token' };
      }
    },
  });

  // Per-connection subscription tracking â€” prevents subscription-flood DoS.
  const MAX_SUBSCRIPTIONS_PER_CONNECTION = 50;
  const subscriptionCounts = new WeakMap<object, number>();

  const wsCleanup = useServer(
    {
      schema: executableSchema,
      context: async (ctx) => {
        const params = (ctx.connectionParams ?? {}) as Record<string, unknown>;
        const authResult = await subscriptionManager.authenticateConnection(params);
        if (!authResult.authenticated) {
          throw new Error(authResult.error);
        }
        return buildResolverContext(authResult.user, deps);
      },
      // graphql-ws carries QUERIES and MUTATIONS as well as subscriptions, so
      // this hook is the WebSocket equivalent of the HTTP request path â€” and it
      // enforced neither of the two gates that path applies. A principal
      // holding any valid token could run unlimited operations of unbounded
      // depth and cost simply by opening a socket instead of POSTing, which
      // made both HTTP controls advisory rather than enforced.
      onSubscribe: async (ctx, message) => {
        const key = (ctx as { extra?: object }).extra ?? ctx;
        return guardWsOperation(
          {
            complexityAnalyzer,
            rateLimiter,
            subscriptionManager,
            maxSubscriptionsPerConnection: MAX_SUBSCRIPTIONS_PER_CONNECTION,
          },
          (ctx.connectionParams ?? {}) as Record<string, unknown>,
          (message.payload as { query?: string } | undefined)?.query,
          {
            get: () => subscriptionCounts.get(key) ?? 0,
            set: (n) => subscriptionCounts.set(key, n),
          },
        );
      },
      onComplete: (ctx) => {
        const key = (ctx as { extra?: object }).extra ?? ctx;
        const count = subscriptionCounts.get(key) ?? 1;
        subscriptionCounts.set(key, Math.max(0, count - 1));
      },
    },
    wsServer as never,
  );

  subscriptionManager.start();

  apolloServer.addPlugin(ApolloServerPluginDrainHttpServer({ httpServer }) as never);
  apolloServer.addPlugin({
    async serverWillStart() {
      return {
        async drainServer() {
          automationRunner?.stop();
          subscriptionManager.stop();
          await wsCleanup.dispose();
        },
      };
    },
  });
  await apolloServer.start();

  // Security headers (disable CSP for GraphQL playground in dev)
  app.use(helmet({ contentSecurityPolicy: isDev ? false : undefined }));

  // CORS: restrict origins in production (fail-closed), allow-all in dev
  const corsOrigins = process.env['CORS_ALLOWED_ORIGINS']?.split(',').map(s => s.trim()).filter(Boolean);
  if (!isDev && (!corsOrigins || corsOrigins.length === 0)) {
    // Production: deny all cross-origin requests when not configured
    logger.warn('WARNING: CORS_ALLOWED_ORIGINS not set â€” all cross-origin requests will be denied. Set CORS_ALLOWED_ORIGINS if a frontend needs API access.');
    app.use(cors({ origin: false }));
  } else if (!isDev) {
    app.use(cors({ origin: corsOrigins, credentials: true }));
  } else {
    app.use(cors());
  }

  app.use(express.json({ limit: '1mb' }));

  // Pre-auth IP-based rate limiter: protects against unauthenticated floods
  // (auth+JWKS work is expensive; this gate runs before identity extraction)
  // Only per-IP (principal) limiting â€” no global tenant cap for unauthenticated traffic.
  // Explicit undefined suppresses defaults from shallow merge in both limiter constructors.
  const ipLimiterConfig = { tenant: undefined, principal: { windowMs: 60_000, maxRequests: 300 }, clientApp: undefined };
  const ipRateLimiter: RateLimiter = redisClient
    ? new RedisRateLimiter(redisClient, { config: ipLimiterConfig, keyPrefix: 'rl:ip:' })
    : new SlidingWindowRateLimiter(ipLimiterConfig);
  app.use(async (req, res, next) => {
    try {
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const result = await ipRateLimiter.check({ tenantId: 'global', principalId: ip });
      if (!result.allowed) {
        res.setHeader('Retry-After', String(Math.ceil((result.resetAt - Date.now()) / 1000)));
        res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', retryable: true } });
        return;
      }
    } catch (err) {
      // Fail open: rate limiter error should not block requests
      logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'IP rate limiter error, failing open');
    }
    next();
  });

  // â”€â”€ Prometheus metrics â”€â”€
  app.use(metricsMiddleware);
  // Block external access to /metrics â€” Prometheus ServiceMonitor scrapes pod
  // directly (bypassing ingress). Requests through ingress carry X-Forwarded-For.
  app.get('/metrics', podDirectOnly(isDev), metricsEndpoint);
  const stopHealthGauge = startStorageHealthGauge(storage);

  // â”€â”€ Health check â”€â”€
  // /health â€” used by readiness probe. Storage is the only CRITICAL dependency,
  // so only it can return 503: the rest are reported as degraded on a 200
  // because the gateway already survives without them (the rate limiter fails
  // open, the event bus falls back to in-memory). Failing readiness on those
  // would turn a QoS wobble into an outage.
  const healthProbes: HealthProbe[] = [
    { name: 'storage', critical: true, check: async () => (await storage.healthCheck()).healthy },
  ];
  if (!isDev && process.env['OPENFGA_URL']) {
    const fgaUrl = process.env['OPENFGA_URL'];
    healthProbes.push({
      name: 'openfga',
      check: async () => (await fetch(`${fgaUrl}/healthz`, { signal: AbortSignal.timeout(2_000) })).ok,
    });
  }
  if (cel instanceof CelClient) {
    healthProbes.push({ name: 'cel', check: () => cel.healthCheck() });
  }
  if (redisClient) {
    healthProbes.push({ name: 'redis', check: async () => (await redisClient.ping()) === 'PONG' });
  }
  if (eventBus instanceof RedpandaEventBus) {
    healthProbes.push({ name: 'eventBus', check: async () => eventBus.isConnected() });
  }

  app.get('/health', async (_req, res) => {
    try {
      const report = await buildHealthReport(healthProbes);
      res.status(report.httpStatus).json(report.body);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'Health check failed');
      res.status(503).json({ status: 'unhealthy', service: 'api-gateway' });
    }
  });
  // /healthz â€” liveness probe (lightweight, always pass if process is up)
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'pass' });
  });
  app.get('/.well-known/apollo/server-health', (_req, res) => {
    res.json({ status: 'pass' });
  });

  // â”€â”€ Admin endpoints â”€â”€
  // Register Prometheus gauges for loaded packs
  for (const info of packInfos) {
    packLoaded.set(
      { name: info.manifest.name, version: info.manifest.version, origin: info.external ? 'external' : 'primary' },
      1,
    );
  }

  // GET /admin/packs â€” introspection of loaded domain packs; pod-internal
  // only (same posture as /metrics â€” pack metadata is not for external eyes)
  app.get('/admin/packs', podDirectOnly(isDev), (_req, res) => {
    res.json({
      packs: packInfos.map(info => ({
        name: info.manifest.name,
        version: info.manifest.version,
        namespace: info.manifest.namespace,
        description: info.manifest.description ?? null,
        external: info.external,
        objectTypes: info.typeCounts.objectTypes,
        linkTypes: info.typeCounts.linkTypes,
        actionTypes: info.typeCounts.actionTypes,
        functionTypes: info.typeCounts.functionTypes,
        connectors: connectorManifests.filter(c => c.packName === info.manifest.name).length,
        permissions: (info.manifest.permissions ?? []).filter(f => f.endsWith('.fga')).length,
      })),
      totals: {
        objectTypes: schema.objectTypes.length,
        linkTypes: schema.linkTypes.length,
        actionTypes: schema.actionTypes.length,
        functionTypes: schema.functionTypes.length,
        connectors: connectorManifests.length,
      },
    });
  });

  // â”€â”€ GraphQL at /graphql â”€â”€
  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async ({ req }): Promise<ResolverContext> => {
        authorizationService.clearFieldCache();
        try {
          const user = await extractUser(req, authenticator, isDev);

          // Rate limit check
          const rlResult = await rateLimiter.check({ tenantId: user.tenantId, principalId: user.id } as RateLimitIdentity);
          if (!rlResult.allowed) {
            throw new GraphQLError(`Rate limit exceeded (by ${rlResult.exceededBy})`, {
              extensions: {
                code: 'RATE_LIMITED',
                http: { status: 429 },
                retryAfter: Math.ceil((rlResult.resetAt - Date.now()) / 1000),
              },
            });
          }

          return buildResolverContext(user, deps);
        } catch (err) {
          // Map auth failures to proper GraphQL errors with 401 status
          if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
            throw new GraphQLError('Authentication required', {
              extensions: {
                code: 'UNAUTHENTICATED',
                http: { status: 401 },
              },
            });
          }
          throw err;
        }
      },
    }),
  );

  // â”€â”€ REST at /api/v1/* â”€â”€
  const restRoutes = [
    ...generateRestRoutes(schema, deps),
    ...generateAuditRoutes(deps),
    ...generateTraverseRoutes(deps),
    ...generateRelationshipRoutes(deps, grantAllowlist),
    ...generateConsentRoutes(deps),
    ...generateLlmRoutes(deps),
    ...generateWorkflowRoutes(deps),
    // Sync scheduler status. Registered unconditionally so the endpoint can
    // report "not running" â€” the state an operator most needs to see, and the
    // one an absent route cannot express.
    ...generateSyncStatusRoutes({
      enabled: syncBoot.scheduler !== null,
      datasources: () => syncBoot.scheduler?.stats() ?? [],
    }, deps.auditReaderRoles),
    // Data-connection gateway status — registered unconditionally for the
    // same reason as sync status: "not running" must be reportable.
    ...generateDataConnectionStatusRoutes({
      enabled: dataConnectionBoot.gateway !== null,
      status: async () => (await dataConnectionBoot.gateway?.status()) ?? { agents: [], datasources: [] },
    }, deps.auditReaderRoles),
  ];
  for (const route of restRoutes) {
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
    app[method](route.pattern, async (req, res) => {
      try {
        authorizationService.clearFieldCache();
        const user = await extractUser(req, authenticator, isDev);

        // Rate limit check
        const rlResult = await rateLimiter.check({ tenantId: user.tenantId, principalId: user.id } as RateLimitIdentity);
        if (!rlResult.allowed) {
          res.setHeader('Retry-After', String(Math.ceil((rlResult.resetAt - Date.now()) / 1000)));
          res.status(429).json({ error: { code: 'RATE_LIMITED', message: `Rate limit exceeded (by ${rlResult.exceededBy})`, retryable: true } });
          return;
        }

        const restReq: RestRequest = {
          method: req.method,
          path: req.path,
          params: req.params as Record<string, string>,
          query: req.query as Record<string, string>,
          body: req.body as Record<string, unknown>,
          user,
          headers: req.headers as Record<string, string | undefined>,
        };
        const ctx: ResolverContext = buildResolverContext(user, deps);

        // Mandatory markings, checked BEFORE the route runs and before any
        // authorization: a marking restricts access where a role expands it,
        // so holding `editor` or `admin` must not get past one.
        //
        // The answer is 404, not 403. Markings restrict DISCOVERY â€” a 403
        // confirms the type exists and that something is being withheld,
        // which is the disclosure the marking was applied to prevent.
        if (!isTypeVisible(deps.markingPolicy, user, route.objectType)) {
          const missing = missingMarkings(deps.markingPolicy, user, route.objectType);
          // The caller is told nothing; the trail records exactly what was
          // unsatisfied so a DPO can answer why.
          await writeReadAuditFor(
            deps.auditWriter,
            { id: user.id, roles: user.roles, tenantId: user.tenantId },
            {
              type: 'read',
              ...(route.objectType ? { objectType: route.objectType } : {}),
              query: `${restReq.method} ${restReq.path}`,
              result: 'denied',
            },
          );
          logger.warn(
            { objectType: route.objectType, actor: user.id, missing },
            'Read withheld: caller does not satisfy mandatory markings',
          );
          res.status(404).json({
            error: { code: 'NOT_FOUND', message: 'Not found', retryable: false },
          });
          return;
        }

        const startedAt = Date.now();
        const result = await route.handler(restReq, ctx);
        await auditRead(deps.auditWriter, route, restReq, ctx, result.status);
        // Usage metrics for the observability surface. Recorded here for the
        // same reason read auditing is: this is where every REST route
        // converges, so a route added later is instrumented the day it lands.
        await recordRestUsage(deps, route, restReq, result.status, Date.now() - startedAt, logger);
        // Apply optional response headers (e.g. Content-Type for export endpoints)
        if (result.headers) {
          for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
        }
        // String bodies (NDJSON/CSV exports) are sent as-is; JSON bodies via .json()
        if (typeof result.body === 'string') {
          res.status(result.status).send(result.body);
        } else {
          res.status(result.status).json(result.body);
        }
      } catch (err) {
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
          res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
          return;
        }
        logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'REST handler error');
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            category: 'system',
            message: 'Internal server error',
            retryable: false,
            details: {},
            traceId: 'unknown',
            timestamp: new Date().toISOString(),
          },
        });
      }
    });
  }

  // â”€â”€ Attachment upload/download routes (raw body, not JSON) â”€â”€
  registerAttachmentRoutes(app, deps, authenticator, isDev);

  // â”€â”€ Time-series read/write routes â”€â”€
  registerTimeSeriesRoutes(app, deps, authenticator, isDev);

  // â”€â”€ Branch management routes â”€â”€
  registerBranchRoutes(app, deps, authenticator, isDev);

  // â”€â”€ Comments and collaboration routes â”€â”€
  registerCommentRoutes(app, deps, authenticator, isDev);

  // â”€â”€ Platform notification routes â”€â”€
  registerNotificationRoutes(app, deps, authenticator, isDev);

  // â”€â”€ Embedding / vector search routes â”€â”€
  registerEmbeddingRoutes(app, deps, authenticator, isDev);

  // â”€â”€ Alerting routes â”€â”€
  registerAlertingRoutes(app, deps, authenticator, isDev);
  registerGeospatialRoutes(app, deps, authenticator, isDev);
  registerScenarioRoutes(app, deps, authenticator, isDev);
  registerWorkshopRoutes(app, deps, authenticator, isDev);
  registerAppEmbeddingRoutes(app, deps, authenticator, isDev);
  registerPlatformResourceRoutes(app, deps, authenticator, isDev);
  registerSavedViewRoutes(app, deps, authenticator, isDev);
  registerUserDirectoryRoutes(app, deps, authenticator, isDev);

  // â”€â”€ Previously-unreachable SPI services (change-proposals, business-rules,
  // agent-evals, agent-threads, conflict-resolution, connectors, data-expectations,
  // embedded-copilots, event-objects, graph-analyses, multi-ontology, pipeline-builds,
  // platform-assistant, process-mining, workshop-ux) ──
  // Role-gated as a whole (default admin-only): these services carry no
  // per-object authorization of their own.
  const platformServiceRoles = (process.env['PLATFORM_SERVICE_ROLES'] ?? '')
    .split(',').map(r => r.trim()).filter(Boolean);
  registerAbsentServiceRoutes(app, deps, authenticator, isDev,
    platformServiceRoles.length > 0 ? platformServiceRoles : ['admin']);

  // â”€â”€ LLM gateway routes â”€â”€
  registerLLMGatewayRoutes(app, deps, authenticator, isDev);

  // â”€â”€ OpenAPI spec at /api/v1/openapi.json â”€â”€
  // Stamp the served contract with the real platform version (root package.json)
  // so it matches the released spec artifact, not the generator's default.
  const openApiSpec = generateOpenApiSpec(schema, readPlatformVersion());
  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  // â”€â”€ FDP/CDM projection at /api/v1/cdm/* (S1.0) â€” mounted only with `cdm`.
  // cdmEnabled/fhirEnabled were resolved above (before GraphQL schema build) so
  // the REST mount, GraphQL SDL, and GraphQL resolvers all gate identically. â”€â”€
  if (cdmEnabled) {
  const cdmHandler = createCdmRouter({ deps });
  // Public metadata: profile, compatibility matrix, gap register (non-sensitive
  // schema mapping info â€” mirrors the public openapi.json endpoint).
  // Registered for both GET and HEAD so the advertised contract holds before
  // the authenticated catch-all below.
  const cdmMetadataHandler: express.RequestHandler = async (req, res) => {
    const result = await cdmHandler({ method: req.method, path: 'metadata', query: {} });
    for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
    res.status(result.status).json(result.body);
  };
  app.get('/api/v1/cdm/metadata', cdmMetadataHandler);
  app.head('/api/v1/cdm/metadata', cdmMetadataHandler);
  // Authenticated data projections.
  app.all('/api/v1/cdm/*', async (req, res) => {
    try {
      authorizationService.clearFieldCache();
      const user = await extractUser(req, authenticator, isDev);

      const rlResult = await rateLimiter.check({ tenantId: user.tenantId, principalId: user.id } as RateLimitIdentity);
      if (!rlResult.allowed) {
        res.setHeader('Retry-After', String(Math.ceil((rlResult.resetAt - Date.now()) / 1000)));
        res.status(429).json({ error: { code: 429, message: 'Rate limit exceeded' } });
        return;
      }

      const result = await cdmHandler({
        method: req.method,
        path: req.path.replace(/^\/api\/v1\/cdm/, ''),
        query: req.query as Record<string, string>,
        user,
      });
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, value);
      }
      // Dataset-export routes return a pre-serialised string (NDJSON/CSV) with
      // their own Content-Type; send it raw rather than JSON-encoding it.
      if (typeof result.body === 'string') {
        res.status(result.status).send(result.body);
      } else {
        res.status(result.status).json(result.body);
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
        res.status(401).json({ error: { code: 401, message: 'Authentication required' } });
        return;
      }
      logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'CDM handler error');
      res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
    }
  });
  } // end cdm capability gate

  // â”€â”€ FHIR at /fhir/* â€” mounted only when a pack declares the `fhir` capability â”€â”€
  if (fhirEnabled) {
  const fhirBaseUrl = process.env['FHIR_BASE_URL'] ?? `http://localhost:${PORT}/fhir`;
  if (!isDev && !process.env['FHIR_BASE_URL']) {
    logger.warn('WARNING: FHIR_BASE_URL not set â€” Bundle fullUrl links will use http://localhost. Set FHIR_BASE_URL to the externally routable address.');
  }
  const fhirHandler = createFhirRouter({ deps, baseUrl: fhirBaseUrl });
  app.all('/fhir/*', async (req, res) => {
    try {
      authorizationService.clearFieldCache();
      const user = await extractUser(req, authenticator, isDev);

      // Rate limit check
      const rlResult = await rateLimiter.check({ tenantId: user.tenantId, principalId: user.id } as RateLimitIdentity);
      if (!rlResult.allowed) {
        res.setHeader('Retry-After', String(Math.ceil((rlResult.resetAt - Date.now()) / 1000)));
        res.status(429).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'throttled', diagnostics: 'Rate limit exceeded' }] });
        return;
      }

      const fhirReq = {
        method: req.method,
        path: req.path.replace(/^\/fhir/, ''),
        query: req.query as Record<string, string>,
        user,
      };
      const result = await fhirHandler(fhirReq);
      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, value);
        }
      }
      res.status(result.status).json(result.body);
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
        res.status(401).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'login', diagnostics: 'Authentication required' }] });
        return;
      }
      logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'FHIR handler error');
      res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'fatal', code: 'exception', diagnostics: 'Internal server error' }] });
    }
  });
  } // end fhir capability gate

  // â”€â”€ MCP at /mcp â€” mounted only when a pack declares the `mcp` capability â”€â”€
  // Streamable HTTP transport (JSON-RPC 2.0 over POST). Exposes governed
  // actions + FGA-scoped read queries as MCP tools for external AI agents.
  // Auth is OIDC bearer token â€” an agent is just another OIDC principal
  // calling the same 8-stage action pipeline. Stateless: no session storage.
  if (mcpEnabled) {
    const { createMcpServer } = await import('@altius/mcp-server');
    const mcpHandler = createMcpServer({
      deps: {
        schema,
        actionExecutor,
        authorizationService,
        authenticator,
        storage,
        manifestRegistry: manifestRegistry ?? { get: () => undefined },
        ...(consentSubjectTypes ? { consentSubjectTypes } : {}),
        ...(consentService ? { consentService } : {}),
        rateLimiter,
        consentPurpose: DEFAULT_CONSENT_PURPOSE as string,
        objectManager,
        auditWriter: securityAuditWriter,
        ...(markingPolicy ? { markingPolicy } : {}),
        // Wired, not left optional: tool scoping hides an action tool whenever
        // the caller holds its relation on no object, and a relation missing
        // from the deployed FGA model is indistinguishable from that. Without
        // this the whole pack's tools vanish from discovery in silence.
        logger,
        // Expose declared FunctionTypes as function_<Name> MCP tools, dispatched
        // through the same governed path (role check + audit) as REST/GraphQL.
        ...(schema.functionTypes.length > 0
          ? {
              functionInvoker: {
                invoke: async ({ functionName, args, user, requestContext }) => {
                  const fn = schema.functionTypes.find((f) => f.name === functionName);
                  if (!fn) return { ok: false as const, error: `Unknown function: ${functionName}` };
                  try {
                    const r = await invokeFunction(fn, deps, {
                      requestContext,
                      user: {
                        id: user.id, name: user.name, email: user.email,
                        roles: user.roles, groups: user.groups, tenantId: requestContext.tenantId,
                      },
                      deps,
                    }, args);
                    // The whole invocation result, not just `result`: the SDL's
                    // ${Name}FunctionResult carries logs and durationMs too, and
                    // an agent debugging its own call needs them as much as a
                    // GraphQL client does.
                    return { ok: true as const, result: r };
                  } catch (err) {
                    const e = err as { code?: string; message?: string };
                    return { ok: false as const, error: e.message ?? 'Function invocation failed', ...(e.code ? { code: e.code } : {}) };
                  }
                },
              },
            }
          : {}),
      },
      isDev,
    });
    app.post('/mcp', async (req, res) => {
      const out = await mcpHandler({
        method: req.method,
        headers: req.headers as Record<string, string | undefined>,
        body: req.body,
      });
      if (out.body === undefined) {
        res.status(out.status).end();
      } else {
        res.status(out.status).json(out.body);
      }
    });
    app.delete('/mcp', async (req, res) => {
      const out = await mcpHandler({
        method: req.method,
        headers: req.headers as Record<string, string | undefined>,
        body: undefined,
      });
      if (out.body === undefined) {
        res.status(out.status).end();
      } else {
        res.status(out.status).json(out.body);
      }
    });
    logger.info('MCP server mounted at /mcp (Streamable HTTP, tools-only)');
  } // end mcp capability gate

  // â”€â”€ Webhook ingest at /api/v1/ingest/:datasource (T6) â”€â”€
  // Push-based single-record or batch upsert path. Authenticated via
  // X-Ingest-Secret (sourced from INGEST_SECRET env var). Reuses the same
  // parseMappingObject â†’ RecordMapper â†’ createEngineChangeApplier pipeline
  // as the sync scheduler.
  const ingestSecret = process.env.INGEST_SECRET;
  if (ingestSecret) {
    const { createIngestHandler } = await import('./ingest-handler.js');
    // Build datasource name â†’ raw mapping config from connector manifests
    const datasourceMappings = new Map<string, Record<string, unknown>>();
    for (const cm of connectorManifests) {
      const ds = cm.config['datasource'] as string | undefined;
      if (ds) datasourceMappings.set(ds, cm.config);
    }
    const ingestHandler = createIngestHandler({
      objectManager,
      datasourceMappings,
      ingestSecret,
      tenantId: process.env.SYNC_TENANT || process.env.SEED_TENANT || 'system',
    });
    app.post('/api/v1/ingest/:datasource', express.json({ limit: '1mb' }), async (req, res) => {
      const result = await ingestHandler({
        datasource: req.params['datasource']!,
        body: req.body,
        secret: req.headers['x-ingest-secret'] as string | undefined,
      });
      res.status(result.status).json(result.body);
    });
    logger.info(`Ingest webhook mounted at /api/v1/ingest/:datasource (${datasourceMappings.size} datasource(s))`);
  } else {
    logger.info('Ingest webhook disabled (set INGEST_SECRET to enable)');
  }

  // ── Data Connection Agent endpoints at /api/v1/data-connection/* ──
  // Agent-facing (not OIDC): enrollment is gated by the shared
  // X-Enrollment-Secret, everything after by the per-agent bearer token
  // minted at enrollment — same posture as the ingest webhook's
  // X-Ingest-Secret. All calls are agent-initiated over the agent's
  // outbound-only channel; the admin-facing status endpoint lives in the
  // OIDC-authenticated REST layer instead.
  if (dataConnectionBoot.gateway) {
    const gateway = dataConnectionBoot.gateway;
    const bearer = (req: express.Request): string | undefined => {
      const header = req.headers.authorization;
      return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    };
    app.post('/api/v1/data-connection/enroll', express.json({ limit: '256kb' }), (req, res) => {
      const out = gateway.enroll(
        req.headers['x-enrollment-secret'] as string | undefined,
        req.body,
      );
      res.status(out.status).json(out.body);
    });
    app.post('/api/v1/data-connection/agents/:agentId/heartbeat', express.json({ limit: '1mb' }), async (req, res) => {
      const out = await gateway.heartbeat(req.params['agentId']!, bearer(req), req.body);
      res.status(out.status).json(out.body);
    });
    app.post(
      '/api/v1/data-connection/agents/:agentId/datasources/:datasource/records',
      express.json({ limit: '10mb' }),
      async (req, res) => {
        const out = await gateway.upload(
          req.params['agentId']!,
          bearer(req),
          req.params['datasource']!,
          req.body,
        );
        res.status(out.status).json(out.body);
      },
    );
    logger.info(
      `Data-connection agent gateway mounted at /api/v1/data-connection/* (${dataConnectionBoot.leasable.length} leasable datasource(s))`,
    );
  } else {
    logger.info(
      'Data-connection agent gateway disabled (set DATA_CONNECTION_ENROLLMENT_SECRET and declare a runtime: AGENT datasource to enable)',
    );
  }

  // ── Function Pipeline Webhook ──
  // Receives Git push events (GitHub/GitLab) and triggers the function
  // pipeline for matching functions. Signature-verified with HMAC-SHA256
  // (GitHub) or token (GitLab). Disabled when FUNCTION_WEBHOOK_SECRET is unset.
  if (webhookTrigger) {
    app.post('/api/v1/functions-lifecycle/webhook', express.json({ limit: '5mb' }), async (req, res) => {
      try {
        const headers = req.headers as Record<string, string>;
        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        // Detect provider from headers
        const isGitHub = 'x-hub-signature-256' in headers || 'x-github-event' in headers;
        const isGitLab = 'x-gitlab-token' in headers || 'x-gitlab-event' in headers;
        let result;
        if (isGitHub) {
          result = await webhookTrigger.handleGitHubWebhook(headers, body);
        } else if (isGitLab) {
          result = await webhookTrigger.handleGitLabWebhook(headers, body);
        } else {
          // Generic: requires repoUrl + ref in the body
          const payload = typeof req.body === 'object' ? req.body : JSON.parse(body);
          result = await webhookTrigger.handleGenericWebhook(
            payload['repoUrl'] as string,
            payload['ref'] as string | undefined,
          );
        }
        if (!result.verified) {
          res.status(401).json({ error: { code: 'UNAUTHORIZED', message: result.error ?? 'Webhook verification failed' } });
          return;
        }
        res.status(200).json({
          processed: result.processed,
          results: result.results,
        });
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : 'unknown' }, 'Function webhook error');
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Webhook processing failed' } });
      }
    });
    logger.info('Function pipeline webhook mounted at /api/v1/functions-lifecycle/webhook');
  } else {
    logger.info('Function pipeline webhook disabled (set FUNCTION_WEBHOOK_SECRET to enable)');
  }

  // â”€â”€ Graceful shutdown â”€â”€
  const SHUTDOWN_TIMEOUT_MS = 5_000;

  async function shutdown() {
    logger.info('Shutting down...');
    stopHealthGauge();
    stopSyncMetricsGauge();
    // Stop sync polling before storage/bus teardown (in-flight ticks drain)
    try {
      await Promise.race([
        syncBoot.stop(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), SHUTDOWN_TIMEOUT_MS)),
      ]);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'Sync scheduler stop error');
    }
    automationRunner?.stop();
    subscriptionManager.stop();
    await apolloServer.stop();
    if (cel instanceof CelClient) {
      cel.close();
    }
    // Disconnect persistent event bus (Redpanda/Kafka) with timeout
    if (eventBus instanceof RedpandaEventBus) {
      try {
        await Promise.race([
          eventBus.disconnect(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), SHUTDOWN_TIMEOUT_MS)),
        ]);
        logger.info('EventBus: disconnected');
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'EventBus disconnect error');
      }
    }
    // Close Redis connection (distributed rate limiting) with timeout
    if (redisClient) {
      try {
        await Promise.race([
          redisClient.quit(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), SHUTDOWN_TIMEOUT_MS)),
        ]);
        logger.info('Redis: disconnected');
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'Redis disconnect error');
      }
    }
    if (storage instanceof PostgresStorageProvider) {
      await storage.close();
    }
    // Flush pending OTEL spans before exit
    const { shutdownTelemetry } = await import('@altius/observability');
    await shutdownTelemetry();
    httpServer.close();
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // â”€â”€ Start â”€â”€
  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  const mode = isDev ? 'DEVELOPMENT' : 'PRODUCTION';
  const imageRevision = process.env['GIT_REVISION'] ?? 'unknown';
  logger.info(`Altius API gateway [${mode}] listening at http://localhost:${PORT} (rev: ${imageRevision.slice(0, 8)})`);
  logger.info(`  GraphQL:  http://localhost:${PORT}/graphql`);
  logger.info(`  WS Subs:  ws://localhost:${PORT}/graphql`);
  logger.info(`  REST:     http://localhost:${PORT}/api/v1/`);
  logger.info(`  FHIR:     http://localhost:${PORT}/fhir/`);
  logger.info(`  Metrics:  http://localhost:${PORT}/metrics`);
}

/**
 * Build the link â†’ ReBAC-tuple sync map. For each link type whose
 * `snake(linkType)` relation exists on its from-type in the merged OpenFGA
 * model, map it so the action pipeline mints `(toType:toId, relation,
 * fromType:fromId)` tuples on link create/delete. Links without a matching
 * model relation (e.g. dropped by a permission override) are skipped.
 */
function buildLinkTupleMap(
  schema: import('@altius/odl').ParsedSchema,
  model: FgaAuthorizationModel,
): LinkTupleMap {
  const relationsByType = new Map<string, Set<string>>();
  for (const td of model.type_definitions) {
    relationsByType.set(td.type, new Set(Object.keys(td.relations ?? {})));
  }
  const map: LinkTupleMap = new Map();
  for (const lt of schema.linkTypes) {
    const fromType = toSnakeCase(lt.from);
    const toType = toSnakeCase(lt.to);
    const relation = toSnakeCase(lt.name);
    if (relationsByType.get(fromType)?.has(relation)) {
      map.set(lt.name, { relation, fromType, toType });
    }
  }
  return map;
}

/**
 * Build action authorization mappings from the parsed schema's actionTypes.
 * Extracts verb from PascalCase name, finds first object-typed param.
 * Uses snake_case for FGA object types (matching OpenFGA codegen convention).
 */
/**
 * Verify the merged OpenFGA model actually declares every relation the runtime
 * will check, and fail fast (in production) when it does not.
 *
 * Two contracts a domain pack must satisfy, neither previously enforced:
 *  - the read path checks `viewer` on every ObjectType (single read via `check`,
 *    list via `listObjects`);
 *  - each mapped action checks `can_<verb>` on its target type.
 *
 * A pack's `permissions/*.fga` override REPLACES the whole generated type block,
 * so omitting a relation silently deletes it. OpenFGA then answers those checks
 * with a 400 validation error, which reached callers as a retryable 500 on every
 * read while writes kept working â€” the exact shape reported in issue #3.
 *
 * Dev mode warns instead of throwing: it runs an allow-all stub with no model
 * pushed, so a model gap cannot actually break requests there.
 */
function assertFgaModelCoverage(
  model: FgaAuthorizationModel,
  schema: import('@altius/odl').ParsedSchema,
  isDev: boolean,
): void {
  const relationsByType = new Map<string, Set<string>>();
  for (const td of model.type_definitions) {
    relationsByType.set(td.type, new Set(Object.keys(td.relations ?? {})));
  }

  const guidance =
    'A domain pack permissions/*.fga override REPLACES the generated type block, ' +
    'so it must re-declare every relation the type needs.';

  // Read-path coverage is fatal: without `viewer`, EVERY read of that type fails
  // (a total outage for the type), which is the failure reported in issue #3.
  const fatal: string[] = [];
  for (const obj of schema.objectTypes) {
    const fgaType = toSnakeCase(obj.name);
    const relations = relationsByType.get(fgaType);
    if (!relations) {
      fatal.push(`type '${fgaType}' (ObjectType ${obj.name}) is absent from the model`);
      continue;
    }
    if (!relations.has('viewer')) {
      fatal.push(`type '${fgaType}' is missing relation 'viewer' (required by every read)`);
    }
  }

  // Action-relation coverage warns rather than blocking boot: the blast radius is
  // a single action rather than the whole read surface, and several bundled packs
  // currently declare a differently-named relation than deriveActionAuthzMappings
  // checks (e.g. aml `case` declares can_file_report, the runtime checks can_file).
  // Those need per-pack semantic fixes; surface them loudly rather than making
  // existing deployments unbootable.
  const warnings: string[] = [];
  for (const [actionName, mapping] of deriveActionAuthzMappings(schema)) {
    const relations = relationsByType.get(mapping.objectType);
    if (relations && !relations.has(mapping.relation)) {
      warnings.push(
        `type '${mapping.objectType}' is missing relation '${mapping.relation}' ` +
        `(checked when executing action ${actionName}) â€” that action will be denied`,
      );
    }
  }

  if (warnings.length > 0) {
    logger.warn(
      `Authorization model: action relations are missing, so these actions are denied:\n` +
      `${warnings.map(w => `  - ${w}`).join('\n')}\n${guidance}`,
    );
  }

  if (fatal.length === 0) return;

  const detail = fatal.map(p => `  - ${p}`).join('\n');
  if (isDev) {
    logger.warn(
      `Authorization model coverage gaps (allow-all stub in dev, but these WILL break production):\n${detail}\n${guidance}`,
    );
    return;
  }
  throw new Error(
    `FATAL: the OpenFGA model is missing relations the runtime checks:\n${detail}\n${guidance}`,
  );
}

function deriveActionAuthzMappings(
  schema: import('@altius/odl').ParsedSchema,
): Map<string, ActionAuthzMapping> {
  const mappings = new Map<string, ActionAuthzMapping>();
  const objectTypeNames = new Set(schema.objectTypes.map(o => o.name));

  // The whole derivation â€” relation name, target type, id param â€” comes from
  // @altius/odl, so the runtime checks exactly what the generated model
  // declares. Deriving any part of it independently is what let the two drift
  // (the generator strips words matching ObjectType names, so adding a
  // `Transfer` ObjectType silently renamed TransferWard's relation from
  // can_transfer to can_transfer_ward while this checked can_transfer). The MCP
  // tool-scoping path calls the same function for the same reason.
  for (const action of schema.actionTypes) {
    const mapping = deriveActionAuthzMapping(action, objectTypeNames);
    if (mapping) mappings.set(action.name, mapping);
  }

  return mappings;
}

/**
 * Derive per-function ReBAC mappings from schema functionTypes.
 * Mirrors deriveActionAuthzMappings but for functions: a function with an
 * ObjectType-typed @param gets a FunctionAuthzMapping so invokeFunction
 * checks the FGA relation on the target object before the role gate.
 */
function deriveFunctionAuthzMappings(
  schema: import('@altius/odl').ParsedSchema,
): Map<string, import('@altius/odl').FunctionAuthzMapping> {
  const mappings = new Map<string, import('@altius/odl').FunctionAuthzMapping>();
  const objectTypeNames = new Set(schema.objectTypes.map(o => o.name));
  for (const fn of schema.functionTypes) {
    const mapping = deriveFunctionAuthzMapping(fn, objectTypeNames);
    if (mapping) mappings.set(fn.name, mapping);
  }
  return mappings;
}

/** OpenFGA relation body â€” one of direct, computed, tuple-to-userset, or union. */
export interface FgaRelationBody {
  this?: Record<string, never>;
  computedUserset?: { relation: string };
  tupleToUserset?: { tupleset: { relation: string }; computedUserset: { relation: string } };
  union?: { child: FgaRelationBody[] };
}

/** Single type definition in the OpenFGA authorization model JSON. */
export interface FgaTypeDef {
  type: string;
  relations?: Record<string, FgaRelationBody>;
  metadata?: {
    relations: Record<string, { directly_related_user_types: Array<{ type: string }> }>;
  };
}

/** OpenFGA authorization model JSON accepted by the REST API. */
export interface FgaAuthorizationModel {
  schema_version: string;
  type_definitions: FgaTypeDef[];
}

/**
 * Convert OpenFGA DSL (schema 1.1) to the JSON format accepted by the
 * OpenFGA REST API POST /stores/{id}/authorization-models.
 *
 * Handles: direct types [user], computed usersets (derived), tuple-to-userset
 * (from), and union (or) relations.
 */
export function fgaDslToJson(dsl: string): FgaAuthorizationModel {
  const typeDefs: FgaTypeDef[] = [];
  const lines = dsl.split('\n');
  let currentType: string | null = null;
  let relations: Record<string, FgaRelationBody> = {};
  let metadata: Record<string, { directly_related_user_types: Array<{ type: string }> }> = {};

  function flushType() {
    if (currentType !== null) {
      const def: FgaTypeDef = { type: currentType };
      if (Object.keys(relations).length > 0) {
        def.relations = relations;
        const metaRelations: Record<string, { directly_related_user_types: Array<{ type: string }> }> = {};
        for (const [rel, types] of Object.entries(metadata)) {
          if (types.directly_related_user_types.length > 0) {
            metaRelations[rel] = types;
          }
        }
        if (Object.keys(metaRelations).length > 0) {
          def.metadata = { relations: metaRelations };
        }
      }
      typeDefs.push(def);
    }
    relations = {};
    metadata = {};
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('model') || trimmed.startsWith('schema')) continue;

    const typeMatch = trimmed.match(/^type\s+(\w+)$/);
    if (typeMatch) {
      flushType();
      currentType = typeMatch[1]!;
      continue;
    }

    if (trimmed === 'relations') continue;

    const defineMatch = trimmed.match(/^define\s+(\w+):\s*(.+)$/);
    if (defineMatch && currentType) {
      const relName = defineMatch[1]!;
      const body = defineMatch[2]!.trim();
      metadata[relName] = { directly_related_user_types: [] };

      // Parse the relation body
      const parts = body.split(/\s+or\s+/);
      if (parts.length === 1) {
        const single = parts[0]!.trim();
        const directMatch = single.match(/^\[(\w+)]$/);
        const fromMatch = single.match(/^(\w+)\s+from\s+(\w+)$/);

        if (directMatch) {
          // Direct assignment: [user]
          relations[relName] = { this: {} };
          metadata[relName]!.directly_related_user_types.push({ type: directMatch[1]! });
        } else if (fromMatch) {
          // Tuple-to-userset: viewer from admitted_to
          relations[relName] = {
            tupleToUserset: {
              tupleset: { relation: fromMatch[2]! },
              computedUserset: { relation: fromMatch[1]! },
            },
          };
        } else {
          // Computed userset: assigned
          relations[relName] = { computedUserset: { relation: single } };
        }
      } else {
        // Union of multiple parts
        const children: FgaRelationBody[] = [];
        for (const part of parts) {
          const p = part.trim();
          const directMatch = p.match(/^\[(\w+)]$/);
          const fromMatch = p.match(/^(\w+)\s+from\s+(\w+)$/);

          if (directMatch) {
            children.push({ this: {} });
            metadata[relName]!.directly_related_user_types.push({ type: directMatch[1]! });
          } else if (fromMatch) {
            children.push({
              tupleToUserset: {
                tupleset: { relation: fromMatch[2]! },
                computedUserset: { relation: fromMatch[1]! },
              },
            });
          } else {
            children.push({ computedUserset: { relation: p } });
          }
        }
        relations[relName] = { union: { child: children } };
      }
    }
  }
  flushType();

  return { schema_version: '1.1', type_definitions: typeDefs };
}

// Fatal error handlers â€” log and exit rather than silently dying.
// Must be registered before main() so they catch errors during startup too.
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
  process.exit(1);
});

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
