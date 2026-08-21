import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SyncScheduler, InMemoryCheckpointStore, parseInterval } from "./sync-scheduler.js";
import { ConnectorRegistry } from "../connectors/connector-registry.js";
import type { Connector, ConnectorConfig, Checkpoint, SourceRecord } from "../connectors/connector.js";
import type { DatasourceMappingConfig } from "../mapping/mapping-parser.js";
import type { MappedObject } from "../mapping/record-mapper.js";

// ── Fixtures ─────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<DatasourceMappingConfig["sync"]> = {}): DatasourceMappingConfig {
  return {
    datasource: "TestSource",
    connector: "fake",
    runtime: "DIRECT",
    connection: { url: "postgres://ignored/db", table: "patients" },
    mapping: {
      objectType: "Patient",
      primaryKey: { source: "patient_id", target: "id" },
      properties: { name: { source: "name" } },
      links: [],
    },
    sync: { mode: "POLLING", interval: "50ms", ...overrides },
  };
}

function makeRecord(id: string, checkpoint: Checkpoint): SourceRecord {
  return {
    table: "patients",
    key: { patient_id: id },
    data: { patient_id: id, name: `Name ${id}` },
    operation: "UPDATE",
    timestamp: new Date().toISOString(),
    checkpoint,
  };
}

/** Fake connector: replays queued batches, records the `since` checkpoints it was asked for. */
class FakeConnector implements Connector {
  readonly name = "fake";
  readonly version = "0.0.0";
  batches: SourceRecord[][] = [];
  sinceLog: Checkpoint[] = [];
  initialized = false;
  shutdownCalled = false;
  failNext = false;

  async initialize(_config: ConnectorConfig): Promise<void> { this.initialized = true; }
  async shutdown(): Promise<void> { this.shutdownCalled = true; }
  async healthCheck() { return { healthy: true, provider: "fake", latencyMs: 0 }; }
  async discoverSchema() { return { tables: [] }; }

  async *fullExtract(): AsyncIterable<SourceRecord> {
    yield* this.nextBatch();
  }

  async *incrementalExtract(_table: string, since: Checkpoint): AsyncIterable<SourceRecord> {
    this.sinceLog.push(since);
    yield* this.nextBatch();
  }

  private nextBatch(): SourceRecord[] {
    if (this.failNext) { this.failNext = false; throw new Error("boom"); }
    return this.batches.shift() ?? [];
  }

  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
}

function makeScheduler(connector: FakeConnector, opts: Partial<ConstructorParameters<typeof SyncScheduler>[0]> = {}) {
  const registry = new ConnectorRegistry();
  registry.register({
    metadata: { name: "fake", version: "0.0.0", description: "test" },
    factory: () => connector,
  });
  return new SyncScheduler({ registry, ...opts });
}

async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ── parseInterval ────────────────────────────────────────────────────

describe("parseInterval", () => {
  it("parses ISO-8601 durations", () => {
    expect(parseInterval("PT5M")).toBe(300_000);
    expect(parseInterval("PT30S")).toBe(30_000);
    expect(parseInterval("PT1H")).toBe(3_600_000);
    expect(parseInterval("P1D")).toBe(86_400_000);
  });

  it("parses short forms and plain numbers", () => {
    expect(parseInterval("30s")).toBe(30_000);
    expect(parseInterval("5m")).toBe(300_000);
    expect(parseInterval("500ms")).toBe(500);
    expect(parseInterval("1000")).toBe(1000);
    expect(parseInterval(2500)).toBe(2500);
  });

  it("returns null for missing or invalid input", () => {
    expect(parseInterval(null)).toBeNull();
    expect(parseInterval(undefined)).toBeNull();
    expect(parseInterval("soon")).toBeNull();
    expect(parseInterval("0")).toBeNull();
    expect(parseInterval("PT")).toBeNull();
  });
});

// ── SyncScheduler ────────────────────────────────────────────────────

