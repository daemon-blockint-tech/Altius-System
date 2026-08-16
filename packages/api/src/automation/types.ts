/**
 * Operational automation manifests.
 *
 * An automation declares, in pack YAML, "when X happens, run governed action Y".
 * It is pack content (like actions and connectors), not platform code: the
 * runtime is the existing EventBus + ActionExecutor. Two trigger kinds:
 *
 *  - `event`    — fires on an object lifecycle change (CREATED/UPDATED/DELETED)
 *                 of a given ObjectType, optionally gated by a CEL condition.
 *  - `schedule` — fires on a fixed interval (per declared tenant).
 *
 * The action runs through the full governed pipeline under the declared actor's
 * roles (authorized and audited like any other caller).
 */

export type ChangeKind = 'CREATED' | 'UPDATED' | 'DELETED';

export interface EventTrigger {
  type: 'event';
  /** ObjectType whose lifecycle changes fire this automation. */
  objectType: string;
  /** Which change kinds fire it. */
  on: ChangeKind[];
  /**
   * Optional CEL guard, evaluated against `{ event, object, changes }`. The
   * automation fires only when it returns true (e.g. `object.status == 'DISCHARGED'`).
   */
  condition?: string;
}

export interface ScheduleTrigger {
  type: 'schedule';
  /** Fixed interval between runs, in milliseconds (parsed from e.g. "5m"). */
  intervalMs: number;
}

export type AutomationTrigger = EventTrigger | ScheduleTrigger;

/**
 * Param value mapping. A value is used as a static literal unless it is the
 * shape `{ from: "<cel>" }`, in which case the CEL expression is evaluated
 * against `{ event, object, changes }` at fire time.
 */
export type ParamMapping = Record<string, unknown>;

export interface AutomationActor {
  id: string;
  roles: string[];
}

export interface AutomationManifest {
  name: string;
  trigger: AutomationTrigger;
  action: { name: string; params: ParamMapping };
  actor: AutomationActor;
  /**
   * Tenant the automation runs in. Required for `schedule` triggers (there is
   * no event to carry a tenant); ignored for `event` triggers, which use the
   * triggering event's tenant.
   */
  tenantId?: string;
  /** Pack that declared this automation (diagnostics). */
  packName?: string;
}

/** A param mapping entry that resolves a value from a CEL expression. */
export function isFromExpression(v: unknown): v is { from: string } {
  return (
    typeof v === 'object' && v !== null && !Array.isArray(v) &&
    'from' in v && typeof (v as { from: unknown }).from === 'string'
  );
}
