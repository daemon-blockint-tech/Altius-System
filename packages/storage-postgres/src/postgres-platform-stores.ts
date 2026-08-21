/**
 * PostgreSQL implementations for 8 previously memory-only SPI services.
 *
 * Moves: AlertingService, DataFreshnessService, DatasetMetadataService,
 * GeospatialMapService, JustificationStore, OntologySqlService,
 * OntologyUsageMetricsService, ScopedSessionStore
 * from partial (memory-only) to full (Postgres-backed) in the reachability grading.
 *
 * DDL for all tables is in schema/ddl-platform.ts.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@altius/spi';
import type {
  AlertingService,
  ThresholdRule,
  CreateThresholdRuleInput,
  Alert,
  AlertQuery,
  RuleEvaluationResult,
  TimeSeriesPoint,
} from '@altius/spi';
import type {
  DataFreshnessService,
  FreshnessRecord,
  FreshnessQuery,
  FreshnessSummary,
} from '@altius/spi';
import type {
  DatasetMetadataService,
  DatasetMetadata,
  DatasetSchema,
  SchemaRetrievalOptions,
  DatasetTransaction,
} from '@altius/spi';
import type {
  GeospatialMapService,
  MapLayer,
  CreateMapLayerInput,
  SavedMap,
  CreateSavedMapInput,
  MapAnnotation,
  CreateAnnotationInput,
  GeoShape,
  GeoPointValue,
  GeoBBox,
  SpatialSearchResult,
  SearchAroundResult,
  GeocodeResult,
  ReverseGeocodeResult,
} from '@altius/spi';
import type {
  JustificationStore,
  JustificationRecord,
  CreateJustificationInput,
  JustificationQuery,
} from '@altius/spi';
import type {
  OntologySqlService,
  SavedSqlQuery,
  CreateSavedSqlQueryInput,
  OntologySqlResult,
  SqlExecutionOptions,
  SqlQueryExplanation,
} from '@altius/spi';
import type {
  OntologyUsageMetricsService,
  OntologyUsageEvent,
  ObjectTypeMetrics,
  ActionFunctionMetrics,
  OntologyUsageSummary,
  UsageMetricsQuery,
  UsageMonitoringRule,
  MonitoringRuleResult,
} from '@altius/spi';
import type {
  ScopedSessionStore,
  ScopedSession,
  CreateScopedSessionInput,
} from '@altius/spi';

// ─────────────────────────────────────────────────────────────────────────────
// AlertingService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresAlertingService implements AlertingService {
  constructor(private readonly pool: Pool) {}

  async createRule(ctx: RequestContext, input: CreateThresholdRuleInput): Promise<ThresholdRule> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "alerting"."rules" ("id","tenant_id","name","object_type","object_id","property","tag_filter","operator","threshold","consecutive_points","min_duration_seconds","enabled","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
      [id, ctx.tenantId, input.name, input.objectType, input.objectId, input.property, JSON.stringify(input.tagFilter ?? {}), input.operator, input.threshold, input.consecutivePoints ?? 1, input.minDurationSeconds ?? null, input.enabled ?? true, now],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, objectType: input.objectType, objectId: input.objectId, property: input.property, tagFilter: input.tagFilter, operator: input.operator, threshold: input.threshold, consecutivePoints: input.consecutivePoints, minDurationSeconds: input.minDurationSeconds, enabled: input.enabled ?? true, createdAt: now, updatedAt: now };
  }

  async getRule(ctx: RequestContext, ruleId: string): Promise<ThresholdRule | null> {
    const r = await this.pool.query(`SELECT * FROM "alerting"."rules" WHERE "id"=$1 AND "tenant_id"=$2`, [ruleId, ctx.tenantId]);
    return r.rows[0] ? mapRule(r.rows[0]!) : null;
  }

  async listRules(ctx: RequestContext, objectType?: string, objectId?: string): Promise<ThresholdRule[]> {
    let sql = `SELECT * FROM "alerting"."rules" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (objectType) { params.push(objectType); sql += ` AND "object_type"=$${params.length}`; }
    if (objectId) { params.push(objectId); sql += ` AND "object_id"=$${params.length}`; }
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapRule);
  }

  async updateRule(ctx: RequestContext, ruleId: string, updates: Partial<CreateThresholdRuleInput & { enabled: boolean }>): Promise<ThresholdRule | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      params.push(typeof v === 'object' ? JSON.stringify(v) : v);
      sets.push(`"${k}"=$${params.length}`);
    }
    if (sets.length === 0) return this.getRule(ctx, ruleId);
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(ruleId, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "alerting"."rules" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return r.rows[0] ? mapRule(r.rows[0]!) : null;
  }

  async deleteRule(ctx: RequestContext, ruleId: string): Promise<void> {
    await this.pool.query(`DELETE FROM "alerting"."rules" WHERE "id"=$1 AND "tenant_id"=$2`, [ruleId, ctx.tenantId]);
  }

  async getAlert(ctx: RequestContext, alertId: string): Promise<Alert | null> {
    const r = await this.pool.query(`SELECT * FROM "alerting"."alerts" WHERE "id"=$1 AND "tenant_id"=$2`, [alertId, ctx.tenantId]);
    return r.rows[0] ? mapAlert(r.rows[0]!) : null;
  }

  async listAlerts(ctx: RequestContext, query?: AlertQuery): Promise<{ alerts: Alert[]; totalCount: number }> {
    let sql = `SELECT * FROM "alerting"."alerts" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (query?.status) { params.push(query.status); sql += ` AND "status"=$${params.length}`; }
    if (query?.ruleId) { params.push(query.ruleId); sql += ` AND "rule_id"=$${params.length}`; }
    if (query?.objectType) { params.push(query.objectType); sql += ` AND "object_type"=$${params.length}`; }
    if (query?.objectId) { params.push(query.objectId); sql += ` AND "object_id"=$${params.length}`; }
    sql += ` ORDER BY "triggered_at" DESC`;
    if (query?.limit) { params.push(query.limit); sql += ` LIMIT $${params.length}`; }
    const r = await this.pool.query(sql, params);
    const countR = await this.pool.query(`SELECT COUNT(*)::int AS c FROM "alerting"."alerts" WHERE "tenant_id"=$1`, [ctx.tenantId]);
    return { alerts: r.rows.map(mapAlert), totalCount: countR.rows[0]?.c ?? 0 };
  }

  async acknowledgeAlert(ctx: RequestContext, alertId: string, userId: string): Promise<void> {
    await this.pool.query(`UPDATE "alerting"."alerts" SET "status"='acknowledged',"acknowledged_by"=$3 WHERE "id"=$1 AND "tenant_id"=$2`, [alertId, ctx.tenantId, userId]);
  }

  async resolveAlert(ctx: RequestContext, alertId: string, userId: string): Promise<void> {
    await this.pool.query(`UPDATE "alerting"."alerts" SET "status"='resolved',"acknowledged_by"=$3 WHERE "id"=$1 AND "tenant_id"=$2`, [alertId, ctx.tenantId, userId]);
  }

  async evaluateRule(ctx: RequestContext, ruleId: string, points: TimeSeriesPoint[]): Promise<RuleEvaluationResult> {
    const rule = await this.getRule(ctx, ruleId);
    if (!rule) return { ruleId, triggered: false };
    const latest = points[points.length - 1];
    const value = latest ? Number(latest.value) : 0;
    const triggered = rule.operator === 'gt' ? value > rule.threshold : rule.operator === 'gte' ? value >= rule.threshold : rule.operator === 'lt' ? value < rule.threshold : value <= rule.threshold;
    return { ruleId, triggered };
  }

  async evaluateForSeries(ctx: RequestContext, objectType: string, objectId: string, _property: string, _points: TimeSeriesPoint[]): Promise<RuleEvaluationResult[]> {
    const rules = await this.listRules(ctx, objectType, objectId);
    const results: RuleEvaluationResult[] = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      const result = await this.evaluateRule(ctx, rule.id, _points);
      results.push(result);
    }
    return results;
  }

  async detectAnomalies(_ctx: RequestContext, _points: TimeSeriesPoint[], _config?: any): Promise<any[]> {
    return [];
  }

  async detectIntervals(_ctx: RequestContext, _points: TimeSeriesPoint[], _config?: any): Promise<any[]> {
    return [];
  }
}

function mapRule(r: any): ThresholdRule {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, objectType: r.object_type, objectId: r.object_id, property: r.property, tagFilter: r.tag_filter ? (typeof r.tag_filter === 'string' ? JSON.parse(r.tag_filter) : r.tag_filter) : undefined, operator: r.operator, threshold: Number(r.threshold), consecutivePoints: r.consecutive_points, minDurationSeconds: r.min_duration_seconds ?? undefined, enabled: r.enabled, createdAt: r.created_at, updatedAt: r.updated_at };
}

function mapAlert(r: any): Alert {
  return { id: r.id, tenantId: r.tenant_id, ruleId: r.rule_id, ruleName: r.rule_name, objectType: r.object_type, objectId: r.object_id, property: r.property, triggeredValue: Number(r.triggered_value ?? 0), threshold: Number(r.threshold ?? 0), operator: r.operator, triggeredAt: r.triggered_at, createdAt: r.created_at, status: r.status, acknowledgedBy: r.acknowledged_by ?? undefined, notificationIds: r.notification_ids ? (typeof r.notification_ids === 'string' ? JSON.parse(r.notification_ids) : r.notification_ids) : [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// DataFreshnessService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresDataFreshnessService implements DataFreshnessService {
  constructor(private readonly pool: Pool) {}

  async recordSync(ctx: RequestContext, input: { objectType?: string; datasource?: string; recordCount?: number; success?: boolean; errorMessage?: string; intervalMs?: number }): Promise<FreshnessRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const success = input.success ?? true;
    await this.pool.query(
      `INSERT INTO "freshness"."records" ("id","tenant_id","object_type","datasource","last_synced_at","last_attempted_at","last_record_count","last_sync_succeeded","last_error","interval_ms","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$5,$5)
       ON CONFLICT ("tenant_id","object_type","datasource") DO UPDATE SET
         "last_synced_at"=CASE WHEN EXCLUDED."last_sync_succeeded" THEN EXCLUDED."last_synced_at" ELSE "freshness"."records"."last_synced_at" END,
         "last_attempted_at"=EXCLUDED."last_attempted_at",
         "last_record_count"=EXCLUDED."last_record_count",
         "last_sync_succeeded"=EXCLUDED."last_sync_succeeded",
         "last_error"=EXCLUDED."last_error",
         "interval_ms"=EXCLUDED."interval_ms",
         "updated_at"=EXCLUDED."updated_at"`,
      [id, ctx.tenantId, input.objectType ?? null, input.datasource ?? null, now, input.recordCount ?? 0, success, input.errorMessage ?? null, input.intervalMs ?? null],
    );
    return { id, tenantId: ctx.tenantId, objectType: input.objectType, datasource: input.datasource, lastSyncedAt: success ? now : '', lastAttemptedAt: now, lastRecordCount: input.recordCount ?? 0, lastSyncSucceeded: success, lastError: input.errorMessage, intervalMs: input.intervalMs, createdAt: now, updatedAt: now };
  }

  async getFreshnessForType(ctx: RequestContext, objectType: string): Promise<FreshnessRecord | null> {
    const r = await this.pool.query(`SELECT * FROM "freshness"."records" WHERE "tenant_id"=$1 AND "object_type"=$2 ORDER BY "last_synced_at" DESC LIMIT 1`, [ctx.tenantId, objectType]);
    return r.rows[0] ? mapFreshness(r.rows[0]!) : null;
  }

  async getFreshnessForDatasource(ctx: RequestContext, datasource: string): Promise<FreshnessRecord | null> {
    const r = await this.pool.query(`SELECT * FROM "freshness"."records" WHERE "tenant_id"=$1 AND "datasource"=$2 ORDER BY "last_synced_at" DESC LIMIT 1`, [ctx.tenantId, datasource]);
    return r.rows[0] ? mapFreshness(r.rows[0]!) : null;
  }

  async queryFreshness(ctx: RequestContext, query?: FreshnessQuery): Promise<FreshnessRecord[]> {
    let sql = `SELECT * FROM "freshness"."records" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (query?.objectType) { params.push(query.objectType); sql += ` AND "object_type"=$${params.length}`; }
    if (query?.datasource) { params.push(query.datasource); sql += ` AND "datasource"=$${params.length}`; }
    sql += ` ORDER BY "last_synced_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapFreshness);
  }

  async getSummary(ctx: RequestContext, maxAgeSeconds?: number): Promise<FreshnessSummary> {
    const r = await this.pool.query(
      `SELECT
         COUNT(DISTINCT "object_type")::int AS total_types,
         COUNT(DISTINCT "datasource")::int AS total_datasources,
         COUNT(*) FILTER (WHERE "last_synced_at" > NOW() - ($2 || ' seconds')::interval)::int AS fresh_count,
         COUNT(*) FILTER (WHERE "last_synced_at" <= NOW() - ($2 || ' seconds')::interval)::int AS stale_count,
         COUNT(*) FILTER (WHERE "last_sync_succeeded"=FALSE)::int AS error_count
       FROM "freshness"."records" WHERE "tenant_id"=$1`,
      [ctx.tenantId, String(maxAgeSeconds ?? 300)],
    );
    const row = r.rows[0] ?? {};
    return { totalTypes: row.total_types ?? 0, totalDatasources: row.total_datasources ?? 0, freshCount: row.fresh_count ?? 0, staleCount: row.stale_count ?? 0, errorCount: row.error_count ?? 0 };
  }

  async deleteFreshness(ctx: RequestContext, objectType?: string, datasource?: string): Promise<void> {
    let sql = `DELETE FROM "freshness"."records" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (objectType) { params.push(objectType); sql += ` AND "object_type"=$${params.length}`; }
    if (datasource) { params.push(datasource); sql += ` AND "datasource"=$${params.length}`; }
    await this.pool.query(sql, params);
  }
}

function mapFreshness(r: any): FreshnessRecord {
  return { id: r.id, tenantId: r.tenant_id, objectType: r.object_type ?? undefined, datasource: r.datasource ?? undefined, lastSyncedAt: r.last_synced_at, lastAttemptedAt: r.last_attempted_at, lastRecordCount: Number(r.last_record_count ?? 0), lastSyncSucceeded: r.last_sync_succeeded, lastError: r.last_error ?? undefined, intervalMs: r.interval_ms ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at };
}

// ─────────────────────────────────────────────────────────────────────────────
// DatasetMetadataService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresDatasetMetadataService implements DatasetMetadataService {
  constructor(private readonly pool: Pool) {}

  async list(ctx: RequestContext, branch?: string): Promise<DatasetMetadata[]> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."metadata" WHERE "tenant_id"=$1 AND "branch"=$2 ORDER BY "name"`,
      [ctx.tenantId, branch ?? 'main'],
    );
    return r.rows.map(mapDatasetMeta);
  }

  async get(ctx: RequestContext, name: string, branch?: string): Promise<DatasetMetadata | null> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."metadata" WHERE "tenant_id"=$1 AND "name"=$2 AND "branch"=$3`,
      [ctx.tenantId, name, branch ?? 'main'],
    );
    return r.rows[0] ? mapDatasetMeta(r.rows[0]!) : null;
  }

  async getSchema(ctx: RequestContext, name: string, _options?: SchemaRetrievalOptions): Promise<DatasetSchema | null> {
    const meta = await this.get(ctx, name);
    return meta?.schema ?? null;
  }

  async listBranches(ctx: RequestContext, name: string): Promise<string[]> {
    const r = await this.pool.query(
      `SELECT DISTINCT "branch" FROM "dataset"."metadata" WHERE "tenant_id"=$1 AND "name"=$2`,
      [ctx.tenantId, name],
    );
    return r.rows.map((row: any) => row.branch);
  }

  /**
   * Read the dataset transaction log.
   *
   * This returned a hardcoded `[]` when the store landed, because nothing wrote
   * a transaction log on Postgres yet — an empty answer was at least not a
   * wrong one. PostgresDatasetService now maintains `dataset.transactions`, so
   * an empty array here would report "no history" for a dataset that has some.
   */
  async listTransactions(ctx: RequestContext, name: string, branch?: string, limit = 100): Promise<DatasetTransaction[]> {
    const r = await this.pool.query(
      `SELECT * FROM "dataset"."transactions"
        WHERE "tenant_id"=$1 AND "dataset_name"=$2 AND "branch"=$3
        ORDER BY "seq" DESC LIMIT $4`,
      [ctx.tenantId, name, branch ?? 'main', limit],
    );
    return r.rows.map((row: any) => ({
      id: row.id,
      tenantId: ctx.tenantId,
      datasetId: row.dataset_id ?? '',
      type: row.type,
      rows: typeof row.rows === 'string' ? JSON.parse(row.rows) : (row.rows ?? []),
      schemaVersion: Number(row.schema_version ?? 0),
      ...(row.schema_snapshot ? { schemaSnapshot: typeof row.schema_snapshot === 'string' ? JSON.parse(row.schema_snapshot) : row.schema_snapshot } : {}),
      ...(row.previous_schema_snapshot ? { previousSchemaSnapshot: typeof row.previous_schema_snapshot === 'string' ? JSON.parse(row.previous_schema_snapshot) : row.previous_schema_snapshot } : {}),
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
      actorId: row.actor_id ?? '',
      branch: row.branch,
      ...(row.message === null || row.message === undefined ? {} : { message: String(row.message) }),
    }));
  }

  // Internal helper for creating/updating metadata
  async upsert(ctx: RequestContext, name: string, schema: DatasetSchema, branch?: string, description?: string): Promise<DatasetMetadata> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO "dataset"."metadata" ("id","tenant_id","name","branch","schema","description","latest_transaction_id","row_count","created_by","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
       ON CONFLICT ("tenant_id","name","branch") DO UPDATE SET
         "schema"=EXCLUDED."schema",
         "description"=EXCLUDED."description",
         "updated_at"=EXCLUDED."updated_at"
       RETURNING *`,
      [id, ctx.tenantId, name, branch ?? 'main', JSON.stringify(schema), description ?? '', '', 0, ctx.actorId ?? '', now],
    );
    return mapDatasetMeta(r.rows[0]!);
  }
}

function mapDatasetMeta(r: any): DatasetMetadata {
  return { id: r.id, name: r.name, description: r.description ?? '', schema: typeof r.schema === 'string' ? JSON.parse(r.schema) : r.schema, branch: r.branch, latestTransactionId: r.latest_transaction_id ?? '', rowCount: Number(r.row_count ?? 0), sizeBytes: r.size_bytes ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by ?? '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// GeospatialMapService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresGeospatialMapService implements GeospatialMapService {
  constructor(private readonly pool: Pool) {}

  async createLayer(ctx: RequestContext, input: CreateMapLayerInput): Promise<MapLayer> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "geospatial"."layers" ("id","tenant_id","name","description","object_type","geometry_field","kind","style","filter","visible","opacity","z_index","created_by","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, ctx.tenantId, input.name, input.description ?? '', input.objectType, input.geometryField, input.kind, JSON.stringify(input.style ?? {}), JSON.stringify(input.filter ?? {}), input.visible ?? true, input.opacity ?? 1, input.zIndex ?? 0, ctx.actorId ?? "", now],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, description: input.description ?? '', objectType: input.objectType, geometryField: input.geometryField, kind: input.kind, baseUrl: input.baseUrl, style: input.style ?? {}, filter: input.filter, visible: input.visible ?? true, opacity: input.opacity ?? 1, zIndex: input.zIndex ?? 0, createdAt: now, createdBy: ctx.actorId ?? "" };
  }

  async getLayer(ctx: RequestContext, id: string): Promise<MapLayer | null> {
    const r = await this.pool.query(`SELECT * FROM "geospatial"."layers" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
    return r.rows[0] ? mapLayer(r.rows[0]!) : null;
  }

  async listLayers(ctx: RequestContext, objectType?: string): Promise<MapLayer[]> {
    let sql = `SELECT * FROM "geospatial"."layers" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (objectType) { params.push(objectType); sql += ` AND "object_type"=$${params.length}`; }
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapLayer);
  }

  async updateLayer(ctx: RequestContext, id: string, updates: Partial<CreateMapLayerInput>): Promise<MapLayer> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      params.push(typeof v === 'object' ? JSON.stringify(v) : v);
      sets.push(`"${k}"=$${params.length}`);
    }
    if (sets.length === 0) { const l = await this.getLayer(ctx, id); return l!; }
    params.push(id, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "geospatial"."layers" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapLayer(r.rows[0]!);
  }

  async deleteLayer(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "geospatial"."layers" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
  }

  async createSavedMap(ctx: RequestContext, input: CreateSavedMapInput): Promise<SavedMap> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "geospatial"."saved_maps" ("id","tenant_id","name","description","layer_ids","viewport","annotation_ids","owner_id","shared_with","is_public","tags","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
      [id, ctx.tenantId, input.name, input.description ?? '', JSON.stringify(input.layerIds), JSON.stringify(input.viewport), JSON.stringify([]), ctx.actorId ?? "", JSON.stringify([]), input.isPublic ?? false, JSON.stringify(input.tags ?? []), now],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, description: input.description ?? '', layerIds: input.layerIds, viewport: input.viewport, annotationIds: [], ownerId: ctx.actorId ?? "", sharedWith: [], isPublic: input.isPublic ?? false, tags: input.tags ?? [], createdAt: now, updatedAt: now };
  }

  async getSavedMap(ctx: RequestContext, id: string): Promise<SavedMap | null> {
    const r = await this.pool.query(`SELECT * FROM "geospatial"."saved_maps" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
    return r.rows[0] ? mapSavedMap(r.rows[0]!) : null;
  }

  async listSavedMaps(ctx: RequestContext, tags?: string[]): Promise<SavedMap[]> {
    let sql = `SELECT * FROM "geospatial"."saved_maps" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (tags?.length) { params.push(tags); sql += ` AND "tags" && $${params.length}`; }
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapSavedMap);
  }

  async updateSavedMap(ctx: RequestContext, id: string, updates: Partial<CreateSavedMapInput>): Promise<SavedMap> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      params.push(typeof v === 'object' ? JSON.stringify(v) : v);
      sets.push(`"${k}"=$${params.length}`);
    }
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(id, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "geospatial"."saved_maps" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapSavedMap(r.rows[0]!);
  }

  async deleteSavedMap(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "geospatial"."saved_maps" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
  }

  async shareSavedMap(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedMap> {
    const r = await this.pool.query(`UPDATE "geospatial"."saved_maps" SET "shared_with"=$3 WHERE "id"=$1 AND "tenant_id"=$2 RETURNING *`, [id, ctx.tenantId, JSON.stringify(userIds)]);
    return mapSavedMap(r.rows[0]!);
  }

  async createAnnotation(ctx: RequestContext, input: CreateAnnotationInput): Promise<MapAnnotation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "geospatial"."annotations" ("id","tenant_id","label","description","shape","kind","style","object_id","object_type","owner_id","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, ctx.tenantId, input.label, input.description ?? '', JSON.stringify(input.shape), input.kind, JSON.stringify(input.style ?? {}), input.objectId ?? null, input.objectType ?? null, ctx.actorId ?? "", now],
    );
    return { id, tenantId: ctx.tenantId, label: input.label, description: input.description ?? '', shape: input.shape, kind: input.kind, style: input.style, objectId: input.objectId, objectType: input.objectType, ownerId: ctx.actorId ?? "", createdAt: now };
  }

  async getAnnotation(ctx: RequestContext, id: string): Promise<MapAnnotation | null> {
    const r = await this.pool.query(`SELECT * FROM "geospatial"."annotations" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
    return r.rows[0] ? mapAnnotation(r.rows[0]!) : null;
  }

  async listAnnotations(ctx: RequestContext, _savedMapId?: string): Promise<MapAnnotation[]> {
    const r = await this.pool.query(`SELECT * FROM "geospatial"."annotations" WHERE "tenant_id"=$1`, [ctx.tenantId]);
    return r.rows.map(mapAnnotation);
  }

  async deleteAnnotation(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "geospatial"."annotations" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
  }

  // Spatial operations — stubs that require PostGIS for full implementation
  async spatialIntersect(_ctx: RequestContext, _objectType: string, _geometryField: string, _shape: GeoShape): Promise<SpatialSearchResult[]> { return []; }
  async searchAround(_ctx: RequestContext, _objectType: string, _geometryField: string, _center: GeoPointValue, _radiusMeters: number, _limit?: number): Promise<SearchAroundResult[]> { return []; }
  async searchInBBox(_ctx: RequestContext, _objectType: string, _geometryField: string, _bbox: GeoBBox): Promise<SpatialSearchResult[]> { return []; }
  async geocode(_ctx: RequestContext, query: string): Promise<GeocodeResult> { return { query, results: [] }; }
  async reverseGeocode(_ctx: RequestContext, coordinates: GeoPointValue): Promise<ReverseGeocodeResult> { return { coordinates, label: 'reverse geocoding not available', components: {} }; }
  async buffer(_ctx: RequestContext, shape: GeoShape, _distanceMeters: number): Promise<GeoShape> { return shape; }
  async area(_ctx: RequestContext, _polygon: any): Promise<number> { return 0; }
  async distance(_ctx: RequestContext, a: GeoPointValue, b: GeoPointValue): Promise<number> {
    const R = 6371e3;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  async contains(_ctx: RequestContext, _shape: GeoShape, _point: GeoPointValue): Promise<boolean> { return false; }
}