describe("SyncScheduler", () => {
  let connector: FakeConnector;
  let applied: Array<{ mapped: MappedObject; source: string }>;
  const applier = async (mapped: MappedObject, source: string) => { applied.push({ mapped, source }); };

  beforeEach(() => {
    connector = new FakeConnector();
    applied = [];
  });

  afterEach(() => vi.restoreAllMocks());

  it("rejects OVERLAY datasources", async () => {
    const scheduler = makeScheduler(connector);
    await expect(scheduler.register(makeConfig({ mode: "OVERLAY" }), applier)).rejects.toThrow(/OVERLAY/);
  });

  it("rejects duplicate datasource registration", async () => {
    const scheduler = makeScheduler(connector);
    await scheduler.register(makeConfig(), applier);
    await expect(scheduler.register(makeConfig(), applier)).rejects.toThrow(/already registered/);
  });

  it("polls incrementally, applies mapped records, and advances the checkpoint", async () => {
    connector.batches = [
      [makeRecord("p1", "cp1"), makeRecord("p2", "cp2")],
      [makeRecord("p3", "cp3")],
    ];
    const store = new InMemoryCheckpointStore();
    const scheduler = makeScheduler(connector, { checkpointStore: store });
    await scheduler.register(makeConfig(), applier);
    expect(connector.initialized).toBe(true);

    scheduler.start();
    await waitFor(() => applied.length >= 3);
    await scheduler.stop();

    // Mapped through RecordMapper (id from primaryKey, properties mapped)
    expect(applied[0]!.mapped).toMatchObject({ objectType: "Patient", id: "p1", properties: { name: "Name p1" } });
    expect(applied[0]!.source).toBe("TestSource");
    // First poll starts from the epoch default, second resumes from saved checkpoint
    expect(connector.sinceLog[0]!).toBe("1970-01-01T00:00:00Z");
    expect(connector.sinceLog[1]!).toBe("cp2");
    await expect(store.getCheckpoint("TestSource")).resolves.toBe("cp3");
  });

  it("does not overlap ticks when a tick outlives the interval", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    connector.batches = [[makeRecord("p1", "cp1")], [makeRecord("p2", "cp2")]];
    const slowApplier = async (mapped: MappedObject, source: string) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 120)); // 2.4× the 50ms interval
      concurrent--;
      applied.push({ mapped, source });
    };
    const scheduler = makeScheduler(connector);
    await scheduler.register(makeConfig(), slowApplier);
    scheduler.start();
    await waitFor(() => applied.length >= 2);
    await scheduler.stop();
    expect(maxConcurrent).toBe(1);
  });

  it("backs off after a failure and recovers", async () => {
    connector.failNext = true;
    connector.batches = [[makeRecord("p1", "cp1")]];
    const scheduler = makeScheduler(connector);
    await scheduler.register(makeConfig(), applier);
    scheduler.start();

    await waitFor(() => scheduler.stats()[0]!.consecutiveFailures === 1 || applied.length > 0);
    const failed = scheduler.stats()[0]!;
    expect(failed.lastError).toBe("boom");

    await waitFor(() => applied.length >= 1);
    await scheduler.stop();
    expect(scheduler.stats()[0]!.consecutiveFailures).toBe(0);
    expect(scheduler.stats()[0]!.lastError).toBeNull();
  });

  it("enforces maxRecordsPerTick", async () => {
    connector.batches = [[makeRecord("p1", "c1"), makeRecord("p2", "c2"), makeRecord("p3", "c3")]];
    const scheduler = makeScheduler(connector, { maxRecordsPerTick: 2 });
    await scheduler.register(makeConfig(), applier);
    scheduler.start();
    await waitFor(() => scheduler.stats()[0]!.ticks >= 1 && !scheduler.stats()[0]!.running);
    await scheduler.stop();
    expect(applied.length).toBe(2);
  });

  it("uses fullExtract for BATCH mode", async () => {
    connector.batches = [[makeRecord("p1", "c1")]];
    const scheduler = makeScheduler(connector);
    await scheduler.register(makeConfig({ mode: "BATCH" }), applier);
    scheduler.start();
    await waitFor(() => applied.length >= 1);
    await scheduler.stop();
    expect(connector.sinceLog).toHaveLength(0); // incrementalExtract never called
  });

  it("stop() shuts down connectors and halts scheduling", async () => {
    connector.batches = [[makeRecord("p1", "c1")]];
    const scheduler = makeScheduler(connector);
    await scheduler.register(makeConfig(), applier);
    scheduler.start();
    await waitFor(() => applied.length >= 1);
    await scheduler.stop();
    expect(connector.shutdownCalled).toBe(true);
    const ticksAtStop = scheduler.stats()[0]!.ticks;
    await new Promise((r) => setTimeout(r, 150));
    expect(scheduler.stats()[0]!.ticks).toBe(ticksAtStop);
  });
});
