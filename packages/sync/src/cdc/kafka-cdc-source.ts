/**
 * KafkaCdcSource — Debezium CDC source over Kafka/Redpanda (T6).
 *
 * Consumes Debezium-format change events from Kafka (Redpanda) and exposes
 * them as an AsyncIterable<SourceRecord> that the existing CdcConsumer can
 * pull from. Unwraps the Debezium envelope:
 *   op: c → INSERT
 *   op: u → UPDATE
 *   op: d → DELETE
 *   op: r → INSERT (snapshot)
 *
 * Kafka offsets are surfaced as Checkpoint values so the CdcConsumer can
 * persist and resume from the last consumed offset.
 */

import { Kafka, type Consumer, type KafkaMessage, type EachMessagePayload } from 'kafkajs';
import { createLogger } from '@altius/observability';
import type { SourceRecord, Checkpoint } from '../connectors/connector.js';

const logger = createLogger('kafka-cdc-source');

/** Debezium envelope shape (subset of fields we read). */
interface DebeziumEnvelope {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  op: 'c' | 'u' | 'd' | 'r';
  ts_ms?: number;
  source?: {
    table?: string;
    db?: string;
  };
}

export interface KafkaCdcSourceConfig {
  /** Comma-separated Kafka broker list (e.g. "redpanda:9092"). */
  brokers: string;
  /** Topic name (e.g. "dbserver.public.patients"). */
  topic: string;
  /** Consumer group ID. */
  groupId: string;
  /** Source table name to set on emitted SourceRecords. Defaults to the topic's table. */
  table?: string;
  /** Optional SASL/SSL — passed through to KafkaJS. */
  sasl?: ConstructorParameters<typeof Kafka>[0]['sasl'];
  ssl?: ConstructorParameters<typeof Kafka>[0]['ssl'];
}

/**
 * Kafka CDC source that yields SourceRecords from a Debezium topic.
 *
 * Implements AsyncIterable<SourceRecord> so it can be fed directly into
 * `CdcConsumer.consume(records)`.
 */
export class KafkaCdcSource implements AsyncIterable<SourceRecord> {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly topic: string;
  private readonly table: string;
  private readonly queue: SourceRecord[] = [];
  private done = false;
  private error: Error | null = null;
  private resolveWaiter: (() => void) | null = null;
  private started = false;

  constructor(config: KafkaCdcSourceConfig) {
    this.kafka = new Kafka({
      brokers: config.brokers.split(',').map(b => b.trim()),
      ...(config.sasl ? { sasl: config.sasl } : {}),
      ...(config.ssl ? { ssl: config.ssl } : {}),
    });
    this.consumer = this.kafka.consumer({ groupId: config.groupId });
    this.topic = config.topic;
    this.table = config.table ?? config.topic.split('.').pop() ?? config.topic;
  }

  /**
   * Connect and subscribe. Must be called before iterating.
   * Idempotent — safe to call multiple times.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          const record = this.unwrapMessage(payload.message, payload.partition);
          if (record) {
            this.queue.push(record);
            if (this.resolveWaiter) {
              const w = this.resolveWaiter;
              this.resolveWaiter = null;
              w();
            }
          }
        } catch (err) {
          logger.error(
            { err: err instanceof Error ? err.message : String(err), topic: this.topic },
            'Failed to unwrap Debezium message',
          );
        }
      },
    });
  }

  /**
   * Stop consuming and disconnect.
   */
  async stop(): Promise<void> {
    this.done = true;
    if (this.resolveWaiter) {
      const w = this.resolveWaiter;
      this.resolveWaiter = null;
      w();
    }
    try {
      await this.consumer.disconnect();
    } catch {
      // best-effort
    }
  }

  /**
   * Decode a Kafka message into a SourceRecord, unwrapping the Debezium
   * envelope. Returns null for tombstones or unparseable messages.
   */
  unwrapMessage(message: KafkaMessage, partition: number): SourceRecord | null {
    if (!message.value || message.value.length === 0) return null; // tombstone

    let parsed: DebeziumEnvelope;
    try {
      parsed = JSON.parse(message.value.toString()) as DebeziumEnvelope;
    } catch {
      return null;
    }

    const op = parsed.op;
    if (op !== 'c' && op !== 'u' && op !== 'd' && op !== 'r') return null;

    const operation: SourceRecord['operation'] =
      op === 'd' ? 'DELETE' : (op === 'u' ? 'UPDATE' : 'INSERT');

    // For DELETE, the payload is in `before`; for INSERT/UPDATE, in `after`.
    const data = operation === 'DELETE'
      ? (parsed.before ?? {})
      : (parsed.after ?? {});

    // Primary key: Debezium puts it in the message key as JSON or plain string.
    const key = this.parseKey(message.key);

    const checkpoint: Checkpoint = {
      topic: this.topic,
      partition,
      offset: message.offset,
    };

    return {
      table: parsed.source?.table ?? this.table,
      key,
      data,
      operation,
      timestamp: parsed.ts_ms
        ? new Date(parsed.ts_ms).toISOString()
        : new Date().toISOString(),
      checkpoint,
    };
  }

  private parseKey(keyBytes: Buffer | null): Record<string, unknown> {
    if (!keyBytes || keyBytes.length === 0) return {};
    const str = keyBytes.toString();
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'object' && parsed !== null) {
        // Debezium may wrap the key in a "payload" object
        if ('payload' in parsed && typeof (parsed as { payload: unknown }).payload === 'object') {
          return (parsed as { payload: Record<string, unknown> }).payload;
        }
        return parsed as Record<string, unknown>;
      }
      // Plain string key → { id: "..." }
      return { id: str };
    } catch {
      return { id: str };
    }
  }

  // ── AsyncIterable ───────────────────────────────────────────────────

  async *[Symbol.asyncIterator](): AsyncIterator<SourceRecord> {
    if (!this.started) {
      await this.start();
    }
    while (!this.done) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.error) {
        throw this.error;
      } else {
        // Wait for the next message or stop signal
        await new Promise<void>(resolve => {
          this.resolveWaiter = resolve;
        });
      }
    }
    // Drain any remaining queued records
    while (this.queue.length > 0) {
      yield this.queue.shift()!;
    }
  }
}
