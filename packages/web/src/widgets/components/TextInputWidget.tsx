/** TextInputWidget — text input that writes to a bound variable. */

import type { WidgetProps } from '../types.js';

interface TextInputConfig { placeholder?: string; label?: string; }

export function TextInputWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as TextInputConfig;
  const varName = instance.boundVariable ?? 'text';
  return (
    <div className="ed-widget ed-text-input" data-widget-id={instance.id}>
      {config.label && <label className="ed-text-input__label">{config.label}</label>}
      <input
        type="text"
        className="ed-text-input__field"
        placeholder={config.placeholder ?? ''}
        value={String(ctx.variables[varName] ?? '')}
        onChange={(e) => ctx.setVariable(varName, e.target.value)}
      />
    </div>
  );
}
