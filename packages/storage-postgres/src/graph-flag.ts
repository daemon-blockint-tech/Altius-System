/**
 * Per-pool switch for the Apache AGE graph mirror.
 *
 * AGE is a write-only mirror today: traversal runs through SQL JOINs
 * (links/traversal.ts), and nothing reads a single Cypher result. Yet
 * `CREATE EXTENSION IF NOT EXISTS age` was emitted unconditionally into the
 * DDL that `applySchema` runs inside its migration transaction, so schema
 * application failed outright on any Postgres without the AGE binary — every
 * managed service (Supabase, RDS, Cloud SQL) among them. A deployment was
 * refused over a graph no query touches.
 *
 * `enableGraph: false` on the provider config turns both halves off: the DDL
 * stops emitting the extension, and the write mirror stops being attempted.
 * Skipping the writes matters as much as skipping the DDL — the AGE helpers
 * already fail safely inside a savepoint, but each failure logs at error
 * level, so leaving them on would turn every insert on a managed Postgres
 * into an error line.
 *
 * Keyed by Pool rather than held as a module flag because a single process
 * can run several providers with different settings — the conformance suite
 * builds a fresh one per test — and a global would make the last provider
 * constructed silently decide for all of them.
 */

import type { Pool } from 'pg';

const graphDisabled = new WeakSet<Pool>();

/** Turn the AGE write mirror off for one provider's pool. */
export function disableGraphWrites(pool: Pool): void {
  graphDisabled.add(pool);
}

/** Whether AGE writes should be attempted for this pool. */
export function graphWritesEnabled(pool: Pool): boolean {
  return !graphDisabled.has(pool);
}
