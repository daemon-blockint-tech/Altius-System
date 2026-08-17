/**
 * Shared search query parser for both storage providers.
 *
 * Converts a websearch-style query string into a structured form both
 * providers compile to identical SQL / in-memory matching:
 *
 *   - `"acute care"`   → phrase (contiguous substring, required)
 *   - `word1 word2`    → AND (both required)
 *   - `word1 OR word2` → at least one side must match
 *   - `-word`          → exclusion (must NOT match)
 *
 * No stemming. The parser is pure string analysis; providers call it and
 * then implement the match/scoring against their own column set. Keeping
 * the parser in SPI guarantees both providers see the same terms — the
 * 16 Aug divergence where Postgres matched a literal phrase and memory
 * split on whitespace was exactly this kind of provider-local parsing.
 */

/** A single search term: either a contiguous phrase or a bare word. */
export interface SearchTerm {
  kind: 'phrase' | 'word';
  /** Lowercased value. For phrases, internal whitespace is preserved. */
  value: string;
}

/**
 * Parsed query. Both providers must implement:
 *
 *   match = (all `required` match) AND (no `excluded` matches) and
 *           (if `orGroups` is non-empty, at least one group matches,
 *            where every term in that group must match)
 *
 * Scoring is provider-specific but must rank phrase matches above word
 * matches (phrase is more specific).
 */
export interface ParsedSearchQuery {
  /** Terms/phrases that MUST all match (AND). */
  required: SearchTerm[];
  /** Terms that must NOT match anywhere. */
  excluded: SearchTerm[];
  /**
   * Groups connected by OR. If non-empty, at least one group must match.
   * Each group is itself an AND of terms. A group with a single term is
   * a plain OR.
   */
  orGroups: SearchTerm[][];
}

/**
 * Parse a websearch-style query string.
 *
 * Returns an empty structure for blank/whitespace-only input — callers
 * should guard on that before calling (the providers already do).
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { required: [], excluded: [], orGroups: [] };
  }

  // Tokenize: split into tokens, keeping quoted phrases intact.
  // A leading '-' before a token (quoted or bare) marks exclusion.
  // 'OR' (case-insensitive, bare, surrounded by spaces) is a binary operator.
  const tokens = tokenize(trimmed);

  // OR has higher precedence than the implicit AND between bare terms.
  //   'unit acute OR critical'  →  unit AND (acute OR critical)
  //   'acute OR critical'        →  (acute OR critical), no required
  //   'a b c'                    →  a AND b AND c, no OR
  //
  // A term is "adjacent to OR" if an OR token immediately precedes or
  // follows it. Terms not adjacent to any OR are required.
  const orGroups: SearchTerm[][] = [];
  const required: SearchTerm[] = [];
  const excluded: SearchTerm[] = [];

  // Mark which token indices are adjacent to a REAL OR operator.
  // A leading or trailing 'OR' is a literal word, not an operator, so
  // terms next to it are NOT OR-adjacent — they stay required.
  const isOr = tokens.map((t) => t.kind === 'or');
  const isRealOr = tokens.map((_, idx) => {
    if (!isOr[idx]) return false;
    const hasPrevTerm = idx > 0 && !isOr[idx - 1];
    const hasNextTerm = idx < tokens.length - 1 && !isOr[idx + 1];
    return hasPrevTerm && hasNextTerm;
  });
  const adjacentToOr = tokens.map((_, idx) => {
    if (isOr[idx]) return false;
    const prev = idx > 0 && isRealOr[idx - 1];
    const next = idx < tokens.length - 1 && isRealOr[idx + 1];
    return prev || next;
  });

  // Walk tokens, building orGroups when we're in an OR-adjacent run.
  // Non-real OR tokens (leading/trailing) are emitted as the literal word 'or'.
  let currentGroup: SearchTerm[] | null = null;
  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx]!;
    if (tok.kind === 'or') {
      if (isRealOr[idx]) {
        // Flush any in-progress group; a new one starts at the next term.
        if (currentGroup !== null) {
          orGroups.push(currentGroup);
          currentGroup = null;
        }
      } else {
        // Literal word 'or'
        required.push({ kind: 'word', value: 'or' });
      }
      continue;
    }
    // Term
    const term: SearchTerm = {
      kind: tok.kind === 'phrase' ? 'phrase' : 'word',
      value: tok.value,
    };
    if (tok.excluded) {
      excluded.push(term);
      continue;
    }
    if (adjacentToOr[idx]) {
      if (currentGroup === null) currentGroup = [];
      currentGroup.push(term);
    } else {
      required.push(term);
    }
  }
  // Flush trailing group
  if (currentGroup !== null) orGroups.push(currentGroup);

  // Filter out empty terms (e.g. from `""`)
  const nonEmpty = (t: SearchTerm) => t.value.length > 0;
  return {
    required: required.filter(nonEmpty),
    excluded: excluded.filter(nonEmpty),
    orGroups: orGroups.map((g) => g.filter(nonEmpty)).filter((g) => g.length > 0),
  };
}

// ─── Tokenizer ───────────────────────────────────────────────────────────

type Token =
  | { kind: 'phrase' | 'word'; value: string; excluded: boolean }
  | { kind: 'or' };

/**
 * Split a query string into tokens, preserving quoted phrases.
 *
 *   `"acute care" -stable widget OR unit`
 *   → [phrase("acute care"), word("stable",excluded), word("widget"), or, word("unit")]
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && input[i] === ' ') i++;
    if (i >= len) break;

    // Check for exclusion prefix
    let excluded = false;
    if (input[i] === '-') {
      excluded = true;
      i++;
      if (i >= len) break;
    }

    if (input[i] === '"') {
      // Quoted phrase
      i++; // skip opening quote
      let phrase = '';
      while (i < len && input[i] !== '"') {
        phrase += input[i];
        i++;
      }
      if (i < len) i++; // skip closing quote
      // Collapse multiple internal spaces to a single space
      const collapsed = phrase.replace(/\s+/g, ' ').trim().toLowerCase();
      tokens.push({ kind: 'phrase', value: collapsed, excluded });
    } else {
      // Bare word — read until whitespace
      let word = '';
      while (i < len && input[i] !== ' ') {
        word += input[i];
        i++;
      }
      const lower = word.toLowerCase();
      if (!excluded && lower === 'or') {
        tokens.push({ kind: 'or' });
      } else {
        tokens.push({ kind: 'word', value: lower, excluded });
      }
    }
  }

  return tokens;
}
