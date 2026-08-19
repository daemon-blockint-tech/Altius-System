/**
 * PlaceholderWidget — renders for widget types that have no implementation yet.
 *
 * Shows the widget type, config, and a "not yet implemented" label.
 * This is not an error — it's a visible stub that makes the app
 * definition render completely even when some widgets are stubs.
 */

import type { WidgetProps } from '../types.js';

export function PlaceholderWidget({ instance }: WidgetProps): React.ReactNode {
  return (
    <div
      className="ed-widget ed-widget--placeholder"
      data-widget-type={instance.widgetType}
      data-widget-id={instance.id}
      role="region"
      aria-label={`${instance.widgetType} widget (not yet implemented)`}
    >
      <div className="ed-widget--placeholder__inner">
        <span className="ed-widget--placeholder__icon">□</span>
        <span className="ed-widget--placeholder__type">{instance.widgetType}</span>
        <span className="ed-widget--placeholder__label">Not yet implemented</span>
        {instance.boundVariable && (
          <span className="ed-widget--placeholder__binding">bound: {instance.boundVariable}</span>
        )}
      </div>
    </div>
  );
}
