/** NumberInputWidget — numeric input that writes to a bound variable. */

import type { WidgetProps } from '../types.js';

interface NumberInputConfig { placeholder?: string; label?: string; min?: number; max?: number; step?: number; }

export function NumberInputWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as NumberInputConfig;
  const varName = instance.boundVariable ?? 'number';
  return (
    <div className="ed-widget ed-number-input" data-widget-id={instance.id}>
      {config.label && <label className="ed-number-input__label">{config.label}</label>}
      <input
        type="number"
        className="ed-number-input__field"
        placeholder={config.placeholder ?? ''}
        min={config.min}
        max={config.max}
        step={config.step}
        value={String(ctx.variables[varName] ?? '')}
        onChange={(e) => ctx.setVariable(varName, e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </div>
  );
}
