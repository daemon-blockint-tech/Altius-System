/**
 * Platform-wide notification service.
 *
 * Unifies notifications from multiple sources (comments, actions, alerts,
 * system events) into a single store with user preferences for delivery
 * channels (in-platform, email, push).
 */

/** Notification type — the source/event that created this notification. */
export type NotificationType =
  | 'mention'        // @-mention in a comment
  | 'reply'          // reply to a user's comment
  | 'action'         // action status change (approved, rejected, completed)
  | 'alert'          // threshold or rule alert
  | 'assignment'     // object or task assigned to user
  | 'system'         // platform-level system notification
  | 'branch'         // branch/proposal status change
  | 'sync';          // sync pipeline status

/** Delivery channel for notifications. */
export type NotificationChannel = 'platform' | 'email' | 'push';

/** A platform notification. */
export interface PlatformNotification {
  /** Notification ID (UUID). */
  id: string;
  /** Tenant ID. */
  tenantId: string;
  /** Target user ID. */
  userId: string;
  /** Notification type. */
  type: NotificationType;
  /** Human-readable title. */
  title: string;
  /** Human-readable body. */
  body: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** Whether the notification has been read. */
  read: boolean;
  /** Optional link to the source object. */
  sourceObjectType?: string;
  sourceObjectId?: string;
  /** Optional link to a URL for navigation. */
  linkUrl?: string;
  /** Severity level. */
  severity: 'info' | 'warning' | 'critical';
  /** Channels this notification was dispatched to. */
  channels: NotificationChannel[];
}

/** User notification preferences. */
export interface NotificationPreferences {
  tenantId: string;
  userId: string;
  /** Per-type channel preferences. Absent type = default channels. */
  perType: Partial<Record<NotificationType, NotificationChannel[]>>;
  /** Default channels for types not in perType. */
  defaultChannels: NotificationChannel[];
  /** Whether email delivery is enabled at all. */
  emailEnabled: boolean;
  /** Whether push delivery is enabled at all. */
  pushEnabled: boolean;
  /** Types the user has muted entirely. */
  mutedTypes: NotificationType[];
}

/** Query for listing notifications. */
export interface NotificationQuery {
  unreadOnly?: boolean;
  type?: NotificationType;
  limit?: number;
  offset?: number;
}

/**
 * Notification store — manages platform-wide notifications and user preferences.
 *
 * The store is the single source of truth for what a user sees in their
 * notification inbox. Delivery to email/push channels is handled by a
 * separate dispatcher that reads from this store.
 */
export interface NotificationStore {
  /** Create a notification. */
  create(notification: Omit<PlatformNotification, 'id' | 'createdAt' | 'read'> & { read?: boolean }): Promise<PlatformNotification>;

  /** Get a notification by ID. */
  get(tenantId: string, notificationId: string): Promise<PlatformNotification | null>;

  /** List notifications for a user. */
  list(tenantId: string, userId: string, query?: NotificationQuery): Promise<{ notifications: PlatformNotification[]; totalCount: number }>;

  /** Mark a notification as read. */
  markRead(tenantId: string, notificationId: string): Promise<void>;

  /** Mark all notifications as read for a user. */
  markAllRead(tenantId: string, userId: string): Promise<void>;

  /** Delete a notification. */
  delete(tenantId: string, notificationId: string): Promise<void>;

  /** Get user preferences. */
  getPreferences(tenantId: string, userId: string): Promise<NotificationPreferences>;

  /** Set user preferences. */
  setPreferences(prefs: NotificationPreferences): Promise<void>;

  /** Get the effective channels for a notification type, considering preferences. */
  getEffectiveChannels(tenantId: string, userId: string, type: NotificationType): Promise<NotificationChannel[]>;
}
