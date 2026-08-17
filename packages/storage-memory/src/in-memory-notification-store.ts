/**
 * In-memory notification store.
 */

import { randomUUID } from 'node:crypto';
import type {
  NotificationStore,
  PlatformNotification,
  NotificationPreferences,
  NotificationType,
  NotificationChannel,
  NotificationQuery,
} from '@altius/spi';

export class InMemoryNotificationStore implements NotificationStore {
  private readonly notifications = new Map<string, Map<string, PlatformNotification>>();
  private readonly prefs = new Map<string, Map<string, NotificationPreferences>>();

  async create(notification: Omit<PlatformNotification, 'id' | 'createdAt' | 'read'> & { read?: boolean }): Promise<PlatformNotification> {
    const id = randomUUID();
    const created: PlatformNotification = {
      ...notification,
      id,
      createdAt: new Date().toISOString(),
      read: notification.read ?? false,
    };
    const tenantNotifs = this.getOrCreate(this.notifications, notification.tenantId);
    tenantNotifs.set(id, created);
    return created;
  }

  async get(tenantId: string, notificationId: string): Promise<PlatformNotification | null> {
    return this.notifications.get(tenantId)?.get(notificationId) ?? null;
  }

  async list(tenantId: string, userId: string, query?: NotificationQuery): Promise<{ notifications: PlatformNotification[]; totalCount: number }> {
    const tenantNotifs = this.notifications.get(tenantId);
    if (!tenantNotifs) return { notifications: [], totalCount: 0 };

    let results = Array.from(tenantNotifs.values()).filter(n => n.userId === userId);

    if (query?.unreadOnly) {
      results = results.filter(n => !n.read);
    }
    if (query?.type) {
      results = results.filter(n => n.type === query.type);
    }

    const totalCount = results.length;
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (query?.offset) {
      results = results.slice(query.offset);
    }
    if (query?.limit) {
      results = results.slice(0, query.limit);
    }

    return { notifications: results, totalCount };
  }

  async markRead(tenantId: string, notificationId: string): Promise<void> {
    const tenantNotifs = this.notifications.get(tenantId);
    if (!tenantNotifs) return;
    const n = tenantNotifs.get(notificationId);
    if (n) tenantNotifs.set(notificationId, { ...n, read: true });
  }

  async markAllRead(tenantId: string, userId: string): Promise<void> {
    const tenantNotifs = this.notifications.get(tenantId);
    if (!tenantNotifs) return;
    for (const [id, n] of tenantNotifs) {
      if (n.userId === userId) {
        tenantNotifs.set(id, { ...n, read: true });
      }
    }
  }

  async delete(tenantId: string, notificationId: string): Promise<void> {
    this.notifications.get(tenantId)?.delete(notificationId);
  }

  async getPreferences(tenantId: string, userId: string): Promise<NotificationPreferences> {
    const tenantPrefs = this.prefs.get(tenantId);
    if (tenantPrefs) {
      const existing = tenantPrefs.get(userId);
      if (existing) return existing;
    }
    // Return defaults
    return {
      tenantId,
      userId,
      perType: {},
      defaultChannels: ['platform'],
      emailEnabled: false,
      pushEnabled: false,
      mutedTypes: [],
    };
  }

  async setPreferences(prefs: NotificationPreferences): Promise<void> {
    const tenantPrefs = this.getOrCreate(this.prefs, prefs.tenantId);
    tenantPrefs.set(prefs.userId, prefs);
  }

  async getEffectiveChannels(tenantId: string, userId: string, type: NotificationType): Promise<NotificationChannel[]> {
    const prefs = await this.getPreferences(tenantId, userId);
    if (prefs.mutedTypes.includes(type)) return [];
    const channels = prefs.perType[type] ?? prefs.defaultChannels;
    return channels.filter(ch => {
      if (ch === 'email' && !prefs.emailEnabled) return false;
      if (ch === 'push' && !prefs.pushEnabled) return false;
      return true;
    });
  }

  private getOrCreate<K, V>(map: Map<K, Map<string, V>>, key: K): Map<string, V> {
    let m = map.get(key);
    if (!m) {
      m = new Map();
      map.set(key, m);
    }
    return m;
  }
}
