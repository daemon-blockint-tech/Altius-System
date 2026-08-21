import { describe, it, expect, beforeEach } from "vitest";
import { AgentGateway } from "./agent-gateway.js";
import type { DatasourceMappingConfig } from "../mapping/mapping-parser.js";
import type { MappedObject } from "../mapping/record-mapper.js";
import type { AgentEnrollResponse, AgentHeartbeatResponse, AgentUploadResponse, WireSourceRecord } from "./protocol.js";

// ── Fixtures ─────────────────────────────────────────────────────────

const SECRET = "test-enrollment-secret";

function makeConfig(overrides: Partial<DatasourceMappingConfig> = {}): DatasourceMappingConfig {
  return {
    datasource: "PasAgentSource",
    connector: "jdbc",
    runtime: "AGENT",
    connection: { url: "jdbc:postgresql://${PAS_HOST}/pas", table: "patients" },
    mapping: {
      objectType: "Patient",
      primaryKey: { source: "patient_id", target: "nhsNumber" },
      properties: { name: { source: "name" } },
      links: [],
    },
    sync: { mode: "POLLING", interval: "30s" },
    ...overrides,
  };
}

function makeWireRecord(id: string, checkpoint: string): WireSourceRecord {
  return {
    table: "patients",
    key: { patient_id: id },
    data: { patient_id: id, name: `Name ${id}` },
    operation: "INSERT",
    timestamp: new Date().toISOString(),
    checkpoint,
  };
}

function makeGateway(opts: {
  datasources?: DatasourceMappingConfig[];
  applied?: Array<{ mapped: MappedObject; source: string }>;
  failApply?: boolean;
  livenessTimeoutMs?: number;
} = {}) {
  const applied = opts.applied ?? [];
  return new AgentGateway({
    enrollmentSecret: SECRET,
    datasources: opts.datasources ?? [makeConfig()],
    changeApplierFactory: () => async (mapped, source) => {
      if (opts.failApply) throw new Error("apply boom");
      applied.push({ mapped, source });
    },
    ...(opts.livenessTimeoutMs !== undefined ? { livenessTimeoutMs: opts.livenessTimeoutMs } : {}),
  });
}

function enrolled(gateway: AgentGateway, name = "site-agent", connectors = ["jdbc"]) {
  const res = gateway.enroll(SECRET, { agentName: name, connectors });
  expect(res.status).toBe(200);
  return res.body as AgentEnrollResponse;
}

// ── Enrollment ───────────────────────────────────────────────────────

describe("AgentGateway enrollment", () => {
  it("rejects a missing or wrong enrollment secret", () => {
    const gateway = makeGateway();
    expect(gateway.enroll(undefined, { agentName: "a", connectors: [] }).status).toBe(401);
    expect(gateway.enroll("wrong", { agentName: "a", connectors: [] }).status).toBe(401);
  });

  it("rejects malformed agent names and connector lists", () => {
    const gateway = makeGateway();
    expect(gateway.enroll(SECRET, { agentName: "", connectors: [] }).status).toBe(400);
    expect(gateway.enroll(SECRET, { agentName: "has spaces", connectors: [] }).status).toBe(400);
    expect(
      gateway.enroll(SECRET, { agentName: "ok", connectors: "jdbc" as unknown as string[] }).status,
    ).toBe(400);
  });

  it("mints a distinct id and token per enrollment", () => {
    const gateway = makeGateway();
    const a = enrolled(gateway, "agent-a");
    const b = enrolled(gateway, "agent-b");
    expect(a.agentId).not.toBe(b.agentId);
    expect(a.agentToken).not.toBe(b.agentToken);
    expect(a.heartbeatIntervalMs).toBeGreaterThan(0);
  });

  it("re-enrollment under the same name revokes the old token", async () => {
    const gateway = makeGateway();
    const first = enrolled(gateway);
    const second = enrolled(gateway);
    const stale = await gateway.heartbeat(first.agentId, first.agentToken, { connectors: ["jdbc"] });
    expect(stale.status).toBe(401);
    const fresh = await gateway.heartbeat(second.agentId, second.agentToken, { connectors: ["jdbc"] });
    expect(fresh.status).toBe(200);
  });

  it("refuses to construct over a DIRECT datasource", () => {
    expect(() => makeGateway({ datasources: [makeConfig({ runtime: "DIRECT" })] })).toThrow(/runtime DIRECT/);
  });
});

