/**
 * Data-connection gateway boot wiring — turns runtime-AGENT pack connector
 * manifests into an AgentGateway that leases them to enrolled Data
 * Connection Agents (Spec Section 6; the agent-based counterpart of
 * sync-boot's in-process scheduler).
 *
 * Opt-in via DATA_CONNECTION_ENROLLMENT_SECRET. Only runtime-AGENT
 * datasources are leased; DIRECT ones stay with the in-process scheduler.
 *
 * Records uploaded by agents land through the same
 * RecordMapper → createEngineChangeApplier pipeline as scheduled syncs, so
 * the same guarantees and the same caveats apply — including the
 * conflictResolution refusal: a declared strategy that cannot be enforced
 * (no field-provenance producer) is refused rather than silently ignored.
 */

import { createLogger } from '@altius/observability';
import type { RequestContext } from '@altius/spi';
import type { ObjectManager } from '@altius/engine';
import type { AgentGateway as AgentGatewayType, DatasourceMappingConfig } from '@altius/sync';
import type { ConnectorManifest } from './schema-loader.js';
import { createEngineChangeApplier } from './sync-boot.js';

const logger = createLogger('data-connection-boot');

export interface DataConnectionBootResult {
  gateway: AgentGatewayType | null;
  /** Datasources the gateway leases out. */
  leasable: string[];
}

/**
 * Parse pack connector manifests and build the agent gateway for every
 * leasable runtime-AGENT datasource. Per-datasource failures skip that
 * datasource loudly instead of failing boot — same posture as sync-boot.
 * Returns a null gateway when no datasource is leasable: enrollment with
 * nothing to lease would only invite agents that can never receive work.
 */
export async function startAgentGateway(opts: {
  connectorManifests: ConnectorManifest[];
  enrollmentSecret: string;
  objectManager: ObjectManager;
  tenantId: string;
}): Promise<DataConnectionBootResult> {
  const { connectorManifests, enrollmentSecret, objectManager, tenantId } = opts;

  const { AgentGateway, parseMappingObject } = await import('@altius/sync');
  const datasources: DatasourceMappingConfig[] = [];

  for (const manifest of connectorManifests) {
    let config: DatasourceMappingConfig;
    try {
      config = parseMappingObject(manifest.config);
    } catch {
      continue; // sync-boot already warns about unparseable manifests
    }
    if (config.runtime !== 'AGENT') continue;

    // Same refusal as sync-boot, same reason: both declarable strategies need
    // field provenance that nothing produces, so the datasource would sync
    // unprotected while the operator believes user edits are safe.
    if (config.sync.conflictResolution) {
      logger.error(
        { datasource: config.datasource, pack: manifest.packName, strategy: config.sync.conflictResolution },
        'Data connection: datasource declares conflictResolution but field provenance has no producer — not leasable',
      );
      continue;
    }

    // Checked here (not left to the applier factory, which throws) so one bad
    // manifest skips loudly instead of failing gateway construction.
    const keyField = config.mapping.primaryKey.target;
    if (keyField === 'id' || keyField.startsWith('_')) {
      logger.warn(
        { datasource: config.datasource, pack: manifest.packName, keyField },
        'Data connection: primaryKey.target is not upsertable — not leasable',
      );
      continue;
    }

    // connection.url is NOT env-resolved here: for an AGENT datasource the
    // ${ENV_VAR}s name credentials on the agent's host inside the customer
    // network. The platform passes the placeholder through and never sees
    // the secret.
    datasources.push(config);
  }

  if (datasources.length === 0) {
    logger.info('Data connection: no leasable runtime-AGENT datasources — gateway not started');
    return { gateway: null, leasable: [] };
  }

  const gateway = new AgentGateway({
    enrollmentSecret,
    datasources,
    changeApplierFactory: (config) => {
      const ctx: RequestContext = { tenantId, actorId: `sync:${config.datasource}` };
      return createEngineChangeApplier({
        objectManager,
        keyField: config.mapping.primaryKey.target,
        ctx,
      });
    },
  });
  const leasable = datasources.map((d) => d.datasource);
  logger.info({ leasable }, `Data connection: agent gateway ready (${leasable.length} leasable datasource(s))`);
  return { gateway, leasable };
}
