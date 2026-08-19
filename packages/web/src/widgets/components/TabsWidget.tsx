/**
 * TabsWidget — renders tabbed content. Each tab contains child widget instances.
 *
 * Config:
 *   tabs: Array<{ label: string; widgetIds: string[] }>
 *
 * Note: this is a standalone tabs widget, distinct from the 'tabs' section layout.
 * The section layout arranges sections; this widget provides tabs within a section.
 */

import { useState } from 'react';
import type { WidgetProps } from '../types.js';

interface TabConfig {
  label: string;
  widgetIds: string[];
}

interface TabsConfig {
  tabs: TabConfig[];
}

export function TabsWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as TabsConfig;
  const tabs = config.tabs ?? [];
  const [active, setActive] = useState(0);

  if (tabs.length === 0) return null;

  return (
    <div className="ed-widget ed-tabs-widget" data-widget-id={instance.id}>
      <div className="ed-tabs-widget__bar" role="tablist">
        {tabs.map((tab, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={active === i}
            className={`ed-tabs-widget__tab${active === i ? ' ed-tabs-widget__tab--active' : ''}`}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ed-tabs-widget__panel" role="tabpanel">
        {tabs[active]?.label}
      </div>
    </div>
  );
}