// ── Heartbeat and lease assignment ───────────────────────────────────

describe("AgentGateway leases", () => {
  it("leases a datasource to a live agent with the connector plugin", async () => {
    const gateway = makeGateway();
    const agent = enrolled(gateway);
    const hb = await gateway.heartbeat(agent.agentId, agent.agentToken, { connectors: ["jdbc"] });
    expect(hb.status).toBe(200);
    const body = hb.body as AgentHeartbeatResponse;
    expect(body.leases).toHaveLength(1);
    expect(body.leases[0]).toMatchObject({
      datasource: "PasAgentSource",
      connector: "jdbc",
      mode: "POLLING",
      checkpoint: null,
    });
    expect(body.leases[0]!.connection.url).toContain("${PAS_HOST}"); // placeholder passes through unresolved
  });

  it("does not lease to an agent lacking the connector plugin", async () => {
    const gateway = makeGateway();
    const agent = enrolled(gateway, "site-agent", ["rest"]);
    const hb = await gateway.heartbeat(agent.agentId, agent.agentToken, { connectors: ["rest"] });
    expect((hb.body as AgentHeartbeatResponse).leases).toHaveLength(0);
  });

  it("honours an agent pin", async () => {
    const gateway = makeGateway({ datasources: [makeConfig({ agent: "ward-a-agent" })] });
    const other = enrolled(gateway, "other-agent");
    expect(
      ((await gateway.heartbeat(other.agentId, other.agentToken, { connectors: ["jdbc"] })).body as AgentHeartbeatResponse)
        .leases,
    ).toHaveLength(0);
    const pinned = enrolled(gateway, "ward-a-agent");
    expect(
      ((await gateway.heartbeat(pinned.agentId, pinned.agentToken, { connectors: ["jdbc"] })).body as AgentHeartbeatResponse)
        .leases,
    ).toHaveLength(1);
  });

  it("keeps the lease with its holder while the holder is live", async () => {
    const gateway = makeGateway();
    const first = enrolled(gateway, "agent-a");
    await gateway.heartbeat(first.agentId, first.agentToken, { connectors: ["jdbc"] });
    const second = enrolled(gateway, "agent-b");
    const hb = await gateway.heartbeat(second.agentId, second.agentToken, { connectors: ["jdbc"] });
    expect((hb.body as AgentHeartbeatResponse).leases).toHaveLength(0);
  });

  it("reassigns the lease when the holder goes stale", async () => {
    const gateway = makeGateway({ livenessTimeoutMs: 30 });
    const first = enrolled(gateway, "agent-a");
    await gateway.heartbeat(first.agentId, first.agentToken, { connectors: ["jdbc"] });
    await new Promise((r) => setTimeout(r, 60)); // agent-a passes the liveness timeout
    const second = enrolled(gateway, "agent-b");
    const hb = await gateway.heartbeat(second.agentId, second.agentToken, { connectors: ["jdbc"] });
    expect((hb.body as AgentHeartbeatResponse).leases).toHaveLength(1);
  });
});

// ── Upload ───────────────────────────────────────────────────────────

