/**
 * In-memory platform resource service.
 */

import { randomUUID } from 'node:crypto';
import type {
  PlatformResourceService, PlatformResource, CreateResourceInput,
  ResourceObjectLink, LinkResourceInput,
  UploadAndLinkResult, UploadAndLinkInput, RequestContext,
} from '@altius/spi';

export class InMemoryPlatformResourceService implements PlatformResourceService {
  private readonly resources = new Map<string, Map<string, PlatformResource>>();
  private readonly links = new Map<string, Map<string, ResourceObjectLink>>();

  async createResource(ctx: RequestContext, input: CreateResourceInput): Promise<PlatformResource> {
    const id = randomUUID();
    const now = new Date().toISOString();
    let path = input.name;
    if (input.parentId) {
      const parent = this.resources.get(ctx.tenantId)?.get(input.parentId);
      if (parent) path = `${parent.path}/${input.name}`;
    }
    const resource: PlatformResource = {
      id, tenantId: ctx.tenantId,
      name: input.name, kind: input.kind, parentId: input.parentId,
      path, description: input.description ?? '',
      mimeType: input.mimeType, sizeBytes: input.sizeBytes, storageRef: input.storageRef,
      isFolder: input.isFolder ?? input.kind === 'folder',
      tags: input.tags ?? [],
      ownerId: ctx.actorId ?? 'system',
      createdAt: now, updatedAt: now,
    };
    this.getResourceMap(ctx.tenantId).set(id, resource);
    return resource;
  }
  async getResource(ctx: RequestContext, id: string): Promise<PlatformResource | null> {
    return this.resources.get(ctx.tenantId)?.get(id) ?? null;
  }
  async listResources(ctx: RequestContext, parentId?: string, kind?: PlatformResource['kind']): Promise<PlatformResource[]> {
    const m = this.resources.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (parentId !== undefined) list = list.filter(r => r.parentId === parentId);
    if (kind) list = list.filter(r => r.kind === kind);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  async updateResource(ctx: RequestContext, id: string, updates: Partial<CreateResourceInput>): Promise<PlatformResource> {
    const r = this.resources.get(ctx.tenantId)?.get(id);
    if (!r) throw new Error(`Resource not found: ${id}`);
    const updated: PlatformResource = {
      ...r,
      name: updates.name ?? r.name, description: updates.description ?? r.description,
      mimeType: updates.mimeType ?? r.mimeType, sizeBytes: updates.sizeBytes ?? r.sizeBytes,
      storageRef: updates.storageRef ?? r.storageRef, tags: updates.tags ?? r.tags,
      updatedAt: new Date().toISOString(),
    };
    this.getResourceMap(ctx.tenantId).set(id, updated);
    return updated;
  }
  async deleteResource(ctx: RequestContext, id: string): Promise<void> {
    this.resources.get(ctx.tenantId)?.delete(id);
    // Also delete links to this resource
    const links = this.links.get(ctx.tenantId);
    if (links) {
      for (const [linkId, link] of links) {
        if (link.resourceId === id) links.delete(linkId);
      }
    }
  }
  async browse(ctx: RequestContext, path?: string): Promise<PlatformResource[]> {
    const m = this.resources.get(ctx.tenantId);
    if (!m) return [];
    if (!path) {
      // Root: resources with no parent
      return Array.from(m.values()).filter(r => !r.parentId).sort((a, b) => a.name.localeCompare(b.name));
    }
    // Find resources whose path starts with the given path
    return Array.from(m.values()).filter(r => r.path.startsWith(path) && r.path !== path).sort((a, b) => a.name.localeCompare(b.name));
  }
  async search(ctx: RequestContext, query: string): Promise<PlatformResource[]> {
    const m = this.resources.get(ctx.tenantId);
    if (!m) return [];
    const q = query.toLowerCase();
    return Array.from(m.values()).filter(r => r.name.toLowerCase().includes(q) || r.tags.some(t => t.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  }

  async linkToObject(ctx: RequestContext, input: LinkResourceInput): Promise<ResourceObjectLink> {
    const link: ResourceObjectLink = {
      id: randomUUID(), tenantId: ctx.tenantId,
      resourceId: input.resourceId, objectType: input.objectType, objectId: input.objectId,
      linkKind: input.linkKind ?? 'attachment',
      createdAt: new Date().toISOString(), createdBy: ctx.actorId ?? 'system',
    };
    this.getLinkMap(ctx.tenantId).set(link.id, link);
    return link;
  }
  async unlinkFromObject(ctx: RequestContext, linkId: string): Promise<void> {
    this.links.get(ctx.tenantId)?.delete(linkId);
  }
  async getLinksForResource(ctx: RequestContext, resourceId: string): Promise<ResourceObjectLink[]> {
    const m = this.links.get(ctx.tenantId);
    if (!m) return [];
    return Array.from(m.values()).filter(l => l.resourceId === resourceId);
  }
  async getLinksForObject(ctx: RequestContext, objectType: string, objectId: string): Promise<ResourceObjectLink[]> {
    const m = this.links.get(ctx.tenantId);
    if (!m) return [];
    return Array.from(m.values()).filter(l => l.objectType === objectType && l.objectId === objectId);
  }

  async uploadAndLink(ctx: RequestContext, input: UploadAndLinkInput): Promise<UploadAndLinkResult> {
    const resource = await this.createResource(ctx, {
      name: input.name, kind: 'file', mimeType: input.mimeType, sizeBytes: input.sizeBytes,
      storageRef: input.storageRef, tags: input.tags,
    });
    const link = await this.linkToObject(ctx, {
      resourceId: resource.id, objectType: input.objectType, objectId: input.objectId,
      linkKind: input.linkKind ?? 'attachment',
    });
    return { resource, link };
  }

  private getResourceMap(t: string) { let m = this.resources.get(t); if (!m) { m = new Map(); this.resources.set(t, m); } return m; }
  private getLinkMap(t: string) { let m = this.links.get(t); if (!m) { m = new Map(); this.links.set(t, m); } return m; }
}
