/**
 * In-memory embedding and cross-app service.
 */

import { randomUUID } from 'node:crypto';
import type {
  EmbeddingService, RegisteredApp, RegisterAppInput,
  EmbeddingManifest, CrossAppCommand, SendCommandInput,
  AppPairing, CreateAppPairingInput, RequestContext,
} from '@altius/spi';

export class InMemoryEmbeddingService implements EmbeddingService {
  private readonly apps = new Map<string, Map<string, RegisteredApp>>();
  private readonly appsByName = new Map<string, Map<string, string>>();
  private readonly commands = new Map<string, Map<string, CrossAppCommand>>();
  private readonly pairings = new Map<string, Map<string, AppPairing>>();
  private readonly sharedState = new Map<string, Map<string, Record<string, unknown>>>();

  async registerApp(ctx: RequestContext, input: RegisterAppInput): Promise<RegisteredApp> {
    const id = randomUUID();
    const app: RegisteredApp = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      kind: input.kind, url: input.url, iconUrl: input.iconUrl,
      embeddable: input.embeddable ?? true,
      allowedEmbedOrigins: input.allowedEmbedOrigins,
      supportsDeepLinks: input.supportsDeepLinks ?? false,
      deepLinkPattern: input.deepLinkPattern,
      supportsCommands: input.supportsCommands ?? false,
      version: '1.0.0', enabled: input.enabled ?? true,
      createdAt: new Date().toISOString(), createdBy: ctx.actorId ?? 'system',
    };
    this.getAppMap(ctx.tenantId).set(id, app);
    this.getNameMap(ctx.tenantId).set(input.name, id);
    return app;
  }
  async getApp(ctx: RequestContext, id: string): Promise<RegisteredApp | null> {
    return this.apps.get(ctx.tenantId)?.get(id) ?? null;
  }
  async getAppByName(ctx: RequestContext, name: string): Promise<RegisteredApp | null> {
    const id = this.appsByName.get(ctx.tenantId)?.get(name);
    return id ? (this.apps.get(ctx.tenantId)?.get(id) ?? null) : null;
  }
  async listApps(ctx: RequestContext, kind?: RegisteredApp['kind']): Promise<RegisteredApp[]> {
    const m = this.apps.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (kind) list = list.filter(a => a.kind === kind);
    return list;
  }
  async updateApp(ctx: RequestContext, id: string, updates: Partial<RegisterAppInput>): Promise<RegisteredApp> {
    const app = this.apps.get(ctx.tenantId)?.get(id);
    if (!app) throw new Error(`App not found: ${id}`);
    const updated: RegisteredApp = {
      ...app,
      name: updates.name ?? app.name, description: updates.description ?? app.description,
      url: updates.url ?? app.url, iconUrl: updates.iconUrl ?? app.iconUrl,
      embeddable: updates.embeddable ?? app.embeddable,
      allowedEmbedOrigins: updates.allowedEmbedOrigins ?? app.allowedEmbedOrigins,
      supportsDeepLinks: updates.supportsDeepLinks ?? app.supportsDeepLinks,
      deepLinkPattern: updates.deepLinkPattern ?? app.deepLinkPattern,
      supportsCommands: updates.supportsCommands ?? app.supportsCommands,
      enabled: updates.enabled ?? app.enabled,
    };
    this.getAppMap(ctx.tenantId).set(id, updated);
    return updated;
  }
  async deleteApp(ctx: RequestContext, id: string): Promise<void> {
    const app = this.apps.get(ctx.tenantId)?.get(id);
    if (app) this.getNameMap(ctx.tenantId).delete(app.name);
    this.apps.get(ctx.tenantId)?.delete(id);
  }

  async getEmbeddingManifest(ctx: RequestContext, appId: string): Promise<EmbeddingManifest | null> {
    const app = await this.getApp(ctx, appId);
    if (!app) return null;
    return {
      appId,
      frameSrc: app.allowedEmbedOrigins ?? (app.embeddable ? [app.url] : []),
      framingAllowed: app.embeddable,
      requiredPermissions: ['read'],
      contextParameters: [{ name: 'objectId', type: 'string', required: false }],
      emittedEvents: app.supportsCommands ? ['command', 'navigate'] : ['navigate'],
      acceptedCommands: app.supportsCommands ? ['update', 'select', 'filter'] : [],
    };
  }

  async sendCommand(ctx: RequestContext, sourceAppId: string, input: SendCommandInput): Promise<CrossAppCommand> {
    const cmd: CrossAppCommand = {
      id: randomUUID(), tenantId: ctx.tenantId,
      sourceAppId, targetAppId: input.targetAppId,
      command: input.command, payload: input.payload ?? {},
      status: 'pending', timestamp: new Date().toISOString(),
    };
    this.getCmdMap(ctx.tenantId).set(cmd.id, cmd);
    return cmd;
  }
  async getCommand(ctx: RequestContext, commandId: string): Promise<CrossAppCommand | null> {
    return this.commands.get(ctx.tenantId)?.get(commandId) ?? null;
  }
  async listCommands(ctx: RequestContext, appId?: string): Promise<CrossAppCommand[]> {
    const m = this.commands.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (appId) list = list.filter(c => c.sourceAppId === appId || c.targetAppId === appId);
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  async updateCommandStatus(ctx: RequestContext, commandId: string, status: CrossAppCommand['status'], result?: unknown, error?: string): Promise<CrossAppCommand> {
    const cmd = this.commands.get(ctx.tenantId)?.get(commandId);
    if (!cmd) throw new Error(`Command not found: ${commandId}`);
    const updated = { ...cmd, status, result, error };
    this.getCmdMap(ctx.tenantId).set(commandId, updated);
    return updated;
  }

  async createPairing(ctx: RequestContext, input: CreateAppPairingInput): Promise<AppPairing> {
    const id = randomUUID();
    const pairing: AppPairing = {
      id, tenantId: ctx.tenantId,
      appAId: input.appAId, appBId: input.appBId,
      sharedStateKeys: input.sharedStateKeys ?? [],
      bidirectional: input.bidirectional ?? true,
      createdAt: new Date().toISOString(), createdBy: ctx.actorId ?? 'system',
      active: input.active ?? true,
    };
    this.getPairingMap(ctx.tenantId).set(id, pairing);
    return pairing;
  }
  async getPairing(ctx: RequestContext, id: string): Promise<AppPairing | null> {
    return this.pairings.get(ctx.tenantId)?.get(id) ?? null;
  }
  async listPairings(ctx: RequestContext, appId?: string): Promise<AppPairing[]> {
    const m = this.pairings.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (appId) list = list.filter(p => p.appAId === appId || p.appBId === appId);
    return list;
  }
  async deletePairing(ctx: RequestContext, id: string): Promise<void> {
    this.pairings.get(ctx.tenantId)?.delete(id);
  }
  async syncSharedState(ctx: RequestContext, pairingId: string, key: string, value: unknown): Promise<{ delivered: boolean }> {
    const pairing = this.pairings.get(ctx.tenantId)?.get(pairingId);
    if (!pairing) throw new Error(`Pairing not found: ${pairingId}`);
    if (!pairing.active) return { delivered: false };
    let stateMap = this.sharedState.get(ctx.tenantId);
    if (!stateMap) { stateMap = new Map(); this.sharedState.set(ctx.tenantId, stateMap); }
    stateMap.set(`${pairingId}:${key}`, { key, value, syncedAt: new Date().toISOString() });
    return { delivered: true };
  }

  private getAppMap(t: string) { let m = this.apps.get(t); if (!m) { m = new Map(); this.apps.set(t, m); } return m; }
  private getNameMap(t: string) { let m = this.appsByName.get(t); if (!m) { m = new Map(); this.appsByName.set(t, m); } return m; }
  private getCmdMap(t: string) { let m = this.commands.get(t); if (!m) { m = new Map(); this.commands.set(t, m); } return m; }
  private getPairingMap(t: string) { let m = this.pairings.get(t); if (!m) { m = new Map(); this.pairings.set(t, m); } return m; }
}
