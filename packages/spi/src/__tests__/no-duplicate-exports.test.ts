/**
 * Merge-artifact guard. Three times on 21 Aug a merge of two concurrently
 * developed branches kept BOTH copies of the same `export { X } from './y.js'`
 * block in index.ts, breaking every downstream build (TS2300). This oracle
 * makes the duplicate a test failure at merge time instead of a build break
 * discovered by whoever pulls next.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function duplicateExports(file: string): string[] {
  const src = readFileSync(file, 'utf-8');
  const seen = new Set<string>();
  const dupes: string[] = [];
  const re = /^export\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)';/gms;
  for (const m of src.matchAll(re)) {
    const isType = Boolean(m[1]);
    for (const raw of m[2]!.split(',')) {
      const spec = raw.trim();
      if (!spec) continue;
      // What the module exports is the ALIAS when one is present:
      // `export { MarkingRecord as MarkingDefinition }` exports
      // MarkingDefinition and does not collide with a plain MarkingRecord
      // export -- tsc raises no TS2300 for it. Keying on the source name
      // flagged exactly those legal aliases as duplicates. (Two equivalent
      // fixes for this collided in a merge; this keeps the regex form.)
      const name = spec.replace(/^.*\s+as\s+/, '');
      if (!name) continue;
      const key = `${isType ? 'type:' : ''}${name}`;
      if (seen.has(key)) dupes.push(`${key} (from ${m[3]})`);
      seen.add(key);
    }
  }
  return dupes;
}

describe('index.ts export uniqueness', () => {
  it('spi index has no duplicate exported identifiers', () => {
    expect(duplicateExports(resolve(HERE, '../index.ts'))).toEqual([]);
  });
});
