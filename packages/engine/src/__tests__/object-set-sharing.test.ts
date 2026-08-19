/**
 * Object-set sharing — per-user and per-group read grants.
 *
 * Before this, a saved set was either private to its creator or public to the
 * whole tenant. "Share this view with my team" had no expression other than
 * making it public, so the only way to collaborate was to publish to everyone.
 *
 * Sharing grants READ only. A shared set must not become editable or
 * deletable by the people it is shared with, or a shared view could be
 * silently redefined under its readers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryObjectSetStore } from '../object-sets/in-memory-object-set-store.js';
import type { RequestContext } from '@altius/spi';

const OWNER: RequestContext = { tenantId: 't1', actorId: 'owner', traceId: 'trace' };
const MATE: RequestContext = { tenantId: 't1', actorId: 'mate', traceId: 'trace' };
const TEAMMATE: RequestContext = { tenantId: 't1', actorId: 'teammate', actorGroups: ['cardiology'], traceId: 'trace' };
const STRANGER: RequestContext = { tenantId: 't1', actorId: 'stranger', actorGroups: ['oncology'], traceId: 'trace' };
const ANON: RequestContext = { tenantId: 't1', traceId: 'trace' };

function definition(overrides: Record<string, unknown> = {}) {
  return {
    name: 'my-set',
    objectType: 'Patient',
    isPublic: false,
    createdBy: 'owner',
    tenantId: 't1',
    ...overrides,
  } as never;
}

describe('object-set sharing', () => {
  let store: InMemoryObjectSetStore;

  beforeEach(() => {
    store = new InMemoryObjectSetStore();
  });

  it('keeps an unshared private set invisible to everyone but the creator', async () => {
    const created = await store.create(OWNER, definition());
    expect(await store.get(OWNER, created.id)).not.toBeNull();
    expect(await store.get(MATE, created.id)).toBeNull();
    expect(await store.list(MATE, undefined)).toEqual([]);
  });

  it('grants read to a named user', async () => {
    const created = await store.create(OWNER, definition({ sharedWithUsers: ['mate'] }));
    expect(await store.get(MATE, created.id)).not.toBeNull();
    expect((await store.list(MATE, undefined)).map(d => d.id)).toEqual([created.id]);
    // and to nobody else
    expect(await store.get(STRANGER, created.id)).toBeNull();
  });

  it('grants read to a group the caller belongs to', async () => {
    const created = await store.create(OWNER, definition({ sharedWithGroups: ['cardiology'] }));
    expect(await store.get(TEAMMATE, created.id)).not.toBeNull();
    expect(await store.get(STRANGER, created.id)).toBeNull();
  });

  it('grants nothing to an unauthenticated caller, even for a shared set', async () => {
    const created = await store.create(OWNER, definition({ sharedWithUsers: ['mate'], sharedWithGroups: ['cardiology'] }));
    expect(await store.get(ANON, created.id)).toBeNull();
  });

  it('resolves by name under the same visibility rule', async () => {
    await store.create(OWNER, definition({ name: 'shared-set', sharedWithUsers: ['mate'] }));
    expect(await store.getByName(MATE, 'shared-set')).not.toBeNull();
    expect(await store.getByName(STRANGER, 'shared-set')).toBeNull();
  });

  it('does not let a share recipient edit or delete the set', async () => {
    const created = await store.create(OWNER, definition({ sharedWithUsers: ['mate'] }));
    await expect(store.update(MATE, created.id, { name: 'hijacked' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.delete(MATE, created.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets the creator revoke a share', async () => {
    const created = await store.create(OWNER, definition({ sharedWithUsers: ['mate'] }));
    expect(await store.get(MATE, created.id)).not.toBeNull();
    await store.update(OWNER, created.id, { sharedWithUsers: [] });
    expect(await store.get(MATE, created.id)).toBeNull();
  });

  it('does not leak a share across tenants', async () => {
    const created = await store.create(OWNER, definition({ sharedWithUsers: ['mate'] }));
    const otherTenantMate: RequestContext = { tenantId: 't2', actorId: 'mate', traceId: 'trace' };
    expect(await store.get(otherTenantMate, created.id)).toBeNull();
  });
});
