/**
 * Tests for RestConnector.
 *
 * Validates lifecycle plus real extraction: pagination styles, auth schemes,
 * incremental checkpointing, and error surfacing. A fake fetch stands in for the
 * source so the tests assert the requests actually issued.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RestConnector, restPlugin } from "./rest-connector.js";
import type { ConnectorConfig, SourceRecord } from "./connector.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<ConnectorConfig>): ConnectorConfig {
  return {
    url: "https://api.example.com",
    table: "records",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RestConnector", () => {
  let connector: RestConnector;

  beforeEach(() => {
    connector = new RestConnector();
  });

  // -- Identity --

  it("has name and version", () => {
    expect(connector.name).toBe("rest");
    expect(connector.version).toBe("1.0.0");
  });

  // -- Lifecycle --

  describe("initialize / shutdown", () => {
    it("initializes successfully", async () => {
      await connector.initialize(makeConfig());
      const status = await connector.healthCheck();
      expect(status.healthy).toBe(true);
    });

    it("shutdown marks connector as unhealthy", async () => {
      await connector.initialize(makeConfig());
      await connector.shutdown();
      const status = await connector.healthCheck();
      expect(status.healthy).toBe(false);
    });

    it("can initialize, shutdown, and re-initialize", async () => {
      await connector.initialize(makeConfig());
      await connector.shutdown();
      await connector.initialize(makeConfig());
      const status = await connector.healthCheck();
      expect(status.healthy).toBe(true);
      await connector.shutdown();
    });
  });

  // -- Health check --

  describe("healthCheck", () => {
    it("returns unhealthy before initialization", async () => {
      const status = await connector.healthCheck();
      expect(status.healthy).toBe(false);
      expect(status.provider).toBe("rest");
    });

    it("returns healthy after initialization", async () => {
      await connector.initialize(makeConfig());
      const status = await connector.healthCheck();
      expect(status.healthy).toBe(true);
      expect(status.provider).toBe("rest");
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
      await connector.shutdown();
    });
  });

  // -- Schema discovery (stub) --

  describe("pause / resume", () => {
    it("pause and resume do not throw", async () => {
      await connector.initialize(makeConfig());
      await connector.pause();
      await connector.resume();
      await connector.shutdown();
    });

    it("resume without pause is a no-op", async () => {
      await connector.initialize(makeConfig());
      await connector.resume();
      await connector.shutdown();
    });
  });

  // -- Plugin export --

  describe("restPlugin", () => {
    it("has correct metadata", () => {
      expect(restPlugin.metadata.name).toBe("rest");
      expect(restPlugin.metadata.version).toBe("1.0.0");
      expect(restPlugin.metadata.description).toBeDefined();
    });

    it("factory creates a RestConnector", () => {
      const instance = restPlugin.factory(makeConfig());
      expect(instance.name).toBe("rest");
      expect(instance.version).toBe("1.0.0");
    });
  });
});

// ---------------------------------------------------------------------------
// Extraction — the behaviour that replaced the stub
// ---------------------------------------------------------------------------

/** Fake fetch recording every request and replaying queued JSON responses. */
function fakeFetch(pages: unknown[]) {
  const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];
  let i = 0;
  const impl = async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, headers: init?.headers ?? {}, ...(init?.body ? { body: init.body } : {}) });
    const body = pages[Math.min(i, pages.length - 1)];
    i += 1;
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { impl, calls };
}

async function collect(it: AsyncIterable<SourceRecord>): Promise<SourceRecord[]> {
  const out: SourceRecord[] = [];
  for await (const r of it) out.push(r);
  return out;
}

