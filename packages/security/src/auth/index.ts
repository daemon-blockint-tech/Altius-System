export type {
  AuthenticatedUser,
  OidcConfig,
  PlatformIdentity,
  RoleMappingConfig,
} from "./types.js";
export { AuthenticationError } from "./types.js";

export { OidcAuthenticator } from "./oidc-authenticator.js";

export { CIS2_ROLE_MAPPINGS, resolveRoles, resolveGroups } from "./role-mapping.js";
export { DEV_USER, devAuthBypassEnabled } from "./dev-bypass.js";

// OAuth client management (third-party application platform)
export type {
  OAuthClient,
  OAuthClientStore,
  CreateOAuthClientInput,
  UpdateOAuthClientInput,
  OAuthClientCreationResult,
} from "./oauth-client-store.js";
export { OAuthClientManager, PLATFORM_SCOPES } from "./oauth-client-manager.js";
export { InMemoryOAuthClientStore } from "./in-memory-oauth-client-store.js";
export { hashSecret, verifySecret, generateClientId, generateClientSecret } from "./oauth-client-utils.js";
