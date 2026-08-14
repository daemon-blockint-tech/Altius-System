// Tracer utilities
export {
  getTracer,
  withSpan,
  getActiveSpan,
  SpanAttributes,
  type AltiusLayer,
  type AltiusSpanAttributes,
} from "./tracer.js";

// Metric definitions
export {
  createAltiusMetrics,
  registerSyncLagGauge,
  MetricNames,
  type MetricName,
  type AltiusMetrics,
} from "./metrics.js";

// SDK lifecycle
export { initTelemetry, shutdownTelemetry } from "./sdk.js";

// Structured logging
export { createLogger } from "./logger.js";

// Context propagation
export {
  extractContext,
  injectContext,
  getTraceId,
  getSpanId,
  withContext,
  PropagationHeaders,
  type HeaderCarrier,
} from "./context.js";
