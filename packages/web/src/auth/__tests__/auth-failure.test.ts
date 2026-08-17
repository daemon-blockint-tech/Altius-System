/**
 * Telling an identity failure from a data failure.
 *
 * The consequence of getting this wrong is a screen of Retry buttons that
 * resend a credential the gateway has already refused, so both directions
 * matter: a missed 401 strands the user, and a false positive would bounce
 * someone to sign-in over an unrelated server error.
 */

import { describe, it, expect } from 'vitest';
import { isAuthFailure } from '../auth-failure.js';

/** The shape AltiusRequestError presents. Duck-typed on purpose — see the module. */
function requestError(message: string, init: { status?: number; codes?: string[] }) {
  return Object.assign(new Error(message), {
    status: init.status,
    codes: init.codes ?? [],
  });
}

describe('isAuthFailure', () => {
  it('is true for HTTP 401', () => {
    expect(isAuthFailure(requestError('GraphQL request failed: 401 Unauthorized', { status: 401 }))).toBe(true);
  });

  it('is true for an UNAUTHENTICATED code on a 200 error body', () => {
    // The gateway answers an unauthenticated GraphQL request with HTTP 200 and
    // the failure in errors[] — verified against the dev API — so status alone
    // would miss the most common form.
    expect(
      isAuthFailure(requestError('GraphQL errors: Authentication required', { codes: ['UNAUTHENTICATED'] })),
    ).toBe(true);
  });

  it('is FALSE for 403', () => {
    // Identified but not permitted. Returning them to sign-in loops them
    // through a login that cannot change the outcome.
    expect(isAuthFailure(requestError('GraphQL request failed: 403 Forbidden', { status: 403 }))).toBe(false);
  });

  it('is false for a server error, which IS worth retrying', () => {
    expect(isAuthFailure(requestError('GraphQL request failed: 500 Internal Server Error', { status: 500 }))).toBe(false);
  });

  it('is false for an ordinary error carrying no transport fields', () => {
    // A network failure or a bug. Notably this includes an error whose MESSAGE
    // mentions 401 but which carries no status — the predicate reads the
    // fields, not the prose, so wording changes cannot flip it.
    expect(isAuthFailure(new Error('fetch failed'))).toBe(false);
    expect(isAuthFailure(new Error('something about 401 in the text'))).toBe(false);
  });

  it('is false for non-errors', () => {
    expect(isAuthFailure(null)).toBe(false);
    expect(isAuthFailure(undefined)).toBe(false);
    expect(isAuthFailure('401')).toBe(false);
  });
});
