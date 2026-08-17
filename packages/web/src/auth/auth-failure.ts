/**
 * Did this request fail because of who the caller is, rather than what they
 * asked for?
 *
 * The distinction drives what the user is shown: a data failure is worth a
 * Retry button, an identity failure is not — retrying an anonymous request
 * produces the same 401 forever, which is exactly what the app used to offer.
 *
 * Read structurally. The SDK throws `AltiusRequestError` carrying the HTTP
 * status and any GraphQL `extensions.code` values, so this checks those rather
 * than matching prose — an earlier version read the message with a regex,
 * because at the time the SDK threw a bare Error and its generator was being
 * edited by another session. It no longer does.
 *
 * Duck-typed rather than `instanceof AltiusRequestError`. The SDK is a separate
 * package consumed from its build output, so a duplicated module instance would
 * make `instanceof` false against an error that is structurally identical, and
 * the app would render an unauthenticated user a Retry button that cannot work.
 * The shape is the contract here.
 *
 * 403 is deliberately absent: it means the caller IS identified and lacks
 * permission, so returning them to sign-in loops them through a login that
 * changes nothing.
 */

/** The subset of AltiusRequestError this predicate needs. */
interface RequestErrorLike {
  status?: unknown;
  codes?: unknown;
}

export function isAuthFailure(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;

  const { status, codes } = err as RequestErrorLike;
  if (status === 401) return true;
  return Array.isArray(codes) && codes.includes('UNAUTHENTICATED');
}
