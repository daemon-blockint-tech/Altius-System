/**
 * SearchBarWidget — a text search input that writes to a bound variable.
 */

import type { WidgetProps } from '../types.js';

interface SearchBarConfig {
  placeholder?: string;
}

export function SearchBarWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as SearchBarConfig;
  const varName = instance.boundVariable ?? 'search';

  return (
    <input
      type="search"
      className="ed-widget ed-search-bar"
      data-widget-id={instance.id}
      placeholder={config.placeholder ?? 'Search…'}
      value={String(ctx.variables[varName] ?? '')}
      onChange={(e) => ctx.setVariable(varName, e.target.value)}
    />
  );
}
