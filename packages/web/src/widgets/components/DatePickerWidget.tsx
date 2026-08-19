/** DatePickerWidget — date input that writes to a bound variable. */

import type { WidgetProps } from '../types.js';

interface DatePickerConfig { label?: string; }

export function DatePickerWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as DatePickerConfig;
  const varName = instance.boundVariable ?? 'date';
  return (
    <div className="ed-widget ed-date-picker" data-widget-id={instance.id}>
      {config.label && <label className="ed-date-picker__label">{config.label}</label>}
      <input
        type="date"
        className="ed-date-picker__field"
        value={String(ctx.variables[varName] ?? '')}
        onChange={(e) => ctx.setVariable(varName, e.target.value)}
      />
    </div>
  );
}
