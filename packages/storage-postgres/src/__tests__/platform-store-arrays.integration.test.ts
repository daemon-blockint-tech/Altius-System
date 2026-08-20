/**
 * Comment and notification stores against real Postgres.
 *
 * Both tables carry a `TEXT[]` column (`comments.mentions`, `notifications.channels`)
 * and both stores passed `JSON.stringify(...)` for it. Postgres parses an array
 * parameter with array_in, which rejects `["bob"]` as a malformed array literal —
 * so createComment and create failed for EVERY input, including the empty-array
 * and absent cases. Neither store had any Postgres coverage, so the whole
 * storage-postgres suite stayed green while both write paths were dead.
 *
 * These assert the round trip, not just the absence of a throw: an array that
 * serialises wrongly can still insert (as one text element) and only reveal
 * itself on read.
 *
 * Requires PostgreSQL. Set PG_TEST_URL or these are skipped — which is exactly
 * how the defect survived, so treat a skip as "unverified", not "passing".
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RequestContext, OntologySchema } from '@altius/spi';
import { PostgresStorageProvider } from '../postgres-storage-provider.js';
import { PostgresCommentStore } from '../comment/postgres-comment-store.js';
import { PostgresNotificationStore } from '../notification/postgres-notification-store.js';

const PG_TEST_URL = process.env['PG_TEST_URL'];

function parseUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: u.username,
    password: u.password,
  };
}

const describeWithPg = PG_TEST_URL ? describe : describe.skip;

describeWithPg('platform stores with TEXT[] columns (integration)', () => {
  let provider: PostgresStorageProvider;
  let comments: PostgresCommentStore;
  let notifications: PostgresNotificationStore;

  const TENANT = 'tenant-arraycols-001';
  const ctx: RequestContext = { tenantId: TENANT, actorId: 'test-actor' };
  const SCHEMA_VERSION = 515151;

  const schema: OntologySchema = {
    version: SCHEMA_VERSION,
    objectTypes: [
      { name: 'ArrayDoc', properties: [{ name: 'title', type: 'String', required: true }] },
    ],
    linkTypes: [],
  };

  beforeAll(async () => {
    provider = new PostgresStorageProvider(parseUrl(PG_TEST_URL!));
    await provider.pool
      .query('DELETE FROM _schema_migrations WHERE version = $1', [SCHEMA_VERSION])
      .catch(() => {
        /* table may not exist yet on a fresh database */
      });
    await provider.applySchema(ctx, schema);
    comments = new PostgresCommentStore(provider.pool);
    notifications = new PostgresNotificationStore(provider.pool);
  });

  afterAll(async () => {
    if (provider) {
      await provider.pool.query('DELETE FROM "comment"."comments" WHERE "tenant_id" = $1', [TENANT]).catch(() => {});
      await provider.pool
        .query('DELETE FROM "notification"."notifications" WHERE "tenant_id" = $1', [TENANT])
        .catch(() => {});
      await provider.close();
    }
  });

  it('stores a comment whose body mentions nobody (empty TEXT[])', async () => {
    const created = await comments.createComment({
      tenantId: TENANT,
      objectType: 'ArrayDoc',
      objectId: 'doc-empty',
      body: 'no mentions here',
      authorId: 'u1',
      authorName: 'U One',
      parentCommentId: null,
    });
    const read = await comments.getComment(TENANT, created.id);
    expect(read).not.toBeNull();
    expect(read!.mentions).toEqual([]);
  });

  it('round-trips parsed @mentions as array elements, not one JSON string', async () => {
    const created = await comments.createComment({
      tenantId: TENANT,
      objectType: 'ArrayDoc',
      objectId: 'doc-mentions',
      body: 'ping @bob and @carol',
      authorId: 'u1',
      authorName: 'U One',
      parentCommentId: null,
    });
    const read = await comments.getComment(TENANT, created.id);
    // The bug inserted a single element `["bob","carol"]` when it inserted at
    // all, so assert the shape rather than merely that a value came back.
    expect(read!.mentions).toEqual(['bob', 'carol']);
  });

  it('re-parses mentions on update', async () => {
    const created = await comments.createComment({
      tenantId: TENANT,
      objectType: 'ArrayDoc',
      objectId: 'doc-update',
      body: 'first @bob',
      authorId: 'u1',
      authorName: 'U One',
      parentCommentId: null,
    });
    await comments.updateComment(TENANT, created.id, 'now @dave instead');
    const read = await comments.getComment(TENANT, created.id);
    expect(read!.mentions).toEqual(['dave']);
    expect(read!.edited).toBe(true);
  });

  it('stores a notification with an explicit channel list', async () => {
    const created = await notifications.create({
      tenantId: TENANT,
      userId: 'u1',
      type: 'mention',
      title: 'You were mentioned',
      body: 'in a comment',
      severity: 'info',
      channels: ['email', 'platform'],
    });
    const read = await notifications.get(TENANT, created.id);
    expect(read).not.toBeNull();
    expect(read!.channels).toEqual(['email', 'platform']);
  });

  it('defaults an absent channel list to the empty array rather than violating NOT NULL', async () => {
    const created = await notifications.create({
      tenantId: TENANT,
      userId: 'u2',
      type: 'system',
      title: 'No channels given',
      body: 'body',
      severity: 'info',
    } as Parameters<PostgresNotificationStore['create']>[0]);
    const read = await notifications.get(TENANT, created.id);
    expect(read!.channels).toEqual([]);
  });
});