describe("RestConnector extraction", () => {
  it("pages through an offset-paginated source until a short page", async () => {
    const page1 = Array.from({ length: 2 }, (_, n) => ({ id: `r${n}`, updated_at: "2026-01-01T00:00:00Z" }));
    const { impl, calls } = fakeFetch([page1, [{ id: "r2", updated_at: "2026-01-02T00:00:00Z" }]]);
    const c = new RestConnector(impl);
    await c.initialize(makeConfig({ properties: { pagination: { style: "offset", pageSize: 2 } } }));

    const records = await collect(c.fullExtract("records"));

    expect(records.map(r => r.key['id'])).toEqual(["r0", "r1", "r2"]);
    expect(calls[0]!.url).toContain("limit=2");
    expect(calls[0]!.url).toContain("offset=0");
    expect(calls[1]!.url).toContain("offset=2");
  });

  it("follows a cursor until the source stops returning one", async () => {
    const { impl, calls } = fakeFetch([
      { data: [{ id: "a" }], next_cursor: "c1" },
      { data: [{ id: "b" }], next_cursor: "" },
    ]);
    const c = new RestConnector(impl);
    await c.initialize(makeConfig({ properties: { pagination: { style: "cursor", pageSize: 1 } } }));

    const records = await collect(c.fullExtract("records"));

    expect(records.map(r => r.key['id'])).toEqual(["a", "b"]);
    expect(calls[1]!.url).toContain("cursor=c1");
  });

  it("sends the checkpoint as the since parameter on incremental extract", async () => {
    const { impl, calls } = fakeFetch([[]]);
    const c = new RestConnector(impl);
    await c.initialize(makeConfig({ properties: { sinceParam: "updated_since" } }));

    await collect(c.incrementalExtract("records", "2026-03-01T10:00:00Z"));

    expect(calls[0]!.url).toContain("updated_since=2026-03-01T10%3A00%3A00Z");
  });

  it("checkpoints on the row timestamp so a resumed extract does not re-read", async () => {
    const { impl } = fakeFetch([[{ id: "x", updated_at: "2026-04-01T09:00:00Z" }]]);
    const c = new RestConnector(impl);
    await c.initialize(makeConfig({ properties: { pagination: { style: "offset", pageSize: 10 } } }));

    const [record] = await collect(c.fullExtract("records"));

    expect(record!.checkpoint).toBe("2026-04-01T09:00:00Z");
    expect(record!.timestamp).toBe("2026-04-01T09:00:00Z");
  });

  it("attaches bearer and basic credentials", async () => {
    const bearer = fakeFetch([[]]);
    const b = new RestConnector(bearer.impl);
    await b.initialize(makeConfig({ properties: { auth: { type: "bearer", token: "t0k" } } }));
    await collect(b.fullExtract("records"));
    expect(bearer.calls[0]!.headers['Authorization']).toBe("Bearer t0k");

    const basic = fakeFetch([[]]);
    const a = new RestConnector(basic.impl);
    await a.initialize(makeConfig({ properties: { auth: { type: "basic", username: "u", password: "p" } } }));
    await collect(a.fullExtract("records"));
    expect(basic.calls[0]!.headers['Authorization']).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
  });

  it("completes the OAuth2 client-credentials grant and reuses the token", async () => {
    const { impl, calls } = fakeFetch([
      { access_token: "abc123", expires_in: 3600 },
      [{ id: "1" }],
      [{ id: "2" }],
    ]);
    const c = new RestConnector(impl);
    await c.initialize(makeConfig({
      properties: {
        pagination: { style: "offset", pageSize: 10 },
        auth: { type: "oauth2", tokenUrl: "https://idp.example.com/token", clientId: "cid", clientSecret: "sec", scope: "read" },
      },
    }));

    await collect(c.fullExtract("records"));
    await collect(c.fullExtract("records"));

    expect(calls[0]!.url).toBe("https://idp.example.com/token");
    expect(calls[0]!.body).toContain("grant_type=client_credentials");
    expect(calls[0]!.body).toContain("scope=read");
    expect(calls[1]!.headers['Authorization']).toBe("Bearer abc123");
    // Second extract must not re-request a token that has not expired.
    expect(calls.filter(x => x.url.includes("/token"))).toHaveLength(1);
  });

  it("infers a schema from a sampled page", async () => {
    const { impl } = fakeFetch([[{ id: "1", name: "Ada", age: 36, retired: null }]]);
    const c = new RestConnector(impl);
    await c.initialize(makeConfig());

    const schema = await c.discoverSchema();
    const cols = schema.tables[0]!.columns;

    expect(schema.tables[0]!.name).toBe("records");
    expect(cols.find(x => x.name === "name")!.type).toBe("string");
    expect(cols.find(x => x.name === "age")!.type).toBe("number");
    // Null in every sampled row: report unknown rather than guess a type.
    expect(cols.find(x => x.name === "retired")!.type).toBe("unknown");
  });

  it("surfaces an HTTP error instead of yielding nothing", async () => {
    const impl = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "upstream down" });
    const c = new RestConnector(impl);
    await c.initialize(makeConfig());

    await expect(collect(c.fullExtract("records"))).rejects.toThrow(/503.*upstream down/);
  });

  it("refuses to guess when the record array cannot be located", async () => {
    const { impl } = fakeFetch([{ unexpected: { shape: true } }]);
    const c = new RestConnector(impl);
    await c.initialize(makeConfig());

    await expect(collect(c.fullExtract("records"))).rejects.toThrow(/recordsPath/);
  });
});
