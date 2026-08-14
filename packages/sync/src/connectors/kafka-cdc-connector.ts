/**
 * Kafka CDC connector plugin (T6).
 *
 * Registers the `kafka-cdc` connector type in the default registry so
 * pack-declared manifests with `connector: "kafka-cdc"` can be resolved
 * by the sync scheduler. The connector wraps a {@link KafkaCdcSource} as
 * a pull-based AsyncIterable<SourceRecord> for the existing CdcConsumer.
 */

import type { Connector, ConnectorConfig } from "./connector.js";
import type { ConnectorPlugin } from "./connector-registry.js";
import type { HealthStatus } from "@altius/spi";
import { KafkaCdcSource } from "../cdc/kafka-cdc-source.js";

/**
 * Minimal Connector adapter that exposes a KafkaCdcSource as the
 * incrementalExtract AsyncIterable. fullExtract is not supported —
 * Kafka CDC is incremental-only.
 */
class KafkaCdcConnector implements Connector {
  readonly name = "kafka-cdc";
  readonly version = "0.1.0";

  private source: KafkaCdcSource | null = null;

  async initialize(_config: ConnectorConfig): Promise<void> {
    const config = _config;
    const brokers = String(config.properties?.['brokers'] ?? config.url);
    const topic = String(config.properties?.['topic'] ?? config.table);
    const groupId = String(config.properties?.['groupId'] ?? `altius-cdc-${topic}`);
    this.source = new KafkaCdcSource({
      brokers,
      topic,
      groupId,
      table: config.table,
    });
  }

  async shutdown(): Promise<void> {
    if (this.source) {
      await this.source.stop();
      this.source = null;
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.source) return { healthy: false, provider: 'kafka-cdc', latencyMs: 0, details: { message: 'Not initialized' } };
    return { healthy: true, provider: 'kafka-cdc', latencyMs: 0 };
  }

  async discoverSchema(): Promise<{ tables: { name: string; columns: { name: string; type: string; nullable: boolean }[] }[] }> {
    return { tables: [] };
  }

  fullExtract(): AsyncIterable<never> {
    throw new Error('kafka-cdc does not support fullExtract — use incrementalExtract');
  }

  incrementalExtract(_table: string, _since: unknown): AsyncIterable<import("./connector.js").SourceRecord> {
    if (!this.source) {
      throw new Error('kafka-cdc connector not initialized');
    }
    // The KafkaCdcSource is itself an AsyncIterable<SourceRecord>
    return this.source;
  }

  async pause(): Promise<void> {
    // KafkaJS consumer pause is cooperative; the run loop handles backpressure
  }

  async resume(): Promise<void> {
    // No-op — KafkaJS auto-resumes
  }
}

export const kafkaCdcPlugin: ConnectorPlugin = {
  metadata: {
    name: 'kafka-cdc',
    version: '0.1.0',
    description: 'Debezium CDC source over Kafka/Redpanda',
  },
  factory: (_config: ConnectorConfig) => new KafkaCdcConnector(),
};
