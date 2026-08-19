/**
 * StepperWidget — renders a multi-step progress indicator.
 *
 * Config:
 *   steps: Array<{ label: string; description?: string }>
 *   currentStep: number  — 0-indexed
 */

import type { WidgetProps } from '../types.js';

interface StepConfig { label: string; description?: string; }
interface StepperConfig { steps: StepConfig[]; currentStep?: number; }

export function StepperWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as StepperConfig;
  const steps = config.steps ?? [];
  const current = (instance.boundVariable
    ? Number(ctx.variables[instance.boundVariable] ?? 0)
    : config.currentStep ?? 0);

  return (
    <ol className="ed-widget ed-stepper" data-widget-id={instance.id}>
      {steps.map((step, i) => (
        <li
          key={i}
          className={`ed-stepper__step${i === current ? ' ed-stepper__step--current' : ''}${i < current ? ' ed-stepper__step--done' : ''}`}
        >
          <span className="ed-stepper__marker">{i < current ? '✓' : i + 1}</span>
          <span className="ed-stepper__label">{step.label}</span>
          {step.description && <span className="ed-stepper__desc">{step.description}</span>}
        </li>
      ))}
    </ol>
  );
}
