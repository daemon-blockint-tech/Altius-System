/** HeaderWidget — renders a section header with optional subtitle. */

import type { WidgetProps } from '../types.js';

interface HeaderConfig { title: string; subtitle?: string; level?: 1 | 2 | 3 | 4 | 5 | 6; }

export function HeaderWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as HeaderConfig;
  const level = config.level ?? 2;
  const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
  return (
    <div className="ed-widget ed-header-widget" data-widget-id={instance.id}>
      <Tag className="ed-header-widget__title">{config.title ?? ''}</Tag>
      {config.subtitle && <p className="ed-header-widget__subtitle">{config.subtitle}</p>}
    </div>
  );
}
