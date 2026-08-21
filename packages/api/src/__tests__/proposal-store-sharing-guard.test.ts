/**
 * Guard against the human-in-the-loop surface drifting onto its own store.
 *
 * `/api/v1/change-proposals` and `/api/v1/ai-proposals` are two surfaces over
 * one record: an AI agent proposes a change on one, a human approves it on the
 * other. They used to be backed by different stores — `humanInTheLoopService`
 * built its own private `InMemoryChangeProposalStore` — and neither surface
 * erred about it. Each answered correctly about a record the other had never
 * heard of, and on a Postgres deployment the approval half was the one living
 * in a Map.
 *
 * A source-text test is the right altitude, for the same reason the #14 wiring
 * guard is one: the `deps` literal is not exported, the defect is invisible at
 * runtime (both surfaces work perfectly in isolation), and it only shows up as
 * an approval nobody can find. The conformance suite pins that a *shared* store
 * behaves correctly; this pins that the API actually shares one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const serverPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'server.ts');
const source = readFileSync(serverPath, 'utf8');

/** The `const deps: ApiDependencies = { … };` object literal, brace-matched. */
function depsObjectLiteral(src: string): string {
  const start = src.indexOf('const deps: ApiDependencies = {');
  if (start === -1) throw new Error('deps object literal not found in server.ts');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error('unbalanced braces in deps object literal');
}

function lineFor(literal: string, key: string): string {
  const line = literal.split('\n').find(l => new RegExp(`^\\s*${key}:`).test(l));
  if (!line) throw new Error(`${key} is not wired in the deps literal`);
  return line;
}

describe('change-proposal store sharing', () => {
  const literal = depsObjectLiteral(source);

  it('hands the human-in-the-loop surface the same store as the change-proposal surface', () => {
    const storeLine = lineFor(literal, 'changeProposalStore');
    const hitlLine = lineFor(literal, 'humanInTheLoopService');

    // Whatever identifier the store slot names, the in-memory HITL fallback has
    // to be handed it. Deriving the name rather than hardcoding it keeps this
    // working through a rename.
    const shared = storeLine.match(/changeProposalStore:\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*,/)?.[1];
    expect(
      shared,
      'changeProposalStore should name a store built once above the deps literal, so the\n' +
        'human-in-the-loop surface can be handed the same instance. Inlining a `new …Store()`\n' +
        'here makes that impossible.',
    ).toBeTruthy();

    expect(
      hitlLine.includes(`(${shared})`),
      'humanInTheLoopService must be constructed from the same store instance as\n' +
        `changeProposalStore (\`${shared}\`). Letting it build its own means an approval\n` +
        'recorded on /api/v1/ai-proposals is invisible on /api/v1/change-proposals, and\n' +
        'neither surface reports anything wrong.\n' +
        `Offending wiring: ${hitlLine.trim()}`,
    ).toBe(true);
  });

  it('keeps the human-in-the-loop surface durable under Postgres', () => {
    // It graduated out of `nonDurableServices`, so it must carry the ternary
    // the #14 guard looks for rather than sit in the literal unconditionally.
    const hitlLine = lineFor(literal, 'humanInTheLoopService');
    expect(hitlLine).toMatch(/pgPool\s*\?/);
    expect(hitlLine).toContain('PostgresHumanInTheLoopService');
  });

  it('builds the shared store behind a pgPool ternary', () => {
    // Hoisting the store above the literal moves it out of the #14 guard's
    // view, so the choice it guards is asserted here instead.
    expect(source).toMatch(
      /const changeProposals = pgPool \? new PostgresChangeProposalStore\(pgPool\) : new InMemoryChangeProposalStore\(\);/,
    );
  });
});
