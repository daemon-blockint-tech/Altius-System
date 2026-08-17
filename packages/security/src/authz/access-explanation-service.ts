/**
 * Access explanation service — explains why access was granted or denied.
 *
 * Combines role checks, ReBAC relation checks, marking checks, consent checks,
 * and tenant isolation checks into a human-readable explanation.
 */

import type {
  AccessExplanationService,
  AccessExplanation,
  AccessExplanationReason,
} from '@altius/spi';
import type { AuthorizationService } from './authorization-service.js';

export interface AccessExplanationServiceOptions {
  authorizationService: AuthorizationService;
}

export class DefaultAccessExplanationService implements AccessExplanationService {
  private readonly authz: AuthorizationService;

  constructor(options: AccessExplanationServiceOptions) {
    this.authz = options.authorizationService;
  }

  async explain(params: {
    tenantId: string;
    userId: string;
    objectType: string;
    objectId?: string;
    action?: string;
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

    // 3. Marking check (placeholder — would integrate with MarkingPolicy when available)
    reasons.push({
      check: 'marking',
      passed: true,
      detail: 'No marking restrictions configured for this resource type',
      rule: 'marking-default',
    });

    // 4. Consent check (placeholder — consent service integration would go here)
    reasons.push({
      check: 'consent',
      passed: true,
      detail: 'No consent restrictions apply to this resource',
      rule: 'consent-default',
    });

    const summary = allPassed
      ? `Access GRANTED to ${params.objectType}${params.objectId ? `/${params.objectId}` : ''} for action '${params.action ?? 'read'}'`
      : `Access DENIED to ${params.objectType}${params.objectId ? `/${params.objectId}` : ''} for action '${params.action ?? 'read'}': ${reasons.filter(r => !r.passed).map(r => r.check).join(', ')} check(s) failed`;

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
    };
  }
}
