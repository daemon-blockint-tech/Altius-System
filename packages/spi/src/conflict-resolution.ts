/**
 * Conflict resolution — one implementation of "which value wins", both providers.
 *
 * A `DataConflict` is a datasource sync and a user edit disagreeing about one
 * field. Resolving it picks a winner, and picking is a pure function of the
 * conflict and the strategy: nothing about it is storage-specific.
 *
 * It lives here rather than in each provider because the output is *data*. Two
 * providers that disagreed about `latest_value_wins` would write different
 * values into the same field for the same conflict, and neither would error —
 * the discrepancy would only show up much later, in the data itself, with no
 * record of which deployment produced it. That is a worse failure than losing
 * the conflict outright, because a lost conflict is at least visibly gone.
 */

import type { ConflictStrategy, DataConflict } from './data-pipelines.js';

/**
 * The value that wins under `strategy`.
 *
 * `manual` returns `manualValue` verbatim, including `undefined` when the
 * caller passed none — resolving manually without supplying a value stores no
 * value, which is the in-memory behaviour and is reproduced rather than
 * defended against here.
 */
export function resolveConflictValue(
  conflict: DataConflict,
  strategy: ConflictStrategy,
  manualValue?: unknown,
): unknown {
  switch (strategy) {
    case 'user_edits_win':
      return conflict.userValue;
    case 'latest_value_wins':
      // A plain string comparison, which is correct for ISO-8601 timestamps in
      // the same offset and only for those. Note the tie goes to the
      // datasource: strictly-greater, not greater-or-equal.
      return conflict.userTimestamp > conflict.datasourceTimestamp
        ? conflict.userValue
        : conflict.datasourceValue;
    case 'merge':
      // A shallow merge with the user's fields on top, and only when both
      // sides are non-null objects — anything else falls back to the user's
      // value rather than attempting a merge of scalars.
      if (
        typeof conflict.userValue === 'object' && conflict.userValue &&
        typeof conflict.datasourceValue === 'object' && conflict.datasourceValue
      ) {
        return {
          ...(conflict.datasourceValue as Record<string, unknown>),
          ...(conflict.userValue as Record<string, unknown>),
        };
      }
      return conflict.userValue;
    case 'manual':
      return manualValue;
  }
}

/** The strategy applied when a tenant has not chosen one. */
export const DEFAULT_CONFLICT_STRATEGY: ConflictStrategy = 'user_edits_win';
