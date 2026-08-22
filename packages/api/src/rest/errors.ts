/**
 * REST error handling.
 *
 * Unified error model (Section 8.8) adapted for REST responses.
 * Maps error categories to HTTP status codes and produces the
 * standard error envelope described in the spec.
 */

import type { ErrorCategory, ErrorCode } from '@altius/spi';
import type { RestResponse } from './types.js';
import { logger } from '../logger.js';

interface RestErrorOptions {
  code: ErrorCode;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  traceId?: string;
}

/**
 * Map error category to HTTP status code.
 * Mirrors the GraphQL error categories but uses standard HTTP semantics.
 */
export function mapErrorToHttpStatus(category: ErrorCategory): number {
  const mapping: Record<string, number> = {
    validation: 400,
    authorization: 403,
    consent: 403,
    not_found: 404,
    conflict: 409,
    precondition: 412,
    rate_limit: 429,
    quota: 429,
    timeout: 504,
    system: 500,
    unsupported: 503,
  };
  return mapping[category] ?? 500;
}

/**
 * Create a REST error response with the unified error envelope.
 *
 * Response body format matches Section 8.8:
 * {
 *   "error": {
 *     "code": "CONSENT_DENIED",
 *     "category": "consent",
 *     "message": "...",
 *     "retryable": false,
 *     "details": { ... },
 *     "traceId": "...",
 *     "timestamp": "..."
 *   }
 * }
 */
export function createRestErrorResponse(opts: RestErrorOptions): RestResponse {
  const status = mapErrorToHttpStatus(opts.category);

  return {
    status,
    body: {
      error: {
        code: opts.code,
        category: opts.category,
        message: opts.message,
        retryable: opts.retryable,
        details: opts.details ?? {},
        traceId: opts.traceId,
        timestamp: new Date().toISOString(),
      },
    },
  };
}

/**
 * Convert an unknown error into a REST error response.
 * Extracts error code if available, otherwise defaults to INTERNAL_ERROR.
 */
export function wrapErrorToRest(err: unknown, traceId?: string): RestResponse {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const code = extractErrorCode(err);
  const category = mapCodeToCategory(code);

  // Never expose internal error messages to clients for system/timeout errors.
  const withheld = category === 'system' || category === 'timeout';
  const message = withheld ? 'An internal error occurred' : rawMessage;

  // Withholding the message from the caller is right; losing it is not. The
  // response hands the client a traceId as if it were a lookup key, and
  // nothing was ever written under it — an operator handed that id had
  // nothing to search. Log exactly what the caller was not told, keyed by the
  // same id, so the trade is "the client cannot see it" rather than "no one
  // can".
  if (withheld) {
    logger.error(
      { traceId, code, err: rawMessage, stack: err instanceof Error ? err.stack : undefined },
      'Request failed with an internal error — message withheld from the caller',
    );
  }

  return createRestErrorResponse({
    code,
    category,
    message,
    retryable: category === 'system' || category === 'timeout',
    traceId,
  });
}

function extractErrorCode(err: unknown): ErrorCode {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as Record<string, unknown>).code === 'string') {
    return (err as Record<string, unknown>).code as ErrorCode;
  }
  // createAltiusError builds a GraphQLError, which carries the code under
  // extensions.altius rather than on the error itself. Any logic shared
  // between the GraphQL and REST transports throws that shape, and reading
  // only the top level turned every one of them into a 500 with the message
  // replaced by "An internal error occurred" — a 403 became indistinguishable
  // from a crash.
  const extensions = (err as { extensions?: { altius?: { code?: unknown } } })?.extensions;
  if (typeof extensions?.altius?.code === 'string') {
    return extensions.altius.code as ErrorCode;
  }
  return 'INTERNAL_ERROR';
}

/**
 * Which HTTP family an Altius error code belongs to.
 *
 * Exported because the action route needs it too: the pipeline reports some
 * failures in-band (in `result.errors`) rather than by throwing, and those
 * still owe the caller a real status — a stale `If-Match` is a 412 whether the
 * refusal arrived as an exception or as a result field.
 */
export function mapCodeToCategory(code: ErrorCode): ErrorCategory {
  const mapping: Record<string, ErrorCategory> = {
    VALIDATION_ERROR: 'validation',
    INVALID_FILTER: 'validation',
    SCHEMA_VIOLATION: 'validation',
    UNAUTHORIZED: 'authorization',
    FORBIDDEN: 'authorization',
    CONSENT_DENIED: 'consent',
    CONSENT_UNKNOWN: 'consent',
    VERSION_CONFLICT: 'precondition',
    OPTIMISTIC_LOCK_FAILED: 'precondition',
    RATE_LIMITED: 'rate_limit',
    QUOTA_EXCEEDED: 'quota',
    OBJECT_NOT_FOUND: 'not_found',
    LINK_NOT_FOUND: 'not_found',
    TYPE_NOT_FOUND: 'not_found',
    // A name clash on create, not a stale write — 409, where VERSION_CONFLICT
    // is the 412. Without this row the category falls through to 'system' and
    // a deliberate refusal reaches the caller as a 500 with the message
    // withheld, indistinguishable from a crash.
    ALREADY_EXISTS: 'conflict',
    // A dataset that reads its file in place refuses writes deliberately, and
    // the refusal names what to do instead — worth reaching the caller rather
    // than falling through to 'system' and being withheld as a 500.
    DATASET_READ_ONLY: 'conflict',
    EXTERNAL_SOURCE_MISSING: 'conflict',
    INTERNAL_ERROR: 'system',
    PROVIDER_ERROR: 'system',
    OPERATION_TIMEOUT: 'timeout',
    LLM_NOT_CONFIGURED: 'unsupported',
  };
  return mapping[code] ?? 'system';
}
