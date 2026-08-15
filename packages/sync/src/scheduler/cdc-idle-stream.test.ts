/**
 * A CDC source is a push stream, not a finite batch.
 *
 * extractIterable() treats CDC exactly like POLLING — connector.incrementalExtract
 * is expected to return an iterable the tick drains to completion. The Kafka
 * connector returns its KafkaCdcSource directly, which never ends: on an idle
 * topic `for await` simply blocks on the next message.
 *
 * bounded() checks its deadline only *after* a record arrives, so a stream that
 * goes quiet is unbounded in practice — and stop() awaits the in-flight tick
 * (line 222) before calling connector.shutdown() (line 223), which is the only
 * thing that would end the stream. Idle CDC datasource → shutdown deadlocks.
 */

import { describe, it, expect, afterEach } from "vitest";
import { SyncScheduler } from "./sync-scheduler.js";
import { ConnectorRegistry } from "../connectors/connector-registry.js";
import type { Connector, ConnectorConfig, Checkpoint, SourceRecord } from "../connectors/connector.js";
import type { DatasourceMappingConfig } from "../mapping/mapping-parser.js";
import type { MappedObject } from "../mapping/record-mapper.js";

const config: DatasourceMappingConfig = {
  datasource: "KafkaSource",
  connector: "idle-cdc",
  connection: { url: "kafka://ignored", table: "patients" },
  mapping: {
    objectType: "Patient",
    primaryKey: { source: "patient_id", target: "id" },
    properties: { name: { source: "name" } },
    links: [],
  },
  sync: { mode: "CDC", interval: "50ms" },
};

/** Emits one record, then goes quiet exactly as an idle Kafka topic does. */
class IdleCdcConnector implements Connector {
  readonly name = "idle-cdc";
  readonly version = "0.0.0";
  shutdownCalled = false;
  extractCalls = 0;
  private release: (() => void) | null = null;

  async initialize(_config: ConnectorConfig): Promise<void> {}
  async shutdown(): Promise<void> { this.shutdownCalled = true; this.releaseBlocked(); }
  async healthCheck() { return { healthy: true, provider: "idle-cdc", latencyMs: 0 }; }
  async discoverSchema() { return { tables: [] }; }
  async *fullExtract(): AsyncIterable<SourceRecord> {}

  async *incrementalExtract(_table: string, _since: Checkpoint): AsyncIterable<SourceRecord> {
    this.extractCalls++;
    yield {
      table: "patients",
      key: { patient_id: "p1" },
      data: { patient_id: "p1", name: "Ada" },
      operation: "UPDATE",
      timestamp: new Date().toISOString(),
      checkpoint: { offset: String(this.extractCalls) },
    };
    // Quiet topic: the consumer is alive but nothing is being produced.
    await new Promise<void>((resolve) => { this.release = resolve; });
  }

  /** Test-side escape hatch so a hung run does not leak a pending generator. */
  releaseBlocked(): void { this.release?.(); this.release = null; }

  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
}

function makeScheduler(connector: IdleCdcConnector, maxTickMs: number) {
  const registry = new ConnectorRegistry();
  registry.register({
    metadata: { name: "idle-cdc", version: "0.0.0", description: "test" },
    factory: () => connector,
  });
  return new SyncScheduler({ registry, maxTickMs });
}

async function withinMs<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

const applied: MappedObject[] = [];
let live: IdleCdcConnector | null = null;

afterEach(() => { live?.releaseBlocked(); live = null; applied.length = 0; });

describe("CDC over an idle stream", () => {
  it("ends the tick on maxTickMs instead of waiting for the next record", async () => {
    const connector = new IdleCdcConnector();
    live = connector;
    const scheduler = makeScheduler(connector, 100);
    await scheduler.register(config, async (obj) => { applied.push(obj); });
    scheduler.start();

    // Two ticks can only happen if the first one ended on its own — the
    // scheduler chains the next fire in tick().finally.
    await withinMs(
      (async () => {
        const deadline = Date.now() + 3000;
        while (connector.extractCalls < 2) {
          if (Date.now() > deadline) throw new Error("second tick never started");
          await new Promise((r) => setTimeout(r, 10));
        }
      })(),
      3500,
      "second tick",
    );

    expect(connector.extractCalls).toBeGreaterThanOrEqual(2);
    await withinMs(scheduler.stop(), 2000, "stop");
  });

  it("shuts down without deadlocking while a tick is blocked on the stream", async () => {
    const connector = new IdleCdcConnector();
    live = connector;
    const scheduler = makeScheduler(connector, 60_000); // bound far away: only shutdown can end it
    await scheduler.register(config, async (obj) => { applied.push(obj); });
    scheduler.start();

    await withinMs(
      (async () => {
        const deadline = Date.now() + 2000;
        while (applied.length === 0) {
          if (Date.now() > deadline) throw new Error("first record never applied");
          await new Promise((r) => setTimeout(r, 10));
        }
      })(),
      2500,
      "first record",
    );

    await withinMs(scheduler.stop(), 3000, "stop with tick in flight");
    expect(connector.shutdownCalled).toBe(true);
  });
});
