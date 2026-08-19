/**
 * MobileNavbarWidget — bottom navigation bar for mobile apps.
 *
 * Config:
 *   items: Array<{ label: string; pageId: string; icon?: string }>
 *   position: 'bottom' | 'top'
 *
 * Writes the selected page ID to a bound variable so other widgets
 * or the app shell can react to navigation.
 */

import { useState } from 'react';
import type { WidgetProps } from '../types.js';

interface NavItem { label: string; pageId: string; icon?: string; }
interface MobileNavbarConfig {
  items: NavItem[];
  position?: 'bottom' | 'top';
}

export function MobileNavbarWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as MobileNavbarConfig;
  const items = config.items ?? [];
  const position = config.position ?? 'bottom';
  const varName = instance.boundVariable ?? 'currentPage';
  const [active, setActive] = useState<string>(String(ctx.variables[varName] ?? items[0]?.pageId ?? ''));

  return (
    <nav className={`ed-widget ed-mobile-nav ed-mobile-nav--${position}`} data-widget-id={instance.id} role="navigation">
      {items.map((item) => (
        <button
          key={item.pageId}
          className={`ed-mobile-nav__item${item.pageId === active ? ' ed-mobile-nav__item--active' : ''}`}
          onClick={() => {
            setActive(item.pageId);
            ctx.setVariable(varName, item.pageId);
            ctx.navigate(item.pageId);
          }}
        >
          {item.icon && <span className="ed-mobile-nav__icon">{item.icon}</span>}
          <span className="ed-mobile-nav__label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
