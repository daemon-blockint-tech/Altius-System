/**
 * In-memory user directory service — seeded with platform users.
 *
 * Tenant-scoped. In a real deployment this would be backed by Keycloak
 * or the OIDC provider's user management API.
 */

import type { RequestContext, DirectoryUser, UserDirectoryService, ListUsersOptions, ListUsersResult } from '@altius/spi';

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
