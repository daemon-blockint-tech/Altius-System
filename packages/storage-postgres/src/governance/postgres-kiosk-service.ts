/**
 * PostgreSQL-backed kiosk session service.
 *
 * Persists long-lived, read-only, permission-scoped display sessions with the
 * same state machine and auto-expiry behavior as the in-memory provider.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { KioskService, KioskSession, CreateKioskInput, RequestContext } from '@altius/spi';

/** TIMESTAMPTZ arrives as a Date; the SPI types every timestamp as an ISO string. */
function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJsonb<T>(v: unknown): T {
  if (v === null || v === undefined) {
    return undefined as unknown as T;
  }
  if (typeof v === 'string') {
    return JSON.parse(v) as T;
  }
  return v as T;
}

function mapSession(row: Record<string, unknown>): KioskSession {
  const allowedOrigins = row['allowed_origins'];
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    name: String(row['name']),
    location: String(row['location']),
    kioskUserId: String(row['kiosk_user_id']),
    permissions: parseJsonb<KioskSession['permissions']>(row['permissions']) ?? { readOnly: true, objectTypes: [] },
    state: row['state'] as KioskSession['state'],
    startedAt: toIso(row['started_at'])!,
    expiresAt: toIso(row['expires_at'])!,
    lastActivityAt: toIso(row['last_activity_at'])!,
    adminAllowlisted: row['admin_allowlisted'] === true,
    launchHistory: parseJsonb<KioskSession['launchHistory']>(row['launch_history']) ?? [],
    allowedOrigins:
      Array.isArray(allowedOrigins) && allowedOrigins.length > 0 ? (allowedOrigins as string[]) : undefined,
  };
}

export class PostgresKioskService implements KioskService {
  constructor(private readonly pool: Pool) {}

  async createSession(ctx: RequestContext, input: CreateKioskInput): Promise<KioskSession> {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.durationSeconds * 1000);
    const launchHistory = [{ timestamp: now.toISOString(), action: 'started' as const }];
    const r = await this.pool.query(
      `INSERT INTO "governance"."kiosk_sessions"
         ("id","tenant_id","name","location","kiosk_user_id","permissions","state",
          "started_at","expires_at","last_activity_at","admin_allowlisted","launch_history",
          "allowed_origins","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,$10,$11,$12,$13)
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        input.name,
        input.location,
        input.kioskUserId,
        JSON.stringify(input.permissions),
        'active',
        now.toISOString(),
        expiresAt.toISOString(),
        true,
        JSON.stringify(launchHistory),
        input.allowedOrigins ?? [],
        ctx.actorId ?? 'system',
      ],
    );
    return mapSession(r.rows[0]!);
  }

  async getSession(ctx: RequestContext, sessionId: string): Promise<KioskSession | null> {
    const select = await this.pool.query(
      `SELECT * FROM "governance"."kiosk_sessions" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, sessionId],
    );
    if (!select.rows[0]) return null;
    const row = select.rows[0]!;
    const expiresAt = toIso(row['expires_at']);
    const expired = row['state'] === 'active' && expiresAt !== undefined && new Date(expiresAt) < new Date();
    if (expired) {
      const now = new Date().toISOString();
      const updatedHistory = [
        ...(parseJsonb<KioskSession['launchHistory']>(row['launch_history']) ?? []),
        { timestamp: now, action: 'expired' as const },
      ];
      const upd = await this.pool.query(
        `UPDATE "governance"."kiosk_sessions"
            SET "state"=$3, "last_activity_at"=$4, "launch_history"=$5
          WHERE "tenant_id"=$1 AND "id"=$2
          RETURNING *`,
        [ctx.tenantId, sessionId, 'expired', now, JSON.stringify(updatedHistory)],
      );
      return mapSession(upd.rows[0]!);
    }
    return mapSession(row);
  }

  async listSessions(ctx: RequestContext, state?: KioskSession['state']): Promise<KioskSession[]> {
    let sql = `SELECT * FROM "governance"."kiosk_sessions" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (state) {
      params.push(state);
      sql += ` AND "state"=$${params.length}`;
    }
    sql += ` ORDER BY "started_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapSession);
  }

  async revokeSession(ctx: RequestContext, sessionId: string): Promise<void> {
    const current = await this.getSession(ctx, sessionId);
    if (!current) return;
    const now = new Date().toISOString();
    const launchHistory = [...current.launchHistory, { timestamp: now, action: 'revoked' as const }];
    await this.pool.query(
      `UPDATE "governance"."kiosk_sessions"
          SET "state"=$3, "last_activity_at"=$4, "launch_history"=$5
        WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, sessionId, 'revoked', now, JSON.stringify(launchHistory)],
    );
  }

  async refreshSession(ctx: RequestContext, sessionId: string): Promise<KioskSession> {
    const current = await this.getSession(ctx, sessionId);
    if (!current) throw new Error(`Session not found: ${sessionId}`);
    if (current.state !== 'active') throw new Error(`Cannot refresh ${current.state} session`);
    const now = new Date();
    const nowIso = now.toISOString();
    const launchHistory = [...current.launchHistory, { timestamp: nowIso, action: 'refreshed' as const }];
    const r = await this.pool.query(
      `UPDATE "governance"."kiosk_sessions"
          SET "last_activity_at"=$3, "launch_history"=$4
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [ctx.tenantId, sessionId, nowIso, JSON.stringify(launchHistory)],
    );
    return mapSession(r.rows[0]!);
  }

  async canAccess(ctx: RequestContext, sessionId: string, objectType: string): Promise<boolean> {
    const session = await this.getSession(ctx, sessionId);
    if (!session || session.state !== 'active') return false;
    return session.permissions.objectTypes.includes(objectType);
  }

  async expireStale(ctx: RequestContext): Promise<number> {
    const now = new Date();
    const nowIso = now.toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."kiosk_sessions"
          SET "state"='expired',
              "last_activity_at"=$2,
              "launch_history"="launch_history" || $3::jsonb
        WHERE "tenant_id"=$1 AND "state"='active' AND "expires_at" < $2`,
      [ctx.tenantId, nowIso, JSON.stringify([{ timestamp: nowIso, action: 'expired' }])],
    );
    return r.rowCount ?? 0;
  }
}
