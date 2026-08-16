/**
 * MCP server configuration and injected dependencies.
 */

import type { ParsedSchema } from '@altius/odl';
import type { StorageProvider, RequestContext } from '@altius/spi';
import type { ActionExecutor, ActionManifest } from '@altius/actions';
import type { AuthorizationService, OidcAuthenticator, AuthenticatedUser, ConsentService, AuditWriter } from '@altius/security';
import type { ObjectManager } from '@altius/engine';

/** Outcome of invoking a FunctionType through the governed function pipeline. */
export type McpFunctionResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string; code?: string };

/**
 * Invokes a declared FunctionType under the caller's identity through the same
 * governed path REST and GraphQL use (role check, ontology access, audit).
 *
 * Injected as a callback so @altius/mcp-server stays free of @altius/api: the
 * API layer wires this to its shared `invokeFunction`. When absent, function
 * tools are neither advertised nor dispatched.
 */
export interface McpFunctionInvoker {
  invoke(input: {
    functionName: string;
    args: Record<string, unknown>;
    user: AuthenticatedUser;
    requestContext: RequestContext;
  }): Promise<McpFunctionResult>;
}

/**
 * Registry that resolves action names to parsed YAML manifests.
 * Reuses the API layer's ManifestRegistry shape.
 */
export interface ManifestRegistry {
  get(actionName: string): ActionManifest | undefined;
}

/**
 * Minimal rate-limiter interface mirroring the API layer's RateLimiter.
 * Defined here so @altius/mcp-server does not depend on @altius/api.
 * Accepts any object with `allowed: boolean` as the return — the API layer's
 * richer RateLimitResult is structurally compatible.
 */
export interface McpRateLimiter {
  check(identity: { tenantId: string; principalId: string; clientAppId?: string }, cost?: number): Promise<{ allowed: boolean }> | { allowed: boolean };
}

/**
 * Dependencies injected into the MCP server. Mirrors the subset of
 * ApiDependencies needed to discover and execute actions and read objects.
 */
export interface McpServerDependencies {
  schema: ParsedSchema;
  actionExecutor: ActionExecutor;
  authorizationService: AuthorizationService;
  authenticator: OidcAuthenticator;
  storage: StorageProvider;
  manifestRegistry: ManifestRegistry;
  /** Consent subject types (mirrors ApiDependencies.consentSubjectTypes). */
  consentSubjectTypes?: readonly string[];
  /**
   * Consent gate for subject types. Absent means no deployment configured one
   * — NOT that consent may be skipped: the read tools drop consent-gated types
   * rather than route an agent around a gate REST and GraphQL both apply.
   */
  consentService?: ConsentService;
  /**
   * Per-principal rate limiter. When provided, every authenticated MCP request
   * is checked against it — parity with the GraphQL, REST, CDM and FHIR
   * surfaces. Without this, an agent is bounded only by the global per-IP
   * limiter, not the per-principal 200 req/min limit humans get.
   */
  rateLimiter?: McpRateLimiter;
  /**
   * Mandatory marking policy. Absent means no markings are configured.
   *
   * An agent reads at machine rate, so a mandatory control that is enforced
   * on the human surfaces and not here is not enforced at all.
   */
  markingPolicy?: McpMarkingPolicy;
  /**
   * Audit sink for read tools.
   *
   * MCP is the third read surface, and an agent reading a record is exactly
   * the access a DPO is asked about — often more so than a human's, because
   * an agent reads at machine rate. Optional so a deployment without an audit
   * store still serves MCP; absent means the reads are unaudited, which is
   * the pre-existing behaviour rather than a silent downgrade.
   */
  auditWriter?: AuditWriter;
  /**
   * Consent purpose for MCP read tools. Defaults to DIRECT_CARE when absent;
   * should mirror the deployment's DEFAULT_CONSENT_PURPOSE so an agent and a
   * human invoking the same action are consent-checked under the same purpose.
   */
  consentPurpose?: string;
  /**
   * ObjectManager for read queries. When provided, search_<Type> tools route
   * through it instead of calling storage directly, so computed fields are
   * resolved (parity with REST and GraphQL). Without this, computed fields
   * are absent on /mcp while present on every other surface.
   */
  objectManager?: ObjectManager;
  /**
   * Invokes declared FunctionTypes. When provided, one `function_<Name>` tool
   * is offered per FunctionType and dispatched through it (role-gated + audited
   * like REST/GraphQL). Without it, functions are invisible to agents — the
   * pre-existing behaviour, not a silent downgrade.
   */
  functionInvoker?: McpFunctionInvoker;
}

/**
 * Configuration for createMcpServer.
 */
export interface McpServerConfig {
  deps: McpServerDependencies;
  /** Server name advertised in the `initialize` response. */
  serverName?: string;
  /** Server version advertised in the `initialize` response. */
  serverVersion?: string;
  /** Whether dev-mode auth bypass is allowed (no bearer token → dev-user). */
  isDev?: boolean;
}

/**
 * Resolved caller identity + request context, produced by the auth layer
 * from the bearer token. Passed to tool handlers.
 */
/**
 * The marking surface this server needs — structural, so @altius/security
 * stays an implementation detail of the host.
 */
export interface McpMarkingPolicy {
  readonly isEmpty: boolean;
  requiredFor(objectType: string): readonly string[];
  check(held: readonly string[], required: readonly string[]): { allowed: boolean };
}

export interface McpCaller {
  user: AuthenticatedUser;
  requestContext: RequestContext;
}
