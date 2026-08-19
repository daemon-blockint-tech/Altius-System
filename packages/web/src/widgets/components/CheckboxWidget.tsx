/** CheckboxWidget — boolean toggle that writes to a bound variable. */

import type { WidgetProps } from '../types.js';

interface CheckboxConfig { label?: string; }

export function CheckboxWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as CheckboxConfig;
  const varName = instance.boundVariable ?? 'checked';
  const checked = Boolean(ctx.variables[varName]);
  return (
    <label className="ed-widget ed-checkbox" data-widget-id={instance.id}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => ctx.setVariable(varName, e.target.checked)}
      />
      <span className="ed-checkbox__label">{config.label ?? ''}</span>
    </label>
  );
}
