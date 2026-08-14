import { metrics, Meter, Counter, Histogram } from "@opentelemetry/api";

/**
 * All metric names defined in Altius Spec Section 4.5.2.
 */
export const MetricNames = {
  // Engine metrics
  ENGINE_OPERATIONS: "altius.engine.operations",
  ENGINE_LATENCY: "altius.engine.latency",

  // Action metrics
  ACTION_EXECUTIONS: "altius.action.executions",
  ACTION_DURATION: "altius.action.duration",

  // Security metrics
  SECURITY_CHECKS: "altius.security.checks",
  SECURITY_CHECK_LATENCY: "altius.security.check_latency",

  // Sync metrics
  SYNC_RECORDS_PROCESSED: "altius.sync.records_processed",
  SYNC_LAG_SECONDS: "altius.sync.lag_seconds",
  SYNC_CONFLICTS: "altius.sync.conflicts",

  // Computed metrics
  COMPUTED_EVALUATIONS: "altius.computed.evaluations",
} as const;

export type MetricName = (typeof MetricNames)[keyof typeof MetricNames];

/**
 * Registered metric instruments for the Altius platform.
 */
export interface AltiusMetrics {
  // Engine
  engineOperations: Counter;
  engineLatency: Histogram;

  // Action
  actionExecutions: Counter;
  actionDuration: Histogram;

  // Security
  securityChecks: Counter;
  securityCheckLatency: Histogram;

  // Sync
  syncRecordsProcessed: Counter;
  syncLagSeconds: Histogram; // OTel API has no Gauge type; use ObservableGauge via registerGauge()
  syncConflicts: Counter;

  // Computed
  computedEvaluations: Counter;
}

/**
 * Creates and registers all Altius metric instruments on the given meter.
 *
 * @param meter - The OTel Meter to register instruments on.
 *                Defaults to the global meter named "altius".
 * @returns All registered metric instruments.
 */
export function createAltiusMetrics(
  meter?: Meter,
): AltiusMetrics {
  const m = meter ?? metrics.getMeter("altius");

  return {
    // Engine
    engineOperations: m.createCounter(MetricNames.ENGINE_OPERATIONS, {
      description: "Total number of engine operations executed",
    }),
    engineLatency: m.createHistogram(MetricNames.ENGINE_LATENCY, {
      description: "Latency of engine operations in milliseconds",
      unit: "ms",
    }),

    // Action
    actionExecutions: m.createCounter(MetricNames.ACTION_EXECUTIONS, {
      description: "Total number of action executions",
    }),
    actionDuration: m.createHistogram(MetricNames.ACTION_DURATION, {
      description: "Duration of action executions in milliseconds",
      unit: "ms",
    }),

    // Security
    securityChecks: m.createCounter(MetricNames.SECURITY_CHECKS, {
      description: "Total number of security checks performed",
    }),
    securityCheckLatency: m.createHistogram(
      MetricNames.SECURITY_CHECK_LATENCY,
      {
        description: "Latency of security checks in milliseconds",
        unit: "ms",
      },
    ),

    // Sync
    syncRecordsProcessed: m.createCounter(
      MetricNames.SYNC_RECORDS_PROCESSED,
      {
        description: "Total number of sync records processed",
      },
    ),
    syncLagSeconds: m.createHistogram(MetricNames.SYNC_LAG_SECONDS, {
      description: "Sync lag observed in seconds",
      unit: "s",
    }),
    syncConflicts: m.createCounter(MetricNames.SYNC_CONFLICTS, {
      description: "Total number of sync conflicts encountered",
    }),

    // Computed
    computedEvaluations: m.createCounter(MetricNames.COMPUTED_EVALUATIONS, {
      description: "Total number of computed field evaluations",
    }),
  };
}

/**
 * Registers an observable gauge for sync lag that reports a value via callback.
 * OTel API does not have a synchronous Gauge; this uses ObservableGauge.
 *
 * @param meter - The OTel Meter to register on.
 * @param callback - Function that returns the current lag value in seconds.
 */
export function registerSyncLagGauge(
  meter: Meter,
  callback: () => number,
): void {
  const gauge = meter.createObservableGauge(
    MetricNames.SYNC_LAG_SECONDS + ".gauge",
    {
      description: "Current sync lag in seconds (observable gauge)",
      unit: "s",
    },
  );
  gauge.addCallback((result) => {
    result.observe(callback());
  });
}