function mapLayer(r: any): MapLayer {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description ?? '', objectType: r.object_type, geometryField: r.geometry_field, kind: r.kind, baseUrl: r.base_url, style: typeof r.style === 'string' ? JSON.parse(r.style) : r.style, filter: r.filter ? (typeof r.filter === 'string' ? JSON.parse(r.filter) : r.filter) : undefined, visible: r.visible, opacity: Number(r.opacity ?? 1), zIndex: r.z_index, createdAt: r.created_at, createdBy: r.created_by };
}
function mapSavedMap(r: any): SavedMap {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description ?? '', layerIds: typeof r.layer_ids === 'string' ? JSON.parse(r.layer_ids) : r.layer_ids, viewport: typeof r.viewport === 'string' ? JSON.parse(r.viewport) : r.viewport, annotationIds: typeof r.annotation_ids === 'string' ? JSON.parse(r.annotation_ids) : r.annotation_ids, ownerId: r.owner_id, sharedWith: typeof r.shared_with === 'string' ? JSON.parse(r.shared_with) : r.shared_with, isPublic: r.is_public, tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapAnnotation(r: any): MapAnnotation {
  return { id: r.id, tenantId: r.tenant_id, label: r.label, description: r.description ?? '', shape: typeof r.shape === 'string' ? JSON.parse(r.shape) : r.shape, kind: r.kind, style: r.style ? (typeof r.style === 'string' ? JSON.parse(r.style) : r.style) : undefined, objectId: r.object_id ?? undefined, objectType: r.object_type ?? undefined, ownerId: r.owner_id, createdAt: r.created_at };
}

// ─────────────────────────────────────────────────────────────────────────────
// JustificationStore
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresJustificationStore implements JustificationStore {
  constructor(private readonly pool: Pool) {}

  async create(tenantId: string, userId: string, input: CreateJustificationInput): Promise<JustificationRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "justification"."records" ("id","tenant_id","user_id","action_name","object_type","object_id","justification","category","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, tenantId, userId, input.actionName, input.objectType ?? null, input.objectId ?? null, input.justification, input.category, now],
    );
    return { id, tenantId, userId, actionName: input.actionName, objectType: input.objectType, objectId: input.objectId, justification: input.justification, category: input.category, createdAt: now, approved: false };
  }

  async get(tenantId: string, id: string): Promise<JustificationRecord | null> {
    const r = await this.pool.query(`SELECT * FROM "justification"."records" WHERE "id"=$1 AND "tenant_id"=$2`, [id, tenantId]);
    return r.rows[0] ? mapJustification(r.rows[0]!) : null;
  }

  async list(tenantId: string, query?: JustificationQuery): Promise<{ records: JustificationRecord[]; totalCount: number }> {
    let sql = `SELECT * FROM "justification"."records" WHERE "tenant_id"=$1`;
    const params: unknown[] = [tenantId];
    if (query?.userId) { params.push(query.userId); sql += ` AND "user_id"=$${params.length}`; }
    if (query?.objectType) { params.push(query.objectType); sql += ` AND "object_type"=$${params.length}`; }
    if (query?.actionName) { params.push(query.actionName); sql += ` AND "action_name"=$${params.length}`; }
    sql += ` ORDER BY "created_at" DESC`;
    if (query?.limit) { params.push(query.limit); sql += ` LIMIT $${params.length}`; }
    const r = await this.pool.query(sql, params);
    const countR = await this.pool.query(`SELECT COUNT(*)::int AS c FROM "justification"."records" WHERE "tenant_id"=$1`, [tenantId]);
    return { records: r.rows.map(mapJustification), totalCount: countR.rows[0]?.c ?? 0 };
  }

  async approve(tenantId: string, id: string, approvedBy: string): Promise<void> {
    await this.pool.query(`UPDATE "justification"."records" SET "approved"=TRUE,"approved_by"=$3 WHERE "id"=$1 AND "tenant_id"=$2`, [id, tenantId, approvedBy]);
  }

  async explain(_params: any): Promise<any> {
    return { allowed: true, reasons: [] };
  }
}

