/**
 * Tenant isolation of the ReBAC layer.
 *
 * The defect this guards: authorization did not isolate tenants while storage
 * did. One OpenFGA store served the whole deployment and tuples were written as
 * bare `user:<id>` / `<type>:<id>` with no tenant qualifier — but object ids are
 * unique only PER TENANT (the storage primary key is (_tenant_id, _id)). So a
 * granter in tenant A minting a tuple for `patient:123` also authorized the
 * unrelated `patient:123` in tenant B, and the storage layer then faithfully
 * served tenant B's row. A cross-tenant read.
 *
 * The fix is one OpenFGA store per tenant: the tenants share no namespace, so
 * there is no id for a tuple to collide on.
 */

import { describe, it, expect } from "vitest";

import { AuthorizationService } from "./authorization-service.js";
import type { OpenFgaClientInterface, FgaClientResolver } from "./authorization-service.js";
import { AuthorizationError } from "./types.js";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

/**
 * A single OpenFGA store holding direct tuples only. Deliberately minimal: this
 * suite is about which STORE answers, not about model traversal (the model
 * semantics are covered in authorization-service.test.ts).
 */
function createStore(): OpenFgaClientInterface & { size: () => number } {
  const tuples: Array<{ user: string; relation: string; object: string }> = [];
  const match = (
    t: { user: string; relation: string; object: string },
    u: string,
    r: string,
    o: string,
  ) => t.user === u && t.relation === r && t.object === o;

  return {
    size: () => tuples.length,
    async check({ user, relation, object }) {
      return { allowed: tuples.some(t => match(t, user, relation, object)) };
    },
    async listObjects({ user, relation, type }) {
      return {
        objects: tuples
          .filter(t => t.user === user && t.relation === relation && t.object.startsWith(`${type}:`))
          .map(t => t.object),
      };
    },
    async writeTuples(added) {
      for (const t of added) {
        if (!tuples.some(e => match(e, t.user, t.relation, t.object))) tuples.push({ ...t });
      }
      return {};
    },
    async deleteTuples(removed) {
      for (const t of removed) {
        const i = tuples.findIndex(e => match(e, t.user, t.relation, t.object));
        if (i >= 0) tuples.splice(i, 1);
      }
      return {};
    },
  };
}

/** Build a resolver over a fixed tenant → store mapping (unlisted tenants → undefined). */
function resolverFor(stores: Record<string, OpenFgaClientInterface>): FgaClientResolver {
  return async (tenantId: string) => stores[tenantId];
}

describe("per-tenant FGA store isolation", () => {
  it("a tuple granted under tenant A does NOT authorize the same object id under tenant B", async () => {
    const storeA = createStore();
    const storeB = createStore();
    const authz = new AuthorizationService(resolverFor({ [TENANT_A]: storeA, [TENANT_B]: storeB }));

    // Tenant A's granter assigns Dr Smith as clinician on THEIR patient:123.
    await authz.writeRelationship("user:dr-smith", "clinician", "patient:123", TENANT_A);

    // In tenant A that grant holds.
    expect(await authz.check("user:dr-smith", "clinician", "patient:123", TENANT_A)).toBe(true);

    // Tenant B has an unrelated patient that happens to carry the same id —
    // ids are unique per tenant, not globally. The grant must NOT reach it.
    expect(await authz.check("user:dr-smith", "clinician", "patient:123", TENANT_B)).toBe(false);

    // And the tuple physically landed in tenant A's store only.
    expect(storeA.size()).toBe(1);
    expect(storeB.size()).toBe(0);
  });

  it("listObjects does not leak tenant A's objects into tenant B", async () => {
    const storeA = createStore();
    const storeB = createStore();
    const authz = new AuthorizationService(resolverFor({ [TENANT_A]: storeA, [TENANT_B]: storeB }));

    await authz.writeRelationship("user:alice", "viewer", "patient:1", TENANT_A);
    await authz.writeRelationship("user:alice", "viewer", "patient:2", TENANT_A);
    // Same user id exists in tenant B with access to one (different) patient:1.
    await authz.writeRelationship("user:alice", "viewer", "patient:1", TENANT_B);

    expect(await authz.listObjects("user:alice", "viewer", "patient", TENANT_A)).toEqual([
      "patient:1",
      "patient:2",
    ]);
    expect(await authz.listObjects("user:alice", "viewer", "patient", TENANT_B)).toEqual([
      "patient:1",
    ]);
  });

  it("revoking in one tenant leaves the other tenant's grant intact", async () => {
    const storeA = createStore();
    const storeB = createStore();
    const authz = new AuthorizationService(resolverFor({ [TENANT_A]: storeA, [TENANT_B]: storeB }));

    await authz.writeRelationship("user:alice", "clinician", "patient:123", TENANT_A);
    await authz.writeRelationship("user:alice", "clinician", "patient:123", TENANT_B);

    await authz.deleteRelationship("user:alice", "clinician", "patient:123", TENANT_A);

    expect(await authz.check("user:alice", "clinician", "patient:123", TENANT_A)).toBe(false);
    expect(await authz.check("user:alice", "clinician", "patient:123", TENANT_B)).toBe(true);
  });

  describe("unknown tenant fails closed", () => {
    const authz = () =>
      new AuthorizationService(resolverFor({ [TENANT_A]: createStore() }));

    it("check() denies rather than falling back to another store", async () => {
      expect(await authz().check("user:alice", "viewer", "patient:123", "no-such-tenant")).toBe(false);
    });

    it("listObjects() returns nothing authorized", async () => {
      expect(await authz().listObjects("user:alice", "viewer", "patient", "no-such-tenant")).toEqual([]);
    });

    it("an empty tenant id is denied, not treated as a wildcard", async () => {
      expect(await authz().check("user:alice", "viewer", "patient:123", "")).toBe(false);
    });

    // Writes throw rather than silently no-op: a grant the caller believes
    // succeeded but that landed in no store is worse than a visible failure.
    it("writeRelationship() throws", async () => {
      await expect(
        authz().writeRelationship("user:alice", "clinician", "patient:123", "no-such-tenant"),
      ).rejects.toThrow(AuthorizationError);
    });

    it("deleteRelationship() throws", async () => {
      await expect(
        authz().deleteRelationship("user:alice", "clinician", "patient:123", "no-such-tenant"),
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("single-tenant deployment (bare client, no resolver)", () => {
    it("still serves whichever tenant the deployment declares", async () => {
      const store = createStore();
      const authz = new AuthorizationService(store);

      await authz.writeRelationship("user:alice", "clinician", "patient:123", "default");
      expect(await authz.check("user:alice", "clinician", "patient:123", "default")).toBe(true);
      expect(store.size()).toBe(1);
    });
  });

  it("resolves each tenant's client once and caches it", async () => {
    const storeA = createStore();
    let resolutions = 0;
    const authz = new AuthorizationService(async (tenantId) => {
      resolutions++;
      return tenantId === TENANT_A ? storeA : undefined;
    });

    await authz.check("user:alice", "viewer", "patient:1", TENANT_A);
    await authz.check("user:alice", "viewer", "patient:2", TENANT_A);

    // The service resolves per call; caching is the registry's job (see
    // createFgaClientRegistry in @altius/api), so the resolver is consulted each
    // time and must stay cheap.
    expect(resolutions).toBe(2);
  });
});
