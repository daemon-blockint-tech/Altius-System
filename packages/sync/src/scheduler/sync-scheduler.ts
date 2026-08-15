/**
 * SyncScheduler — the driver loop the Sync Engine was missing (Section 6.2).
 *
 * Owns connector lifecycle and runs one bounded poll "tick" per datasource
 * on its configured interval:
 *
 *   checkpoint → connector.incrementalExtract (or fullExtract for BATCH)
 *              → CdcConsumer.consume → ChangeApplier → checkpoint save
 *
 * Scheduling rules (Operating Rules §2: every loop has bounds):
 * - ticks never overlap per datasource (in-flight tick skips the next fire)
 * - every tick is bounded by maxRecordsPerTick and maxTickMs
 * - consecutive failures back off exponentially, capped at 10× interval
 * - OVERLAY datasources are never scheduled — that mode is a read-through
 *   cache (OverlayEngine), not scheduled ingestion
 */

import { createLogger } from "@altius/observability";
import type { Checkpoint, Connector, SourceRecord } from "../connectors/connector.js";
import type { ConnectorRegistry } from "../connectors/connector-registry.js";
import type { DatasourceMappingConfig } from "../mapping/mapping-parser.js";
import { CdcConsumer, type ChangeApplier, type CheckpointStore, type CdcStats } from "../cdc/cdc-consumer.js";

const logger = createLogger("sync-scheduler");

// ── Interval parsing ─────────────────────────────────────────────────

const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
const SHORT_DURATION = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/;

/**
 * Parse a sync interval into milliseconds.
 * Accepts ISO-8601 durations ("PT5M", "PT30S", "P1D"), short forms
 * ("30s", "5m", "2h", "500ms"), or a plain millisecond number/string.
 * Returns null for missing/unparseable input (caller applies its default).
 */
export function parseInterval(interval: string | number | null | undefined): number | null {
  if (interval === null || interval === undefined) return null;
  if (typeof interval === "number") return interval > 0 ? interval : null;

  const trimmed = interval.trim();
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed);
    return ms > 0 ? ms : null;
  }

  const short = SHORT_DURATION.exec(trimmed);
  if (short) {
    const value = Number(short[1]);
    const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[short[2] as "ms" | "s" | "m" | "h"];
    const ms = value * unit;
    return ms > 0 ? ms : null;
  }

  const iso = ISO_DURATION.exec(trimmed.toUpperCase());
  if (iso && (iso[1] || iso[2] || iso[3] || iso[4])) {
    const ms =
      Number(iso[1] ?? 0) * 86_400_000 +
      Number(iso[2] ?? 0) * 3_600_000 +
      Number(iso[3] ?? 0) * 60_000 +
      Number(iso[4] ?? 0) * 1000;
    return ms > 0 ? ms : null;
  }

  return null;
}

// ── Checkpoint store ─────────────────────────────────────────────────

/**
 * In-memory CheckpointStore.
 *
 * ponytail: process-local — a restart re-polls from initialCheckpoint. Safe
 * because the ChangeApplier upserts idempotently by natural key; add a
 * Postgres-backed store (pattern: PostgresConsentStore) when re-extract cost
 * on restart matters.
 */
export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly checkpoints = new Map<string, Checkpoint>();

  async getCheckpoint(datasource: string): Promise<Checkpoint | null> {
    return this.checkpoints.get(datasource) ?? null;
  }

  async saveCheckpoint(datasource: string, checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(datasource, checkpoint);
  }
}

// ── Scheduler ────────────────────────────────────────────────────────

/** Per-datasource runtime status, exposed via stats(). */
export interface DatasourceStatus {
  datasource: string;
  mode: DatasourceMappingConfig["sync"]["mode"];
  intervalMs: number;
  ticks: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastTickAt: string | null;
  running: boolean;
  cdc: CdcStats;
}

export interface SyncSchedulerConfig {
  /** Registry used to instantiate connectors by type name. */
  registry: ConnectorRegistry;
  /** Checkpoint persistence (default: in-memory). */
  checkpointStore?: CheckpointStore;
  /** Poll interval when sync.interval is absent/unparseable. Default 30s. */
  defaultIntervalMs?: number;
  /** Hard cap on records consumed per tick. Default 10,000. */
  maxRecordsPerTick?: number;
  /** Wall-clock budget per tick. Default 60s. */
  maxTickMs?: number;
  /** Checkpoint for the first incremental poll. Default epoch ISO string. */
  initialCheckpoint?: Checkpoint;
}

