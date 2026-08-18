/**
 * In-memory layout and device-capture service.
 */

import { randomUUID } from 'node:crypto';
import type {
  LayoutDeviceCaptureService, UiStateEntry, SetUiStateInput,
  DeviceCapture, RecordCaptureInput, ResolvedDeepLink, RequestContext,
} from '@altius/spi';

export class InMemoryLayoutDeviceCaptureService implements LayoutDeviceCaptureService {
  private readonly state = new Map<string, Map<string, UiStateEntry>>();
  private readonly captures = new Map<string, Map<string, DeviceCapture>>();
  private readonly deepLinkPatterns = new Map<string, Array<{ appId: string; pattern: string; screen: string }>>();

  async setState(ctx: RequestContext, input: SetUiStateInput): Promise<UiStateEntry> {
    const key = `${input.scope ?? 'user'}:${input.appContext ?? ''}:${input.key}`;
    const existing = this.getStateMap(ctx.tenantId).get(key);
    const now = new Date().toISOString();
    const entry: UiStateEntry = {
      id: existing?.id ?? randomUUID(), tenantId: ctx.tenantId,
      userId: ctx.actorId ?? 'system', key: input.key,
      value: input.value, scope: input.scope ?? 'user',
      appContext: input.appContext,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    this.getStateMap(ctx.tenantId).set(key, entry);
    return entry;
  }
  async getState(ctx: RequestContext, key: string): Promise<UiStateEntry | null> {
    for (const entry of this.getStateMap(ctx.tenantId).values()) {
      if (entry.key === key) return entry;
    }
    return null;
  }
  async listState(ctx: RequestContext, userId?: string, appContext?: string): Promise<UiStateEntry[]> {
    let list = Array.from(this.getStateMap(ctx.tenantId).values());
    if (userId) list = list.filter(e => e.userId === userId);
    if (appContext) list = list.filter(e => e.appContext === appContext);
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async deleteState(ctx: RequestContext, key: string): Promise<void> {
    const m = this.getStateMap(ctx.tenantId);
    for (const [k, e] of m) { if (e.key === key) { m.delete(k); break; } }
  }

  async recordCapture(ctx: RequestContext, input: RecordCaptureInput): Promise<DeviceCapture> {
    const id = randomUUID();
    const capture: DeviceCapture = {
      id, tenantId: ctx.tenantId, kind: input.kind, data: input.data,
      userId: ctx.actorId ?? 'system',
      objectType: input.objectType, objectId: input.objectId,
      timestamp: new Date().toISOString(),
    };
    this.getCaptureMap(ctx.tenantId).set(id, capture);
    return capture;
  }
  async getCapture(ctx: RequestContext, id: string): Promise<DeviceCapture | null> {
    return this.captures.get(ctx.tenantId)?.get(id) ?? null;
  }
  async listCaptures(ctx: RequestContext, kind?: DeviceCapture['kind']): Promise<DeviceCapture[]> {
    const m = this.captures.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (kind) list = list.filter(c => c.kind === kind);
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  async deleteCapture(ctx: RequestContext, id: string): Promise<void> {
    this.captures.get(ctx.tenantId)?.delete(id);
  }

  async resolveDeepLink(ctx: RequestContext, url: string): Promise<ResolvedDeepLink> {
    const patterns = this.deepLinkPatterns.get(ctx.tenantId) ?? [];
    for (const p of patterns) {
      // Convert pattern to regex: /app/{name}/view/{id} → /app/([^/]+)/view/([^/]+)
      const regexStr = p.pattern.replace(/\{(\w+)\}/g, '([^/]+)');
      const match = url.match(new RegExp(`^${regexStr}$`));
      if (match) {
        const paramNames = [...p.pattern.matchAll(/\{(\w+)\}/g)].map(m => m[1]!);
        const params: Record<string, string> = {};
        paramNames.forEach((name, i) => { params[name] = match[i + 1]!; });
        return { url, appId: p.appId, screen: p.screen, params, valid: true };
      }
    }
    return { url, params: {}, valid: false, error: 'No matching deep-link pattern' };
  }
  async registerDeepLinkPattern(ctx: RequestContext, appId: string, pattern: string, screen: string): Promise<void> {
    let list = this.deepLinkPatterns.get(ctx.tenantId);
    if (!list) { list = []; this.deepLinkPatterns.set(ctx.tenantId, list); }
    list.push({ appId, pattern, screen });
  }

  private getStateMap(t: string) { let m = this.state.get(t); if (!m) { m = new Map(); this.state.set(t, m); } return m; }
  private getCaptureMap(t: string) { let m = this.captures.get(t); if (!m) { m = new Map(); this.captures.set(t, m); } return m; }
}
