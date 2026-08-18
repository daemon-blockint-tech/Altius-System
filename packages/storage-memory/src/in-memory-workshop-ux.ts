/**
 * In-memory Workshop UX platform service.
 */

import { randomUUID } from 'node:crypto';
import type {
  WorkshopUxService,
  SavedAppState, SaveAppStateInput,
  RedactModeConfig, UpdateRedactModeInput,
  PerformanceProfile, RecordProfileInput,
  TranslationEntry, SetTranslationInput, TranslationBundle,
  RequestContext,
} from '@altius/spi';

export class InMemoryWorkshopUxService implements WorkshopUxService {
  private readonly states = new Map<string, Map<string, SavedAppState>>();
  private readonly redactConfigs = new Map<string, RedactModeConfig>();
  private readonly profiles = new Map<string, Map<string, PerformanceProfile>>();
  private readonly translations = new Map<string, Map<string, TranslationEntry>>(); // tenant → key:locale → entry

  // ── State saving/sharing ──

  async saveState(ctx: RequestContext, input: SaveAppStateInput): Promise<SavedAppState> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const state: SavedAppState = {
      id, tenantId: ctx.tenantId,
      appId: input.appId, name: input.name, description: input.description ?? '',
      state: input.state,
      ownerId: ctx.actorId ?? 'system', sharedWith: [],
      isPublic: input.isPublic ?? false, isDefault: input.isDefault ?? false,
      version: 1, createdAt: now, updatedAt: now,
    };
    this.getStateMap(ctx.tenantId).set(id, state);
    return state;
  }

  async getState(ctx: RequestContext, id: string): Promise<SavedAppState | null> {
    return this.states.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listStates(ctx: RequestContext, appId: string): Promise<SavedAppState[]> {
    const m = this.states.get(ctx.tenantId);
    if (!m) return [];
    return Array.from(m.values()).filter(s => s.appId === appId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateState(ctx: RequestContext, id: string, updates: Partial<SaveAppStateInput>): Promise<SavedAppState> {
    const s = this.states.get(ctx.tenantId)?.get(id);
    if (!s) throw new Error(`State not found: ${id}`);
    const updated: SavedAppState = {
      ...s,
      name: updates.name ?? s.name, description: updates.description ?? s.description,
      state: updates.state ?? s.state, isPublic: updates.isPublic ?? s.isPublic,
      isDefault: updates.isDefault ?? s.isDefault,
      version: s.version + 1, updatedAt: new Date().toISOString(),
    };
    this.getStateMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteState(ctx: RequestContext, id: string): Promise<void> {
    this.states.get(ctx.tenantId)?.delete(id);
  }

  async shareState(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedAppState> {
    const s = this.states.get(ctx.tenantId)?.get(id);
    if (!s) throw new Error(`State not found: ${id}`);
    const updated = { ...s, sharedWith: [...new Set([...s.sharedWith, ...userIds])] };
    this.getStateMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async forkState(ctx: RequestContext, id: string, newName: string): Promise<SavedAppState> {
    const s = this.states.get(ctx.tenantId)?.get(id);
    if (!s) throw new Error(`State not found: ${id}`);
    return this.saveState(ctx, { appId: s.appId, name: newName, description: s.description, state: s.state });
  }

  // ── Redact mode ──

  async getRedactMode(ctx: RequestContext): Promise<RedactModeConfig> {
    return this.redactConfigs.get(ctx.tenantId) ?? {
      id: 'default', tenantId: ctx.tenantId, enabled: false, level: 'off',
      redactedFields: [], allowedFields: [], redactInExports: true, redactInScreenshots: true,
      updatedAt: new Date().toISOString(), updatedBy: 'system',
    };
  }

  async updateRedactMode(ctx: RequestContext, input: UpdateRedactModeInput): Promise<RedactModeConfig> {
    const current = await this.getRedactMode(ctx);
    const updated: RedactModeConfig = {
      ...current,
      enabled: input.enabled ?? current.enabled,
      level: input.level ?? current.level,
      redactedFields: input.redactedFields ?? current.redactedFields,
      allowedFields: input.allowedFields ?? current.allowedFields,
      redactInExports: input.redactInExports ?? current.redactInExports,
      redactInScreenshots: input.redactInScreenshots ?? current.redactInScreenshots,
      updatedAt: new Date().toISOString(), updatedBy: ctx.actorId ?? 'system',
    };
    this.redactConfigs.set(ctx.tenantId, updated);
    return updated;
  }

  async shouldRedact(ctx: RequestContext, fieldPath: string): Promise<boolean> {
    const config = await this.getRedactMode(ctx);
    if (!config.enabled || config.level === 'off') return false;
    // Check allowed fields first (overrides)
    for (const pattern of config.allowedFields) {
      if (this.matchPattern(pattern, fieldPath)) return false;
    }
    // Check redacted fields
    for (const pattern of config.redactedFields) {
      if (this.matchPattern(pattern, fieldPath)) return true;
    }
    // In 'full' mode, redact everything not explicitly allowed
    return config.level === 'full';
  }

  private matchPattern(pattern: string, path: string): boolean {
    // Convert glob to regex: * → .*, ? → .
    const regex = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(path);
  }

  // ── Performance profiler ──

  async recordProfile(ctx: RequestContext, input: RecordProfileInput): Promise<PerformanceProfile> {
    const id = randomUUID();
    const profile: PerformanceProfile = {
      id, tenantId: ctx.tenantId, appId: input.appId, userId: ctx.actorId ?? 'system',
      name: input.name, durationMs: input.durationMs,
      renderMetrics: input.renderMetrics, networkMetrics: input.networkMetrics,
      memoryMetrics: input.memoryMetrics, timestamp: new Date().toISOString(),
    };
    this.getProfileMap(ctx.tenantId).set(id, profile);
    return profile;
  }

  async getProfile(ctx: RequestContext, id: string): Promise<PerformanceProfile | null> {
    return this.profiles.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listProfiles(ctx: RequestContext, appId?: string): Promise<PerformanceProfile[]> {
    const m = this.profiles.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (appId) list = list.filter(p => p.appId === appId);
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async deleteProfile(ctx: RequestContext, id: string): Promise<void> {
    this.profiles.get(ctx.tenantId)?.delete(id);
  }

  // ── Translations / i18n ──

  async setTranslation(ctx: RequestContext, input: SetTranslationInput): Promise<TranslationEntry> {
    const key = `${input.locale}:${input.key}`;
    const existing = this.getTranslationMap(ctx.tenantId).get(key);
    const entry: TranslationEntry = {
      id: existing?.id ?? randomUUID(), tenantId: ctx.tenantId,
      key: input.key, locale: input.locale, value: input.value,
      autoTranslated: input.source === 'aip',
      source: input.source ?? 'manual',
      updatedAt: new Date().toISOString(),
    };
    this.getTranslationMap(ctx.tenantId).set(key, entry);
    return entry;
  }

  async getTranslation(ctx: RequestContext, key: string, locale: string): Promise<TranslationEntry | null> {
    return this.getTranslationMap(ctx.tenantId).get(`${locale}:${key}`) ?? null;
  }

  async getBundle(ctx: RequestContext, locale: string): Promise<TranslationBundle> {
    const m = this.getTranslationMap(ctx.tenantId);
    const entries: Record<string, string> = {};
    let autoTranslated = 0;
    for (const entry of m.values()) {
      if (entry.locale === locale) {
        entries[entry.key] = entry.value;
        if (entry.autoTranslated) autoTranslated++;
      }
    }
    // Count missing keys vs base locale (en)
    const baseKeys = new Set<string>();
    for (const entry of m.values()) {
      if (entry.locale === 'en') baseKeys.add(entry.key);
    }
    const missing = Array.from(baseKeys).filter(k => !(k in entries)).length;
    return { locale, entries, missingCount: missing, autoTranslatedCount: autoTranslated };
  }

  async listLocales(ctx: RequestContext): Promise<string[]> {
    const m = this.getTranslationMap(ctx.tenantId);
    const locales = new Set<string>();
    for (const entry of m.values()) locales.add(entry.locale);
    return Array.from(locales).sort();
  }

  async autoTranslate(ctx: RequestContext, targetLocale: string, baseLocale = 'en'): Promise<{ translated: number; skipped: number }> {
    const m = this.getTranslationMap(ctx.tenantId);
    const baseEntries = Array.from(m.values()).filter(e => e.locale === baseLocale);
    let translated = 0, skipped = 0;
    for (const base of baseEntries) {
      const existing = m.get(`${targetLocale}:${base.key}`);
      if (existing && !existing.autoTranslated) { skipped++; continue; }
      // In-memory: no real LLM, just copy the base value with a locale marker
      const entry: TranslationEntry = {
        id: existing?.id ?? randomUUID(), tenantId: ctx.tenantId,
        key: base.key, locale: targetLocale,
        value: `[${targetLocale}] ${base.value}`,
        autoTranslated: true, source: 'aip',
        updatedAt: new Date().toISOString(),
      };
      m.set(`${targetLocale}:${base.key}`, entry);
      translated++;
    }
    return { translated, skipped };
  }

  async deleteTranslation(ctx: RequestContext, key: string, locale: string): Promise<void> {
    this.getTranslationMap(ctx.tenantId).delete(`${locale}:${key}`);
  }

  // ── Private maps ──

  private getStateMap(t: string) { let m = this.states.get(t); if (!m) { m = new Map(); this.states.set(t, m); } return m; }
  private getProfileMap(t: string) { let m = this.profiles.get(t); if (!m) { m = new Map(); this.profiles.set(t, m); } return m; }
  private getTranslationMap(t: string) { let m = this.translations.get(t); if (!m) { m = new Map(); this.translations.set(t, m); } return m; }
}
