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
export { PostgresCheckpointStore } from './postgres-checkpoint-store.js';

export type { KafkaCdcSourceConfig } from './kafka-cdc-source.js';
export { KafkaCdcSource } from './kafka-cdc-source.js';

// Reconciliation (Section 6.7)
export type {
  ReconciliationDiscrepancy,
  ReconciliationReport,
  ReconciliationOptions,
} from './reconciliation.js';
export { ReconciliationService } from './reconciliation.js';