describe("AgentGateway upload", () => {
  let gateway: AgentGateway;
  let applied: Array<{ mapped: MappedObject; source: string }>;
  let agent: AgentEnrollResponse;

  beforeEach(async () => {
    applied = [];
    gateway = makeGateway({ applied });
    agent = enrolled(gateway);
    await gateway.heartbeat(agent.agentId, agent.agentToken, { connectors: ["jdbc"] });
  });

  it("rejects a bad token and an unknown datasource", async () => {
    expect((await gateway.upload(agent.agentId, "bad", "PasAgentSource", { records: [] })).status).toBe(401);
    expect((await gateway.upload(agent.agentId, agent.agentToken, "Nope", { records: [] })).status).toBe(404);
  });

  it("refuses an upload for a lease the agent does not hold", async () => {
    const other = enrolled(gateway, "other-agent", []);
    const res = await gateway.upload(other.agentId, other.agentToken, "PasAgentSource", {
      records: [makeWireRecord("p1", "c1")],
    });
    expect(res.status).toBe(409);
  });

  it("maps and applies uploaded records, then persists the checkpoint", async () => {
    const res = await gateway.upload(agent.agentId, agent.agentToken, "PasAgentSource", {
      records: [makeWireRecord("p1", "c1"), makeWireRecord("p2", "c2")],
    });
    expect(res.status).toBe(200);
    const body = res.body as AgentUploadResponse;
    expect(body.accepted).toBe(2);
    expect(body.rejected).toBe(0);
    expect(body.checkpoint).toBe("c2");
    expect(applied).toHaveLength(2);
    expect(applied[0]!.mapped).toMatchObject({ objectType: "Patient", id: "p1" });
    expect(applied[0]!.source).toBe("PasAgentSource");

    // The next heartbeat's lease grant resumes from the durable checkpoint.
    const hb = await gateway.heartbeat(agent.agentId, agent.agentToken, { connectors: ["jdbc"] });
    expect((hb.body as AgentHeartbeatResponse).leases[0]!.checkpoint).toBe("c2");
  });

  it("counts malformed records as rejected without dropping the batch", async () => {
    const res = await gateway.upload(agent.agentId, agent.agentToken, "PasAgentSource", {
      records: [
        makeWireRecord("p1", "c1"),
        { ...makeWireRecord("p2", "c2"), operation: "UPSERT" as "INSERT" },
        { ...makeWireRecord("p3", "c3"), data: null as unknown as Record<string, unknown> },
      ],
    });
    const body = res.body as AgentUploadResponse;
    expect(body.accepted).toBe(1);
    expect(body.rejected).toBe(2);
    expect(body.errors).toHaveLength(2);
    expect(applied).toHaveLength(1);
  });

  it("counts applier failures as rejected", async () => {
    const failing = makeGateway({ failApply: true });
    const a = enrolled(failing);
    await failing.heartbeat(a.agentId, a.agentToken, { connectors: ["jdbc"] });
    const res = await failing.upload(a.agentId, a.agentToken, "PasAgentSource", {
      records: [makeWireRecord("p1", "c1")],
    });
    const body = res.body as AgentUploadResponse;
    expect(body.accepted).toBe(0);
    expect(body.rejected).toBe(1);
  });

  it("caps the records per upload", async () => {
    const capped = new AgentGateway({
      enrollmentSecret: SECRET,
      datasources: [makeConfig()],
      changeApplierFactory: () => async () => {},
      maxRecordsPerUpload: 1,
    });
    const a = enrolled(capped);
    await capped.heartbeat(a.agentId, a.agentToken, { connectors: ["jdbc"] });
    const res = await capped.upload(a.agentId, a.agentToken, "PasAgentSource", {
      records: [makeWireRecord("p1", "c1"), makeWireRecord("p2", "c2")],
    });
    expect(res.status).toBe(413);
  });
});

// ── Status ───────────────────────────────────────────────────────────

describe("AgentGateway status", () => {
  it("reports agents, liveness, leases and datasource intake", async () => {
    const gateway = makeGateway();
    const agent = enrolled(gateway);
    await gateway.heartbeat(agent.agentId, agent.agentToken, { connectors: ["jdbc"] });
    await gateway.upload(agent.agentId, agent.agentToken, "PasAgentSource", {
      records: [makeWireRecord("p1", "c1")],
    });

    const status = await gateway.status();
    expect(status.agents).toHaveLength(1);
    expect(status.agents[0]).toMatchObject({
      agentName: "site-agent",
      live: true,
      leases: ["PasAgentSource"],
    });
    expect(status.datasources).toHaveLength(1);
    expect(status.datasources[0]).toMatchObject({
      datasource: "PasAgentSource",
      assignedAgent: "site-agent",
      recordsProcessed: 1,
      recordsFailed: 0,
      checkpoint: "c1",
    });
  });
});
