/**
 * Sync scheduler boot wiring — turns pack-declared connector manifests into
 * running poll loops (Spec Section 6.2).
 *
 * Opt-in via SYNC_SCHEDULER_ENABLED=true. Only POLLING / CDC / BATCH
 * datasources are scheduled; OVERLAY manifests remain read-through caches.
 *
 * Sync writes intentionally bypass the action pipeline (Spec Section 6): they
 * go straight to the ObjectManager under a dedicated sync actor. Sync therefore
 * OVERWRITES whatever an action wrote — there is no conflict resolution on this
 * path. ConflictResolver implements both declarable strategies, but both decide
 * by comparing the existing value's writer, and nothing in production writes
 * field provenance (LineageRecorder is never constructed). A datasource that
 * declares conflictResolution is refused rather than scheduled unprotected.
 */

import { createLogger } from '@altius/observability';
import type { RequestContext } from '@altius/spi';
import type { ObjectManager } from '@altius/engine';
import type {
  ChangeApplier,
  ConnectorRegistry,
  DatasourceMappingConfig,
  SyncScheduler as SyncSchedulerType,
} from '@altius/sync';
import type { ConnectorManifest } from './schema-loader.js';

const logger = createLogger('sync-boot');

const ENV_PLACEHOLDER = /\$\{([A-Z][A-Z0-9_]*)\}/g;

/**
 * Resolve ${ENV_VAR} placeholders in a connector connection string.
 * Throws if a referenced variable is unset/empty — a half-resolved
 * connection URL must never reach a connector.
 */
export function resolveEnvPlaceholders(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(ENV_PLACEHOLDER, (_match, name: string) => {
    const resolved = env[name];
    if (resolved === undefined || resolved === '') {
      throw new Error(`environment variable ${name} is not set`);
    }
    return resolved;
  });
}

/**
 * Build a ChangeApplier that upserts mapped records into the ontology by
 * natural key: the mapping's primaryKey.target property.
 *
 * The target must be a regular stored property. It cannot be 'id' or any
 * _-prefixed system field: the ODL @primary 'id' is the storage-minted _id
 * (schema-loader convertObjectType strips it), and the SPI has no
 * caller-supplied-id create. Supporting target:"id" requires an SPI contract
 * change across both providers — rejected loudly here instead.
 */
export function createEngineChangeApplier(opts: {
  objectManager: ObjectManager;
  keyField: string;
  ctx: RequestContext;
}): ChangeApplier {
  const { objectManager, keyField, ctx } = opts;
  if (keyField === 'id' || keyField.startsWith('_')) {
    throw new Error(
      `primaryKey.target "${keyField}" is not upsertable: object _id is storage-minted. ` +
      `Point primaryKey.target at a natural-key property (e.g. nhsNumber) with @unique.`,
    );
  }
  const linkWarned = new Set<string>();

  return async (mapped, source) => {
    const cause = { actor: `sync:${source}` };
    const page = await objectManager.query(
      mapped.objectType,
      { field: keyField, operator: 'eq', value: mapped.id },
      { limit: 2, includeDeleted: false },
      ctx,
    );
    if (page.items.length > 1) {
      throw new Error(
        `ambiguous natural key ${mapped.objectType}.${keyField}=${mapped.id}: ${page.totalCount} matches`,
      );
    }
    const existing = page.items[0];

    if (mapped.operation === 'DELETE') {
      if (existing) {
        await objectManager.delete(mapped.objectType, existing._id, 'soft', ctx, cause);
      }
      return;
    }

    if (existing) {
      await objectManager.update(mapped.objectType, existing._id, mapped.properties, ctx, cause);
    } else {
      await objectManager.create(
        mapped.objectType,
        { [keyField]: mapped.id, ...mapped.properties },
        ctx,
        cause,
      );
    }

    // ponytail: link ingestion not wired — MappedLink.toId is a natural key
    // needing the same lookup per link type; add when a manifest ships links.
    if (mapped.links.length > 0 && !linkWarned.has(source)) {
      linkWarned.add(source);
      logger.warn({ source, links: mapped.links.length }, 'Sync link mappings are not applied yet');
    }
  };
}

