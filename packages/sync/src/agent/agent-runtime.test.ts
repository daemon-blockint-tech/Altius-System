import { describe, it, expect, afterEach } from "vitest";
import { AgentGateway } from "./agent-gateway.js";
import { DataConnectionAgent, resolveAgentEnvPlaceholders } from "./agent-runtime.js";
import { ConnectorRegistry } from "../connectors/connector-registry.js";
import type { Connector, ConnectorConfig, Checkpoint, SourceRecord } from "../connectors/connector.js";
import type { DatasourceMappingConfig } from "../mapping/mapping-parser.js";
import type { MappedObject } from "../mapping/record-mapper.js";

// ── Fixtures ─────────────────────────────────────────────────────────

const SECRET = "loopback-secret";

function makeConfig(overrides: Partial<DatasourceMappingConfig> = {}): DatasourceMappingConfig {
  return {
    datasource: "PasAgentSource",
    connector: "fake",
    runtime: "AGENT",
    connection: { url: "jdbc:postgresql://${PAS_HOST}/pas", table: "patients" },
    mapping: {
      objectType: "Patient",
      primaryKey: { source: "patient_id", target: "nhsNumber" },
      properties: { name: { source: "name" } },
      links: [],
    },
    sync: { mode: "POLLING", interval: "40ms" },
    ...overrides,
  };
}

function makeRecord(id: string, checkpoint: Checkpoint): SourceRecord {
  return {
    table: "patients",
    key: { patient_id: id },
    data: { patient_id: id, name: `Name ${id}` },
    operation: "INSERT",
    timestamp: new Date().toISOString(),
    checkpoint,
  };
}

/** Fake connector living in the AGENT's local registry. */
class FakeConnector implements Connector {
  readonly name = "fake";
  readonly version = "0.0.0";
  batches: SourceRecord[][] = [];
  sinceLog: Checkpoint[] = [];
  initConfig: ConnectorConfig | null = null;
  shutdownCalled = false;

  async initialize(config: ConnectorConfig): Promise<void> { this.initConfig = config; }
  async shutdown(): Promise<void> { this.shutdownCalled = true; }
  async healthCheck() { return { healthy: true, provider: "fake", latencyMs: 0 }; }
  async discoverSchema() { return { tables: [] }; }
  async *fullExtract(): AsyncIterable<SourceRecord> { yield* this.batches.shift() ?? []; }
  async *incrementalExtract(_table: string, since: Checkpoint): AsyncIterable<SourceRecord> {
    this.sinceLog.push(since);
    yield* this.batches.shift() ?? [];
  }
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
}

/**
 * Loopback fetch: routes the agent's outbound HTTP calls straight into a
 * gateway instance. Exercises the full wire protocol (paths, headers,
 * bodies, status codes) with no socket — the same JSON round-trip a real
 * deployment does, minus TLS.
 */
function loopbackFetch(gateway: AgentGateway): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const respond = (out: { status: number; body: unknown }) =>
      new Response(JSON.stringify(out.body), { status: out.status });

    const enroll = url.pathname.match(/^\/api\/v1\/data-connection\/enroll$/);
    if (enroll) {
      return respond(gateway.enroll(headers.get("x-enrollment-secret") ?? undefined, body));
    }
    const token = headers.get("authorization")?.replace(/^Bearer /, "");
    const heartbeat = url.pathname.match(/^\/api\/v1\/data-connection\/agents\/([^/]+)\/heartbeat$/);
    if (heartbeat) {
      return respond(await gateway.heartbeat(heartbeat[1]!, token, body));
    }
    const upload = url.pathname.match(/^\/api\/v1\/data-connection\/agents\/([^/]+)\/datasources\/([^/]+)\/records$/);
    if (upload) {
      return respond(await gateway.upload(upload[1]!, token, decodeURIComponent(upload[2]!), body));
    }
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;
}

function makeStack(opts: { config?: DatasourceMappingConfig; heartbeatIntervalMs?: number } = {}) {
  const applied: Array<{ mapped: MappedObject; source: string }> = [];
  const gateway = new AgentGateway({
    enrollmentSecret: SECRET,
    datasources: [opts.config ?? makeConfig()],
    changeApplierFactory: () => async (mapped, source) => { applied.push({ mapped, source }); },
    heartbeatIntervalMs: opts.heartbeatIntervalMs ?? 25,
  });
  const connector = new FakeConnector();
  const registry = new ConnectorRegistry();
  registry.register({ metadata: { name: "fake", version: "0.0.0" }, factory: () => connector });
  const agent = new DataConnectionAgent({
    platformUrl: "https://altius.test",
    enrollmentSecret: SECRET,
    agentName: "test-agent",
    registry,
    fetchImpl: loopbackFetch(gateway),
    env: { PAS_HOST: "pas.internal.example" },
  });
  return { gateway, agent, connector, applied };
}

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ── resolveAgentEnvPlaceholders ──────────────────────────────────────

