/**
 * In-memory security governance implementations.
 */

import { randomUUID } from 'node:crypto';
import type {
  JustificationStore,
  JustificationRecord,
  CreateJustificationInput,
  JustificationQuery,
  ScopedSessionStore,
  ScopedSession,
  CreateScopedSessionInput,
} from '@altius/spi';

// ---------------------------------------------------------------------------
// Justification store
// ---------------------------------------------------------------------------

export class InMemoryJustificationStore implements JustificationStore {
  private readonly records = new Map<string, Map<string, JustificationRecord>>();

  async create(tenantId: string, userId: string, input: CreateJustificationInput): Promise<JustificationRecord> {
    const id = randomUUID();
    const record: JustificationRecord = {
      id,
      tenantId,
      userId,
      actionName: input.actionName,
      objectType: input.objectType,
      objectId: input.objectId,
      justification: input.justification,
      category: input.category,
      createdAt: new Date().toISOString(),
    };
    this.getOrCreateMap(tenantId).set(id, record);
    return record;
  }

  async get(tenantId: string, id: string): Promise<JustificationRecord | null> {
    return this.records.get(tenantId)?.get(id) ?? null;
  }

  async list(tenantId: string, query?: JustificationQuery): Promise<{ records: JustificationRecord[]; totalCount: number }> {
    const tenantRecords = this.records.get(tenantId);
    if (!tenantRecords) return { records: [], totalCount: 0 };
    let results = Array.from(tenantRecords.values());
    if (query?.userId) results = results.filter(r => r.userId === query.userId);
    if (query?.actionName) results = results.filter(r => r.actionName === query.actionName);
    if (query?.objectType) results = results.filter(r => r.objectType === query.objectType);
    if (query?.objectId) results = results.filter(r => r.objectId === query.objectId);
    if (query?.startTime) results = results.filter(r => r.createdAt >= query.startTime!);
    if (query?.endTime) results = results.filter(r => r.createdAt <= query.endTime!);

    const totalCount = results.length;
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (query?.offset) results = results.slice(query.offset);
    if (query?.limit) results = results.slice(0, query.limit);

    return { records: results, totalCount };
  }

  async approve(tenantId: string, id: string, approvedBy: string): Promise<void> {
    const tenantRecords = this.records.get(tenantId);
    if (!tenantRecords) return;
    const record = tenantRecords.get(id);
    if (record) {
      tenantRecords.set(id, { ...record, approved: true, approvedBy });
    }
  }

  private getOrCreateMap(tenantId: string): Map<string, JustificationRecord> {
    let m = this.records.get(tenantId);
    if (!m) {
      m = new Map();
      this.records.set(tenantId, m);
    }
    return m;
  }
}

// ---------------------------------------------------------------------------
// Scoped session store
// ---------------------------------------------------------------------------

export class InMemoryScopedSessionStore implements ScopedSessionStore {
  private readonly sessions = new Map<string, Map<string, ScopedSession>>();

  async create(tenantId: string, createdBy: string, input: CreateScopedSessionInput): Promise<ScopedSession> {
    const id = randomUUID();
    const now = new Date();
    const session: ScopedSession = {
      id,
      tenantId,
      userId: input.userId,
      allowedMarkings: input.allowedMarkings,
      excludedMarkings: input.excludedMarkings ?? [],
      label: input.label,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.durationSeconds * 1000).toISOString(),
      revoked: false,
      createdBy,
    };
    this.getOrCreateMap(tenantId).set(id, session);
    return session;
  }

  async get(tenantId: string, sessionId: string): Promise<ScopedSession | null> {
    return this.sessions.get(tenantId)?.get(sessionId) ?? null;
  }

  async getActiveForUser(tenantId: string, userId: string): Promise<ScopedSession | null> {
    const tenantSessions = this.sessions.get(tenantId);
    if (!tenantSessions) return null;
    const now = new Date().toISOString();
    for (const s of tenantSessions.values()) {
      if (s.userId === userId && !s.revoked && s.expiresAt > now) {
        return s;
      }
    }
    return null;
  }

  async list(tenantId: string, userId?: string): Promise<ScopedSession[]> {
    const tenantSessions = this.sessions.get(tenantId);
    if (!tenantSessions) return [];
    let results = Array.from(tenantSessions.values());
    if (userId) results = results.filter(s => s.userId === userId);
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return results;
  }

  async revoke(tenantId: string, sessionId: string): Promise<void> {
    const tenantSessions = this.sessions.get(tenantId);
    if (!tenantSessions) return;
    const session = tenantSessions.get(sessionId);
    if (session) {
      tenantSessions.set(sessionId, { ...session, revoked: true });
    }
  }

  async isMarkingAllowed(tenantId: string, sessionId: string, marking: string): Promise<boolean> {
    const session = await this.get(tenantId, sessionId);
    if (!session || session.revoked) return false;
    if (new Date(session.expiresAt).getTime() < Date.now()) return false;
    if (session.excludedMarkings.includes(marking)) return false;
    return session.allowedMarkings.includes(marking);
  }

  private getOrCreateMap(tenantId: string): Map<string, ScopedSession> {
    let m = this.sessions.get(tenantId);
    if (!m) {
      m = new Map();
      this.sessions.set(tenantId, m);
    }
    return m;
  }
}