export interface SyncBootResult {
  scheduler: SyncSchedulerType | null;
  /** Datasources actually scheduled. */
  scheduled: string[];
  /** Graceful teardown; no-op when nothing was scheduled. */
  stop: () => Promise<void>;
}

/**
 * Parse pack connector manifests and start the sync scheduler for every
 * schedulable (non-OVERLAY) datasource. Per-datasource failures (bad config,
 * missing env vars, unreachable source) skip that datasource loudly instead
 * of failing boot — matching the loader's warn-only posture for connectors.
 */
export async function startSyncScheduler(opts: {
  connectorManifests: ConnectorManifest[];
  registry: ConnectorRegistry;
  objectManager: ObjectManager;
  tenantId: string;
  /** Optional durable checkpoint store. When absent, defaults to in-memory. */
  checkpointStore?: import('@altius/sync').CheckpointStore;
}): Promise<SyncBootResult> {
  const { connectorManifests, registry, objectManager, tenantId, checkpointStore } = opts;
  const noop: SyncBootResult = { scheduler: null, scheduled: [], stop: async () => {} };
  if (connectorManifests.length === 0) return noop;

  const { SyncScheduler, parseMappingObject } = await import('@altius/sync');
  const scheduler = new SyncScheduler({ registry, ...(checkpointStore ? { checkpointStore } : {}) });
  const scheduled: string[] = [];

  for (const manifest of connectorManifests) {
    let config: DatasourceMappingConfig;
    try {
      config = parseMappingObject(manifest.config);
    } catch (err) {
      logger.warn(
        { pack: manifest.packName, err: err instanceof Error ? err.message : String(err) },
        'Sync: connector manifest unparseable — skipped',
      );
      continue;
    }
    if (config.sync.mode === 'OVERLAY') continue; // read-through cache, not scheduled

    // AGENT datasources run their connector on a Data Connection Agent inside
    // the customer network, not in this process — the platform cannot reach
    // the source (that is the point of the agent). Leased out by the
    // data-connection gateway; scheduling it here would fail on first connect
    // at best and exfiltrate credentials into platform logs at worst.
    if (config.runtime === 'AGENT') {
      logger.info(
        { datasource: config.datasource, pack: manifest.packName },
        'Sync: runtime AGENT — leased to a data-connection agent, not scheduled in-process',
      );
      continue;
    }

    // A declared conflict strategy that does not run is worse than none: the
    // operator believes user edits are protected while every poll overwrites
    // them, and nothing logs it. Both declarable strategies (SOURCE_PRIORITY,
    // ACTION_PRIORITY) decide by comparing the EXISTING value's writer, and no
    // production code writes field provenance — LineageRecorder is never
    // constructed, so lineage.field_provenance has no producer. Refuse the
    // datasource rather than sync it unprotected.
    if (config.sync.conflictResolution) {
      logger.error(
        { datasource: config.datasource, pack: manifest.packName, strategy: config.sync.conflictResolution },
        'Sync: datasource declares conflictResolution but field provenance has no producer, ' +
        'so the strategy cannot be enforced and user edits would be silently overwritten — not scheduled',
      );
      continue;
    }

    try {
      config.connection.url = resolveEnvPlaceholders(config.connection.url);
      const ctx: RequestContext = { tenantId, actorId: `sync:${config.datasource}` };
      const applier = createEngineChangeApplier({
        objectManager,
        keyField: config.mapping.primaryKey.target,
        ctx,
      });
      await scheduler.register(config, applier);
      scheduled.push(config.datasource);
    } catch (err) {
      logger.warn(
        { datasource: config.datasource, pack: manifest.packName, err: err instanceof Error ? err.message : String(err) },
        'Sync: datasource not schedulable — skipped',
      );
    }
  }

  if (scheduled.length === 0) return noop;
  scheduler.start();
  logger.info({ scheduled }, `Sync: scheduler started (${scheduled.length} datasource(s))`);
  return { scheduler, scheduled, stop: () => scheduler.stop() };
}
