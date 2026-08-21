/**
 * PostgreSQL event objects — the process-mining event log and its thresholds.
 *
 * Two pieces of state, and both fail quietly when lost:
 *
 *   - the events themselves. They are what `ProcessMiningService.discover`
 *     reads, and a model discovered from a log that lost half its events does
 *     not look wrong — it looks like a smaller process.
 *   - the thresholds. A threshold marks an event as breaching at the moment it
 *     is created; lose it and new events simply stop being flagged, with
 *     nothing erroring. Same shape as losing a data expectation.
 *
 * Both lived in a `Map`, so #14's gate withheld the service under Postgres and
 * its routes answered 404.
 *
 * Whether an event breaches is NOT decided here. It is a pure function of the
 * threshold and the duration, so it lives in @altius/spi's event-thresholds and
 * both providers call it — the answer is written *onto the event*, so two
 * providers that disagreed would store different flags for the same event and
 * the same threshold, and anything reading breaches afterwards would differ by
 * deployment.
 *
 * ── Timestamps are TEXT, deliberately ──
 *
 * `start_time` and `end_time` are stored as the strings the caller supplied,
 * not as TIMESTAMPTZ. The query filters (`startTimeFrom`/`startTimeTo`) compare
 * lexicographically in the in-memory provider, and `list` orders the same way.
 * Converting to instants would re-order events whose strings differ but whose
 * instants match, and would move the boundaries of a range query — the two
 * providers would part company on exactly the edge cases a timeline scrubber
 * hits. `duration_ms` is still computed numerically, from parsed dates.
 *
 * ── One quirk matched rather than fixed ──
 *
 * `update` does not re-evaluate the threshold. An event edited to a longer
 * duration keeps whatever breach flag it was created with, and an event created
 * before a threshold existed never gains one. Both providers behave this way;
 * changing it would silently re-flag historical events, so it is pinned by a
 * conformance case and raised as a contract question instead.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { evaluateEventThreshold } from '@altius/spi';
import type {
  EventObject,
  EventObjectService,
  EventQuery,
  CreateEventInput,
  EventThreshold,
  RequestContext,
} from '@altius/spi';

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  return (typeof v === 'string' ? JSON.parse(v) : v) as T;
}

function mapEvent(r: Record<string, unknown>): EventObject {
  return {
    id: String(r['id']),
    tenantId: String(r['tenant_id']),
    eventType: String(r['event_type']),
    caseId: String(r['case_id']),
    // Omitted rather than set to undefined, so an event round-trips to the same
    // shape the in-memory service returns.
    ...(r['object_id'] === null || r['object_id'] === undefined ? {} : { objectId: String(r['object_id']) }),
    ...(r['object_type'] === null || r['object_type'] === undefined ? {} : { objectType: String(r['object_type']) }),
    startTime: String(r['start_time']),
    ...(r['end_time'] === null || r['end_time'] === undefined ? {} : { endTime: String(r['end_time']) }),
    ...(r['duration_ms'] === null || r['duration_ms'] === undefined ? {} : { durationMs: Number(r['duration_ms']) }),
    ...(r['actor_id'] === null || r['actor_id'] === undefined ? {} : { actorId: String(r['actor_id']) }),
    badges: parseJson<string[]>(r['badges'], []),
    ...(r['threshold_breached'] === true ? { thresholdBreached: true } : {}),
    ...(r['threshold_details']
      ? { thresholdDetails: parseJson<EventObject['thresholdDetails']>(r['threshold_details'], undefined as never) }
      : {}),
    attributes: parseJson<Record<string, unknown>>(r['attributes'], {}),
    createdAt: toIso(r['created_at']),
  };
}

/** Duration is numeric even though the timestamps are stored as text. */
function durationOf(startTime: string, endTime?: string): number | undefined {
  if (!endTime) return undefined;
  return new Date(endTime).getTime() - new Date(startTime).getTime();
}

export class PostgresEventObjectService implements EventObjectService {
  constructor(private readonly pool: Pool) {}

