/**
 * OAuth client registry — manages third-party application credentials.
 *
 * A registered OAuth client represents a third-party application that can
 * authenticate to Altius via client_credentials or authorization_code grant.
 * Each client has:
 *   - A client_id (public) and client_secret_hash (bcrypt-hashed, never stored plaintext)
 *   - Scopes that limit what the client can access
 *   - Optional service-user mapping (the identity the client acts as)
 *
 * This is the storage interface; the API layer wraps it with REST/GraphQL.
 */

import type { DateTime } from '@altius/spi';

/** A registered OAuth client (third-party application). */
export interface OAuthClient {
  /** Client identifier (public, used in token requests). */
  clientId: string;
  /** Bcrypt hash of the client secret. Never stored or returned in plaintext. */
  clientSecretHash: string;
  /** Human-readable application name. */
  name: string;
  /** Optional description. */
  description?: string;
  /** Scopes granted to this client (e.g. 'read:patients', 'execute:AdmitPatient'). */
  scopes: string[];
  /** Optional service-user ID this client acts as. */
  serviceUserId?: string;
  /** Tenant this client belongs to. */
  tenantId: string;
  /** Whether the client is active. */
  active: boolean;
  createdAt: DateTime;
  updatedAt: DateTime;
}

/** Input for creating a new OAuth client. */
export interface CreateOAuthClientInput {
  name: string;
  description?: string;
  scopes: string[];
  serviceUserId?: string;
  tenantId: string;
}

/** Input for updating an OAuth client. */
export interface UpdateOAuthClientInput {
  name?: string;
  description?: string;
  scopes?: string[];
  serviceUserId?: string;
  active?: boolean;
}

/** Result of client creation — includes the plaintext secret ONCE. */
export interface OAuthClientCreationResult {
  client: OAuthClient;
  /** Plaintext client secret. Only returned at creation time. */
  clientSecret: string;
}

/** Storage interface for OAuth client definitions. */
export interface OAuthClientStore {
  create(input: CreateOAuthClientInput & { clientId: string; clientSecretHash: string }): Promise<OAuthClient>;
  get(clientId: string): Promise<OAuthClient | null>;
  list(tenantId: string): Promise<OAuthClient[]>;
  update(clientId: string, updates: UpdateOAuthClientInput): Promise<OAuthClient>;
  delete(clientId: string): Promise<void>;
  /** Verify a client secret against the stored hash. */
  verifySecret(clientId: string, secret: string): Promise<boolean>;
}
