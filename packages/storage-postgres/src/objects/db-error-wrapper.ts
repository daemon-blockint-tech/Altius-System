/**
 * Wrap raw Postgres errors into Altius-shaped errors with sanitized messages.
 *
 * Postgres constraint-violation messages carry row values — e.g.
 *   `duplicate key value violates unique constraint "patient_nhs_number_key"
 *    Key (nhs_number)=(1234567890) already exists.`
 * That value is PII, and it propagates through the SPI to the API layer,
 * where `wrapErrorToRest` logs `err.message` for system errors. This wrapper
 * catches known PG error codes at the storage boundary and re-throws with a
 * message that names the constraint type and field but never the value.
 *
 * The error code is set to an Altius ErrorCode so `mapCodeToCategory` routes
 * it to the right HTTP status (409 for conflicts, 400 for validation, etc.)
 * instead of falling through to 500/system where the message gets logged.
 */

/** PG error codes that carry row values in their messages. */
const SANITIZE_CODES: Record<string, { code: string; label: string }> = {
  // unique_violation — message includes `Key (col)=(value) already exists`
  '23505': { code: 'ALREADY_EXISTS', label: 'A record with this key already exists' },
  // foreign_key_violation — message includes the conflicting key value
  '23503': { code: 'PROVIDER_ERROR', label: 'A referenced record does not exist' },
  // not_null_violation — message includes the column name (safe) but not values
  '23502': { code: 'VALIDATION_ERROR', label: 'A required field is missing' },
  // string_data_right_truncation — message includes the type but not the value
  '22001': { code: 'VALIDATION_ERROR', label: 'A value exceeds the maximum length for its field' },
  // numeric_value_out_of_range — message includes the type but not the value
  '22003': { code: 'VALIDATION_ERROR', label: 'A numeric value is out of range for its field' },
  // invalid_text_representation — message includes the type and the bad input
  '22P02': { code: 'VALIDATION_ERROR', label: 'A value has invalid syntax for its field type' },
  // check_violation — message may include the checked value
  '23514': { code: 'VALIDATION_ERROR', label: 'A value fails a check constraint' },
  // exclusion_violation — message may include the conflicting values
  '23P01': { code: 'PROVIDER_ERROR', label: 'A value conflicts with an exclusion constraint' },
};

/**
 * Extract a column name from a PG error detail string, e.g.
 * `Key (nhs_number)=(1234567890) already exists.` → `nhs_number`.
 * Returns undefined if no column can be extracted.
 */
function extractColumn(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  // `Key (col)=(...)` or `Key (col1, col2)=(...)`
  const match = detail.match(/Key \(([^)]+)\)=/);
  if (match) return match[1];
  return undefined;
}

/**
 * Wrap a database operation, catching PG errors with known codes and
 * re-throwing with a sanitized message that does not contain row values.
 *
 * @param fn - The async database operation to wrap.
 * @param context - `{ type, operation }` for the error message.
 */
export async function wrapDatabaseError<T>(
  fn: () => Promise<T>,
  context: { type: string; operation: string },
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const pgErr = err as { code?: string; detail?: string; constraint?: string };
    const entry = pgErr.code ? SANITIZE_CODES[pgErr.code] : undefined;
    if (!entry) throw err;

    const column = extractColumn(pgErr.detail) ?? pgErr.constraint ?? 'unknown';
    const sanitized = new Error(
      `${context.operation} on ${context.type} failed: ${entry.label} (field: ${column})`,
    ) as Error & { code: string };
    sanitized.code = entry.code;
    throw sanitized;
  }
}
