/**
 * @altius/security
 *
 * OIDC authentication and authorization for the Altius platform.
 * Supports NHS CIS2 token format with configurable role mapping.
 */

export type {
  AuthenticatedUser,
  OidcConfig,
  PlatformIdentity,
  RoleMappingConfig,
} from "./auth/index.js";
export { AuthenticationError } from "./auth/index.js";

export { OidcAuthenticator } from "./auth/index.js";

export { CIS2_ROLE_MAPPINGS, resolveRoles, resolveGroups } from "./auth/index.js";
export { DEV_USER, devAuthBypassEnabled } from "./auth/index.js";

// Authorization — ReBAC via OpenFGA (Section 7.1)
export type {
  PermissionLevel,
  FieldPermissionRule,
  FieldPermissionConfig,
  RedactionResult,
  FieldCacheKey,
  OpenFgaClientInterface,
  FgaClientResolver,
} from "./authz/index.js";
export { AuthorizationError, AuthorizationService } from "./authz/index.js";
export { DefaultAccessExplanationService } from "./authz/access-explanation-service.js";
export type { AccessExplanationServiceOptions } from "./authz/access-explanation-service.js";

// Audit trail (Section 7.2)
export type { AuditStore, AuditQueryFilter, AuditWriteInput } from "./audit/index.js";
export { AuditWriter, AuditQuery, MemoryAuditStore } from "./audit/index.js";

// Consent management (Section 7.3)
export type {
  ConsentManagerConfig,
  ConsentFilterResult,
  SingleObjectConsentResult,
  ConsentStore,
} from "./consent/index.js";
export { ConsentError, ConsentService, MemoryConsentStore } from "./consent/index.js";

export { MarkingPolicy } from './markings/marking-policy.js';
export type {
  MarkingDefinition,
  MarkingCategoryDefinition,
  MarkingCategoryMode,
  MarkingPolicyConfig,
  MarkingDecision,
} from './markings/marking-policy.js';
