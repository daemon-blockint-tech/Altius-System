/**
 * Where you are, and one click back to each step above.
 *
 * Every screen in the reference product carries this. It answers a question a
 * console with fifteen screens raises constantly — "what am I looking at, and
 * what is it part of?" — and it gives a record view a way out that is not the
 * browser's Back button.
 *
 * The last crumb is the current location: rendered as text, not a control,
 * because a link to where you already are is a lie about what clicking does.
 */

import type { ReactNode } from 'react';

export interface Crumb {
  label: string;
  /** Omitted on the final crumb — you are already there. */
  onClick?: () => void;
}

export function Breadcrumb({ items }: { items: Crumb[] }): ReactNode {
  if (items.length === 0) return null;

  return (
    <nav className="al-crumbs" aria-label="Breadcrumb">
      <ol className="al-crumbs__list">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="al-crumbs__item">
              {item.onClick && !last ? (
                <button type="button" className="al-crumbs__link" onClick={item.onClick}>
                  {item.label}
                </button>
              ) : (
                <span className="al-crumbs__current" aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!last && <span className="al-crumbs__sep" aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
