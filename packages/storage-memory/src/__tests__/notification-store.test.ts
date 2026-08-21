/**
 * Tests for the in-memory notification store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryNotificationStore } from '../in-memory-notification-store.js';

describe('InMemoryNotificationStore', () => {
  let store: InMemoryNotificationStore;

  beforeEach(() => {
    store = new InMemoryNotificationStore();
  });

  it('creates and retrieves a notification', async () => {
    const n = await store.create({
      tenantId: 't1',
      userId: 'u1',
      type: 'mention',
      title: 'You were mentioned',
      body: 'Alice mentioned you in a comment',
      severity: 'info',
      channels: ['platform'],
    });
    expect(n.id).toBeTruthy();
    expect(n.read).toBe(false);
    const fetched = await store.get('t1', n.id);
    expect(fetched?.id).toBe(n.id);
  });

  it('lists notifications for a user', async () => {
    await store.create({ tenantId: 't1', userId: 'u1', type: 'mention', title: 'A', body: 'a', severity: 'info', channels: ['platform'] });
    await store.create({ tenantId: 't1', userId: 'u1', type: 'alert', title: 'B', body: 'b', severity: 'warning', channels: ['platform'] });
    await store.create({ tenantId: 't1', userId: 'u2', type: 'mention', title: 'C', body: 'c', severity: 'info', channels: ['platform'] });

    const result = await store.list('t1', 'u1');
    expect(result.notifications).toHaveLength(2);
    expect(result.totalCount).toBe(2);
  });

  it('filters by unreadOnly', async () => {
    const n1 = await store.create({ tenantId: 't1', userId: 'u1', type: 'mention', title: 'A', body: 'a', severity: 'info', channels: ['platform'] });
    await store.create({ tenantId: 't1', userId: 'u1', type: 'alert', title: 'B', body: 'b', severity: 'warning', channels: ['platform'] });
    // Another user cannot mark u1's notification read.
    await store.markRead('t1', 'u2', n1.id);
    expect((await store.list('t1', 'u1', { unreadOnly: true })).notifications).toHaveLength(2);
    // The recipient can.
    await store.markRead('t1', 'u1', n1.id);

    const result = await store.list('t1', 'u1', { unreadOnly: true });
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]!.title).toBe('B');
  });

  it('filters by type', async () => {
    await store.create({ tenantId: 't1', userId: 'u1', type: 'mention', title: 'A', body: 'a', severity: 'info', channels: ['platform'] });
    await store.create({ tenantId: 't1', userId: 'u1', type: 'alert', title: 'B', body: 'b', severity: 'warning', channels: ['platform'] });

    const result = await store.list('t1', 'u1', { type: 'alert' });
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]!.type).toBe('alert');
  });

  it('marks all read for a user', async () => {
    await store.create({ tenantId: 't1', userId: 'u1', type: 'mention', title: 'A', body: 'a', severity: 'info', channels: ['platform'] });
    await store.create({ tenantId: 't1', userId: 'u1', type: 'alert', title: 'B', body: 'b', severity: 'warning', channels: ['platform'] });

    await store.markAllRead('t1', 'u1');
    const result = await store.list('t1', 'u1', { unreadOnly: true });
    expect(result.notifications).toHaveLength(0);
  });

  it('deletes a notification', async () => {
    const n = await store.create({ tenantId: 't1', userId: 'u1', type: 'mention', title: 'A', body: 'a', severity: 'info', channels: ['platform'] });
    // Another user cannot delete u1's notification.
    await store.delete('t1', 'u2', n.id);
    expect(await store.get('t1', n.id)).not.toBeNull();
    // The recipient can.
    await store.delete('t1', 'u1', n.id);
    const fetched = await store.get('t1', n.id);
    expect(fetched).toBeNull();
  });

  it('returns default preferences when none set', async () => {
    const prefs = await store.getPreferences('t1', 'u1');
    expect(prefs.defaultChannels).toEqual(['platform']);
    expect(prefs.emailEnabled).toBe(false);
    expect(prefs.mutedTypes).toEqual([]);
  });

  it('sets and retrieves preferences', async () => {
    await store.setPreferences({
      tenantId: 't1',
      userId: 'u1',
      perType: { alert: ['platform', 'email'] },
      defaultChannels: ['platform'],
      emailEnabled: true,
      pushEnabled: false,
      mutedTypes: ['system'],
    });
    const prefs = await store.getPreferences('t1', 'u1');
    expect(prefs.emailEnabled).toBe(true);
    expect(prefs.mutedTypes).toEqual(['system']);
  });

  it('getEffectiveChannels respects perType overrides', async () => {
    await store.setPreferences({
      tenantId: 't1',
      userId: 'u1',
      perType: { alert: ['platform', 'email'] },
      defaultChannels: ['platform'],
      emailEnabled: true,
      pushEnabled: false,
      mutedTypes: [],
    });
    const alertChannels = await store.getEffectiveChannels('t1', 'u1', 'alert');
    expect(alertChannels).toEqual(['platform', 'email']);
    const mentionChannels = await store.getEffectiveChannels('t1', 'u1', 'mention');
    expect(mentionChannels).toEqual(['platform']); // falls back to default
  });

  it('getEffectiveChannels respects mutedTypes', async () => {
    await store.setPreferences({
      tenantId: 't1',
      userId: 'u1',
      perType: {},
      defaultChannels: ['platform'],
      emailEnabled: true,
      pushEnabled: true,
      mutedTypes: ['alert'],
    });
    const channels = await store.getEffectiveChannels('t1', 'u1', 'alert');
    expect(channels).toEqual([]);
  });

  it('getEffectiveChannels filters out disabled channels', async () => {
    await store.setPreferences({
      tenantId: 't1',
      userId: 'u1',
      perType: { alert: ['platform', 'email', 'push'] },
      defaultChannels: ['platform'],
      emailEnabled: false,
      pushEnabled: false,
      mutedTypes: [],
    });
    const channels = await store.getEffectiveChannels('t1', 'u1', 'alert');
    expect(channels).toEqual(['platform']); // email/push filtered out
  });

  it('isolates tenants', async () => {
    await store.create({ tenantId: 't1', userId: 'u1', type: 'mention', title: 'A', body: 'a', severity: 'info', channels: ['platform'] });
    await store.create({ tenantId: 't2', userId: 'u1', type: 'mention', title: 'B', body: 'b', severity: 'info', channels: ['platform'] });

    const t1 = await store.list('t1', 'u1');
    const t2 = await store.list('t2', 'u1');
    expect(t1.notifications).toHaveLength(1);
    expect(t2.notifications).toHaveLength(1);
    expect(t1.notifications[0]!.title).toBe('A');
    expect(t2.notifications[0]!.title).toBe('B');
  });
});