describe("resolveAgentEnvPlaceholders", () => {
  it("resolves from the provided environment", () => {
    expect(resolveAgentEnvPlaceholders("jdbc://${DB_HOST}/x", { DB_HOST: "h" })).toBe("jdbc://h/x");
  });

  it("throws on an unset variable", () => {
    expect(() => resolveAgentEnvPlaceholders("jdbc://${DB_HOST}/x", {})).toThrow(/DB_HOST/);
  });
});

// ── DataConnectionAgent ──────────────────────────────────────────────

describe("DataConnectionAgent", () => {
  let running: DataConnectionAgent | null = null;
  afterEach(async () => {
    await running?.stop();
    running = null;
  });

  it("refuses a cleartext platform URL unless explicitly allowed", () => {
    const registry = new ConnectorRegistry();
    expect(
      () =>
        new DataConnectionAgent({
          platformUrl: "http://altius.test",
          enrollmentSecret: SECRET,
          registry,
        }),
    ).toThrow(/https/);
    expect(
      () =>
        new DataConnectionAgent({
          platformUrl: "http://altius.test",
          enrollmentSecret: SECRET,
          registry,
          allowInsecureHttp: true,
        }),
    ).not.toThrow();
  });

  it("enrolls, receives the lease, captures locally and uploads to the platform", async () => {
    const { agent, connector, applied } = makeStack();
    connector.batches.push([makeRecord("p1", "c1"), makeRecord("p2", "c2")]);
    running = agent;
    await agent.start();

    await waitFor(() => applied.length === 2);
    expect(applied[0]!.mapped).toMatchObject({ objectType: "Patient", id: "p1" });
    expect(applied[0]!.source).toBe("PasAgentSource");
    expect(agent.heldLeases()).toEqual(["PasAgentSource"]);

    // Credentials resolved from the AGENT's env — the gateway sent the raw placeholder.
    expect(connector.initConfig?.url).toBe("jdbc:postgresql://pas.internal.example/pas");
  });

  it("resumes incremental extraction from the checkpoint the platform acknowledged", async () => {
    const { agent, connector, applied } = makeStack();
    connector.batches.push([makeRecord("p1", "c1")], [makeRecord("p2", "c2")]);
    running = agent;
    await agent.start();

    await waitFor(() => applied.length === 2);
    // First tick starts from the epoch default; the next resumes from c1,
    // which only the platform's upload ack could have told the agent.
    await waitFor(() => connector.sinceLog.length >= 2);
    expect(connector.sinceLog[0]).toBe("1970-01-01T00:00:00Z");
    expect(connector.sinceLog[1]).toBe("c1");
  });

  it("BATCH leases use fullExtract", async () => {
    const { agent, connector, applied } = makeStack({
      config: makeConfig({ sync: { mode: "BATCH", interval: "40ms" } }),
    });
    connector.batches.push([makeRecord("p1", "c1")]);
    running = agent;
    await agent.start();

    await waitFor(() => applied.length === 1);
    expect(connector.sinceLog).toHaveLength(0); // incrementalExtract never called
  });

  it("stop() shuts down local connectors", async () => {
    const { agent, connector, applied } = makeStack();
    connector.batches.push([makeRecord("p1", "c1")]);
    running = agent;
    await agent.start();
    await waitFor(() => applied.length === 1);

    await agent.stop();
    running = null;
    expect(connector.shutdownCalled).toBe(true);
    expect(agent.heldLeases()).toEqual([]);
  });

  it("rejects enrollment permanently on a wrong secret", async () => {
    const { gateway } = makeStack();
    const registry = new ConnectorRegistry();
    const badAgent = new DataConnectionAgent({
      platformUrl: "https://altius.test",
      enrollmentSecret: "wrong-secret",
      agentName: "bad-agent",
      registry,
      fetchImpl: loopbackFetch(gateway),
    });
    await expect(badAgent.start()).rejects.toThrow(/invalid enrollment secret/);
  });
});
