/**
 * PostgreSQL NotificationStore — platform-wide notifications and user preferences.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  NotificationStore,
  PlatformNotification,
  NotificationPreferences,
  NotificationQuery,
  NotificationType,
  NotificationChannel,
} from '@altius/spi';

const DEFAULT_PREFS: NotificationPreferences = {
  tenantId: '',
  userId: '',
  perType: {},
  defaultChannels: ['platform'],
  emailEnabled: false,
  pushEnabled: false,
  mutedTypes: [],
};

export class PostgresNotificationStore implements NotificationStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(
    notification: Omit<PlatformNotification, 'id' | 'createdAt' | 'read'> & { read?: boolean },
  ): Promise<PlatformNotification> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "notification"."notifications"
        ("id", "tenant_id", "user_id", "type", "title", "body", "read", "created_at",
         "source_object_type", "source_object_id", "link_url", "severity", "channels")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id, notification.tenantId, notification.userId, notification.type,
        notification.title, notification.body, notification.read ?? false, now,
        notification.sourceObjectType ?? null, notification.sourceObjectId ?? null,
        notification.linkUrl ?? null, notification.severity,
        JSON.stringify(notification.channels),
      ],
    );
    return {
      id,
      tenantId: notification.tenantId,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      createdAt: now,
      read: notification.read ?? false,
      sourceObjectType: notification.sourceObjectType,
      sourceObjectId: notification.sourceObjectId,
      linkUrl: notification.linkUrl,
      severity: notification.severity,
      channels: notification.channels,
    };
  }

  async get(tenantId: string, notificationId: string): Promise<PlatformNotification | null> {
    const result = await this.pool.query(
      `SELECT * FROM "notification"."notifications" WHERE "id" = $1 AND "tenant_id" = $2`,
      [notificationId, tenantId],
    );
    if (result.rows.length === 0) return null;
    return mapNotification(result.rows[0]!);
  }

  async list(
    tenantId: string,
    userId: string,
    query?: NotificationQuery,
  ): Promise<{ notifications: PlatformNotification[]; totalCount: number }> {
    const conditions = [`"tenant_id" = $1`, `"user_id" = $2`];
    const params: unknown[] = [tenantId, userId];
    let idx = 3;

    if (query?.unreadOnly) {
      conditions.push(`"read" = FALSE`);
    }
    if (query?.type) {
      conditions.push(`"type" = $${idx++}`);
      params.push(query.type);
    }

    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;

    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM "notification"."notifications" WHERE ${conditions.join(' AND ')}`,
      params,
    );
    const totalCount = countResult.rows[0]!.count;

    const result = await this.pool.query(
      `SELECT * FROM "notification"."notifications" WHERE ${conditions.join(' AND ')}
       ORDER BY "created_at" DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return { notifications: result.rows.map(r => mapNotification(r)), totalCount };
  }

  async markRead(tenantId: string, notificationId: string): Promise<void> {
    await this.pool.query(
      `UPDATE "notification"."notifications" SET "read" = TRUE
       WHERE "id" = $1 AND "tenant_id" = $2`,
      [notificationId, tenantId],
    );
  }

  async markAllRead(tenantId: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE "notification"."notifications" SET "read" = TRUE
       WHERE "tenant_id" = $1 AND "user_id" = $2`,
      [tenantId, userId],
    );
  }

  async delete(tenantId: string, notificationId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "notification"."notifications" WHERE "id" = $1 AND "tenant_id" = $2`,
      [notificationId, tenantId],
    );
  }

  async getPreferences(tenantId: string, userId: string): Promise<NotificationPreferences> {
    const result = await this.pool.query(
      `SELECT "preferences" FROM "notification"."preferences"
       WHERE "tenant_id" = $1 AND "user_id" = $2`,
      [tenantId, userId],
    );
    if (result.rows.length === 0) {
      return { ...DEFAULT_PREFS, tenantId, userId };
    }
    const prefs = result.rows[0]!['preferences'] as NotificationPreferences;
    return { ...prefs, tenantId, userId };
  }

  async setPreferences(prefs: NotificationPreferences): Promise<void> {
    await this.pool.query(
      `INSERT INTO "notification"."preferences" ("tenant_id", "user_id", "preferences")
       VALUES ($1, $2, $3)
       ON CONFLICT ("tenant_id", "user_id") DO UPDATE SET "preferences" = EXCLUDED."preferences"`,
      [prefs.tenantId, prefs.userId, JSON.stringify(prefs)],
    );
  }

  async getEffectiveChannels(
    tenantId: string,
    userId: string,
    type: NotificationType,
  ): Promise<NotificationChannel[]> {
    const prefs = await this.getPreferences(tenantId, userId);
    if (prefs.mutedTypes.includes(type)) return [];
    if (prefs.perType[type]) return prefs.perType[type]!;
    return prefs.defaultChannels;
  }
}

function mapNotification(r: Record<string, unknown>): PlatformNotification {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    userId: r['user_id'] as string,
    type: r['type'] as NotificationType,
    title: r['title'] as string,
    body: r['body'] as string,
    createdAt: r['created_at'] as string,
    read: r['read'] as boolean,
    sourceObjectType: r['source_object_type'] as string | undefined,
    sourceObjectId: r['source_object_id'] as string | undefined,
    linkUrl: r['link_url'] as string | undefined,
    severity: r['severity'] as 'info' | 'warning' | 'critical',
    channels: r['channels'] as NotificationChannel[],
  };
}
