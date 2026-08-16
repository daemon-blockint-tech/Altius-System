/**
 * Parse and validate an automation manifest (one pack YAML file).
 *
 * Throws a descriptive Error on any malformed field so a bad automation fails
 * loudly at boot rather than silently never firing.
 */

import type { AutomationManifest, AutomationTrigger, ChangeKind, ParamMapping } from './types.js';

const CHANGE_KINDS: ReadonlySet<string> = new Set(['CREATED', 'UPDATED', 'DELETED']);

/** Parse an interval string like "500ms", "30s", "5m", "2h" into milliseconds. */
export function parseIntervalMs(raw: string): number {
  const m = /^(\d+)(ms|s|m|h)$/.exec(raw.trim());
  if (!m) {
    throw new Error(`invalid interval "${raw}" (expected e.g. "30s", "5m", "1h")`);
  }
  const n = parseInt(m[1]!, 10);
  const unit = m[2]!;
  const mult = unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000;
  const ms = n * mult;
  if (ms <= 0) throw new Error(`interval "${raw}" must be greater than zero`);
  return ms;
}

function asObject(v: unknown, ctx: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`${ctx} must be an object`);
  }
  return v as Record<string, unknown>;
}

function parseTrigger(raw: unknown): AutomationTrigger {
  const t = asObject(raw, 'trigger');
  const type = t['type'];
  if (type === 'event') {
    const objectType = t['objectType'];
    if (typeof objectType !== 'string' || objectType.length === 0) {
      throw new Error('event trigger requires a non-empty "objectType"');
    }
    const onRaw = t['on'];
    const on: ChangeKind[] = Array.isArray(onRaw) && onRaw.length > 0
      ? onRaw.map((k) => {
          if (typeof k !== 'string' || !CHANGE_KINDS.has(k)) {
            throw new Error(`event trigger "on" has invalid change kind "${String(k)}" (allowed: CREATED, UPDATED, DELETED)`);
          }
          return k as ChangeKind;
        })
      : ['CREATED', 'UPDATED', 'DELETED'];
    const condition = t['condition'];
    if (condition !== undefined && typeof condition !== 'string') {
      throw new Error('event trigger "condition" must be a CEL string');
    }
    return { type: 'event', objectType, on, ...(condition !== undefined ? { condition } : {}) };
  }
  if (type === 'schedule') {
    if (t['cron'] !== undefined) {
      throw new Error('cron scheduling is not yet supported; use "interval" (e.g. "5m")');
    }
    const interval = t['interval'];
    if (typeof interval !== 'string') {
      throw new Error('schedule trigger requires an "interval" string (e.g. "5m")');
    }
    return { type: 'schedule', intervalMs: parseIntervalMs(interval) };
  }
  throw new Error(`trigger.type must be "event" or "schedule" (got "${String(type)}")`);
}

export function parseAutomationManifest(raw: unknown): AutomationManifest {
  const root = asObject(raw, 'automation manifest');

  const name = root['name'];
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('automation manifest requires a non-empty "name"');
  }

  const trigger = parseTrigger(root['trigger']);

  const actionRaw = asObject(root['action'], `automation "${name}" action`);
  const actionName = actionRaw['name'];
  if (typeof actionName !== 'string' || actionName.length === 0) {
    throw new Error(`automation "${name}" requires action.name`);
  }
  const paramsRaw = actionRaw['params'];
  if (paramsRaw !== undefined && (typeof paramsRaw !== 'object' || paramsRaw === null || Array.isArray(paramsRaw))) {
    throw new Error(`automation "${name}" action.params must be an object`);
  }
  const params = (paramsRaw ?? {}) as ParamMapping;

  const actorRaw = asObject(root['actor'], `automation "${name}" actor`);
  const actorId = actorRaw['id'];
  if (typeof actorId !== 'string' || actorId.length === 0) {
    throw new Error(`automation "${name}" requires actor.id`);
  }
  const rolesRaw = actorRaw['roles'];
  const roles = Array.isArray(rolesRaw) ? rolesRaw.filter((r): r is string => typeof r === 'string') : [];

  const tenantId = root['tenantId'];
  if (trigger.type === 'schedule' && (typeof tenantId !== 'string' || tenantId.length === 0)) {
    throw new Error(`automation "${name}" has a schedule trigger and must declare a "tenantId"`);
  }
  if (tenantId !== undefined && typeof tenantId !== 'string') {
    throw new Error(`automation "${name}" tenantId must be a string`);
  }

  return {
    name,
    trigger,
    action: { name: actionName, params },
    actor: { id: actorId, roles },
    ...(typeof tenantId === 'string' ? { tenantId } : {}),
  };
}
