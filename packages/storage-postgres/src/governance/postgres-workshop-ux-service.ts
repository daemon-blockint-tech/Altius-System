/**
 * PostgreSQL-backed Workshop UX platform service.
 *
 * Persists tenant-scoped app state, redact mode, performance profiles,
 * and translations in `governance.workshop_ux_state`.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  RequestContext,
  WorkshopUxService,
  SavedAppState,
  SaveAppStateInput,
  RedactModeConfig,
  UpdateRedactModeInput,
  PerformanceProfile,
  RecordProfileInput,
  TranslationEntry,
  SetTranslationInput,
  TranslationBundle,
} from '@altius/spi';

function toIso(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJsonb<T>(v: unknown): T | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    return JSON.parse(v) as T;
  }
  return v as T;
}

function mapSavedAppState(row: Record<string, unknown>): SavedAppState {
  const payload = parseJsonb<Record<string, unknown>>(row['payload']) ?? {};
  const state = parseJsonb<Record<string, unknown>>(payload['state']) ?? (payload['state'] as Record<string, unknown> | undefined) ?? {};
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    appId: String(row['app_id'] ?? ''),
    name: String(row['name'] ?? ''),
    description: typeof payload['description'] === 'string' ? payload['description'] : '',
    state,
    ownerId: String(row['created_by'] ?? 'system'),
    sharedWith: (row['shared_with'] as string[] | null) ?? [],
    isPublic: row['is_public'] === true,
    isDefault: row['is_default'] === true,
    version: typeof row['version'] === 'number' ? row['version'] : (Number(row['version']) || 1),
    createdAt: toIso(row['created_at']),
    updatedAt: toIso(row['updated_at']),
  };
}

function mapRedactMode(row: Record<string, unknown>): RedactModeConfig {
  const payload = parseJsonb<Record<string, unknown>>(row['payload']) ?? {};
  const level = payload['level'];
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    enabled: payload['enabled'] === true,
    level: level === 'off' || level === 'partial' || level === 'full' ? (level as RedactModeConfig['level']) : 'off',
    redactedFields: (row['redacted_fields'] as string[] | null) ?? [],
    allowedFields: (row['allowed_fields'] as string[] | null) ?? [],
    redactInExports: payload['redactInExports'] !== false,
    redactInScreenshots: payload['redactInScreenshots'] !== false,
    updatedAt: toIso(row['updated_at']),
    updatedBy: String(row['created_by'] ?? 'system'),
  };
}

function mapProfile(row: Record<string, unknown>): PerformanceProfile {
  const payload = parseJsonb<Record<string, unknown>>(row['payload']) ?? {};
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    appId: String(row['app_id'] ?? ''),
    userId: String(row['user_id'] ?? row['created_by'] ?? 'system'),
    name: String(row['name'] ?? ''),
    durationMs: typeof row['duration_ms'] === 'number' ? row['duration_ms'] : (Number(row['duration_ms']) || 0),
    renderMetrics: (parseJsonb<PerformanceProfile['renderMetrics']>(payload['renderMetrics']) ?? payload['renderMetrics']) as PerformanceProfile['renderMetrics'] ?? {
      renderCount: 0,
      avgRenderMs: 0,
      p95RenderMs: 0,
    },
    networkMetrics: (parseJsonb<PerformanceProfile['networkMetrics']>(payload['networkMetrics']) ?? payload['networkMetrics']) as PerformanceProfile['networkMetrics'] ?? {
      requestCount: 0,
      avgRequestMs: 0,
      p95RequestMs: 0,
      failedRequests: 0,
    },
    memoryMetrics: parseJsonb<PerformanceProfile['memoryMetrics']>(payload['memoryMetrics']),
    timestamp: toIso(row['created_at']),
  };
}

function mapTranslation(row: Record<string, unknown>): TranslationEntry {
  const source = String(row['source'] ?? 'manual');
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    key: String(row['key'] ?? ''),
    locale: String(row['locale'] ?? ''),
    value: String(row['value'] ?? ''),
    autoTranslated: row['auto_translated'] === true,
    source: source === 'manual' || source === 'aip' || source === 'import' ? (source as TranslationEntry['source']) : 'manual',
    updatedAt: toIso(row['updated_at']),
  };
}

const REDACT_MODE_ID = (tenantId: string) => `${tenantId}:redact`;
const TRANSLATION_ID = (tenantId: string, locale: string, key: string) => `${tenantId}:${locale}:${key}`;

export class PostgresWorkshopUxService implements WorkshopUxService {
  constructor(private readonly pool: Pool) {}

  // ── State saving/sharing ──

  async saveState(ctx: RequestContext, input: SaveAppStateInput): Promise<SavedAppState> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const payload = { state: input.state, description: input.description ?? '' };
    const r = await this.pool.query(
      `INSERT INTO "governance"."workshop_ux_state"
         ("id","tenant_id","kind","app_id","name","payload","shared_with","is_public","is_default","version","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12)
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        'app_state',
        input.appId,
        input.name,
        JSON.stringify(payload),
        [],
        input.isPublic ?? false,
        input.isDefault ?? false,
        1,
        now,
        ctx.actorId ?? 'system',
      ],
    );
    return mapSavedAppState(r.rows[0]!);
  }

  async getState(ctx: RequestContext, id: string): Promise<SavedAppState | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."workshop_ux_state" WHERE "id"=$1 AND "tenant_id"=$2 AND "kind"='app_state'`,
      [id, ctx.tenantId],
    );
    return r.rows[0] ? mapSavedAppState(r.rows[0]!) : null;
  }

  async listStates(ctx: RequestContext, appId: string): Promise<SavedAppState[]> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."workshop_ux_state" WHERE "tenant_id"=$1 AND "kind"='app_state' AND "app_id"=$2 ORDER BY "updated_at" DESC`,
      [ctx.tenantId, appId],
    );
    return r.rows.map(mapSavedAppState);
  }

  async updateState(ctx: RequestContext, id: string, updates: Partial<SaveAppStateInput>): Promise<SavedAppState> {
    const existing = await this.getState(ctx, id);
    if (!existing) throw new Error(`State not found: ${id}`);
    const now = new Date().toISOString();
    const payload = {
      state: updates.state ?? existing.state,
      description: updates.description ?? existing.description,
    };
    const r = await this.pool.query(
      `UPDATE "governance"."workshop_ux_state"
       SET "name"=$3,
           "payload"=$4,
           "is_public"=$5,
           "is_default"=$6,
           "updated_at"=$7,
           "version"="version"+1
       WHERE "id"=$1 AND "tenant_id"=$2 AND "kind"='app_state'
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        updates.name ?? existing.name,
        JSON.stringify(payload),
        updates.isPublic ?? existing.isPublic,
        updates.isDefault ?? existing.isDefault,
        now,
      ],
    );
    return mapSavedAppState(r.rows[0]!);
  }

  async deleteState(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "governance"."workshop_ux_state" WHERE "id"=$1 AND "tenant_id"=$2 AND "kind"='app_state'`,
      [id, ctx.tenantId],
    );
  }

  async shareState(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedAppState> {
    const existing = await this.getState(ctx, id);
    if (!existing) throw new Error(`State not found: ${id}`);
    const merged = [...new Set([...existing.sharedWith, ...userIds])];
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."workshop_ux_state"
       SET "shared_with"=$3, "updated_at"=$4
       WHERE "id"=$1 AND "tenant_id"=$2 AND "kind"='app_state'
       RETURNING *`,
      [id, ctx.tenantId, merged, now],
    );
    return mapSavedAppState(r.rows[0]!);
  }

  async forkState(ctx: RequestContext, id: string, newName: string): Promise<SavedAppState> {
    const existing = await this.getState(ctx, id);
    if (!existing) throw new Error(`State not found: ${id}`);
    return this.saveState(ctx, { appId: existing.appId, name: newName, description: existing.description, state: existing.state });
  }

  // ── Redact mode ──

  async getRedactMode(ctx: RequestContext): Promise<RedactModeConfig> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."workshop_ux_state" WHERE "tenant_id"=$1 AND "kind"='redact_mode' ORDER BY "updated_at" DESC LIMIT 1`,
      [ctx.tenantId],
    );
    if (r.rows[0]) return mapRedactMode(r.rows[0]!);
    return {
      id: 'default',
      tenantId: ctx.tenantId,
      enabled: false,
      level: 'off',
      redactedFields: [],
      allowedFields: [],
      redactInExports: true,
      redactInScreenshots: true,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    };
  }

  async updateRedactMode(ctx: RequestContext, input: UpdateRedactModeInput): Promise<RedactModeConfig> {
    const current = await this.getRedactMode(ctx);
    const enabled = input.enabled ?? current.enabled;
    const level = input.level ?? current.level;
    const redactedFields = input.redactedFields ?? current.redactedFields;
    const allowedFields = input.allowedFields ?? current.allowedFields;
    const redactInExports = input.redactInExports ?? current.redactInExports;
    const redactInScreenshots = input.redactInScreenshots ?? current.redactInScreenshots;
    const now = new Date().toISOString();
    const payload = { enabled, level, redactInExports, redactInScreenshots };
    const id = REDACT_MODE_ID(ctx.tenantId);
    const r = await this.pool.query(
      `INSERT INTO "governance"."workshop_ux_state"
         ("id","tenant_id","kind","payload","redacted_fields","allowed_fields","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8)
       ON CONFLICT ("id") DO UPDATE SET
         "payload"=EXCLUDED."payload",
         "redacted_fields"=EXCLUDED."redacted_fields",
         "allowed_fields"=EXCLUDED."allowed_fields",
         "updated_at"=EXCLUDED."updated_at",
         "created_by"=EXCLUDED."created_by"
       RETURNING *`,
      [id, ctx.tenantId, 'redact_mode', JSON.stringify(payload), redactedFields, allowedFields, now, ctx.actorId ?? 'system'],
    );
    return mapRedactMode(r.rows[0]!);
  }

  async shouldRedact(ctx: RequestContext, fieldPath: string): Promise<boolean> {
    const config = await this.getRedactMode(ctx);
    if (!config.enabled || config.level === 'off') return false;
    for (const pattern of config.allowedFields) {
      if (this.matchPattern(pattern, fieldPath)) return false;
    }
    for (const pattern of config.redactedFields) {
      if (this.matchPattern(pattern, fieldPath)) return true;
    }
    return config.level === 'full';
  }

  private matchPattern(pattern: string, path: string): boolean {
    const regex = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(path);
  }

  // ── Performance profiler ──

  async recordProfile(ctx: RequestContext, input: RecordProfileInput): Promise<PerformanceProfile> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const payload = { renderMetrics: input.renderMetrics, networkMetrics: input.networkMetrics, memoryMetrics: input.memoryMetrics };
    const r = await this.pool.query(
      `INSERT INTO "governance"."workshop_ux_state"
         ("id","tenant_id","kind","app_id","user_id","name","duration_ms","payload","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        'profile',
        input.appId,
        ctx.actorId ?? 'system',
        input.name,
        input.durationMs,
        JSON.stringify(payload),
        now,
        ctx.actorId ?? 'system',
      ],
    );
    return mapProfile(r.rows[0]!);
  }

  async getProfile(ctx: RequestContext, id: string): Promise<PerformanceProfile | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."workshop_ux_state" WHERE "id"=$1 AND "tenant_id"=$2 AND "kind"='profile'`,
      [id, ctx.tenantId],
    );
    return r.rows[0] ? mapProfile(r.rows[0]!) : null;
  }

  async listProfiles(ctx: RequestContext, appId?: string): Promise<PerformanceProfile[]> {
    let sql = `SELECT * FROM "governance"."workshop_ux_state" WHERE "tenant_id"=$1 AND "kind"='profile'`;
    const params: unknown[] = [ctx.tenantId];
    if (appId) {
      params.push(appId);
      sql += ` AND "app_id"=$${params.length}`;
    }
    sql += ` ORDER BY "created_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapProfile);
  }

  async deleteProfile(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "governance"."workshop_ux_state" WHERE "id"=$1 AND "tenant_id"=$2 AND "kind"='profile'`,
      [id, ctx.tenantId],
    );
  }

  // ── Translations / i18n ──

  async setTranslation(ctx: RequestContext, input: SetTranslationInput): Promise<TranslationEntry> {
    const now = new Date().toISOString();
    const source = input.source ?? 'manual';
    const autoTranslated = source === 'aip';
    const id = TRANSLATION_ID(ctx.tenantId, input.locale, input.key);
    const r = await this.pool.query(
      `INSERT INTO "governance"."workshop_ux_state"
         ("id","tenant_id","kind","key","locale","value","auto_translated","source","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)
       ON CONFLICT ("id") DO UPDATE SET
         "value"=EXCLUDED."value",
         "auto_translated"=EXCLUDED."auto_translated",
         "source"=EXCLUDED."source",
         "updated_at"=EXCLUDED."updated_at",
         "created_by"=EXCLUDED."created_by"
       RETURNING *`,
      [id, ctx.tenantId, 'translation', input.key, input.locale, input.value, autoTranslated, source, now, ctx.actorId ?? 'system'],
    );
    return mapTranslation(r.rows[0]!);
  }

  async getTranslation(ctx: RequestContext, key: string, locale: string): Promise<TranslationEntry | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."workshop_ux_state" WHERE "tenant_id"=$1 AND "kind"='translation' AND "key"=$2 AND "locale"=$3`,
      [ctx.tenantId, key, locale],
    );
    return r.rows[0] ? mapTranslation(r.rows[0]!) : null;
  }

  async getBundle(ctx: RequestContext, locale: string): Promise<TranslationBundle> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."workshop_ux_state" WHERE "tenant_id"=$1 AND "kind"='translation' AND "locale"=ANY($2)`,
      [ctx.tenantId, [locale, 'en']],
    );
    const entries: Record<string, string> = {};
    let autoTranslated = 0;
    const baseKeys = new Set<string>();
    for (const row of r.rows) {
      const e = mapTranslation(row);
      if (e.locale === locale) {
        entries[e.key] = e.value;
        if (e.autoTranslated) autoTranslated++;
      }
      if (e.locale === 'en') {
        baseKeys.add(e.key);
      }
    }
    const missing = Array.from(baseKeys).filter((k) => !(k in entries)).length;
    return { locale, entries, missingCount: missing, autoTranslatedCount: autoTranslated };
  }

  async listLocales(ctx: RequestContext): Promise<string[]> {
    const r = await this.pool.query(
      `SELECT DISTINCT "locale" FROM "governance"."workshop_ux_state" WHERE "tenant_id"=$1 AND "kind"='translation'`,
      [ctx.tenantId],
    );
    return r.rows.map((row) => String(row['locale'])).filter(Boolean).sort();
  }

  async autoTranslate(ctx: RequestContext, targetLocale: string, baseLocale = 'en'): Promise<{ translated: number; skipped: number }> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."workshop_ux_state" WHERE "tenant_id"=$1 AND "kind"='translation' AND "locale"=$2`,
      [ctx.tenantId, baseLocale],
    );
    let translated = 0;
    let skipped = 0;
    for (const row of r.rows) {
      const base = mapTranslation(row);
      const existing = await this.getTranslation(ctx, base.key, targetLocale);
      if (existing && !existing.autoTranslated) {
        skipped++;
        continue;
      }
      await this.setTranslation(ctx, {
        key: base.key,
        locale: targetLocale,
        value: `[${targetLocale}] ${base.value}`,
        source: 'aip',
      });
      translated++;
    }
    return { translated, skipped };
  }

  async deleteTranslation(ctx: RequestContext, key: string, locale: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "governance"."workshop_ux_state" WHERE "tenant_id"=$1 AND "kind"='translation' AND "key"=$2 AND "locale"=$3`,
      [ctx.tenantId, key, locale],
    );
  }
}
