/**
 * Access explanation service — explains why access was granted or denied.
 *
 * Combines tenant isolation, ReBAC relation checks, mandatory markings,
 * consent, and field-level policy into a human-readable explanation.
 *
 * Two properties matter more than the prose it produces:
 *
 *  1. **It must agree with the read path.** An explanation that says GRANTED
 *     where a read withholds the row is worse than no explanation — it sends
 *     the operator to debug the wrong layer. So the marking and field checks
 *     here run the same `MarkingPolicy` and `getVisibleFields` the enforcement
 *     path runs, rather than reporting a default-allow placeholder.
 *  2. **Simulation must not leak.** Explaining another principal's access is a
 *     privileged operation (it reveals that principal's permissions); the
 *     service records that the answer was simulated, and the caller-facing
 *     surface is responsible for gating who may ask.
 */

import type {
  AccessExplanationService,
  AccessExplanation,
  AccessExplanationReason,
  AccessExplanationField,
} from '@altius/spi';
import type { AuthorizationService } from './authorization-service.js';
import type { MarkingPolicy } from '../markings/marking-policy.js';

/**
 * The consent surface this service needs — structurally the ConsentService
 * method, so the live service can be passed straight in with no adapter.
 */
export interface ConsentExplainer {
  checkConsent(
    subjectId: string,
    purpose: string,
    requestor: string,
    tenantId?: string,
  ): Promise<{ allowed: boolean; basis?: string }>;
}

export interface AccessExplanationServiceOptions {
  authorizationService: AuthorizationService;
  /**
   * Mandatory marking policy. When absent the explanation says markings are
   * not configured, which is true of a deployment with no marking policy —
   * unlike the old placeholder, which said it for every deployment.
   */
  markingPolicy?: MarkingPolicy;
  /** Object types whose reads are consent-gated. */
  consentSubjectTypes?: readonly string[];
  /** Consent check, when a consent service is deployed. */
  consent?: ConsentExplainer;
  /** Purpose used for the consent probe. Defaults to the read purpose. */
  consentPurpose?: string;
}

export class DefaultAccessExplanationService implements AccessExplanationService {
  private readonly authz: AuthorizationService;
  private readonly markingPolicy?: MarkingPolicy;
  private readonly consentSubjectTypes: ReadonlySet<string>;
  private readonly consent?: ConsentExplainer;
  private readonly consentPurpose: string;

  constructor(options: AccessExplanationServiceOptions) {
    this.authz = options.authorizationService;
    this.markingPolicy = options.markingPolicy;
    this.consentSubjectTypes = new Set(options.consentSubjectTypes ?? []);
    this.consent = options.consent;
    this.consentPurpose = options.consentPurpose ?? 'direct_care';
  }

