/**
 * Dependency health reporting for `/health`.
 *
 * The endpoint probed storage and nothing else, so OpenFGA, the CEL sidecar,
 * Redpanda and Redis could all be down while it answered `{"status":"ok"}`.
 *
 * Kept as a pure function over injected probes rather than reaching for the
 * clients directly: `/health` is served from inside `main()` in server.ts, where
 * every client is a local binding, and a report that can only be exercised by
 * booting the whole gateway is a report nobody tests.
 */

/** A single dependency probe. */
export interface HealthProbe {
  /** Name reported under `checks`. */
  name: string;
  /** Resolve true when the dependency is usable. Rejections count as unhealthy. */
  check: () => Promise<boolean>;
  /**
   * Whether the gateway cannot serve requests without this dependency.
   *
   * Only a critical failure fails readiness. Storage is critical; the rest are
   * not, because the platform already degrades rather than stops without them —
   * the rate limiter fails open, and the event bus falls back to in-memory.
   * Returning 503 for those would pull the pod out of the load balancer over a
   * dependency the request path does not actually require.
   */
  critical?: boolean;
}

export interface HealthReportBody {
  status: 'ok' | 'degraded';
  service: string;
  checks: Record<string, { healthy: boolean }>;
}

export interface HealthReport {
  httpStatus: number;
  body: HealthReportBody;
}

/**
 * Run every probe and summarise. Probes run concurrently and are settled
 * independently, so one hanging or throwing dependency cannot hide the others —
 * which is the whole point of reporting them separately.
 */
export async function buildHealthReport(
  probes: HealthProbe[],
  service = 'api-gateway',
): Promise<HealthReport> {
  const results = await Promise.all(
    probes.map(async (probe) => {
      try {
        return { probe, healthy: await probe.check() };
      } catch {
        // An unreachable dependency rejects; that is the answer, not an error.
        return { probe, healthy: false };
      }
    }),
  );

  const checks: Record<string, { healthy: boolean }> = {};
  for (const { probe, healthy } of results) {
    checks[probe.name] = { healthy };
  }

  const criticalDown = results.some((r) => r.probe.critical && !r.healthy);
  const anyDown = results.some((r) => !r.healthy);

  return {
    httpStatus: criticalDown ? 503 : 200,
    body: {
      status: anyDown ? 'degraded' : 'ok',
      service,
      checks,
    },
  };
}
