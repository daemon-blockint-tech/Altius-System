/**
 * An audit record must record which tenant produced it.
 *
 * AuditRecord (packages/spi/src/audit.ts) carries id, timestamp, traceId,
 * actor, operation and detail — and no tenant, at any layer: not in the SPI
 * type, not in AuditWriteInput, not as a column in ddl-audit.ts.
 *
 * That is fine while the records are write-only, which is what they are today.
 * It stops being fine the moment they are readable: the backlog item
 * "Action Log Timeline has no read API" cannot be built on a record that
 * cannot say whose it is, because serving it to one tenant would serve every
 * other tenant's operations too — the same cross-tenant class 379e5be just
 * closed for OpenFGA tuples. So the tenant lands before the read surface.
 */

import { describe, it, expect } from "vitest";
import { AuditWriter } from "./audit-writer.js";
import { MemoryAuditStore } from "./memory-audit-store.js";

function writerWithStore() {
  const store = new MemoryAuditStore();
  return { store, writer: new AuditWriter(store) };
}

const input = (tenantId: string, actorId: string) => ({
  tenantId,
  traceId: `trace-${actorId}`,
  actor: { type: "user" as const, id: actorId, roles: ["clinician"] },
  operation: { type: "read" as const, objectType: "Patient", objectId: "p-1" },
  detail: { result: "success" as const },
});

describe("audit records are tenant-scoped", () => {
  it("persists the tenant that produced the record", async () => {
    const { store, writer } = writerWithStore();

    await writer.write(input("tenant-a", "alice"));

    const [rec] = await store.query({});
    expect(rec!.tenantId).toBe("tenant-a");
  });

  it("does not return another tenant's records", async () => {
    const { store, writer } = writerWithStore();
    await writer.write(input("tenant-a", "alice"));
    await writer.write(input("tenant-b", "bob"));

    const forA = await store.query({ tenantId: "tenant-a" });

    expect(forA).toHaveLength(1);
    expect(forA[0]!.actor.id).toBe("alice");
  });

  it("scopes by tenant even when another filter also matches", async () => {
    const { store, writer } = writerWithStore();
    // Same object id in two tenants — the case that makes an unscoped read a
    // leak rather than a nuisance.
    await writer.write(input("tenant-a", "alice"));
    await writer.write(input("tenant-b", "bob"));

    const forB = await store.query({ tenantId: "tenant-b", objectId: "p-1" });

    expect(forB).toHaveLength(1);
    expect(forB[0]!.tenantId).toBe("tenant-b");
  });
});
