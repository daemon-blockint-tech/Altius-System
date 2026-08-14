/**
 * MCP server configuration and injected dependencies.
 */

import type { ParsedSchema } from '@altius/odl';
import type { StorageProvider, RequestContext } from '@altius/spi';
import type { ActionExecutor, ActionManifest } from '@altius/actions';
import type { AuthorizationService, OidcAuthenticator, AuthenticatedUser } from '@altius/security';

/**
 * Registry that resolves action names to parsed YAML manifests.
 * Reuses the API layer's ManifestRegistry shape.
 */
export interface ManifestRegistry {
  get(actionName: string): ActionManifest | undefined;
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
export interface McpCaller {
  user: AuthenticatedUser;
  requestContext: RequestContext;
}
