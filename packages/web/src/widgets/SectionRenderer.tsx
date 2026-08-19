/**
 * SectionRenderer — renders a section with its layout and widgets.
 *
 * Supports the six layout kinds from WorkshopAppSection:
 *   stack, grid, tabs, columns, sidebar, loop
 *
 * Each layout renders its widget instances via WidgetRenderer.
 */

import type { WidgetContext, WorkshopAppSection } from './types.js';
import { WidgetRenderer } from './WidgetRenderer.js';

export interface SectionRendererProps {
  section: WorkshopAppSection;
  ctx: WidgetContext;
}

export function SectionRenderer({ section, ctx }: SectionRendererProps): React.ReactNode {
  const { layout, widgets, layoutParams } = section;

  switch (layout) {
    case 'stack':
      return (
        <div className="ed-section ed-section--stack" data-section-id={section.id}>
          {section.name && <h3 className="ed-section__name">{section.name}</h3>}
          {widgets.map((w) => (
            <WidgetRenderer key={w.id} instance={w} ctx={ctx} />
          ))}
        </div>
      );

    case 'grid': {
      const cols = (layoutParams?.columns as number) ?? 2;
      const gap = (layoutParams?.gap as string) ?? '16px';
      return (
        <div
          className="ed-section ed-section--grid"
          data-section-id={section.id}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}
        >
          {section.name && <h3 className="ed-section__name">{section.name}</h3>}
          {widgets.map((w) => (
            <WidgetRenderer key={w.id} instance={w} ctx={ctx} />
          ))}
        </div>
      );
    }

    case 'tabs': {
      const tabLabels = (layoutParams?.tabs as string[]) ?? widgets.map((_, i) => `Tab ${i + 1}`);
      return (
        <TabsLayout section={section} tabLabels={tabLabels} ctx={ctx} />
      );
    }

    case 'columns': {
      const colCount = (layoutParams?.columns as number) ?? 2;
      const perCol = Math.ceil(widgets.length / colCount);
      const cols = Array.from({ length: colCount }, (_, i) =>
        widgets.slice(i * perCol, (i + 1) * perCol),
      );
      return (
        <div className="ed-section ed-section--columns" data-section-id={section.id} style={{ display: 'flex', gap: '16px' }}>
          {section.name && <h3 className="ed-section__name">{section.name}</h3>}
          {cols.map((col, i) => (
            <div key={i} className="ed-section__column" style={{ flex: 1 }}>
              {col.map((w) => (
                <WidgetRenderer key={w.id} instance={w} ctx={ctx} />
              ))}
            </div>
          ))}
        </div>
      );
    }

    case 'sidebar': {
      const sidebarWidth = (layoutParams?.sidebarWidth as string) ?? '280px';
      const [main, side] = partitionWidgets(widgets, layoutParams);
      return (
        <div className="ed-section ed-section--sidebar" data-section-id={section.id} style={{ display: 'flex', gap: '16px' }}>
          <div className="ed-section__sidebar" style={{ width: sidebarWidth, flexShrink: 0 }}>
            {side.map((w) => (
              <WidgetRenderer key={w.id} instance={w} ctx={ctx} />
            ))}
          </div>
          <div className="ed-section__main" style={{ flex: 1 }}>
            {main.map((w) => (
              <WidgetRenderer key={w.id} instance={w} ctx={ctx} />
            ))}
          </div>
        </div>
      );
    }

    case 'loop': {
      const loopVar = section.loopConfig?.variableName;
      const itemVar = section.loopConfig?.itemVariableName ?? 'item';
      if (!loopVar) return null;
      const items = (ctx.variables[loopVar] as unknown[]) ?? [];
      return (
        <div className="ed-section ed-section--loop" data-section-id={section.id}>
          {section.name && <h3 className="ed-section__name">{section.name}</h3>}
          {items.map((item, i) => {
            const loopCtx: WidgetContext = {
              ...ctx,
              variables: { ...ctx.variables, [itemVar]: item },
            };
            return (
              <div key={i} className="ed-section__loop-item">
                {widgets.map((w) => (
                  <WidgetRenderer key={w.id} instance={w} ctx={loopCtx} />
                ))}
              </div>
            );
          })}
        </div>
      );
    }

    default:
      return null;
  }
}

// ── Tabs layout (internal) ─────────────────────────────────────

import { useState } from 'react';

function TabsLayout({ section, tabLabels, ctx }: {
  section: WorkshopAppSection;
  tabLabels: string[];
  ctx: WidgetContext;
}): React.ReactNode {
  const [active, setActive] = useState(0);
  const widgets = section.widgets;
  return (
    <div className="ed-section ed-section--tabs" data-section-id={section.id}>
      {section.name && <h3 className="ed-section__name">{section.name}</h3>}
      <div className="ed-tabs">
        <div className="ed-tabs__bar" role="tablist">
          {tabLabels.map((label, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={active === i}
              className={`ed-tabs__tab${active === i ? ' ed-tabs__tab--active' : ''}`}
              onClick={() => setActive(i)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ed-tabs__panel" role="tabpanel">
          {widgets[active] && <WidgetRenderer instance={widgets[active]} ctx={ctx} />}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function partitionWidgets(widgets: WorkshopAppSection['widgets'], layoutParams: Record<string, unknown> | undefined) {
  const sidebarCount = (layoutParams?.sidebarWidgetCount as number) ?? 1;
  const side = widgets.slice(0, sidebarCount);
  const main = widgets.slice(sidebarCount);
  return [main, side] as const;
}
