/**
 * AutomationRunner — wires declared automations to the live EventBus and a
 * fixed-interval scheduler, and runs their action through the ActionExecutor.
 *
 * Event path: on an object lifecycle CloudEvent, match automations by
 * ObjectType + change kind, optionally evaluate a CEL condition against
 * `{ event, object, changes }`, build params, and execute the governed action
 * under the declared actor.
 *
 * Schedule path: run the action every interval, under the declared tenant.
 *
 * Loop safety: an automation never re-fires on an event its own actor caused
 * (the common self-loop where an automation edits the type it watches).
 * Cross-automation cycles (A triggers B triggers A) are the author's
 * responsibility — a documented v1 limitation.
 */

import type { CloudEvent, StorageProvider, RequestContext } from '@altius/spi';
import type { ActionExecutor, ActionActor, CelEvaluator } from '@altius/actions';
import type { ObjectEventData, EventCause } from '@altius/engine';
import type { ParsedSchema } from '@altius/odl';
import type { ManifestRegistry } from '../graphql/types.js';
import type { AutomationManifest, ChangeKind } from './types.js';
import { isFromExpression } from './types.js';

export interface AutomationLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface AutomationRunnerDeps {
  automations: AutomationManifest[];
  /** Subscribe to the CloudEvent stream; returns an unsubscribe function. */
  subscribe: (handler: (event: CloudEvent) => void) => () => void;
  manifestRegistry: ManifestRegistry;
  executor: ActionExecutor;
  /** Parsed schema — the executor validates action params against it. */
  schema: ParsedSchema;
  cel: CelEvaluator;
  storage: StorageProvider;
  logger: AutomationLogger;
  /** Injectable timer (tests). Defaults to setInterval/clearInterval. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const EVENT_TYPE_TO_KIND: Record<string, ChangeKind> = {
  'altius.object.created': 'CREATED',
  'altius.object.updated': 'UPDATED',
  'altius.object.deleted': 'DELETED',
};

export class AutomationRunner {
  private unsubscribe: (() => void) | null = null;
  private readonly timers: unknown[] = [];
  private traceCounter = 0;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly deps: AutomationRunnerDeps) {
    this.setTimer = deps.setTimer ?? ((fn, ms) => setInterval(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  }

  start(): void {
    if (this.unsubscribe) return;
    const hasEventTrigger = this.deps.automations.some((a) => a.trigger.type === 'event');
    this.unsubscribe = hasEventTrigger
      ? this.deps.subscribe((e) => { void this.onEvent(e); })
      : () => {};
    for (const auto of this.deps.automations) {
      if (auto.trigger.type === 'schedule') {
        const handle = this.setTimer(() => { void this.runScheduled(auto); }, auto.trigger.intervalMs);
        this.timers.push(handle);
      }
    }
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    for (const h of this.timers) this.clearTimer(h);
    this.timers.length = 0;
  }

  // ── Event path ────────────────────────────────────────────────────────────

  async onEvent(event: CloudEvent): Promise<void> {
    const kind = EVENT_TYPE_TO_KIND[event.type];
    if (!kind) return; // object lifecycle events only (link events ignored in v1)
    const data = event.data as ObjectEventData | undefined;
    if (!data || typeof data.objectType !== 'string' || typeof data.objectId !== 'string') return;
    const tenantId = event.tenantid;
    if (typeof tenantId !== 'string' || tenantId.length === 0) return;

    for (const auto of this.deps.automations) {
      if (auto.trigger.type !== 'event') continue;
      if (auto.trigger.objectType !== data.objectType) continue;
      if (!auto.trigger.on.includes(kind)) continue;
      if (this.wasCausedBy(data.causedBy, auto.actor.id)) continue; // self-loop guard
      try {
        await this.fireEvent(auto, tenantId, kind, data);
      } catch (err) {
        this.deps.logger.error(`Automation '${auto.name}' failed: ${errMsg(err)}`);
      }
    }
  }

  private async fireEvent(
    auto: AutomationManifest,
    tenantId: string,
    kind: ChangeKind,
    data: ObjectEventData,
  ): Promise<void> {
    const ctx: RequestContext = { tenantId, actorId: auto.actor.id, traceId: this.nextTraceId() };
    // Best-effort current state so conditions/params can reference object fields.
    let object: Record<string, unknown> | null = null;
    try {
      object = await this.deps.storage.getObject(ctx, data.objectType, data.objectId);
    } catch {
      object = null;
    }
    const vars = {
      event: { objectType: data.objectType, objectId: data.objectId, changeType: kind, version: data.version, tenantId },
      object,
      changes: data.changes ?? {},
    };
    if (auto.trigger.type === 'event' && auto.trigger.condition) {
      if (!(await this.conditionHolds(auto.trigger.condition, vars))) return;
    }
    await this.execute(auto, vars, ctx);
  }

  // ── Schedule path ───────────────────────────────────────────────────────────

  async runScheduled(auto: AutomationManifest): Promise<void> {
    if (!auto.tenantId) return; // enforced by the parser, guarded here too
    const ctx: RequestContext = { tenantId: auto.tenantId, actorId: auto.actor.id, traceId: this.nextTraceId() };
    const vars = { event: null, object: null, changes: {} };
    try {
      await this.execute(auto, vars, ctx);
    } catch (err) {
      this.deps.logger.error(`Automation '${auto.name}' failed: ${errMsg(err)}`);
    }
  }

  // ── Shared execution ─────────────────────────────────────────────────────────

  private async execute(auto: AutomationManifest, vars: Record<string, unknown>, ctx: RequestContext): Promise<void> {
    const manifest = this.deps.manifestRegistry.get(auto.action.name);
    if (!manifest) {
      this.deps.logger.warn(`Automation '${auto.name}': action '${auto.action.name}' is not a known action`);
      return;
    }
    const params = await this.buildParams(auto.action.params, vars);
    const actor: ActionActor = { id: auto.actor.id, type: 'system', roles: auto.actor.roles };
    const result = await this.deps.executor.execute(manifest, params, actor, { requestContext: ctx }, this.deps.schema);
    if (!result.success) {
      this.deps.logger.warn(
        `Automation '${auto.name}' action '${auto.action.name}' did not succeed: ${result.errors.map((e) => e.code).join(', ')}`,
      );
    }
  }

  async buildParams(mapping: Record<string, unknown>, vars: Record<string, unknown>): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(mapping)) {
      if (isFromExpression(value)) {
        const r = await this.deps.cel.evaluate(value.from, vars);
        if (r.error) {
          this.deps.logger.warn(`Automation param '${key}' expression failed: ${r.error}`);
          out[key] = undefined;
        } else {
          out[key] = r.value;
        }
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  private async conditionHolds(expr: string, vars: Record<string, unknown>): Promise<boolean> {
    const r = await this.deps.cel.evaluate(expr, vars);
    if (r.error) {
      this.deps.logger.warn(`Automation condition failed to evaluate: ${r.error}`);
      return false;
    }
    return r.value === true;
  }

  private wasCausedBy(cause: EventCause | undefined, actorId: string): boolean {
    return typeof cause?.actor === 'string' && cause.actor.includes(actorId);
  }

  private nextTraceId(): string {
    this.traceCounter += 1;
    return `automation-${Date.now()}-${this.traceCounter}`;
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
