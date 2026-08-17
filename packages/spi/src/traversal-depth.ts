/**
 * Depth semantics for `TraversalStep.maxDepth`, shared by every provider.
 *
 * These live in the SPI rather than in each provider because they define the
 * contract, not an implementation detail. Two providers computing "how many
 * hops is this" from their own copy of the rule is exactly how the
 * Date-normalisation divergence happened: the behaviour differed, both sides
 * looked reasonable, and only a suite that ran against both could see it.
 *
 * The semantics `maxDepth: N` carries:
 *
 *   - Repeat this step's link type up to N hops from the current frontier.
 *   - A node reachable at ANY depth 1..N is in the step's result, not only
 *     one at exactly N. "Up to" is what the caller asked for, and it is what
 *     makes the feature useful — "everyone under this manager", not "everyone
 *     exactly three levels down".
 *   - A cyclic graph yields each node once and terminates: the hop loop is
 *     bounded by N regardless of shape. Providers additionally skip
 *     re-expanding a node within a step, which bounds cost on dense or cyclic
 *     regions but does not change the answer.
 *   - `maxDepth: 1` is identical to omitting it. That invariant is what lets
 *     the feature be added without changing any existing answer.
 */

import type { TraversalStep } from './ontology.js';

/** Hops a single step consumes. Absent maxDepth is one hop. */
export function stepDepth(step: TraversalStep): number {
  const depth = step.maxDepth;
  if (depth === undefined) return 1;
  if (!Number.isInteger(depth) || depth < 1) {
    // Zero or negative is a caller bug, not a request for nothing: silently
    // returning an empty set would look like "no such relationships exist".
    throw new Error(
      `TraversalStep.maxDepth must be an integer >= 1 (step "${step.linkType}" set ${String(depth)})`,
    );
  }
  return depth;
}

/**
 * Total hops a path consumes.
 *
 * The depth budget is counted in hops rather than steps. Counting steps would
 * let `maxDepth: 1000` past a limit whose whole purpose is to bound the work a
 * single traversal can do.
 */
export function totalHops(steps: TraversalStep[]): number {
  return steps.reduce((sum, step) => sum + stepDepth(step), 0);
}