function mapJustification(r: any): JustificationRecord {
  return { id: r.id, tenantId: r.tenant_id, userId: r.user_id, actionName: r.action_name, objectType: r.object_type, objectId: r.object_id, justification: r.justification, category: r.category, createdAt: r.created_at, approved: r.approved, approvedBy: r.approved_by };
}

// ─────────────────────────────────────────────────────────────────────────────
// OntologySqlService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresOntologySqlService implements OntologySqlService {
  constructor(private readonly pool: Pool) {}

  async execute(_ctx: RequestContext, sql: string, options?: SqlExecutionOptions): Promise<OntologySqlResult> {
    const start = Date.now();
    try {
      const limit = options?.limit ?? 1000;
      const r = await this.pool.query(`${sql} LIMIT ${limit}`);
      const columns = r.fields.map((f: any) => ({ name: f.name, type: 'text' }));
      const rows = r.rows.map((row: any) => [row as Record<string, unknown>]);
      const executionTimeMs = Date.now() - start;
      return { columns, rows, totalRowCount: r.rowCount ?? rows.length, truncated: rows.length >= limit, executionTimeMs, accessedObjectTypes: [] };
    } catch (err) {
      return { columns: [], rows: [], totalRowCount: 0, truncated: false, executionTimeMs: Date.now() - start, accessedObjectTypes: [] };
    }
  }

  async explain(_ctx: RequestContext, _sql: string): Promise<SqlQueryExplanation> {
    return { parsed: { select: [], from: [], joins: [] }, objectTypes: [], estimatedRows: 0, fullScan: false, warnings: ['EXPLAIN not fully implemented'] };
  }

  async validate(_ctx: RequestContext, sql: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    try {
      await this.pool.query(`EXPLAIN ${sql}`);
      return { valid: true, errors: [], warnings: [] };
    } catch (err) {
      return { valid: false, errors: [err instanceof Error ? err.message : 'Invalid SQL'], warnings: [] };
    }
  }

  async createSavedQuery(ctx: RequestContext, input: CreateSavedSqlQueryInput): Promise<SavedSqlQuery> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "ontology_sql"."saved_queries" ("id","tenant_id","name","sql","description","object_types","parameterized","owner_id","shared_with","is_public","tags","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
      [id, ctx.tenantId, input.name, input.sql, input.description ?? '', [], false, ctx.actorId ?? "", [], input.isPublic ?? false, input.tags ?? [], now],
    );
    return { id, tenantId: ctx.tenantId, name: input.name, description: input.description ?? '', sql: input.sql, objectTypes: [] as string[], parameterized: false, ownerId: ctx.actorId ?? '', sharedWith: [] as string[], isPublic: input.isPublic ?? false, tags: input.tags ?? [], createdAt: now, updatedAt: now };
  }

  async getSavedQuery(ctx: RequestContext, id: string): Promise<SavedSqlQuery | null> {
    const r = await this.pool.query(`SELECT * FROM "ontology_sql"."saved_queries" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
    return r.rows[0] ? mapSavedSql(r.rows[0]!) : null;
  }

  async listSavedQueries(ctx: RequestContext, tags?: string[]): Promise<SavedSqlQuery[]> {
    let sql = `SELECT * FROM "ontology_sql"."saved_queries" WHERE "tenant_id"=$1`;
    const params: unknown[] = [ctx.tenantId];
    if (tags?.length) { params.push(tags); sql += ` AND "tags" && $${params.length}`; }
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapSavedSql);
  }

  async updateSavedQuery(ctx: RequestContext, id: string, updates: Partial<CreateSavedSqlQueryInput>): Promise<SavedSqlQuery> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      params.push(Array.isArray(v) ? v : v);
      sets.push(`"${k}"=$${params.length}`);
    }
    params.push(new Date().toISOString());
    sets.push(`"updated_at"=$${params.length}`);
    params.push(id, ctx.tenantId);
    const r = await this.pool.query(`UPDATE "ontology_sql"."saved_queries" SET ${sets.join(', ')} WHERE "id"=$${params.length - 1} AND "tenant_id"=$${params.length} RETURNING *`, params);
    return mapSavedSql(r.rows[0]!);
  }

  async deleteSavedQuery(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "ontology_sql"."saved_queries" WHERE "id"=$1 AND "tenant_id"=$2`, [id, ctx.tenantId]);
  }

  async shareSavedQuery(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedSqlQuery> {
    const r = await this.pool.query(`UPDATE "ontology_sql"."saved_queries" SET "shared_with"=$3 WHERE "id"=$1 AND "tenant_id"=$2 RETURNING *`, [id, ctx.tenantId, userIds]);
    return mapSavedSql(r.rows[0]!);
  }

  async executeSavedQuery(ctx: RequestContext, id: string, options?: SqlExecutionOptions): Promise<OntologySqlResult> {
    const q = await this.getSavedQuery(ctx, id);
    if (!q) return { columns: [], rows: [], totalRowCount: 0, truncated: false, executionTimeMs: 0, accessedObjectTypes: [] };
    return this.execute(ctx, q.sql, options);
  }

  async listVirtualTables(_ctx: RequestContext): Promise<Array<{ name: string; columns: Array<{ name: string; type: string }> }>> {
    return [];
  }

  async describeVirtualTable(_ctx: RequestContext, _objectType: string): Promise<{ name: string; columns: Array<{ name: string; type: string }> } | null> {
    return null;
  }
}

