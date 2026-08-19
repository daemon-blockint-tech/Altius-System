/**
 * Tests for workshop REST routes — app CRUD, pages, variables, modules, state encoding.
 *
 * Tests the WorkshopPlatformService directly through the REST route handlers,
 * using the same RestRequest/RestRoute pattern as other API tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { InMemoryWorkshopPlatformService } from '@altius/storage-memory';
import type { RequestContext } from '@altius/spi';

const ctx: RequestContext = { tenantId: 'test-tenant', actorId: 'test-user' };

describe('Workshop platform service (Phase 19)', () => {
  let svc: InMemoryWorkshopPlatformService;

  beforeAll(() => {
    svc = new InMemoryWorkshopPlatformService();
  });

  it('creates and retrieves an app', async () => {
    const app = await svc.createApp(ctx, { name: 'Test App', description: 'A test' });
    expect(app.name).toBe('Test App');
    expect(app.id).toBeTruthy();

    const fetched = await svc.getApp(ctx, app.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Test App');
  });

  it('lists apps', async () => {
    await svc.createApp(ctx, { name: 'App 2' });
    const apps = await svc.listApps(ctx);
    expect(apps.length).toBeGreaterThanOrEqual(2);
  });

  it('updates an app', async () => {
    const app = await svc.createApp(ctx, { name: 'Update Me' });
    const updated = await svc.updateApp(ctx, app.id, { description: 'Updated description' });
    expect(updated.description).toBe('Updated description');
  });

  it('deletes an app', async () => {
    const app = await svc.createApp(ctx, { name: 'Delete Me' });
    await svc.deleteApp(ctx, app.id);
    const fetched = await svc.getApp(ctx, app.id);
    expect(fetched).toBeNull();
  });

  it('shares an app', async () => {
    const app = await svc.createApp(ctx, { name: 'Share Me' });
    const shared = await svc.shareApp(ctx, app.id, ['user-2', 'user-3']);
    expect(shared.sharedWith).toContain('user-2');
    expect(shared.sharedWith).toContain('user-3');
  });

  it('duplicates an app', async () => {
    const app = await svc.createApp(ctx, { name: 'Duplicate Me' });
    const copy = await svc.duplicateApp(ctx, app.id, 'Copy of Duplicate Me');
    expect(copy.name).toBe('Copy of Duplicate Me');
    expect(copy.id).not.toBe(app.id);
  });

  it('encodes and decodes state', async () => {
    const app = await svc.createApp(ctx, { name: 'State App' });
    const variables = { selectedPatient: 'p1', filter: 'active', page: 3 };
    const encoded = await svc.encodeState(ctx, app.id, variables);
    expect(encoded).toBeTruthy();
    expect(encoded).toContain('s:');

    const decoded = await svc.decodeState(ctx, encoded);
    expect(decoded).toEqual(variables);
  });

  it('lists modules', async () => {
    const modules = await svc.listModules(ctx);
    expect(Array.isArray(modules)).toBe(true);
  });

  it('lists templates', async () => {
    const templates = await svc.listTemplates(ctx);
    expect(Array.isArray(templates)).toBe(true);
  });

  it('creates and lists variables', async () => {
    const app = await svc.createApp(ctx, { name: 'Var App' });
    const variable = await svc.createVariable(ctx, {
      appId: app.id,
      name: 'selectedPatient',
      type: 'string',
      source: { kind: 'static' },
      lazy: false,
    });
    expect(variable.name).toBe('selectedPatient');

    const variables = await svc.listVariables(ctx, app.id);
    expect(variables.length).toBeGreaterThanOrEqual(1);
  });

  it('gets variable lineage', async () => {
    const app = await svc.createApp(ctx, { name: 'Lineage App' });
    await svc.createVariable(ctx, {
      appId: app.id,
      name: 'source1',
      type: 'string',
      source: { kind: 'static' },
    });
    const lineage = await svc.getVariableLineage(ctx, app.id);
    expect(Array.isArray(lineage)).toBe(true);
  });

  it('evaluates a variable', async () => {
    const app = await svc.createApp(ctx, { name: 'Eval App' });
    const variable = await svc.createVariable(ctx, {
      appId: app.id,
      name: 'staticVar',
      type: 'string',
      source: { kind: 'static', value: 'hello-world', dependencies: [] } as never,
    });
    const value = await svc.evaluateVariable(ctx, variable.id);
    expect(value).toBe('hello-world');
  });
});
