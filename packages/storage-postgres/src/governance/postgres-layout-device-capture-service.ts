/**
 * PostgreSQL-backed layout, device-capture, and deep-link service.
 *
 * Persists tenant-scoped UI state, device captures, and deep-link patterns
 * in a single generic `governance.layout_device_state` table.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  RequestContext,
  LayoutDeviceCaptureService,
  UiStateEntry,
  SetUiStateInput,
  DeviceCapture,
  RecordCaptureInput,
  ResolvedDeepLink,
} from '@altius/spi';

const EXPIRY_FILTER = `"expires_at" IS NULL OR "expires_at" > NOW()`;

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

function mapUiState(row: Record<string, unknown>): UiStateEntry {
  const payload = parseJsonb<Record<string, unknown>>(row['payload']) ?? {};
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    userId: String(row['device_id'] ?? payload['userId'] ?? ''),
    key: String(payload['key'] ?? ''),
    value: payload['value'],
    scope: (payload['scope'] as 'user' | 'app' | 'global') ?? 'user',
    appContext: payload['appContext'] ? String(payload['appContext']) : undefined,
    createdAt: toIso(row['created_at']),
    updatedAt: toIso(row['updated_at']),
  };
}

function mapCapture(row: Record<string, unknown>): DeviceCapture {
  const payload = parseJsonb<Record<string, unknown>>(row['payload']) ?? {};
  const data = parseJsonb<DeviceCapture['data']>(payload['data']) ?? {};
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    kind: (payload['kind'] as DeviceCapture['kind']) ?? (row['device_id'] as DeviceCapture['kind']) ?? 'qr_code',
    data,
    userId: String(payload['userId'] ?? row['created_by'] ?? ''),
    objectType: payload['objectType'] ? String(payload['objectType']) : undefined,
    objectId: payload['objectId'] ? String(payload['objectId']) : undefined,
    timestamp: payload['timestamp'] ? String(payload['timestamp']) : toIso(row['created_at']),
  };
}

export class PostgresLayoutDeviceCaptureService implements LayoutDeviceCaptureService {
  constructor(private readonly pool: Pool) {}

  async setState(ctx: RequestContext, input: SetUiStateInput): Promise<UiStateEntry> {
    const id = `${ctx.tenantId}:ui:${input.scope ?? 'user'}:${input.appContext ?? ''}:${input.key}`;
    const now = new Date().toISOString();
    const payload = {
      key: input.key,
      value: input.value,
      scope: input.scope ?? 'user',
      appContext: input.appContext,
    };
    const r = await this.pool.query(
      `INSERT INTO "governance"."layout_device_state"
         ("id","tenant_id","device_id","session_id","kind","payload","created_at","updated_at","created_by","expires_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)
       ON CONFLICT ("id") DO UPDATE SET
         "device_id"=EXCLUDED."device_id",
         "session_id"=EXCLUDED."session_id",
         "payload"=EXCLUDED."payload",
         "updated_at"=EXCLUDED."updated_at",
         "created_by"=EXCLUDED."created_by"
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        ctx.actorId ?? 'system',
        `${input.scope ?? 'user'}:${input.appContext ?? ''}`,
        'ui_state',
        JSON.stringify(payload),
        now,
        ctx.actorId ?? 'system',
        null,
      ],
    );
    return mapUiState(r.rows[0]!);
  }

  async getState(ctx: RequestContext, key: string): Promise<UiStateEntry | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."layout_device_state"
       WHERE "tenant_id"=$1 AND "kind"='ui_state' AND "payload"->>'key'=$2 AND (${EXPIRY_FILTER})
       ORDER BY "updated_at" DESC LIMIT 1`,
      [ctx.tenantId, key],
    );
    return r.rows[0] ? mapUiState(r.rows[0]!) : null;
  }

  async listState(ctx: RequestContext, userId?: string, appContext?: string): Promise<UiStateEntry[]> {
    let sql = `SELECT * FROM "governance"."layout_device_state"
               WHERE "tenant_id"=$1 AND "kind"='ui_state' AND (${EXPIRY_FILTER})`;
    const params: unknown[] = [ctx.tenantId];
    if (userId) {
      params.push(userId);
      sql += ` AND "device_id"=$${params.length}`;
    }
    if (appContext) {
      params.push(appContext);
      sql += ` AND "payload"->>'appContext'=$${params.length}`;
    }
    sql += ` ORDER BY "updated_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapUiState);
  }

  async deleteState(ctx: RequestContext, key: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "governance"."layout_device_state"
       WHERE "tenant_id"=$1 AND "kind"='ui_state' AND "payload"->>'key'=$2`,
      [ctx.tenantId, key],
    );
  }

  async recordCapture(ctx: RequestContext, input: RecordCaptureInput): Promise<DeviceCapture> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const payload = {
      kind: input.kind,
      data: input.data,
      objectType: input.objectType,
      objectId: input.objectId,
      userId: ctx.actorId ?? 'system',
      timestamp: now,
    };
    const r = await this.pool.query(
      `INSERT INTO "governance"."layout_device_state"
         ("id","tenant_id","device_id","session_id","kind","payload","created_at","updated_at","created_by","expires_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        input.kind,
        input.objectId ?? null,
        'capture',
        JSON.stringify(payload),
        // $7 fills both "created_at" and "updated_at", so `now` is bound once.
        now,
        ctx.actorId ?? 'system',
        null,
      ],
    );
    return mapCapture(r.rows[0]!);
  }

  async getCapture(ctx: RequestContext, id: string): Promise<DeviceCapture | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."layout_device_state"
       WHERE "id"=$1 AND "tenant_id"=$2 AND "kind"='capture' AND (${EXPIRY_FILTER})`,
      [id, ctx.tenantId],
    );
    return r.rows[0] ? mapCapture(r.rows[0]!) : null;
  }

  async listCaptures(ctx: RequestContext, kind?: DeviceCapture['kind']): Promise<DeviceCapture[]> {
    let sql = `SELECT * FROM "governance"."layout_device_state"
               WHERE "tenant_id"=$1 AND "kind"='capture' AND (${EXPIRY_FILTER})`;
    const params: unknown[] = [ctx.tenantId];
    if (kind) {
      params.push(kind);
      sql += ` AND "device_id"=$${params.length}`;
    }
    sql += ` ORDER BY "created_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapCapture);
  }

  async deleteCapture(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "governance"."layout_device_state"
       WHERE "id"=$1 AND "tenant_id"=$2 AND "kind"='capture'`,
      [id, ctx.tenantId],
    );
  }

  async resolveDeepLink(ctx: RequestContext, url: string): Promise<ResolvedDeepLink> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."layout_device_state"
       WHERE "tenant_id"=$1 AND "kind"='deep_link_pattern' AND (${EXPIRY_FILTER})
       ORDER BY "created_at" ASC`,
      [ctx.tenantId],
    );
    for (const row of r.rows) {
      const payload = parseJsonb<Record<string, string>>(row['payload']) ?? {};
      const pattern = payload['pattern'] ?? '';
      const appId = (row['device_id'] as string | undefined) ?? payload['appId'] ?? '';
      const screen = (row['session_id'] as string | undefined) ?? payload['screen'] ?? '';
      const regexStr = pattern.replace(/\{(\w+)\}/g, '([^/]+)');
      const match = url.match(new RegExp(`^${regexStr}$`));
      if (match) {
        const paramNames = [...pattern.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
        const params: Record<string, string> = {};
        paramNames.forEach((name, i) => {
          params[name] = match[i + 1]!;
        });
        return { url, appId, screen, params, valid: true };
      }
    }
    return { url, params: {}, valid: false, error: 'No matching deep-link pattern' };
  }

  async registerDeepLinkPattern(ctx: RequestContext, appId: string, pattern: string, screen: string): Promise<void> {
    const id = `${ctx.tenantId}:dl:${appId}:${pattern}`;
    const now = new Date().toISOString();
    const payload = { pattern, appId, screen };
    await this.pool.query(
      `INSERT INTO "governance"."layout_device_state"
         ("id","tenant_id","device_id","session_id","kind","payload","created_at","updated_at","created_by","expires_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)
       ON CONFLICT ("id") DO UPDATE SET
         "device_id"=EXCLUDED."device_id",
         "session_id"=EXCLUDED."session_id",
         "payload"=EXCLUDED."payload",
         "updated_at"=EXCLUDED."updated_at",
         "created_by"=EXCLUDED."created_by"`,
      [id, ctx.tenantId, appId, screen, 'deep_link_pattern', JSON.stringify(payload), now, ctx.actorId ?? 'system', null],
    );
  }
}