  async create(ctx: RequestContext, input: CreateEventInput): Promise<EventObject> {
    const durationMs = durationOf(input.startTime, input.endTime);
    // The threshold is read at creation time and never again — see the header.
    const breach = evaluateEventThreshold(await this.threshold(ctx, input.eventType), durationMs);

    const r = await this.pool.query(
      `INSERT INTO "process"."events"
         ("id","tenant_id","event_type","case_id","object_id","object_type",
          "start_time","end_time","duration_ms","actor_id","badges",
          "threshold_breached","threshold_details","attributes","created_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        randomUUID(), ctx.tenantId, input.eventType, input.caseId,
        input.objectId ?? null, input.objectType ?? null,
        input.startTime, input.endTime ?? null, durationMs ?? null,
        input.actorId ?? null, JSON.stringify(input.badges ?? []),
        breach ? true : null, breach ? JSON.stringify(breach) : null,
        JSON.stringify(input.attributes ?? {}), new Date().toISOString(),
      ],
    );
    return mapEvent(r.rows[0]!);
  }

  async get(ctx: RequestContext, eventId: string): Promise<EventObject | null> {
    const r = await this.pool.query(
      `SELECT * FROM "process"."events" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, eventId],
    );
    return r.rows[0] ? mapEvent(r.rows[0]) : null;
  }

  async list(ctx: RequestContext, query?: EventQuery): Promise<{ events: EventObject[]; totalCount: number }> {
    const params: unknown[] = [ctx.tenantId];
    let sql = `SELECT * FROM "process"."events" WHERE "tenant_id"=$1`;
    const eq = (column: string, value: unknown) => {
      params.push(value);
      sql += ` AND "${column}"=$${params.length}`;
    };
    if (query?.caseId) eq('case_id', query.caseId);
    if (query?.eventType) eq('event_type', query.eventType);
    if (query?.objectId) eq('object_id', query.objectId);
    if (query?.objectType) eq('object_type', query.objectType);
    if (query?.actorId) eq('actor_id', query.actorId);
    if (query?.thresholdBreached !== undefined) {
      // A non-breaching event stores NULL rather than FALSE, and `= FALSE`
      // would not match it — so the false case has to ask for "not true".
      sql += query.thresholdBreached
        ? ` AND "threshold_breached" IS TRUE`
        : ` AND "threshold_breached" IS NOT TRUE`;
    }
    // Lexicographic comparison on the stored strings, matching the in-memory
    // filter exactly. See the header on why these are TEXT.
    if (query?.startTimeFrom) { params.push(query.startTimeFrom); sql += ` AND "start_time">=$${params.length}`; }
    if (query?.startTimeTo) { params.push(query.startTimeTo); sql += ` AND "start_time"<=$${params.length}`; }
    if (query?.badges?.length) {
      // Any-match, not all-match: an event qualifies if it carries at least one
      // of the badges asked for.
      params.push(JSON.stringify(query.badges));
      sql += ` AND EXISTS (SELECT 1 FROM jsonb_array_elements_text("badges") b WHERE b IN (SELECT jsonb_array_elements_text($${params.length}::jsonb)))`;
    }
    // Oldest first — this is an event log, so time order is the natural one —
    // with `seq` breaking ties, which are common when events share a clock
    // reading.
    sql += ` ORDER BY "start_time", "seq"`;

    const r = await this.pool.query(sql, params);
    const all = r.rows.map(mapEvent);
    // `totalCount` counts the matches, not the page: it is computed before
    // offset and limit are applied, matching the in-memory service.
    const totalCount = all.length;
    const offset = query?.offset ?? 0;
    const events = query?.limit === undefined
      ? all.slice(offset)
      : all.slice(offset, offset + query.limit);
    return { events, totalCount };
  }

  async update(ctx: RequestContext, eventId: string, updates: Partial<CreateEventInput>): Promise<EventObject> {
    const current = await this.get(ctx, eventId);
    if (!current) throw new Error(`Event not found: ${eventId}`);
    const startTime = updates.startTime ?? current.startTime;
    const endTime = updates.endTime ?? current.endTime;
    // Recomputed, but the breach flag is NOT re-evaluated — see the header.
    // `?? current.durationMs` keeps an existing duration when the update leaves
    // the event instantaneous, which is what spreading the old record does.
    const durationMs = durationOf(startTime, endTime) ?? current.durationMs;

    const r = await this.pool.query(
      `UPDATE "process"."events"
          SET "event_type"=$3, "case_id"=$4, "object_id"=$5, "object_type"=$6,
              "start_time"=$7, "end_time"=$8, "duration_ms"=$9, "actor_id"=$10,
              "badges"=$11, "attributes"=$12
        WHERE "tenant_id"=$1 AND "id"=$2
        RETURNING *`,
      [
        ctx.tenantId, eventId,
        updates.eventType ?? current.eventType,
        updates.caseId ?? current.caseId,
        updates.objectId ?? current.objectId ?? null,
        updates.objectType ?? current.objectType ?? null,
        startTime, endTime ?? null, durationMs ?? null,
        updates.actorId ?? current.actorId ?? null,
        JSON.stringify(updates.badges ?? current.badges),
        JSON.stringify(updates.attributes ?? current.attributes),
      ],
    );
    return mapEvent(r.rows[0]!);
  }

  async delete(ctx: RequestContext, eventId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "process"."events" WHERE "tenant_id"=$1 AND "id"=$2`,
      [ctx.tenantId, eventId],
    );
  }

  async setThreshold(
    ctx: RequestContext,
    eventType: string,
    metric: string,
    threshold: number,
    direction: 'above' | 'below',
  ): Promise<void> {
    // One threshold per event type, replaced rather than accumulated.
    await this.pool.query(
      `INSERT INTO "process"."event_thresholds"
         ("tenant_id","event_type","metric","threshold","direction","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("tenant_id","event_type") DO UPDATE SET
         "metric"=EXCLUDED."metric",
         "threshold"=EXCLUDED."threshold",
         "direction"=EXCLUDED."direction",
         "updated_at"=EXCLUDED."updated_at"`,
      [ctx.tenantId, eventType, metric, threshold, direction, new Date().toISOString()],
    );
  }

  async getTimeline(
    ctx: RequestContext,
    startTime: string,
    endTime: string,
    caseId?: string,
  ): Promise<EventObject[]> {
    const { events } = await this.list(ctx, {
      startTimeFrom: startTime,
      startTimeTo: endTime,
      ...(caseId ? { caseId } : {}),
      limit: 10000,
    });
    return events;
  }

  private async threshold(ctx: RequestContext, eventType: string): Promise<EventThreshold | null> {
    const r = await this.pool.query(
      `SELECT "metric","threshold","direction" FROM "process"."event_thresholds"
        WHERE "tenant_id"=$1 AND "event_type"=$2`,
      [ctx.tenantId, eventType],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      metric: String(row['metric']),
      threshold: Number(row['threshold']),
      direction: row['direction'] as 'above' | 'below',
    };
  }
}
