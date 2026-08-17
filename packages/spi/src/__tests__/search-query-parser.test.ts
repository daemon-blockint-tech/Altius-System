/**
 * Unit tests for the shared search query parser.
 *
 * The parser converts a websearch-style query string into a structured
 * form both providers compile identically:
 *   - `"phrase"`          → contiguous substring (required)
 *   - `word1 word2`       → AND (both required)
 *   - `word1 OR word2`    → either must match
 *   - `-word`             → exclusion (must NOT match)
 *
 * No stemming. The parser is pure string analysis — no provider I/O — so
 * these tests pin the contract both providers must implement.
 */
import { describe, it, expect } from 'vitest';
import { parseSearchQuery, type ParsedSearchQuery } from '../search-query-parser.js';

describe('parseSearchQuery', () => {
  describe('plain substring (backward compatibility)', () => {
    it('treats a bare word as a single required term', () => {
      const r = parseSearchQuery('widget');
      expect(r.required).toEqual([{ kind: 'word', value: 'widget' }]);
      expect(r.excluded).toEqual([]);
      expect(r.orGroups).toEqual([]);
    });

    it('treats a multi-word query with no operators as AND of all terms', () => {
      const r = parseSearchQuery('acute care');
      expect(r.required).toEqual([
        { kind: 'word', value: 'acute' },
        { kind: 'word', value: 'care' },
      ]);
      expect(r.excluded).toEqual([]);
      expect(r.orGroups).toEqual([]);
    });
  });

  describe('phrase', () => {
    it('extracts a quoted phrase as a single contiguous term', () => {
      const r = parseSearchQuery('"acute care"');
      expect(r.required).toEqual([{ kind: 'phrase', value: 'acute care' }]);
    });

    it('mixes phrase and bare words as AND', () => {
      const r = parseSearchQuery('"acute care" unit');
      expect(r.required).toEqual([
        { kind: 'phrase', value: 'acute care' },
        { kind: 'word', value: 'unit' },
      ]);
    });

    it('handles empty quotes as no term', () => {
      const r = parseSearchQuery('"" widget');
      expect(r.required).toEqual([{ kind: 'word', value: 'widget' }]);
    });
  });

  describe('OR', () => {
    it('splits on OR into an orGroup', () => {
      const r = parseSearchQuery('acute OR critical');
      expect(r.required).toEqual([]);
      expect(r.orGroups).toEqual([
        [{ kind: 'word', value: 'acute' }],
        [{ kind: 'word', value: 'critical' }],
      ]);
    });

    it('combines OR with required terms', () => {
      const r = parseSearchQuery('unit acute OR critical');
      expect(r.required).toEqual([{ kind: 'word', value: 'unit' }]);
      expect(r.orGroups).toEqual([
        [{ kind: 'word', value: 'acute' }],
        [{ kind: 'word', value: 'critical' }],
      ]);
    });

    it('handles phrase on one side of OR', () => {
      const r = parseSearchQuery('"acute care" OR critical');
      expect(r.orGroups).toEqual([
        [{ kind: 'phrase', value: 'acute care' }],
        [{ kind: 'word', value: 'critical' }],
      ]);
    });
  });

  describe('exclusion', () => {
    it('collects -word as excluded', () => {
      const r = parseSearchQuery('acute -stable');
      expect(r.required).toEqual([{ kind: 'word', value: 'acute' }]);
      expect(r.excluded).toEqual([{ kind: 'word', value: 'stable' }]);
    });

    it('excludes a phrase with -"..."', () => {
      const r = parseSearchQuery('acute -"critical care"');
      expect(r.required).toEqual([{ kind: 'word', value: 'acute' }]);
      expect(r.excluded).toEqual([{ kind: 'phrase', value: 'critical care' }]);
    });
  });

  describe('combined', () => {
    it('parses unit "acute care" OR critical -stable', () => {
      const r = parseSearchQuery('unit "acute care" OR critical -stable');
      expect(r.required).toEqual([
        { kind: 'word', value: 'unit' },
      ]);
      expect(r.excluded).toEqual([{ kind: 'word', value: 'stable' }]);
      expect(r.orGroups).toEqual([
        [{ kind: 'phrase', value: 'acute care' }],
        [{ kind: 'word', value: 'critical' }],
      ]);
    });
  });

  describe('edge cases', () => {
    it('returns empty for whitespace-only input', () => {
      const r = parseSearchQuery('   ');
      expect(r.required).toEqual([]);
      expect(r.excluded).toEqual([]);
      expect(r.orGroups).toEqual([]);
    });

    it('treats OR at start or end as a bare word', () => {
      // Leading/trailing OR is not a binary operator — treat as literal
      const r = parseSearchQuery('OR widget');
      expect(r.required).toEqual([{ kind: 'word', value: 'or' }, { kind: 'word', value: 'widget' }]);
    });

    it('lowercases terms for case-insensitive matching', () => {
      const r = parseSearchQuery('Widget');
      expect(r.required[0]?.value).toBe('widget');
    });

    it('collapses internal whitespace in phrases', () => {
      const r = parseSearchQuery('"acute   care"');
      expect(r.required[0]?.value).toBe('acute care');
    });
  });
});

describe('ParsedSearchQuery matching', () => {
  // Helper: simulate the match logic both providers share
  function matchesField(
    fieldValue: string,
    parsed: ParsedSearchQuery,
  ): { matched: boolean; score: number } {
    const lower = fieldValue.toLowerCase();
    let score = 0;

    // All required must match
    for (const term of parsed.required) {
      if (!lower.includes(term.value)) return { matched: false, score: 0 };
      score += term.kind === 'phrase' ? 3 : 1;
    }

    // No excluded may match
    for (const term of parsed.excluded) {
      if (lower.includes(term.value)) return { matched: false, score: 0 };
    }

    // If OR groups exist, at least one group must match (all terms in it)
    if (parsed.orGroups.length > 0) {
      let orSatisfied = false;
      for (const group of parsed.orGroups) {
        if (group.every((t) => lower.includes(t.value))) {
          score += group.reduce((s, t) => s + (t.kind === 'phrase' ? 3 : 1), 0);
          orSatisfied = true;
          break;
        }
      }
      if (!orSatisfied) return { matched: false, score: 0 };
    }

    return { matched: true, score };
  }

  it('AND: both terms must be present', () => {
    const p = parseSearchQuery('acute care');
    expect(matchesField('acute care unit', p).matched).toBe(true);
    expect(matchesField('acute unit', p).matched).toBe(false);
    expect(matchesField('care unit', p).matched).toBe(false);
  });

  it('phrase: contiguous only', () => {
    const p = parseSearchQuery('"acute care"');
    expect(matchesField('acute care unit', p).matched).toBe(true);
    expect(matchesField('acute, then care', p).matched).toBe(false);
  });

  it('OR: either term', () => {
    const p = parseSearchQuery('acute OR critical');
    expect(matchesField('acute patient', p).matched).toBe(true);
    expect(matchesField('critical patient', p).matched).toBe(true);
    expect(matchesField('stable patient', p).matched).toBe(false);
  });

  it('exclusion: -word filters out', () => {
    const p = parseSearchQuery('acute -stable');
    expect(matchesField('acute critical', p).matched).toBe(true);
    expect(matchesField('acute stable', p).matched).toBe(false);
  });

  it('phrase scores higher than separate words', () => {
    const phrase = parseSearchQuery('"acute care"');
    const words = parseSearchQuery('acute care');
    const field = 'acute care unit';
    expect(matchesField(field, phrase).score).toBeGreaterThan(
      matchesField(field, words).score,
    );
  });
});
