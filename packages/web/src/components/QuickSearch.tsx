/**
 * Go anywhere by typing.
 *
 * The reference product puts a single search over everything behind one
 * shortcut, with chips to narrow it — because in a console with fifteen
 * screens and a hundred object types, hunting through a tree is the slowest
 * path to a known destination.
 *
 * What it searches is only what the deployment actually has: the screens this
 * pack can show, and the object types the gateway's schema exposes. Nothing is
 * invented, and a type the caller may not read never reaches the list, because
 * the introspection behind it is the governed one.
 *
 * Cmd/Ctrl+K rather than the reference's Ctrl+J: Ctrl+J is Chrome's Downloads
 * shortcut on Windows and Linux, and taking it would break a browser function
 * to match a keystroke.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type QuickSearchKind = 'screen' | 'type';

export interface QuickSearchItem {
  kind: QuickSearchKind;
  /** Stable within its kind. */
  id: string;
  label: string;
  /** Where it sits — the job for a screen, the pack for a type. */
  context: string;
}

export interface QuickSearchProps {
  open: boolean;
  items: QuickSearchItem[];
  onClose: () => void;
  onPick: (item: QuickSearchItem) => void;
}

const FILTERS: ReadonlyArray<{ id: 'all' | QuickSearchKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'screen', label: 'Screens' },
  { id: 'type', label: 'Object types' },
];

/** Case-insensitive substring, ranked so a prefix match comes first. */
function rank(item: QuickSearchItem, query: string): number {
  const label = item.label.toLowerCase();
  if (label.startsWith(query)) return 0;
  if (label.includes(query)) return 1;
  if (item.context.toLowerCase().includes(query)) return 2;
  return -1;
}

export function QuickSearch({ open, items, onClose, onPick }: QuickSearchProps): ReactNode {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | QuickSearchKind>('all');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reopening starts clean: the previous query is not where this search begins.
  useEffect(() => {
    if (open) {
      setQuery('');
      setFilter('all');
      setCursor(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped = filter === 'all' ? items : items.filter(i => i.kind === filter);
    if (!q) return scoped.slice(0, 20);
    return scoped
      .map(item => ({ item, score: rank(item, q) }))
      .filter(r => r.score >= 0)
      .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label))
      .slice(0, 20)
      .map(r => r.item);
  }, [items, query, filter]);

  useEffect(() => { setCursor(0); }, [query, filter]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const picked = results[cursor];
      if (picked) onPick(picked);
    }
  };

  return (
    <div className="al-quick" role="presentation" onMouseDown={onClose}>
      <div
        className="al-quick__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="al-quick__field">
          <span className="al-quick__icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="text"
            className="al-quick__input"
            placeholder="Search screens and object types…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search screens and object types"
            aria-controls="al-quick-results"
            autoComplete="off"
          />
          <button type="button" className="al-quick__close" onClick={onClose} aria-label="Close search">✕</button>
        </div>

        <div className="al-quick__filters">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              className={`al-chip${filter === f.id ? ' al-chip--on' : ''}`}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        <ul className="al-quick__results" id="al-quick-results" role="listbox">
          {results.length === 0 && (
            <li className="al-quick__empty">
              {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Nothing to search yet.'}
            </li>
          )}
          {results.map((item, i) => (
            <li key={`${item.kind}:${item.id}`} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                className={`al-quick__result${i === cursor ? ' al-quick__result--on' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => onPick(item)}
              >
                <span className="al-quick__kind">{item.kind === 'screen' ? 'Screen' : 'Type'}</span>
                <span className="al-quick__label">{item.label}</span>
                <span className="al-quick__context">{item.context}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="al-quick__hint">
          <kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>enter</kbd> to open · <kbd>esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
