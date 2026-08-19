/**
 * WidgetRenderer — renders a single widget instance.
 *
 * Looks up the widget type in the WidgetRegistry and renders the
 * matching component. If the type is not registered, renders a
 * PlaceholderWidget with the type name.
 */

import type { WidgetContext, WorkshopWidgetInstance } from './types.js';
import { getWidget } from './WidgetRegistry.js';
import { PlaceholderWidget } from './components/PlaceholderWidget.js';

export interface WidgetRendererProps {
  instance: WorkshopWidgetInstance;
  ctx: WidgetContext;
}

export function WidgetRenderer({ instance, ctx }: WidgetRendererProps): React.ReactNode {
  if (!instance.visible) return null;

  const entry = getWidget(instance.widgetType);
  if (!entry) {
    return <PlaceholderWidget instance={instance} ctx={ctx} />;
  }

  const Component = entry.component;
  return <Component instance={instance} ctx={ctx} />;
}
