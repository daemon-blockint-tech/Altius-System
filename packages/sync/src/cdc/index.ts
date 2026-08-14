/**
 * CDC (Change Data Capture) module.
 */

export type {
  ChangeApplier,
  CheckpointStore,
  CdcStats,
  CdcConsumerConfig,
} from './cdc-consumer.js';

export { CdcConsumer } from './cdc-consumer.js';

export type { KafkaCdcSourceConfig } from './kafka-cdc-source.js';
export { KafkaCdcSource } from './kafka-cdc-source.js';