interface Entry {
  config: DatasourceMappingConfig;
  connector: Connector;
  consumer: CdcConsumer;
  changeApplier: ChangeApplier;
  intervalMs: number;
  timer: NodeJS.Timeout | null;
  running: boolean;
  currentTick: Promise<void> | null;
  ticks: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastTickAt: string | null;
}

export class SyncScheduler {
  private readonly registry: ConnectorRegistry;
  private readonly checkpointStore: CheckpointStore;
  private readonly defaultIntervalMs: number;
  private readonly maxRecordsPerTick: number;
  private readonly maxTickMs: number;
  private readonly initialCheckpoint: Checkpoint;
  private readonly entries = new Map<string, Entry>();
  private started = false;
  private stopped = false;
  /** Aborted by stop() so a tick blocked on a quiet push source can end. */
  private readonly aborter = new AbortController();

  constructor(config: SyncSchedulerConfig) {
    this.registry = config.registry;
    this.checkpointStore = config.checkpointStore ?? new InMemoryCheckpointStore();
    this.defaultIntervalMs = config.defaultIntervalMs ?? 30_000;
    this.maxRecordsPerTick = config.maxRecordsPerTick ?? 10_000;
    this.maxTickMs = config.maxTickMs ?? 60_000;
    this.initialCheckpoint = config.initialCheckpoint ?? "1970-01-01T00:00:00Z";
  }

  /**
   * Register a datasource for scheduling. Instantiates and initializes its
   * connector. OVERLAY datasources are rejected — they are read-through
   * caches, not scheduled ingestion.
   */
  async register(config: DatasourceMappingConfig, changeApplier: ChangeApplier): Promise<void> {
    if (config.sync.mode === "OVERLAY") {
      throw new Error(
        `Datasource ${config.datasource} has sync.mode OVERLAY — use OverlayEngine, not the scheduler`,
      );
    }
    if (this.entries.has(config.datasource)) {
      throw new Error(`Datasource ${config.datasource} is already registered`);
    }

    const connectorConfig = {
      url: config.connection.url,
      table: config.connection.table,
      ...(config.connection.properties ? { properties: config.connection.properties } : {}),
    };
    const connector = this.registry.create(config.connector, connectorConfig);
    await connector.initialize(connectorConfig);

    const consumer = new CdcConsumer({
      mappingConfig: config,
      changeApplier,
      checkpointStore: this.checkpointStore,
    });

    this.entries.set(config.datasource, {
      config,
      connector,
      consumer,
      changeApplier,
      intervalMs: parseInterval(config.sync.interval) ?? this.defaultIntervalMs,
      timer: null,
      running: false,
      currentTick: null,
      ticks: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastTickAt: null,
    });
  }

  /** Start the poll loop for every registered datasource. */
  start(): void {
    if (this.started) return;
    this.started = true;
    for (const entry of this.entries.values()) {
      this.schedule(entry, entry.intervalMs);
      logger.info(
        { datasource: entry.config.datasource, mode: entry.config.sync.mode, intervalMs: entry.intervalMs },
        "Sync datasource scheduled",
      );
    }
  }

  /** Stop all loops, await in-flight ticks, shut down connectors. */
  async stop(): Promise<void> {
    this.stopped = true;
    // Before awaiting in-flight ticks: a CDC tick is parked on the next Kafka
    // message, and the only other thing that would end it is connector
    // shutdown — which runs after that await. Signalling first is what keeps
    // this from deadlocking on an idle topic.
    this.aborter.abort();
    const inFlight: Promise<void>[] = [];
    for (const entry of this.entries.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = null;
      if (entry.currentTick) inFlight.push(entry.currentTick);
    }
    await Promise.allSettled(inFlight);
    await Promise.allSettled([...this.entries.values()].map((e) => e.connector.shutdown()));
  }

  /** Current status of every registered datasource. */
  stats(): DatasourceStatus[] {
    return [...this.entries.values()].map((e) => ({
      datasource: e.config.datasource,
      mode: e.config.sync.mode,
      intervalMs: e.intervalMs,
      ticks: e.ticks,
      consecutiveFailures: e.consecutiveFailures,
      lastError: e.lastError,
      lastTickAt: e.lastTickAt,
      running: e.running,
      cdc: e.consumer.stats,
    }));
  }

