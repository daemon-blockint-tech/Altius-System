/**
 * PostgreSQL-backed user directory service.
 *
 * Persists tenant-scoped users with the same read visibility and
 * administrative group-membership semantics as the in-memory provider.
 */

import type { Pool } from 'pg';
import type { DirectoryUser, ListUsersOptions, ListUsersResult, RequestContext, UserDirectoryService } from '@altius/spi';

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

function parseJsonb<T>(v: unknown): T | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    return JSON.parse(v) as T;
  }
  return v as T;
}

function mapUser(row: Record<string, unknown>): DirectoryUser {
  return {
    id: String(row['user_id'] ?? row['id']),
    tenantId: String(row['tenant_id']),
    name: String(row['display_name'] ?? ''),
    email: String(row['email'] ?? ''),
    roles: parseJsonb<string[]>(row['roles']) ?? [],
    groups: parseJsonb<string[]>(row['groups']) ?? [],
    active: row['is_active'] === true,
  };
}

export class PostgresUserDirectoryService implements UserDirectoryService {
  constructor(private readonly pool: Pool) {}

  async createUser(ctx: RequestContext, input: CreateUserInput): Promise<DirectoryUser> {
    const now = new Date().toISOString();
    const roles = input.roles ?? [];
    const groups = input.groups ?? [];
    const attributes = input.attributes ?? {};
    const active = input.active ?? true;
    const createdBy = ctx.actorId ?? 'system';
    const userId = input.id;
    const r = await this.pool.query(
      `INSERT INTO "governance"."user_directory"
         ("id","tenant_id","user_id","email","display_name","roles","groups","attributes","is_active","created_at","updated_at","created_by")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)
       RETURNING *`,
      [userId, ctx.tenantId, userId, input.email, input.name, JSON.stringify(roles), JSON.stringify(groups), JSON.stringify(attributes), active, now, createdBy],
    );
    return mapUser(r.rows[0]!);
  }

  async updateUser(ctx: RequestContext, id: string, input: UpdateUserInput): Promise<DirectoryUser | null> {
    const select = await this.pool.query(
      `SELECT * FROM "governance"."user_directory" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
    if (!select.rows[0]) return null;
    const row = select.rows[0]!;
    const now = new Date().toISOString();
    const displayName = input.name ?? row['display_name'];
    const email = input.email ?? row['email'];
    const roles = input.roles ?? parseJsonb<string[]>(row['roles']) ?? [];
    const groups = input.groups ?? parseJsonb<string[]>(row['groups']) ?? [];
    const attributes = input.attributes ?? parseJsonb<Record<string, unknown>>(row['attributes']) ?? {};
    const active = input.active ?? row['is_active'];
    const r = await this.pool.query(
      `UPDATE "governance"."user_directory"
          SET "display_name"=$3,"email"=$4,"roles"=$5,"groups"=$6,"attributes"=$7,"is_active"=$8,"updated_at"=$9
        WHERE "tenant_id"=$1 AND "id"=$2
       RETURNING *`,
      [ctx.tenantId, id, displayName, email, JSON.stringify(roles), JSON.stringify(groups), JSON.stringify(attributes), active, now],
    );
    return mapUser(r.rows[0]!);
  }

  async deactivateUser(ctx: RequestContext, id: string): Promise<DirectoryUser | null> {
    return this.setActive(ctx, id, false);
  }

  async reactivateUser(ctx: RequestContext, id: string): Promise<DirectoryUser | null> {
    return this.setActive(ctx, id, true);
  }

  private async setActive(ctx: RequestContext, id: string, active: boolean): Promise<DirectoryUser | null> {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."user_directory"
          SET "is_active"=$3,"updated_at"=$4
        WHERE "tenant_id"=$1 AND "id"=$2
       RETURNING *`,
      [ctx.tenantId, id, active, now],
    );
    if (!r.rows[0]) return null;
    return mapUser(r.rows[0]!);
  }

  async addGroupMembership(ctx: RequestContext, id: string, group: string): Promise<DirectoryUser | null> {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."user_directory"
          SET "groups"="groups" || $3::jsonb,"updated_at"=$4
        WHERE "tenant_id"=$1 AND "id"=$2 AND NOT "groups" @> $3::jsonb
       RETURNING *`,
      [ctx.tenantId, id, JSON.stringify([group]), now],
    );
    if (!r.rows[0]) {
      const existing = await this.get(ctx, id);
      return existing;
    }
    return mapUser(r.rows[0]!);
  }

  async removeGroupMembership(ctx: RequestContext, id: string, group: string): Promise<DirectoryUser | null> {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE "governance"."user_directory"
          SET "groups"="groups" - $3,"updated_at"=$4
        WHERE "tenant_id"=$1 AND "id"=$2
       RETURNING *`,
      [ctx.tenantId, id, group, now],
    );
    if (!r.rows[0]) return null;
    return mapUser(r.rows[0]!);
  }

  async list(ctx: RequestContext, options?: ListUsersOptions): Promise<ListUsersResult> {
    const where: string[] = ['"tenant_id"=$1'];
    const params: unknown[] = [ctx.tenantId];

    if (!options?.includeInactive) {
      params.push(true);
      where.push(`"is_active"=$${params.length}`);
    }
    if (options?.q) {
      params.push(`%${options.q}%`);
      where.push(`(LOWER("display_name") LIKE $${params.length} OR LOWER("email") LIKE $${params.length})`);
    }
    if (options?.role) {
      params.push(JSON.stringify([options.role]));
      where.push(`"roles" @> $${params.length}::jsonb`);
    }
    if (options?.group) {
      params.push(JSON.stringify([options.group]));
      where.push(`"groups" @> $${params.length}::jsonb`);
    }

    const whereSql = where.join(' AND ');
    const countR = await this.pool.query(`SELECT COUNT(*)::int AS total FROM "governance"."user_directory" WHERE ${whereSql}`, params);
    const totalCount = Number(countR.rows[0]!['total']);

    let sql = `SELECT * FROM "governance"."user_directory" WHERE ${whereSql} ORDER BY "display_name" ASC, "id" ASC`;
    if (options?.limit !== undefined) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (options?.offset !== undefined) {
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }
    const r = await this.pool.query(sql, params);
    return { users: r.rows.map(mapUser), totalCount };
  }

  async get(ctx: RequestContext, id: string): Promise<DirectoryUser | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."user_directory" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, id],
    );
    if (!r.rows[0]) return null;
    return mapUser(r.rows[0]!);
  }

  async getMany(ctx: RequestContext, ids: string[]): Promise<DirectoryUser[]> {
    if (ids.length === 0) return [];
    const r = await this.pool.query(
      `SELECT * FROM "governance"."user_directory" WHERE "tenant_id"=$1 AND "id"=ANY($2::text[])`,
      [ctx.tenantId, ids],
    );
    const byId = new Map(r.rows.map((row) => [String(row['id']), mapUser(row)]));
    const result: DirectoryUser[] = [];
    for (const id of ids) {
      const user = byId.get(id);
      if (user) result.push(user);
    }
    return result;
  }
}
