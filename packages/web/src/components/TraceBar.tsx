/**
 * Footer trace bar — pipeline stages, audit id, trace id, duration.
 *
 * The eight stages of the governed action pipeline, shown in order.
 * The active stage is underlined; completed stages are muted. This is
 * the "pre-flight on actions" mechanism made visible at rest: even on
 * a read, the bar shows which stages the last request passed through.
 */

import type { ReactNode } from 'react';

export interface TraceBarProps {
  stages: string[];
  activeStage: string;
  durationMs: number;
  auditId: string;
}

export function TraceBar({ stages, activeStage, durationMs, auditId }: TraceBarProps): ReactNode {
  return (
    <footer className="shell__trace-bar">
      <span className="trace-bar__label">LAST READ</span>
      <div className="trace-bar__stages">
        {stages.map(stage => (
          <span
            key={stage}
            className={stage === activeStage ? 'trace-bar__stage trace-bar__stage--active' : 'trace-bar__stage'}
          >
            {stage}
          </span>
        ))}
        <span className="trace-bar__meta">{durationMs}ms · audit {auditId}</span>
      </div>
      <a href="#" className="trace-bar__link">open trace</a>
    </footer>
  );
}

/** The canonical eight-stage pipeline, in order. */
export const PIPELINE_STAGES = [
  'validate',
  'authorise',
  'consent',
  'redact',
  'emit',
  'persist',
  'audit',
  'notify',
] as const;