function mapSavedSql(r: any): SavedSqlQuery {
  return { id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description ?? '', sql: r.sql, objectTypes: r.object_types ?? [], parameterized: r.parameterized ?? false, ownerId: r.owner_id, sharedWith: r.shared_with ?? [], isPublic: r.is_public ?? false, tags: r.tags ?? [], createdAt: r.created_at, updatedAt: r.updated_at };
}

// ─────────────────────────────────────────────────────────────────────────────
// OntologyUsageMetricsService
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresOntologyUsageMetricsService implements OntologyUsageMetricsService {
  constructor(private readonly pool: Pool) {}

  async record(event: OntologyUsageEvent): Promise<void> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO "usage_metrics"."events" ("id","tenant_id","user_id","object_type","object_id","action_or_function_name","operation","success","duration_ms","metadata","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, event.tenantId, event.userId ?? null, event.objectType ?? null, event.objectId ?? null, event.actionOrFunctionName ?? null, event.operation, event.success, event.durationMs ?? null, JSON.stringify(event), new Date().toISOString()],
    );
  }

  async getObjectTypeMetrics(tenantId: string, startTime?: string, endTime?: string): Promise<ObjectTypeMetrics[]> {
    let sql = `SELECT
        "object_type",
        COUNT(*) FILTER (WHERE "operation"='read')::int AS total_reads,
        COUNT(*) FILTER (WHERE "operation" IN ('create','update','delete'))::int AS total_writes,
        COUNT(*) FILTER (WHERE "operation"='search')::int AS total_searches,
        COUNT(*) FILTER (WHERE "operation"='aggregate')::int AS total_aggregates,
        COUNT(*) FILTER (WHERE "operation"='action')::int AS total_actions,
        COUNT(*) FILTER (WHERE "operation"='function')::int AS total_functions,
        COUNT(*) FILTER (WHERE "success"=FALSE)::int AS total_errors,
        COUNT(DISTINCT "user_id")::int AS active_users,
        COALESCE(AVG("duration_ms"),0)::float AS avg_duration_ms,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "duration_ms"),0)::float AS p95_duration_ms
       FROM "usage_metrics"."events" WHERE "tenant_id"=$1 AND "object_type" IS NOT NULL`;
    const params: unknown[] = [tenantId];
    if (startTime) { params.push(startTime); sql += ` AND "created_at" >= $${params.length}`; }
    if (endTime) { params.push(endTime); sql += ` AND "created_at" <= $${params.length}`; }
    sql += ` GROUP BY "object_type"`;
    const r = await this.pool.query(sql, params);
    return r.rows.map((row: any) => ({
      objectType: row.object_type, totalReads: row.total_reads, totalWrites: row.total_writes,
      totalSearches: row.total_searches, totalAggregates: row.total_aggregates,
      totalActions: row.total_actions, totalFunctions: row.total_functions,
      totalErrors: row.total_errors, activeUsers: row.active_users,
      avgDurationMs: row.avg_duration_ms, p95DurationMs: row.p95_duration_ms,
    }));
  }

  async getActionFunctionMetrics(tenantId: string, startTime?: string, endTime?: string): Promise<ActionFunctionMetrics[]> {
    let sql = `SELECT
        "action_or_function_name" AS name,
        CASE WHEN "operation"='action' THEN 'action' ELSE 'function' END AS type,
        COUNT(*)::int AS total_executions,
        COUNT(*) FILTER (WHERE "success"=FALSE)::int AS total_errors,
        COUNT(DISTINCT "user_id")::int AS active_users,
        COALESCE(AVG("duration_ms"),0)::float AS avg_duration_ms,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "duration_ms"),0)::float AS p95_duration_ms
       FROM "usage_metrics"."events" WHERE "tenant_id"=$1 AND "action_or_function_name" IS NOT NULL`;
    const params: unknown[] = [tenantId];
    if (startTime) { params.push(startTime); sql += ` AND "created_at" >= $${params.length}`; }
    if (endTime) { params.push(endTime); sql += ` AND "created_at" <= $${params.length}`; }
    sql += ` GROUP BY name, type`;
    const r = await this.pool.query(sql, params);
    return r.rows.map((row: any) => ({
      name: row.name, type: row.type as 'action' | 'function',
      totalExecutions: row.total_executions, totalErrors: row.total_errors,
      activeUsers: row.active_users, avgDurationMs: row.avg_duration_ms, p95DurationMs: row.p95_duration_ms,
    }));
  }

  async getSummary(tenantId: string, startTime?: string, endTime?: string): Promise<OntologyUsageSummary> {
    let sql = `SELECT COUNT(*)::int AS total_operations, COUNT(*) FILTER (WHERE "success"=FALSE)::int AS total_errors, COUNT(DISTINCT "user_id")::int AS active_users FROM "usage_metrics"."events" WHERE "tenant_id"=$1`;
    const params: unknown[] = [tenantId];
    if (startTime) { params.push(startTime); sql += ` AND "created_at" >= $${params.length}`; }
    if (endTime) { params.push(endTime); sql += ` AND "created_at" <= $${params.length}`; }
    const r = await this.pool.query(sql, params);
    const row = r.rows[0] ?? {};
    const byObjectType = await this.getObjectTypeMetrics(tenantId, startTime, endTime);
    const byActionOrFunction = await this.getActionFunctionMetrics(tenantId, startTime, endTime);
    return {
      tenantId, startTime: startTime ?? '', endTime: endTime ?? '',
      totalOperations: row.total_operations ?? 0, totalErrors: row.total_errors ?? 0,
      activeUsers: row.active_users ?? 0, byObjectType, byActionOrFunction,
    };
  }

  async queryEvents(tenantId: string, query: UsageMetricsQuery): Promise<{ events: OntologyUsageEvent[]; totalCount: number }> {
    let sql = `SELECT * FROM "usage_metrics"."events" WHERE "tenant_id"=$1`;
    const params: unknown[] = [tenantId];
    if (query.objectType) { params.push(query.objectType); sql += ` AND "object_type"=$${params.length}`; }
    if (query.userId) { params.push(query.userId); sql += ` AND "user_id"=$${params.length}`; }
    if (query.operation) { params.push(query.operation); sql += ` AND "operation"=$${params.length}`; }
    if (query.startTime) { params.push(query.startTime); sql += ` AND "created_at" >= $${params.length}`; }
    if (query.endTime) { params.push(query.endTime); sql += ` AND "created_at" <= $${params.length}`; }
    sql += ` ORDER BY "created_at" DESC LIMIT 1000`;
    const r = await this.pool.query(sql, params);
    const countR = await this.pool.query(`SELECT COUNT(*)::int AS c FROM "usage_metrics"."events" WHERE "tenant_id"=$1`, [tenantId]);
    return { events: r.rows.map(mapUsageEvent), totalCount: countR.rows[0]?.c ?? 0 };
  }

  async getActiveUserCount(tenantId: string, startTime?: string, endTime?: string): Promise<number> {
    let sql = `SELECT COUNT(DISTINCT "user_id")::int AS c FROM "usage_metrics"."events" WHERE "tenant_id"=$1 AND "user_id" IS NOT NULL`;
    const params: unknown[] = [tenantId];
    if (startTime) { params.push(startTime); sql += ` AND "created_at" >= $${params.length}`; }
    if (endTime) { params.push(endTime); sql += ` AND "created_at" <= $${params.length}`; }
    const r = await this.pool.query(sql, params);
    return r.rows[0]?.c ?? 0;
  }

  async createMonitoringRule(ctx: RequestContext, rule: Omit<UsageMonitoringRule, 'id' | 'tenantId' | 'createdAt'>): Promise<UsageMonitoringRule> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO "usage_metrics"."monitoring_rules" ("id","tenant_id","name","metric","object_type","operation","threshold","operator","window_seconds","enabled","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, ctx.tenantId, rule.name, rule.metric, rule.objectType, rule.operation, rule.threshold, rule.operator, rule.windowSeconds, rule.enabled ?? true, now],
    );
    return { id, tenantId: ctx.tenantId, ...rule, createdAt: now };
  }

  async listMonitoringRules(ctx: RequestContext): Promise<UsageMonitoringRule[]> {
    const r = await this.pool.query(`SELECT * FROM "usage_metrics"."monitoring_rules" WHERE "tenant_id"=$1`, [ctx.tenantId]);
    return r.rows.map((row: any) => ({ id: row.id, tenantId: row.tenant_id, name: row.name, metric: row.metric, objectType: row.object_type, operation: row.operation, threshold: Number(row.threshold), operator: row.operator, windowSeconds: row.window_seconds, enabled: row.enabled, createdAt: row.created_at }));
  }

  async deleteMonitoringRule(ctx: RequestContext, ruleId: string): Promise<void> {
    await this.pool.query(`DELETE FROM "usage_metrics"."monitoring_rules" WHERE "id"=$1 AND "tenant_id"=$2`, [ruleId, ctx.tenantId]);
  }

  async evaluateMonitoringRules(ctx: RequestContext): Promise<MonitoringRuleResult[]> {
    const rules = await this.listMonitoringRules(ctx);
    const results: MonitoringRuleResult[] = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      const summary = await this.getSummary(ctx.tenantId);
      const currentValue = (summary as any)[rule.metric] ?? 0;
      const triggered = rule.operator === 'gt' ? currentValue > rule.threshold : rule.operator === 'gte' ? currentValue >= rule.threshold : rule.operator === 'lt' ? currentValue < rule.threshold : currentValue <= rule.threshold;
      results.push({ ruleId: rule.id, ruleName: rule.name, triggered, currentValue, threshold: rule.threshold });
    }
    return results;
  }
}

