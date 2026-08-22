/**
 * Guard against the non-durable wiring defect coming back.
 *
 * The original bug was not one service — it was the shape of the wiring. Every
 * phase that adds a capability adds an `InMemoryX` to the `deps` object, and a
 * flat list gives no signal that doing so is different from the line above it.
 * Phase 16 added `geospatialMapService` that way; Phases 17-20 added nine more.
 * Each one silently gained a live route on a Postgres deployment that answers
 * 200 and drops the write.
 *
 * So this asserts the invariant at the source level, where the mistake is made:
 * inside the `deps` object literal, an in-memory implementation may appear ONLY
 * as the fallback of a `pgPool ? … : …` ternary. Anything genuinely
 * memory-only belongs in `nonDurableServices`, which is built above the literal
 * and spread in, and is therefore withheld under Postgres unless the operator
 * opts in.
 *
 * A source-text test is the right altitude here: the defect is invisible at
 * runtime (the service works fine in dev, where memory is the correct choice)
 * and only shows up in production, which no unit test reaches.
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

/**
 * Re-join a wrapped ternary onto one logical line.
 *
 * A property whose ternary does not fit on one line is formatted as
 *   `x: pgPool\n  ? new PostgresX(pgPool)\n  : new InMemoryX(),`
 * so a per-line scan sees only the `: new InMemoryX(),` branch and reports a
 * correctly-wired service. Continuation lines start with `?` or `:`.
 */
export function logicalLines(literal: string): string[] {
  const out: string[] = [];
  for (const line of literal.split('\n')) {
    const trimmed = line.trim();
    if ((trimmed.startsWith('?') || trimmed.startsWith(':')) && out.length > 0) {
      out[out.length - 1] += ` ${trimmed}`;
    } else {
      out.push(trimmed);
    }
  }
  return out;
}

/** In-memory implementations wired without a `pgPool ? … : …` guard. */
export function directInMemoryWirings(literal: string): string[] {
  const offenders: string[] = [];
  for (const line of logicalLines(literal)) {
    const m = line.match(/new (InMemory[A-Za-z0-9_]+)\s*\(/);
    if (!m) continue;
    // Legitimate: `x: pgPool ? new PostgresX(pgPool) : new InMemoryX()`.
    if (/pgPool\s*\?/.test(line)) continue;
    offenders.push(`${m[1]} — ${line.trim()}`);
  }
  return offenders;
}

describe('non-durable service wiring', () => {
  it('still catches an in-memory service wired with no ternary at all', () => {
    expect(directInMemoryWirings('{\n  fooService: new InMemoryFooService(),\n}'))
      .toEqual(['InMemoryFooService — fooService: new InMemoryFooService(),']);
  });

  it('accepts a ternary the formatter wrapped across lines', () => {
    expect(directInMemoryWirings('{\n  fooService: pgPool\n    ? new PostgresFooService(pgPool)\n    : new InMemoryFooService(),\n}'))
      .toEqual([]);
  });

  it('keeps every in-memory implementation in the deps literal behind a pgPool ternary', () => {
    const literal = depsObjectLiteral(source);
    const offenders = directInMemoryWirings(literal);

    expect(
      offenders,
      'An in-memory service is wired directly into `deps`. On a Postgres deployment its\n' +
        'routes register and answer 200 while writing to a process-local Map that is lost on\n' +
        'restart and never shared across replicas. Either give it a Postgres implementation\n' +
        'and use `pgPool ? new PostgresX(pgPool) : new InMemoryX()`, or move it into the\n' +
        '`nonDurableServices` object so it is withheld unless ALLOW_NON_DURABLE_SERVICES is\n' +
        'set. Offending wiring:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  it('builds the non-durable services behind the opt-in gate', () => {
    // The gate must wrap the object, not be applied after the fact — otherwise
    // the services are constructed regardless and only hidden from `deps`.
    expect(source).toMatch(/const nonDurableServices = nonDurableServicesEnabled\s*\n?\s*\?\s*\{/);
    expect(depsObjectLiteral(source)).toContain('...nonDurableServices');
  });

  it('derives the boot log from the wired keys rather than a hand-written list', () => {
    // A hand-maintained string silently goes stale the next time a service is
    // added, which is exactly how this defect stayed invisible.
    expect(source).toContain('Object.keys(nonDurableServices)');
  });
});
