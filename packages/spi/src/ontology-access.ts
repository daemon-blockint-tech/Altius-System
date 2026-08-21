/**
 * Cross-org ontology access evaluation — one implementation, both providers.
 *
 * Deciding whether a caller from one org may see an ontology owned by another
 * is a pure function of three things: the ontology, the space it lives in, and
 * the sharing rules on that space. Nothing about it is storage-specific.
 *
 * It lives here rather than in each provider because this is an **authorization
 * decision**. Two providers that disagreed would mean one deployment granting
 * cross-org access that the other denies — and unlike a disagreement about
 * ordering or row counts, neither side would look wrong from where it stands.
 * That is the failure this file exists to make impossible.
 *
 * The evaluation fails closed: with no space, no rule, or no matching rule, the
 * answer is `allowed: false` with a reason. So losing sharing rules costs
 * partners their access — loud, and the right direction to fail in.
 */

import type {
  OntologyAccessResult,
  OntologyEntity,
  OntologySpace,
  SharingRule,
} from './multi-ontology.js';

/**
 * Decide whether `callerOrgScope` may reach `ontology`.
 *
 * `rules` must be the sharing rules whose `sourceSpaceId` is `space.id`;
 * filtering is the caller's job because each provider reads them differently.
 *
 * ── A quirk preserved deliberately: `bidirectional` does nothing ──
 *
 * A rule's `bidirectional` flag is read below and cannot change the outcome.
 * The clause it guards also requires `space.orgScope === callerOrgScope`, and
 * that case has already returned `allowed: true` on the same-org check above —
 * so by the time the flag is consulted, its companion condition is always
 * false. Setting `bidirectional: true` on a rule therefore grants nothing that
 * `bidirectional: false` would not.
 *
 * That is how the in-memory service has always behaved, and it is reproduced
 * exactly here rather than repaired, because repairing it would *widen* who can
 * reach an ontology — the one direction an access check must never be changed
 * in as a side effect of moving code. It is pinned by a conformance case and
 * raised as a contract question instead.
 */
export function evaluateOntologyAccess(
  ontology: OntologyEntity,
  space: OntologySpace,
  rules: SharingRule[],
  callerOrgScope: string,
): OntologyAccessResult {
  const denialReasons: string[] = [];

  // Same org → allow, without consulting any rule.
  if (space.orgScope === callerOrgScope) {
    return {
      allowed: true,
      spaceId: space.id,
      callerOrgScope,
      ontologyOrgScope: space.orgScope,
      viaSharingRule: false,
      denialReasons: [],
    };
  }

  for (const rule of rules) {
    if (!rule.enabled) continue;
    // See the note above: the `bidirectional` half of this condition is
    // unreachable, so the test is effectively `rule.targetOrgScope !==
    // callerOrgScope`.
    if (rule.targetOrgScope !== callerOrgScope && !(rule.bidirectional && space.orgScope === callerOrgScope)) continue;
    // An empty `ontologyIds` shares the whole space rather than nothing.
    if (rule.ontologyIds.length > 0 && !rule.ontologyIds.includes(ontology.id)) continue;
    // An empty `allowedMarkings` allows every marking rather than none. A rule
    // that lists markings denies the ontology if it carries any not on the
    // list — the check is over what the ontology has, not what the rule wants.
    if (rule.allowedMarkings.length > 0) {
      const hasDisallowed = ontology.markings.some(m => !rule.allowedMarkings.includes(m));
      if (hasDisallowed) {
        denialReasons.push(`Ontology has markings not allowed by sharing rule ${rule.id}`);
        continue;
      }
    }
    return {
      allowed: true,
      spaceId: space.id,
      callerOrgScope,
      ontologyOrgScope: space.orgScope,
      viaSharingRule: true,
      denialReasons: [],
      sharingRuleId: rule.id,
    };
  }

  denialReasons.push(
    `No sharing rule grants ${callerOrgScope} access to ontology ${ontology.id} in space ${space.name}`,
  );
  return {
    allowed: false,
    spaceId: space.id,
    callerOrgScope,
    ontologyOrgScope: space.orgScope,
    viaSharingRule: false,
    denialReasons,
  };
}
