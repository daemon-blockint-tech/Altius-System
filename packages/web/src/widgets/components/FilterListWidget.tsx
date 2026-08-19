/**
 * FilterListWidget — renders a set of filter controls that update a bound variable.
 *
 * Config:
 *   filters: Array<{ name: string; label: string; type: 'text' | 'select'; options?: string[] }>
 *   boundVariable: string  — variable name to write the filter object to
 */

import { useState, useCallback } from 'react';
import type { WidgetProps } from '../types.js';

interface FilterConfig {
  name: string;
  label: string;
  type: 'text' | 'select';
  options?: string[];
}

interface FilterListConfig {
  filters: FilterConfig[];
}

export function FilterListWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as FilterListConfig;
  const filters = config.filters ?? [];
  const varName = instance.boundVariable ?? 'filter';

  const [values, setValues] = useState<Record<string, string>>({});

  const update = useCallback((name: string, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      ctx.setVariable(varName, next);
      return next;
    });
  }, [ctx, varName]);

  return (
    <div className="ed-widget ed-filter-list" data-widget-id={instance.id}>
      {filters.map((f) => (
        <div key={f.name} className="ed-filter-list__item">
          <label className="ed-filter-list__label" htmlFor={`filter-${instance.id}-${f.name}`}>{f.label}</label>
          {f.type === 'select' ? (
            <select
              id={`filter-${instance.id}-${f.name}`}
              className="ed-filter-list__select"
              value={values[f.name] ?? ''}
              onChange={(e) => update(f.name, e.target.value)}
            >
              <option value="">All</option>
              {f.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : (
            <input
              id={`filter-${instance.id}-${f.name}`}
              type="text"
              className="ed-filter-list__input"
              value={values[f.name] ?? ''}
              onChange={(e) => update(f.name, e.target.value)}
              placeholder={f.label}
            />
          )}
        </div>
      ))}
    </div>
  );
}