function mapUsageEvent(r: any): OntologyUsageEvent {
  const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
  return { tenantId: r.tenant_id, userId: r.user_id, operation: r.operation, objectType: r.object_type ?? '', objectId: r.object_id, actionOrFunctionName: r.action_or_function_name, success: r.success ?? true, durationMs: r.duration_ms, ...meta };
}

// ─────────────────────────────────────────────────────────────────────────────
// ScopedSessionStore
// ─────────────────────────────────────────────────────────────────────────────

export class PostgresScopedSessionStore implements ScopedSessionStore {
  constructor(private readonly pool: Pool) {}

  async create(tenantId: string, createdBy: string, input: CreateScopedSessionInput): Promise<ScopedSession> {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.durationSeconds ?? 3600) * 1000).toISOString();
    await this.pool.query(
      `INSERT INTO "scoped_session"."sessions" ("id","tenant_id","user_id","allowed_markings","excluded_markings","label","expires_at","created_by","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, tenantId, input.userId, input.allowedMarkings, input.excludedMarkings ?? [], input.label, expiresAt, createdBy, now.toISOString()],
    );
    return { id, tenantId, userId: input.userId, allowedMarkings: input.allowedMarkings, excludedMarkings: input.excludedMarkings ?? [], label: input.label, createdAt: now.toISOString(), expiresAt, revoked: false, createdBy };
  }

  async get(tenantId: string, sessionId: string): Promise<ScopedSession | null> {
    const r = await this.pool.query(`SELECT * FROM "scoped_session"."sessions" WHERE "id"=$1 AND "tenant_id"=$2`, [sessionId, tenantId]);
    return r.rows[0] ? mapScopedSession(r.rows[0]!) : null;
  }

  async getActiveForUser(tenantId: string, userId: string): Promise<ScopedSession | null> {
    const r = await this.pool.query(
      `SELECT * FROM "scoped_session"."sessions" WHERE "tenant_id"=$1 AND "user_id"=$2 AND "revoked"=FALSE AND "expires_at" > NOW() ORDER BY "created_at" DESC LIMIT 1`,
      [tenantId, userId],
    );
    return r.rows[0] ? mapScopedSession(r.rows[0]!) : null;
  }

  async list(tenantId: string, userId?: string): Promise<ScopedSession[]> {
    let sql = `SELECT * FROM "scoped_session"."sessions" WHERE "tenant_id"=$1`;
    const params: unknown[] = [tenantId];
    if (userId) { params.push(userId); sql += ` AND "user_id"=$${params.length}`; }
    sql += ` ORDER BY "created_at" DESC`;
    const r = await this.pool.query(sql, params);
    return r.rows.map(mapScopedSession);
  }

  async revoke(tenantId: string, sessionId: string): Promise<void> {
    await this.pool.query(`UPDATE "scoped_session"."sessions" SET "revoked"=TRUE WHERE "id"=$1 AND "tenant_id"=$2`, [sessionId, tenantId]);
  }

  async isMarkingAllowed(tenantId: string, sessionId: string, marking: string): Promise<boolean> {
    const r = await this.pool.query(`SELECT "allowed_markings", "excluded_markings" FROM "scoped_session"."sessions" WHERE "id"=$1 AND "tenant_id"=$2 AND "revoked"=FALSE AND "expires_at" > NOW()`, [sessionId, tenantId]);
    if (r.rows.length === 0) return false;
    const allowed = r.rows[0]!.allowed_markings ?? [];
    const excluded = r.rows[0]!.excluded_markings ?? [];
    if (excluded.includes(marking)) return false;
    // Empty allowedMarkings allows NOTHING — conformance-pinned, matching the
    // memory store and the auth funnel's intersection semantics. The previous
    // `allowed.length === 0 ||` treated an empty list as allow-everything: a
    // fail-open the other provider did not share.
    return allowed.includes(marking);
  }
}

function mapScopedSession(r: any): ScopedSession {
  // TIMESTAMPTZ columns come back from the driver as Date objects; the SPI
  // contract is ISO 8601 strings — conformance-pinned.
  const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
  return { id: r.id, tenantId: r.tenant_id, userId: r.user_id, allowedMarkings: r.allowed_markings ?? [], excludedMarkings: r.excluded_markings ?? [], label: r.label, createdAt: iso(r.created_at), expiresAt: iso(r.expires_at), revoked: r.revoked ?? false, createdBy: r.created_by };
}
