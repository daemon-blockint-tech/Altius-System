/**
 * Tests for security governance: justification store and scoped sessions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryJustificationStore, InMemoryScopedSessionStore } from '../in-memory-security-governance.js';

describe('InMemoryJustificationStore', () => {
  let store: InMemoryJustificationStore;

  beforeEach(() => {
    store = new InMemoryJustificationStore();
  });

  it('creates and retrieves a justification', async () => {
    const record = await store.create('t1', 'u1', {
      actionName: 'freezeAccount',
      objectType: 'Account',
      objectId: 'a1',
      justification: 'Court order #12345',
      category: 'legal',
    });
    expect(record.id).toBeTruthy();
    expect(record.justification).toBe('Court order #12345');
    const fetched = await store.get('t1', record.id);
    expect(fetched?.category).toBe('legal');
  });

  it('lists justifications with filters', async () => {
    await store.create('t1', 'u1', { actionName: 'A', justification: 'j1', category: 'routine' });
    await store.create('t1', 'u2', { actionName: 'B', justification: 'j2', category: 'emergency' });
    await store.create('t1', 'u1', { actionName: 'A', justification: 'j3', category: 'break-glass' });

    const all = await store.list('t1');
    expect(all.totalCount).toBe(3);

    const u1 = await store.list('t1', { userId: 'u1' });
    expect(u1.totalCount).toBe(2);

    const actionA = await store.list('t1', { actionName: 'A' });
    expect(actionA.totalCount).toBe(2);
  });

  it('approves a justification', async () => {
    const record = await store.create('t1', 'u1', { actionName: 'A', justification: 'j1', category: 'routine' });
    await store.approve('t1', record.id, 'admin1');
    const fetched = await store.get('t1', record.id);
    expect(fetched?.approved).toBe(true);
    expect(fetched?.approvedBy).toBe('admin1');
  });

  it('isolates tenants', async () => {
    await store.create('t1', 'u1', { actionName: 'A', justification: 'j1', category: 'routine' });
    const t2 = await store.list('t2');
    expect(t2.totalCount).toBe(0);
  });
});

describe('InMemoryScopedSessionStore', () => {
  let store: InMemoryScopedSessionStore;

  beforeEach(() => {
    store = new InMemoryScopedSessionStore();
  });

  it('creates and retrieves a scoped session', async () => {
    const session = await store.create('t1', 'admin', {
      userId: 'u1',
      allowedMarkings: ['PII', 'FINANCIAL'],
      excludedMarkings: ['TOP_SECRET'],
      label: 'Audit session',
      durationSeconds: 3600,
    });
    expect(session.id).toBeTruthy();
    expect(session.allowedMarkings).toEqual(['PII', 'FINANCIAL']);
    expect(session.revoked).toBe(false);
    const fetched = await store.get('t1', session.id);
    expect(fetched?.label).toBe('Audit session');
  });

  it('gets active session for user', async () => {
    await store.create('t1', 'admin', {
      userId: 'u1',
      allowedMarkings: ['PII'],
      label: 'Session 1',
      durationSeconds: 3600,
    });
    const active = await store.getActiveForUser('t1', 'u1');
    expect(active).not.toBeNull();
    expect(active?.allowedMarkings).toEqual(['PII']);
  });

  it('returns null for expired session', async () => {
    await store.create('t1', 'admin', {
      userId: 'u1',
      allowedMarkings: ['PII'],
      label: 'Expired',
      durationSeconds: 0,
    });
    // Wait a tiny bit for expiry
    await new Promise(r => setTimeout(r, 10));
    const active = await store.getActiveForUser('t1', 'u1');
    expect(active).toBeNull();
  });

  it('revokes a session', async () => {
    const session = await store.create('t1', 'admin', {
      userId: 'u1',
      allowedMarkings: ['PII'],
      label: 'Test',
      durationSeconds: 3600,
    });
    await store.revoke('t1', session.id);
    const fetched = await store.get('t1', session.id);
    expect(fetched?.revoked).toBe(true);
    const active = await store.getActiveForUser('t1', 'u1');
    expect(active).toBeNull();
  });

  it('checks if marking is allowed', async () => {
    const session = await store.create('t1', 'admin', {
      userId: 'u1',
      allowedMarkings: ['PII', 'FINANCIAL'],
      excludedMarkings: ['TOP_SECRET'],
      label: 'Test',
      durationSeconds: 3600,
    });
    expect(await store.isMarkingAllowed('t1', session.id, 'PII')).toBe(true);
    expect(await store.isMarkingAllowed('t1', session.id, 'FINANCIAL')).toBe(true);
    expect(await store.isMarkingAllowed('t1', session.id, 'TOP_SECRET')).toBe(false);
    expect(await store.isMarkingAllowed('t1', session.id, 'UNKNOWN')).toBe(false);
  });

  it('lists sessions for a user', async () => {
    await store.create('t1', 'admin', { userId: 'u1', allowedMarkings: ['PII'], label: 'S1', durationSeconds: 3600 });
    await store.create('t1', 'admin', { userId: 'u2', allowedMarkings: ['PII'], label: 'S2', durationSeconds: 3600 });
    const u1Sessions = await store.list('t1', 'u1');
    expect(u1Sessions).toHaveLength(1);
    expect(u1Sessions[0]!.label).toBe('S1');
  });

  it('isolates tenants', async () => {
    await store.create('t1', 'admin', { userId: 'u1', allowedMarkings: ['PII'], label: 'S1', durationSeconds: 3600 });
    const t2Sessions = await store.list('t2');
    expect(t2Sessions).toHaveLength(0);
  });
});
