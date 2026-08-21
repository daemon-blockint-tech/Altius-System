/**
 * Event threshold evaluation — one implementation, both providers.
 *
 * A threshold says "an event of this type breaches if its duration is above (or
 * below) N". Deciding whether a given event breaches is a pure function of the
 * threshold and the duration, so it lives here rather than in each provider.
 *
 * The reason is the same one that applies to conflict resolution: the answer is
 * *written onto the event* as `thresholdBreached`, so two providers that
 * disagreed would store different flags for the same event and the same
 * threshold, with neither erring. Anything reading breaches afterwards — an
 * alert, a report, a process-mining view — would then differ by deployment.
 *
 * Note what this deliberately does not do: an event with no duration never
 * breaches, whatever the threshold says. An instantaneous event has no
 * `endTime`, so there is nothing to compare, and a threshold cannot make one
 * appear.
 */

/** A threshold registered for an event type. */
export interface EventThreshold {
  /** The metric the threshold is about. Recorded, not interpreted. */
  metric: string;
  /** The boundary value, compared against the event's duration in ms. */
  threshold: number;
  /** Whether breaching means going above or below the boundary. */
  direction: 'above' | 'below';
}

/** The `thresholdDetails` written onto a breaching event. */
export interface EventThresholdBreach {
  metric: string;
  value: number;
  threshold: number;
  direction: 'above' | 'below';
}

/**
 * The breach an event's duration triggers, or `null` for no breach.
 *
 * `metric` is carried through from the threshold and never checked against the
 * value being compared — the comparison is always against `durationMs`,
 * whatever the metric is called. That is the behaviour as it stands in both
 * providers: a threshold named `waitTimeMs` still compares the event's total
 * duration. Matched rather than fixed, and worth knowing before trusting a
 * breach report.
 *
 * The comparison is strict on both sides: a duration exactly equal to the
 * boundary does not breach in either direction.
 */
export function evaluateEventThreshold(
  threshold: EventThreshold | null | undefined,
  durationMs: number | undefined,
): EventThresholdBreach | null {
  if (!threshold || durationMs === undefined) return null;
  const breached = threshold.direction === 'above'
    ? durationMs > threshold.threshold
    : durationMs < threshold.threshold;
  if (!breached) return null;
  return {
    metric: threshold.metric,
    value: durationMs,
    threshold: threshold.threshold,
    direction: threshold.direction,
  };
}
