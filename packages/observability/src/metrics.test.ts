import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { metrics } from "@opentelemetry/api";
import {
  MeterProvider,
  MetricReader,
} from "@opentelemetry/sdk-metrics";
import { createAltiusMetrics, MetricNames } from "./metrics.js";

/**
 * Minimal MetricReader for testing that allows manual collection.
 */
class TestMetricReader extends MetricReader {
  protected async onShutdown(): Promise<void> {
    // no-op
  }
  protected async onForceFlush(): Promise<void> {
    // no-op
  }
}

describe("metrics", () => {
  let meterProvider: MeterProvider;
  let reader: TestMetricReader;

  beforeEach(() => {
    reader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [reader],
    });
    metrics.setGlobalMeterProvider(meterProvider);
  });

  afterEach(async () => {
    await meterProvider.shutdown();
    metrics.disable();
  });

  describe("MetricNames", () => {
    it("defines all spec Section 4.5.2 metric names", () => {
      expect(MetricNames.ENGINE_OPERATIONS).toBe(
        "altius.engine.operations",
      );
      expect(MetricNames.ENGINE_LATENCY).toBe("altius.engine.latency");
      expect(MetricNames.ACTION_EXECUTIONS).toBe(
        "altius.action.executions",
      );
      expect(MetricNames.ACTION_DURATION).toBe("altius.action.duration");
      expect(MetricNames.SECURITY_CHECKS).toBe(
        "altius.security.checks",
      );
      expect(MetricNames.SECURITY_CHECK_LATENCY).toBe(
        "altius.security.check_latency",
      );
      expect(MetricNames.SYNC_RECORDS_PROCESSED).toBe(
        "altius.sync.records_processed",
      );
      expect(MetricNames.SYNC_LAG_SECONDS).toBe(
        "altius.sync.lag_seconds",
      );
      expect(MetricNames.SYNC_CONFLICTS).toBe("altius.sync.conflicts");
      expect(MetricNames.COMPUTED_EVALUATIONS).toBe(
        "altius.computed.evaluations",
      );
    });

    it("has exactly 20 metric names", () => {
      const values = Object.values(MetricNames);
      expect(values).toHaveLength(20);
    });

    it("all metric names follow altius.<layer>.<name> convention", () => {
      for (const name of Object.values(MetricNames)) {
        expect(name).toMatch(/^altius\.\w+\.\w+$/);
      }
    });
  });

  describe("createAltiusMetrics", () => {
    it("creates all metric instruments", () => {
      const altiusMetrics = createAltiusMetrics();

      expect(altiusMetrics.engineOperations).toBeDefined();
      expect(altiusMetrics.engineLatency).toBeDefined();
      expect(altiusMetrics.actionExecutions).toBeDefined();
      expect(altiusMetrics.actionDuration).toBeDefined();
      expect(altiusMetrics.securityChecks).toBeDefined();
      expect(altiusMetrics.securityCheckLatency).toBeDefined();
      expect(altiusMetrics.syncRecordsProcessed).toBeDefined();
      expect(altiusMetrics.syncLagSeconds).toBeDefined();
      expect(altiusMetrics.syncConflicts).toBeDefined();
      expect(altiusMetrics.computedEvaluations).toBeDefined();
      // LLM / AI pipeline metrics
      expect(altiusMetrics.llmCalls).toBeDefined();
      expect(altiusMetrics.llmDuration).toBeDefined();
      expect(altiusMetrics.llmTokens).toBeDefined();
      expect(altiusMetrics.llmRetries).toBeDefined();
      expect(altiusMetrics.llmValidationFailures).toBeDefined();
      // Function metrics
      expect(altiusMetrics.functionInvocations).toBeDefined();
      expect(altiusMetrics.functionDuration).toBeDefined();
      // Workflow metrics
      expect(altiusMetrics.workflowEvents).toBeDefined();
      expect(altiusMetrics.workflowDuration).toBeDefined();
      expect(altiusMetrics.workflowFailures).toBeDefined();
    });

    it("accepts a custom meter", () => {
      const customMeter = meterProvider.getMeter("custom-test");
      const altiusMetrics = createAltiusMetrics(customMeter);

      expect(altiusMetrics.engineOperations).toBeDefined();
    });

    it("records counter increments", async () => {
      const altiusMetrics = createAltiusMetrics();

      altiusMetrics.engineOperations.add(1, { "object.type": "Patient" });
      altiusMetrics.engineOperations.add(2, { "object.type": "Ward" });

      const { resourceMetrics } = await reader.collect();
      const metricData = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .find((m) => m.descriptor.name === MetricNames.ENGINE_OPERATIONS);

      expect(metricData).toBeDefined();
      expect(metricData!.descriptor.name).toBe(
        "altius.engine.operations",
      );
      // Assert the recorded VALUES, not just the descriptor: one data point per
      // attribute set, with the summed counter value.
      const points = metricData!.dataPoints as Array<{ value: number; attributes: Record<string, unknown> }>;
      const patient = points.find((p) => p.attributes["object.type"] === "Patient");
      const ward = points.find((p) => p.attributes["object.type"] === "Ward");
      expect(patient?.value).toBe(1);
      expect(ward?.value).toBe(2);
    });

    it("records histogram values", async () => {
      const altiusMetrics = createAltiusMetrics();

      altiusMetrics.engineLatency.record(42);
      altiusMetrics.engineLatency.record(100);

      const { resourceMetrics } = await reader.collect();
      const metricData = resourceMetrics.scopeMetrics
        .flatMap((sm) => sm.metrics)
        .find((m) => m.descriptor.name === MetricNames.ENGINE_LATENCY);

      expect(metricData).toBeDefined();
      expect(metricData!.descriptor.unit).toBe("ms");
      // Assert the aggregated histogram value: 2 records, sum 142.
      const point = (metricData!.dataPoints as Array<{ value: { count: number; sum: number } }>)[0];
      expect(point?.value.count).toBe(2);
      expect(point?.value.sum).toBe(142);
    });
  });
});
