/**
 * Did this request fail because of who the caller is, rather than what they
 * asked for?
 *
 * The distinction drives what the user is shown: a data failure is worth a
 * Retry button, an identity failure is not — retrying an anonymous request
 * produces the same 401 forever, which is exactly what the app used to offer.
 *
 * Matched on the message because that is all there is to match on. The SDK
 * throws `new Error("GraphQL request failed: 401 Unauthorized")` — a bare Error
 * with no status, code or cause (packages/sdk-typescript/src/index.ts, and its
 * generator at packages/odl/src/codegen/sdk.ts:572). A typed transport error
 * belongs in the SDK and would make this function two lines long; that file is
 * generated and currently being edited by another session, so this reads the
 * string rather than racing them for it. The three forms below are all the
 * gateway can produce: the HTTP status line, and the GraphQL error body that
 * arrives with HTTP 200 (`errors[].message` / `extensions.code`).
 */

const AUTH_FAILURE = /\b401\b|\bunauthori[sz]ed\b|\bUNAUTHENTICATED\b|authentication required/i;

export function isAuthFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return AUTH_FAILURE.test(message);
}
