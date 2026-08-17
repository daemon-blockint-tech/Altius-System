/**
 * Footer trace bar — pipeline stages, audit id, trace id, duration.
 *
 * The eight stages of the governed action pipeline, shown in order.
 * The active stage is underlined; completed stages are muted. This is
 * the "pre-flight on actions" mechanism made visible at rest: even on
 * a read, the bar shows which stages the last request passed through.
 */

import type { ReactNode } from 'react';

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

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface TraceState {
  /** Which stage the last request reached. */
  activeStage: string;
  /** Request duration in milliseconds. */
  durationMs: number;
  /** Audit record id, truncated for display. */
  auditId: string;
  /** OpenTelemetry trace id, truncated for display. */
  traceId: string;
}

export interface TraceBarProps {
  trace: TraceState | null;
  /** Label for the left edge — e.g. "LAST READ" or "LAST WRITE". */
  label?: string;
  onOpenTrace?: () => void;
}

export function TraceBar({ trace, label = 'LAST READ', onOpenTrace }: TraceBarProps): ReactNode {
  return (
    <footer className="ed-trace" role="contentinfo">
      <span className="ed-trace__label">{label}</span>
      <div className="ed-trace__stages">
        {PIPELINE_STAGES.map(stage => (
          <span
            key={stage}
            className={
              trace && stage === trace.activeStage
                ? 'ed-trace__stage ed-trace__stage--active'
                : 'ed-trace__stage'
            }
          >
            {stage}
          </span>
        ))}
        {trace && (
          <span className="ed-trace__meta">
            {trace.durationMs}ms · audit {trace.auditId}
          </span>
        )}
      </div>
      {onOpenTrace ? (
        <button type="button" className="ed-trace__link" onClick={onOpenTrace}>
          open trace
        </button>
      ) : (
        <a href="#" className="ed-trace__link">open trace</a>
      )}
    </footer>
  );
}
