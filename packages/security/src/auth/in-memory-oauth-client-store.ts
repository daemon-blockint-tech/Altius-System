/**
 * In-memory OAuth client store — for development and testing.
 */
import type {
  OAuthClient,
  OAuthClientStore,
  CreateOAuthClientInput,
  UpdateOAuthClientInput,
} from './oauth-client-store.js';
import { hashSecret, verifySecret, generateClientId, generateClientSecret } from './oauth-client-utils.js';

export class InMemoryOAuthClientStore implements OAuthClientStore {
  private readonly clients = new Map<string, OAuthClient>();

  async create(
    input: CreateOAuthClientInput & { clientId: string; clientSecretHash: string },
  ): Promise<OAuthClient> {
    const now = new Date().toISOString() as string;
    const client: OAuthClient = {
      clientId: input.clientId,
      clientSecretHash: input.clientSecretHash,
      name: input.name,
      description: input.description,
      scopes: input.scopes,
      serviceUserId: input.serviceUserId,
      tenantId: input.tenantId,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.clients.set(input.clientId, client);
    return { ...client };
  }

  async get(clientId: string): Promise<OAuthClient | null> {
    const c = this.clients.get(clientId);
    return c ? { ...c } : null;
  }

  async list(tenantId: string): Promise<OAuthClient[]> {
    return [...this.clients.values()]
      .filter((c) => c.tenantId === tenantId)
      .map((c) => ({ ...c }));
  }

  async update(clientId: string, updates: UpdateOAuthClientInput): Promise<OAuthClient> {
    const existing = this.clients.get(clientId);
    if (!existing) throw new Error(`OAuth client ${clientId} not found`);
    const updated: OAuthClient = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString() as string,
    };
    this.clients.set(clientId, updated);
    return { ...updated };
  }

  async delete(clientId: string): Promise<void> {
    this.clients.delete(clientId);
  }

  async verifySecret(clientId: string, secret: string): Promise<boolean> {
    const client = this.clients.get(clientId);
    if (!client) return false;
    return verifySecret(secret, client.clientSecretHash);
  }
}

export { hashSecret, generateClientId, generateClientSecret };