  // ── Internals ──────────────────────────────────────────────────────

  private schedule(entry: Entry, delayMs: number): void {
    if (this.stopped) return;
    entry.timer = setTimeout(() => {
      entry.currentTick = this.tick(entry).finally(() => {
        entry.currentTick = null;
        // Chain the next fire only after this tick settles → no overlap.
        const backoff = Math.min(entry.intervalMs * 2 ** entry.consecutiveFailures, entry.intervalMs * 10);
        this.schedule(entry, entry.consecutiveFailures > 0 ? backoff : entry.intervalMs);
      });
    }, delayMs);
    entry.timer.unref?.();
  }

  private async tick(entry: Entry): Promise<void> {
    entry.running = true;
    entry.lastTickAt = new Date().toISOString();
    entry.ticks++;
    const { datasource } = entry.config;

    try {
      const source = await this.extractIterable(entry);
      await entry.consumer.consume(this.bounded(source, datasource));
      entry.consecutiveFailures = 0;
      entry.lastError = null;
    } catch (err) {
      entry.consecutiveFailures++;
      entry.lastError = err instanceof Error ? err.message : String(err);
      logger.error(
        { datasource, err: entry.lastError, consecutiveFailures: entry.consecutiveFailures },
        "Sync tick failed",
      );
    } finally {
      entry.running = false;
    }
  }

  private async extractIterable(entry: Entry): Promise<AsyncIterable<SourceRecord>> {
    const { config, connector } = entry;
    if (config.sync.mode === "BATCH") {
      // BATCH: periodic full re-extract; idempotent upserts absorb repeats.
      return connector.fullExtract(config.connection.table);
    }
    // POLLING / CDC: incremental from the last durable checkpoint.
    const checkpoint =
      (await this.checkpointStore.getCheckpoint(config.datasource)) ?? this.initialCheckpoint;
    return connector.incrementalExtract(config.connection.table, checkpoint);
  }

  /**
   * Await the next record, giving up when the tick deadline passes or stop()
   * is called.
   *
   * A CDC source is a push stream that can stay quiet indefinitely, and an
   * `await` suspended inside its generator cannot be cancelled from out here —
   * calling .return() on it does nothing until it resumes. So the *wait* is
   * what has to be bounded, not the generator asked to stop.
   */
  private async raceNext(
    it: AsyncIterator<SourceRecord>,
    deadline: number,
  ): Promise<IteratorResult<SourceRecord> | "interrupted"> {
    const signal = this.aborter.signal;
    if (signal.aborted) return "interrupted";
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    const interrupted = new Promise<"interrupted">((resolve) => {
      timer = setTimeout(() => resolve("interrupted"), Math.max(0, deadline - Date.now()));
      timer.unref?.();
      onAbort = () => resolve("interrupted");
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([it.next(), interrupted]);
    } finally {
      // Both must go: the listener would otherwise accumulate on the shared
      // signal, one per record, for the life of the process.
      if (timer) clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }

  /** Enforce maxRecordsPerTick and maxTickMs on a source stream. */
  private async *bounded(
    source: AsyncIterable<SourceRecord>,
    datasource: string,
  ): AsyncIterable<SourceRecord> {
    const deadline = Date.now() + this.maxTickMs;
    const it = source[Symbol.asyncIterator]();
    let count = 0;
    try {
      for (;;) {
        const next = await this.raceNext(it, deadline);
        if (next === "interrupted") {
          logger.warn(
            { datasource, count },
            this.aborter.signal.aborted
              ? "Sync tick interrupted by stop; remainder resumes from checkpoint"
              : "Sync tick hit maxTickMs; remainder next tick",
          );
          return;
        }
        if (next.done) return;
        yield next.value;
        count++;
        if (count >= this.maxRecordsPerTick) {
          logger.warn({ datasource, count }, "Sync tick hit maxRecordsPerTick; remainder next tick");
          return;
        }
        if (Date.now() > deadline) {
          logger.warn({ datasource, count }, "Sync tick hit maxTickMs; remainder next tick");
          return;
        }
      }
    } finally {
      // Deliberately not awaited: .return() on a generator parked at an await
      // only settles once it resumes, which is the deadlock this method exists
      // to avoid. Finite sources still get closed promptly.
      void Promise.resolve(it.return?.()).catch(() => {});
    }
  }
}
