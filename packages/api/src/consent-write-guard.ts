/**
 * Consent guard for the direct write surfaces.
 *
 * The action pipeline checks consent before executing effects (Section
 * 7.3.2), but the direct mutations — REST PUT/DELETE and the GraphQL
 * update<Type>/delete<Type> resolvers — bypass that pipeline: an editor
 * could update or delete a consent-subject's record after the subject
 * revoked consent. One guard, four callers, so a fifth direct-write
 * surface has one obvious thing to call.
 *
 * Denials are audited before the error propagates — a DPO needs to see
 * refused writes, not just successful ones — mirroring the action
 * executor's auditDenied. Audit failure never changes the outcome.
 */

import type { DataPurpose } from '@altius/spi';

import type { ApiDependencies, AuthenticatedUserInfo } from './graphql/types.js';
import { DEFAULT_CONSENT_PURPOSE, isConsentSubjectType } from './graphql/types.js';

export async function guardDirectWriteConsent(
  deps: ApiDependencies,
  operation: 'update' | 'delete',
  typeName: string,
  id: string,
  user: AuthenticatedUserInfo,
  requestContext: { tenantId: string; traceId?: string },
): Promise<void> {
  if (!deps.consentService || !isConsentSubjectType(typeName, deps.consentSubjectTypes)) return;
  try {
    // The object's primary id IS the subject id for a consent-subject type —
    // the same convention every read path uses (checkSingleObject callers).
    await deps.consentService.guardAction(
      id,
      DEFAULT_CONSENT_PURPOSE as DataPurpose,
      user.id,
      requestContext.tenantId,
    );
  } catch (err) {
    if (deps.auditWriter) {
      try {
        await deps.auditWriter.write({
          tenantId: requestContext.tenantId,
          actor: { type: 'user', id: user.id, roles: user.roles },
          operation: { type: operation, objectType: typeName, objectId: id },
          detail: { result: 'denied', consentDecision: 'denied' },
          traceId: requestContext.traceId,
        });
      } catch { /* best-effort */ }
    }
    throw err;
  }
}
