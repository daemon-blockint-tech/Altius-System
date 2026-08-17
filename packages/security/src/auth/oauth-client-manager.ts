/**
 * OAuthClientManager — manages the lifecycle of OAuth client registrations.
 *
 * Wraps the OAuthClientStore with:
 *   - Client ID + secret generation
 *   - Secret hashing (plaintext is returned exactly once, at creation)
 *   - Scope validation against the platform's known scope set
 *   - Tenant isolation
 */
import type {
  OAuthClient,
  OAuthClientStore,
  CreateOAuthClientInput,
  UpdateOAuthClientInput,
  OAuthClientCreationResult,
} from './oauth-client-store.js';
import { hashSecret, generateClientId, generateClientSecret } from './oauth-client-utils.js';

/** Known platform scopes. Used to validate client scope requests. */
export const PLATFORM_SCOPES = [
  'read:objects',
  'write:actions',
  'execute:functions',
  'read:object-sets',
  'manage:object-sets',
  'read:audit',
  'admin:clients',
] as const;

export class OAuthClientManager {
  constructor(private readonly store: OAuthClientStore) {}

  /**
   * Register a new OAuth client. Returns the plaintext secret exactly once.
   * The caller must store it; it cannot be recovered.
   */
  async register(input: CreateOAuthClientInput): Promise<OAuthClientCreationResult> {
    // Validate scopes
    const known = new Set<string>(PLATFORM_SCOPES);
    for (const scope of input.scopes) {
      if (!known.has(scope)) {
        throw new Error(`Unknown scope: ${scope}. Known scopes: ${[...known].join(', ')}`);
      }
    }

    const clientId = generateClientId();
    const clientSecret = generateClientSecret();
    const clientSecretHash = hashSecret(clientSecret);

    const client = await this.store.create({
      ...input,
      clientId,
      clientSecretHash,
    });

    return { client, clientSecret };
  }

  async get(clientId: string): Promise<OAuthClient | null> {
    return this.store.get(clientId);
  }

  async list(tenantId: string): Promise<OAuthClient[]> {
    return this.store.list(tenantId);
  }

  async update(clientId: string, updates: UpdateOAuthClientInput): Promise<OAuthClient> {
    if (updates.scopes) {
      const known = new Set<string>(PLATFORM_SCOPES);
      for (const scope of updates.scopes) {
        if (!known.has(scope)) {
          throw new Error(`Unknown scope: ${scope}. Known scopes: ${[...known].join(', ')}`);
        }
      }
    }
    return this.store.update(clientId, updates);
  }

  async delete(clientId: string): Promise<void> {
    return this.store.delete(clientId);
  }

  /**
   * Rotate a client's secret. Returns the new plaintext secret exactly once.
   */
  async rotateSecret(clientId: string): Promise<string> {
    const newSecret = generateClientSecret();
    const newHash = hashSecret(newSecret);
    await this.store.update(clientId, {} as UpdateOAuthClientInput);
    // The store update doesn't handle secret rotation directly; we need
    // to use the store's create path to set the new hash. For the in-memory
    // store this is handled by re-creating with the same client ID.
    // A real implementation would have a dedicated rotateSecret method.
    const existing = await this.store.get(clientId);
    if (!existing) throw new Error(`OAuth client ${clientId} not found`);
    await this.store.delete(clientId);
    await this.store.create({
      clientId: existing.clientId,
      clientSecretHash: newHash,
      name: existing.name,
      description: existing.description,
      scopes: existing.scopes,
      serviceUserId: existing.serviceUserId,
      tenantId: existing.tenantId,
    });
    return newSecret;
  }

  /**
   * Authenticate a client by verifying its secret.
   * Returns the client if valid, null otherwise.
   */
  async authenticate(clientId: string, clientSecret: string): Promise<OAuthClient | null> {
    const client = await this.store.get(clientId);
    if (!client || !client.active) return null;
    const valid = await this.store.verifySecret(clientId, clientSecret);
    return valid ? client : null;
  }
}
