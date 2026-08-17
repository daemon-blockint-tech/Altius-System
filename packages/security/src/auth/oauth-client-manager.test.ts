import { describe, it, expect, beforeEach } from 'vitest';
import { OAuthClientManager, InMemoryOAuthClientStore, PLATFORM_SCOPES } from './index.js';

describe('OAuthClientManager', () => {
  let manager: OAuthClientManager;

  beforeEach(() => {
    manager = new OAuthClientManager(new InMemoryOAuthClientStore());
  });

  it('registers a client and returns a plaintext secret once', async () => {
    const result = await manager.register({
      name: 'My App',
      scopes: ['read:objects', 'write:actions'],
      tenantId: 'tenant-1',
    });
    expect(result.client.clientId).toMatch(/^altius_/);
    expect(result.clientSecret).toBeTruthy();
    expect(result.clientSecret.length).toBeGreaterThan(30);
    expect(result.client.clientSecretHash).not.toContain(result.clientSecret);
    expect(result.client.scopes).toEqual(['read:objects', 'write:actions']);
    expect(result.client.active).toBe(true);
  });

  it('authenticates with the correct secret', async () => {
    const result = await manager.register({
      name: 'My App',
      scopes: ['read:objects'],
      tenantId: 'tenant-1',
    });
    const client = await manager.authenticate(result.client.clientId, result.clientSecret);
    expect(client).not.toBeNull();
    expect(client!.clientId).toBe(result.client.clientId);
  });

  it('rejects authentication with wrong secret', async () => {
    const result = await manager.register({
      name: 'My App',
      scopes: ['read:objects'],
      tenantId: 'tenant-1',
    });
    const client = await manager.authenticate(result.client.clientId, 'wrong-secret');
    expect(client).toBeNull();
  });

  it('rejects authentication for inactive clients', async () => {
    const result = await manager.register({
      name: 'My App',
      scopes: ['read:objects'],
      tenantId: 'tenant-1',
    });
    await manager.update(result.client.clientId, { active: false });
    const client = await manager.authenticate(result.client.clientId, result.clientSecret);
    expect(client).toBeNull();
  });

  it('rejects unknown scopes', async () => {
    await expect(
      manager.register({
        name: 'My App',
        scopes: ['read:objects', 'hack:everything'],
        tenantId: 'tenant-1',
      }),
    ).rejects.toThrow(/Unknown scope: hack:everything/);
  });

  it('lists clients by tenant', async () => {
    await manager.register({ name: 'App A', scopes: ['read:objects'], tenantId: 'tenant-1' });
    await manager.register({ name: 'App B', scopes: ['read:objects'], tenantId: 'tenant-1' });
    await manager.register({ name: 'App C', scopes: ['read:objects'], tenantId: 'tenant-2' });
    const clients = await manager.list('tenant-1');
    expect(clients).toHaveLength(2);
    expect(clients.map((c) => c.name).sort()).toEqual(['App A', 'App B']);
  });

  it('rotates a client secret', async () => {
    const result = await manager.register({
      name: 'My App',
      scopes: ['read:objects'],
      tenantId: 'tenant-1',
    });
    const newSecret = await manager.rotateSecret(result.client.clientId);
    expect(newSecret).not.toBe(result.clientSecret);
    // Old secret no longer works
    const oldAuth = await manager.authenticate(result.client.clientId, result.clientSecret);
    expect(oldAuth).toBeNull();
    // New secret works
    const newAuth = await manager.authenticate(result.client.clientId, newSecret);
    expect(newAuth).not.toBeNull();
  });

  it('deletes a client', async () => {
    const result = await manager.register({
      name: 'My App',
      scopes: ['read:objects'],
      tenantId: 'tenant-1',
    });
    await manager.delete(result.client.clientId);
    const client = await manager.get(result.client.clientId);
    expect(client).toBeNull();
  });

  it('PLATFORM_SCOPES includes core scopes', () => {
    expect(PLATFORM_SCOPES).toContain('read:objects');
    expect(PLATFORM_SCOPES).toContain('write:actions');
    expect(PLATFORM_SCOPES).toContain('admin:clients');
  });
});
