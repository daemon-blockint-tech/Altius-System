/**
 * Webhook ingest handler (T6).
 *
 * POST /api/v1/ingest/:datasource
 *
 * Accepts a single source record (or a batch array) from an external
 * webhook, authenticates via X-Ingest-Secret, applies the datasource's
 * mapping via RecordMapper, and upserts through the same
 * createEngineChangeApplier used by the sync scheduler.
 *
 * This is the push-based counterpart to the pull-based KafkaCdcSource —
 * both feed into the same CdcConsumer/ChangeApplier pipeline.
 */

import { parseMappingObject, RecordMapper, type DatasourceMappingConfig, type MappedObject } from '@altius/sync';
import type { ObjectManager } from '@altius/engine';
import type { RequestContext } from '@altius/spi';
import { createLogger } from '@altius/observability';
import { createEngineChangeApplier } from './sync-boot.js';

const logger = createLogger('ingest');

export interface IngestHandlerConfig {
  objectManager: ObjectManager;
  /** Map of datasource name → raw mapping config (from pack manifests). */
  datasourceMappings: Map<string, Record<string, unknown>>;
  /** Expected value of the X-Ingest-Secret header. */
  ingestSecret: string;
  /** Tenant for ingested objects. */
  tenantId: string;
}

export interface IngestRequest {
  /** Datasource name from the URL path. */
  datasource: string;
  /** Raw request body (single record or array). */
  body: unknown;
  /** Value of the X-Ingest-Secret header. */
  secret?: string;
}

export interface IngestResponse {
  status: number;
  body: { accepted: number; rejected: number; errors: string[] };
}

/**
 * Create an ingest handler that processes webhook-delivered source records.
 *
 * The handler:
 * 1. Authenticates via X-Ingest-Secret
 * 2. Looks up the datasource's mapping config
 * 3. Wraps each record as a SourceRecord (operation defaults to INSERT)
 * 4. Maps via RecordMapper and applies via createEngineChangeApplier
 */
export function createIngestHandler(config: IngestHandlerConfig) {
  const { objectManager, datasourceMappings, ingestSecret, tenantId } = config;

  return async (req: IngestRequest): Promise<IngestResponse> => {
    // 1. Authenticate
    if (!req.secret || req.secret !== ingestSecret) {
      return { status: 401, body: { accepted: 0, rejected: 0, errors: ['Unauthorized: invalid or missing X-Ingest-Secret'] } };
    }

    // 2. Look up mapping
    const rawMapping = datasourceMappings.get(req.datasource);
    if (!rawMapping) {
      return { status: 404, body: { accepted: 0, rejected: 0, errors: [`Unknown datasource: ${req.datasource}`] } };
    }

    let mappingConfig: DatasourceMappingConfig;
    try {
      mappingConfig = parseMappingObject(rawMapping);
    } catch (err) {
      return { status: 500, body: { accepted: 0, rejected: 0, errors: [`Mapping parse error: ${err instanceof Error ? err.message : String(err)}`] } };
    }

    const ctx: RequestContext = { tenantId, actorId: `ingest:${req.datasource}` };
    const keyField = mappingConfig.mapping.primaryKey.target;
    if (keyField === 'id' || keyField.startsWith('_')) {
      return { status: 500, body: { accepted: 0, rejected: 0, errors: [`primaryKey.target "${keyField}" is not upsertable`] } };
    }

    const apply = createEngineChangeApplier({ objectManager, keyField, ctx });
    const mapper = new RecordMapper(mappingConfig);

    // 3. Normalize body to an array of records
    const records = Array.isArray(req.body) ? req.body : [req.body];
    let accepted = 0;
    let rejected = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        if (!record || typeof record !== 'object') {
          throw new Error('Record must be a JSON object');
        }
        const sourceRecord = {
          table: mappingConfig.connection.table,
          key: {},
          data: record as Record<string, unknown>,
          operation: 'INSERT' as const,
          timestamp: new Date().toISOString(),
          checkpoint: { webhook: Date.now() },
        };
        const mapped: MappedObject = mapper.mapRecord(sourceRecord);
        await apply(mapped, req.datasource);
        accepted++;
      } catch (err) {
        rejected++;
        errors.push(err instanceof Error ? err.message : String(err));
        logger.warn(
          { datasource: req.datasource, err: err instanceof Error ? err.message : String(err) },
          'Ingest record rejected',
        );
      }
    }

    return { status: accepted > 0 ? 200 : 400, body: { accepted, rejected, errors } };
  };
}
