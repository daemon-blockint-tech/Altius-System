/**
 * Enforcement of mandatory markings on the read surfaces.
 *
 * Two properties of markings drive the shape of this, and both differ from
 * how every other control in the platform behaves:
 *
 * 1. They are MANDATORY. Roles and ReBAC relations expand access; a marking
 *    restricts it. So the check runs BEFORE authorization, and holding the
 *    `editor` relation — or being an admin — does not get you past it.
 *
 * 2. They restrict DISCOVERY, not just retrieval. A caller who lacks the
 *    marking must not see the resource in a listing or search result at all.
 *    That is why a denied read answers as if the type were not there rather
 *    than with a permission error: a 403 confirms the type exists and that
 *    something is being withheld, which is itself the disclosure the marking
 *    was applied to prevent.
 *
 * Markings attach to ObjectTypes here. That is the closest analogue to the
 * source model's file-level marking: the unit a policy author reasons about
 * ("Patient records are PII") rather than a per-row label, which would need a
 * storage column and a per-row evaluation on every read.
 */

import type { MarkingPolicy } from '@altius/security';

import type { AuthenticatedUserInfo } from '../graphql/types.js';

/** Whether this caller may see this ObjectType at all. */
export function isTypeVisible(
  policy: MarkingPolicy | undefined,
  user: Pick<AuthenticatedUserInfo, 'markings'> | undefined,
  objectType: string | undefined,
): boolean {
  if (!policy || policy.isEmpty || !objectType) return true;
  const required = policy.requiredFor(objectType);
  if (required.length === 0) return true;
  // No identity resolved means no markings held, which denies every marked
  // type. Failing open here would make an unauthenticated path the way around
  // a mandatory control.
  return policy.check(user?.markings ?? [], required).allowed;
}

/**
 * The markings a caller was missing, for the audit record.
 *
 * Kept separate from `isTypeVisible` because the two audiences differ: the
 * caller is told nothing, while the audit trail records exactly which
 * restrictions were not satisfied so a DPO can answer why access was withheld.
 */
export function missingMarkings(
  policy: MarkingPolicy | undefined,
  user: Pick<AuthenticatedUserInfo, 'markings'> | undefined,
  objectType: string | undefined,
): string[] {
  if (!policy || policy.isEmpty || !objectType) return [];
  const required = policy.requiredFor(objectType);
  if (required.length === 0) return [];
  return policy.check(user?.markings ?? [], required).missing;
}