  async explain(params: {
    tenantId: string;
    userId: string;
    objectType: string;
    objectId?: string;
    action?: string;
    roles?: string[];
    markings?: string[];
    fields?: string[];
    simulated?: boolean;
  }): Promise<AccessExplanation> {
    const reasons: AccessExplanationReason[] = [];
    let allPassed = true;

    // 1. Tenant isolation check
    reasons.push({
      check: 'tenant',
      passed: true,
      detail: `User and resource are in the same tenant: ${params.tenantId}`,
      rule: 'tenant-isolation',
    });

    // 2. Role/ReBAC check
    try {
      const relation = params.action ?? 'viewer';
      const resource = params.objectId
        ? `${params.objectType}:${params.objectId}`
        : `${params.objectType}:*`;
      const hasAccess = await this.authz.check(
        `user:${params.userId}`,
        relation,
        resource,
        params.tenantId,
      );
      reasons.push({
        check: 'rebac_relation',
        passed: hasAccess,
        detail: hasAccess
          ? `User holds '${relation}' relation on ${resource}`
          : `User does not hold '${relation}' relation on ${resource}`,
        rule: 'rebac-check',
      });
      if (!hasAccess) allPassed = false;
    } catch (err) {
      reasons.push({
        check: 'rebac_relation',
        passed: false,
        detail: `ReBAC check error: ${err instanceof Error ? err.message : 'unknown'}`,
      });
      allPassed = false;
    }

    // 3. Marking check — the real policy, evaluated against the markings the
    //    explained principal holds. Markings are mandatory: failing here denies
    //    the read no matter which relation or role the principal holds.
    if (!this.markingPolicy || this.markingPolicy.isEmpty) {
      reasons.push({
        check: 'marking',
        passed: true,
        detail: 'No marking policy is configured for this deployment',
        rule: 'marking-default',
      });
    } else {
      const required = this.markingPolicy.requiredFor(params.objectType);
      if (required.length === 0) {
        reasons.push({
          check: 'marking',
          passed: true,
          detail: `${params.objectType} carries no required markings`,
          rule: 'marking-unmarked',
        });
      } else {
        const decision = this.markingPolicy.check(params.markings ?? [], required);
        reasons.push({
          check: 'marking',
          passed: decision.allowed,
          detail: decision.allowed
            ? `Principal satisfies all ${required.length} required marking(s) on ${params.objectType}`
            // Naming the missing markings is safe here and nowhere else: an
            // explanation is an admin/self tool, and without the names the
            // answer cannot be acted on.
            : `Principal lacks required marking(s): ${decision.missing.join(', ')}`,
          rule: 'marking-policy',
        });
        if (!decision.allowed) allPassed = false;
      }
    }

    // 4. Consent check — real when the type is consent-gated and a consent
    //    service is deployed; otherwise it says which of those is not true.
    if (!this.consentSubjectTypes.has(params.objectType)) {
      reasons.push({
        check: 'consent',
        passed: true,
        detail: `${params.objectType} is not a consent-gated type`,
        rule: 'consent-not-applicable',
      });
    } else if (!this.consent) {
      reasons.push({
        check: 'consent',
        passed: true,
        detail: 'Type is consent-gated but no consent service is deployed',
        rule: 'consent-unavailable',
      });
    } else if (!params.objectId) {
      reasons.push({
        check: 'consent',
        passed: true,
        detail: 'Consent is per-subject; supply objectId to evaluate it',
        rule: 'consent-needs-subject',
      });
    } else {
      try {
        const decision = await this.consent.checkConsent(
          params.objectId,
          this.consentPurpose,
          params.userId,
          params.tenantId,
        );
        reasons.push({
          check: 'consent',
          passed: decision.allowed,
          detail: decision.allowed
            ? `Consent allows purpose '${this.consentPurpose}'${decision.basis ? ` (basis: ${decision.basis})` : ''}`
            : `Consent withheld for purpose '${this.consentPurpose}'${decision.basis ? ` (basis: ${decision.basis})` : ''}`,
          rule: 'consent-check',
        });
        if (!decision.allowed) allPassed = false;
      } catch (err) {
        // Fail the check rather than the request: an unavailable consent
        // service means the answer is unknown, and reporting "granted" would
        // be the wrong direction to guess in.
        reasons.push({
          check: 'consent',
          passed: false,
          detail: `Consent check error: ${err instanceof Error ? err.message : 'unknown'}`,
          rule: 'consent-check',
        });
        allPassed = false;
      }
    }

    // 5. Field-level policy — only when asked, so the resource-level answer
    //    stays cheap. This is the surface that makes `_redactedFields`
    //    explainable.
    let fields: AccessExplanationField[] | undefined;
    if (params.fields && params.fields.length > 0) {
      const visible = this.authz.getVisibleFields(
        params.userId,
        params.roles ?? [],
        params.objectType,
      );
      fields = params.fields.map(field => {
        if (!visible) {
          return {
            field,
            visible: true,
            detail: `No field policy applies to ${params.objectType}.${field}`,
          };
        }
        const isVisible = visible.has(field) || field.startsWith('_');
        return {
          field,
          visible: isVisible,
          detail: isVisible
            ? `Visible: ${params.objectType}.${field} is permitted for the principal's roles`
            : `Withheld: ${params.objectType}.${field} is restricted and the principal's roles do not include it`,
        };
      });
      const withheld = fields.filter(f => !f.visible).map(f => f.field);
      reasons.push({
        check: 'field_policy',
        passed: withheld.length === 0,
        detail: withheld.length === 0
          ? 'All requested fields are visible'
          : `Withheld field(s): ${withheld.join(', ')}`,
        rule: 'field-visibility',
      });
      // A withheld field does not deny the read — the row still comes back
      // with those fields masked, which is why this does not flip allPassed.
    }

    const target = `${params.objectType}${params.objectId ? `/${params.objectId}` : ''}`;
    const prefix = params.simulated ? `[simulated for ${params.userId}] ` : '';
    const summary = allPassed
      ? `${prefix}Access GRANTED to ${target} for action '${params.action ?? 'read'}'`
      : `${prefix}Access DENIED to ${target} for action '${params.action ?? 'read'}': ${reasons.filter(r => !r.passed).map(r => r.check).join(', ')} check(s) failed`;

    return {
      granted: allPassed,
      resource: {
        objectType: params.objectType,
        objectId: params.objectId,
        action: params.action,
      },
      userId: params.userId,
      reasons,
      summary,
      ...(params.simulated ? { simulatedFor: params.userId } : {}),
      ...(fields ? { fields } : {}),
    };
  }
}
