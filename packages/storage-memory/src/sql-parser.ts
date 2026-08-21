/**
 * Compatibility re-export: the parser itself moved to @altius/spi.
 *
 * It moved because it is pure and both providers need it — a Postgres query
 * service and an in-memory one that disagreed about what a WHERE clause meant
 * would return different rows for the same SQL. That rationale lives with the
 * parser, in `packages/spi/src/sql-parser.ts`.
 *
 * This file stays behind as a landing pad for work in flight. Four other
 * branches were open when the move landed, each with three files in this
 * package importing `./sql-parser.js`. Git DOES flag a conflict in every one of
 * those merges — that was measured, not assumed — so the move is not a silent
 * trap. What it is is an easy conflict to mis-resolve: the conflicting hunk is
 * an import block where both sides added a line, "keep both" looks obviously
 * right, and the result is a stale import of a file that no longer exists.
 * With this shim that mis-resolution compiles and behaves correctly instead.
 *
 * Delete it once nothing in this package imports it.
 */
export { parseSql } from '@altius/spi';
export type { ParsedSqlAst } from '@altius/spi';
