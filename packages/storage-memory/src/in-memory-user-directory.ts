/**
 * In-memory user directory service — seeded with platform users.
 *
 * Tenant-scoped. In a real deployment this would be backed by Keycloak
 * or the OIDC provider's user management API.
 */

import type { RequestContext, DirectoryUser, UserDirectoryService, ListUsersOptions, ListUsersResult } from '@altius/spi';

export interface CreateUserInput {
  id: string;
  name: string;
  email: string;
  roles?: string[];
  groups?: string[];
  attributes?: Record<string, unknown>;
  active?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  roles?: string[];
  groups?: string[];
  attributes?: Record<string, unknown>;
  active?: boolean;
}

export class InMemoryUserDirectoryService implements UserDirectoryService {
  private users = new Map<string, DirectoryUser>();

  /** Seed the directory with known users. */
  seed(users: DirectoryUser[]): void {
    for (const u of users) this.users.set(u.id, u);
  }

  /** Add or update a user (called on authentication to keep the directory fresh). */
  upsert(user: DirectoryUser): void {
    this.users.set(user.id, user);
  }

  async createUser(ctx: RequestContext, input: CreateUserInput): Promise<DirectoryUser> {
    const user: DirectoryUser = {
      id: input.id,
      tenantId: ctx.tenantId,
      name: input.name,
      email: input.email,
      roles: input.roles ?? [],
      groups: input.groups ?? [],
      active: input.active ?? true,
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(ctx: RequestContext, id: string, input: UpdateUserInput): Promise<DirectoryUser | null> {
    const existing = this.users.get(id);
    if (!existing || existing.tenantId !== ctx.tenantId) return null;
    const updated: DirectoryUser = {
      id: existing.id,
      tenantId: existing.tenantId,
      name: input.name ?? existing.name,
      email: input.email ?? existing.email,
      roles: input.roles ?? existing.roles,
      groups: input.groups ?? existing.groups,
      active: input.active ?? existing.active,
    };
    this.users.set(id, updated);
    return updated;
  }

  async deactivateUser(ctx: RequestContext, id: string): Promise<DirectoryUser | null> {
    const user = this.users.get(id);
    if (!user || user.tenantId !== ctx.tenantId) return null;
    const updated = { ...user, active: false };
    this.users.set(id, updated);
    return updated;
  }

  async reactivateUser(ctx: RequestContext, id: string): Promise<DirectoryUser | null> {
    const user = this.users.get(id);
    if (!user || user.tenantId !== ctx.tenantId) return null;
    const updated = { ...user, active: true };
    this.users.set(id, updated);
    return updated;
  }

  async addGroupMembership(ctx: RequestContext, id: string, group: string): Promise<DirectoryUser | null> {
    const user = this.users.get(id);
    if (!user || user.tenantId !== ctx.tenantId) return null;
    if (user.groups.includes(group)) return user;
    const updated = { ...user, groups: [...user.groups, group] };
    this.users.set(id, updated);
    return updated;
  }

  async removeGroupMembership(ctx: RequestContext, id: string, group: string): Promise<DirectoryUser | null> {
    const user = this.users.get(id);
    if (!user || user.tenantId !== ctx.tenantId) return null;
    const updated = { ...user, groups: user.groups.filter((g) => g !== group) };
    this.users.set(id, updated);
    return updated;
  }

  async list(ctx: RequestContext, options?: ListUsersOptions): Promise<ListUsersResult> {
    let users = Array.from(this.users.values()).filter((u) => u.tenantId === ctx.tenantId);
    if (!options?.includeInactive) users = users.filter((u) => u.active);
    if (options?.q) {
      const q = options.q.toLowerCase();
      users = users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    if (options?.role) users = users.filter((u) => u.roles.includes(options.role!));
    if (options?.group) users = users.filter((u) => u.groups.includes(options.group!));
    const totalCount = users.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    users = users.slice(offset, offset + limit);
    return { users, totalCount };
  }

  async get(ctx: RequestContext, id: string): Promise<DirectoryUser | null> {
    const user = this.users.get(id);
    if (!user || user.tenantId !== ctx.tenantId) return null;
    return user;
  }

  async getMany(ctx: RequestContext, ids: string[]): Promise<DirectoryUser[]> {
    const result: DirectoryUser[] = [];
    for (const id of ids) {
      const user = this.users.get(id);
      if (user && user.tenantId === ctx.tenantId) result.push(user);
    }
    return result;
  }
}
