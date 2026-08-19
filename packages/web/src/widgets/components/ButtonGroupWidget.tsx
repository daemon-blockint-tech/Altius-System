/**
 * ButtonGroupWidget — renders a group of action-triggering buttons.
 *
 * Config:
 *   buttons: Array<{ label: string; actionName?: string; variableName?: string; variableValue?: unknown }>
 */

import type { WidgetProps } from '../types.js';

interface ButtonConfig {
  label: string;
  actionName?: string;
  variableName?: string;
  variableValue?: unknown;
}

interface ButtonGroupConfig {
  buttons: ButtonConfig[];
}

export function ButtonGroupWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as ButtonGroupConfig;
  const buttons = config.buttons ?? [];

  return (
    <div className="ed-widget ed-button-group" data-widget-id={instance.id} role="group">
      {buttons.map((btn, i) => (
        <button
          key={i}
          className="ed-button-group__btn"
          onClick={() => {
            if (btn.variableName) {
              ctx.setVariable(btn.variableName, btn.variableValue);
            }
          }}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
