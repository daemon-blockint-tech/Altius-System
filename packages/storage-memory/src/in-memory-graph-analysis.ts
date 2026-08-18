/**
 * In-memory graph analysis service.
 */

import { randomUUID } from 'node:crypto';
import type {
  GraphAnalysisService,
  SavedAnalysis,
  CreateSavedAnalysisInput,
  UpdateSavedAnalysisInput,
  AnalysisVersion,
  TimelineSnapshot,
  TimelineComparison,
  RequestContext,
} from '@altius/spi';

export class InMemoryGraphAnalysisService implements GraphAnalysisService {
  private readonly analyses = new Map<string, Map<string, SavedAnalysis>>();
  private readonly versions = new Map<string, Map<string, Map<string, AnalysisVersion>>>(); // tenant → analysisId → versionId → version
  private readonly sharedWith = new Map<string, Map<string, Set<string>>>(); // tenant → userId → analysisIds

  async create(ctx: RequestContext, input: CreateSavedAnalysisInput): Promise<SavedAnalysis> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const analysis: SavedAnalysis = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      rootObjectType: input.rootObjectType,
      rootObjectId: input.rootObjectId,
      traversalSteps: input.traversalSteps,
      filters: input.filters ?? [],
      layout: input.layout,
      timeline: input.timeline,
      ownerId: ctx.actorId ?? 'system',
      sharedWith: [],
      isPublic: input.isPublic ?? false,
      tags: input.tags ?? [],
      version: 1,
      createdAt: now, updatedAt: now,
    };
    this.getMap(ctx.tenantId).set(id, analysis);
    // Record initial version
    await this.recordVersion(ctx, analysis, 'Initial version');
    return analysis;
  }

  async get(ctx: RequestContext, id: string): Promise<SavedAnalysis | null> {
    return this.analyses.get(ctx.tenantId)?.get(id) ?? null;
  }

  async getByName(ctx: RequestContext, name: string): Promise<SavedAnalysis | null> {
    const m = this.analyses.get(ctx.tenantId);
    if (!m) return null;
    for (const a of m.values()) if (a.name === name) return a;
    return null;
  }

  async list(ctx: RequestContext, tags?: string[]): Promise<SavedAnalysis[]> {
    const m = this.analyses.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (tags && tags.length > 0) list = list.filter(a => tags.some(t => a.tags.includes(t)));
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async update(ctx: RequestContext, id: string, updates: UpdateSavedAnalysisInput, message?: string): Promise<SavedAnalysis> {
    const existing = this.analyses.get(ctx.tenantId)?.get(id);
    if (!existing) throw new Error(`Analysis not found: ${id}`);
    const updated: SavedAnalysis = {
      ...existing,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      rootObjectType: updates.rootObjectType ?? existing.rootObjectType,
      rootObjectId: updates.rootObjectId ?? existing.rootObjectId,
      traversalSteps: updates.traversalSteps ?? existing.traversalSteps,
      filters: updates.filters ?? existing.filters,
      layout: updates.layout ?? existing.layout,
      timeline: updates.timeline ?? existing.timeline,
      isPublic: updates.isPublic ?? existing.isPublic,
      tags: updates.tags ?? existing.tags,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(id, updated);
    await this.recordVersion(ctx, updated, message ?? `Updated to v${updated.version}`);
    return updated;
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    this.analyses.get(ctx.tenantId)?.delete(id);
    this.versions.get(ctx.tenantId)?.delete(id);
  }

  async share(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedAnalysis> {
    const analysis = this.analyses.get(ctx.tenantId)?.get(id);
    if (!analysis) throw new Error(`Analysis not found: ${id}`);
    const updated = { ...analysis, sharedWith: [...new Set([...analysis.sharedWith, ...userIds])] };
    this.getMap(ctx.tenantId).set(id, updated);
    // Track in sharedWith index
    for (const userId of userIds) {
      this.getSharedMap(ctx.tenantId, userId).add(id);
    }
    return updated;
  }

  async unshare(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedAnalysis> {
    const analysis = this.analyses.get(ctx.tenantId)?.get(id);
    if (!analysis) throw new Error(`Analysis not found: ${id}`);
    const updated = { ...analysis, sharedWith: analysis.sharedWith.filter(u => !userIds.includes(u)) };
    this.getMap(ctx.tenantId).set(id, updated);
    for (const userId of userIds) {
      this.sharedWith.get(ctx.tenantId)?.get(userId)?.delete(id);
    }
    return updated;
  }

  async listShared(ctx: RequestContext, userId: string): Promise<SavedAnalysis[]> {
    const ids = this.sharedWith.get(ctx.tenantId)?.get(userId);
    if (!ids) return [];
    const m = this.analyses.get(ctx.tenantId);
    if (!m) return [];
    return Array.from(ids).map(id => m.get(id)).filter((a): a is SavedAnalysis => a !== undefined);
  }

  async duplicate(ctx: RequestContext, id: string, newName: string): Promise<SavedAnalysis> {
    const existing = this.analyses.get(ctx.tenantId)?.get(id);
    if (!existing) throw new Error(`Analysis not found: ${id}`);
    const newId = randomUUID();
    const now = new Date().toISOString();
    const copy: SavedAnalysis = {
      ...existing,
      id: newId, name: newName,
      ownerId: ctx.actorId ?? 'system',
      sharedWith: [],
      version: 1,
      createdAt: now, updatedAt: now,
    };
    this.getMap(ctx.tenantId).set(newId, copy);
    await this.recordVersion(ctx, copy, `Duplicated from ${existing.name}`);
    return copy;
  }

  async listVersions(ctx: RequestContext, id: string): Promise<AnalysisVersion[]> {
    const m = this.versions.get(ctx.tenantId)?.get(id);
    return m ? Array.from(m.values()).sort((a, b) => b.version - a.version) : [];
  }

  async getVersion(ctx: RequestContext, id: string, version: number): Promise<AnalysisVersion | null> {
    const m = this.versions.get(ctx.tenantId)?.get(id);
    if (!m) return null;
    for (const v of m.values()) if (v.version === version) return v;
    return null;
  }

  async revert(ctx: RequestContext, id: string, version: number, message?: string): Promise<SavedAnalysis> {
    const oldVersion = await this.getVersion(ctx, id, version);
    if (!oldVersion) throw new Error(`Version ${version} not found for analysis ${id}`);
    const current = this.analyses.get(ctx.tenantId)?.get(id);
    if (!current) throw new Error(`Analysis not found: ${id}`);
    const reverted: SavedAnalysis = {
      ...oldVersion.snapshot,
      id: current.id,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(id, reverted);
    await this.recordVersion(ctx, reverted, message ?? `Reverted to v${version}`);
    return reverted;
  }

  async getTimeline(_ctx: RequestContext, _objectId: string, _objectType: string, _from?: string, _to?: string): Promise<TimelineSnapshot[]> {
    // In-memory: return empty timeline (no real object history store wired)
    return [];
  }

  async compare(_ctx: RequestContext, objectId: string, objectType: string, leftTime: string, rightTime: string): Promise<TimelineComparison> {
    const left: TimelineSnapshot = { objectId, objectType, timestamp: leftTime, state: {}, version: 0 };
    const right: TimelineSnapshot = { objectId, objectType, timestamp: rightTime, state: {}, version: 0 };
    return { objectId, left, right, changedFields: [], addedFields: [], removedFields: [] };
  }

  private async recordVersion(ctx: RequestContext, analysis: SavedAnalysis, message: string): Promise<void> {
    const versionId = randomUUID();
    const version: AnalysisVersion = {
      id: versionId, tenantId: ctx.tenantId,
      analysisId: analysis.id,
      version: analysis.version,
      snapshot: { ...analysis },
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
      message,
    };
    let m = this.versions.get(ctx.tenantId);
    if (!m) { m = new Map(); this.versions.set(ctx.tenantId, m); }
    let vm = m.get(analysis.id);
    if (!vm) { vm = new Map(); m.set(analysis.id, vm); }
    vm.set(versionId, version);
  }

  private getMap(tenantId: string): Map<string, SavedAnalysis> {
    let m = this.analyses.get(tenantId);
    if (!m) { m = new Map(); this.analyses.set(tenantId, m); }
    return m;
  }
  private getSharedMap(tenantId: string, userId: string): Set<string> {
    let tm = this.sharedWith.get(tenantId);
    if (!tm) { tm = new Map(); this.sharedWith.set(tenantId, tm); }
    let s = tm.get(userId);
    if (!s) { s = new Set(); tm.set(userId, s); }
    return s;
  }
}
