/**
 * In-memory saved view store — per-user and shared widget view configurations.
 *
 * Tenant-scoped with owner-only update/delete and owner+public visibility.
 */

import type { RequestContext, SavedView, SavedViewStore, CreateSavedViewInput } from '@altius/spi';

export class InMemorySavedViewStore implements SavedViewStore {
  private views = new Map<string, SavedView>();
  private counter = 0;

  async create(ctx: RequestContext, input: CreateSavedViewInput): Promise<SavedView> {
    const id = `sv_${++this.counter}`;
    const now = new Date().toISOString();
    const view: SavedView = {
      id,
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description,
      objectType: input.objectType,
      widgetType: input.widgetType,
      appId: input.appId,
      columns: input.columns,
      filter: input.filter,
      orderBy: input.orderBy,
      density: input.density,
      pageSize: input.pageSize,
      widgetConfig: input.widgetConfig,
      isPublic: input.isPublic ?? false,
      createdBy: ctx.actorId ?? 'unknown',
      createdAt: now,
      updatedAt: now,
    };
    this.views.set(id, view);
    return view;
  }

  async get(ctx: RequestContext, id: string): Promise<SavedView | null> {
    const view = this.views.get(id);
    if (!view) return null;
    if (view.tenantId !== ctx.tenantId) return null;
    if (!view.isPublic && view.createdBy !== ctx.actorId) return null;
    return view;
  }

  async list(ctx: RequestContext, filter?: { objectType?: string; widgetType?: string; appId?: string }): Promise<SavedView[]> {
    return Array.from(this.views.values()).filter((v) => {
      if (v.tenantId !== ctx.tenantId) return false;
      if (!v.isPublic && v.createdBy !== ctx.actorId) return false;
      if (filter?.objectType && v.objectType !== filter.objectType) return false;
      if (filter?.widgetType && v.widgetType !== filter.widgetType) return false;
      if (filter?.appId && v.appId !== filter.appId) return false;
      return true;
    });
  }

  async update(ctx: RequestContext, id: string, updates: Partial<CreateSavedViewInput>): Promise<SavedView> {
    const view = this.views.get(id);
    if (!view) throw new Error(`Saved view not found: ${id}`);
    if (view.tenantId !== ctx.tenantId) throw new Error(`Saved view not found: ${id}`);
    if (view.createdBy !== ctx.actorId) throw new Error(`Only the owner can update a saved view`);
    const updated: SavedView = {
      ...view,
      name: updates.name ?? view.name,
      description: updates.description ?? view.description,
      objectType: updates.objectType ?? view.objectType,
      widgetType: updates.widgetType ?? view.widgetType,
      appId: updates.appId ?? view.appId,
      columns: updates.columns ?? view.columns,
      filter: updates.filter ?? view.filter,
      orderBy: updates.orderBy ?? view.orderBy,
      density: updates.density ?? view.density,
      pageSize: updates.pageSize ?? view.pageSize,
      widgetConfig: updates.widgetConfig ?? view.widgetConfig,
      isPublic: updates.isPublic ?? view.isPublic,
      updatedAt: new Date().toISOString(),
    };
    this.views.set(id, updated);
    return updated;
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    const view = this.views.get(id);
    if (!view) throw new Error(`Saved view not found: ${id}`);
    if (view.tenantId !== ctx.tenantId) throw new Error(`Saved view not found: ${id}`);
    if (view.createdBy !== ctx.actorId) throw new Error(`Only the owner can delete a saved view`);
    this.views.delete(id);
  }
}
