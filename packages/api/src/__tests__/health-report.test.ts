/**
 * `/health` must report the dependencies the gateway actually needs.
 *
 * It probed storage and nothing else — `storage.healthCheck()` is the only
 * health call in the whole api package. OpenFGA, the CEL sidecar, Redpanda and
 * Redis could all be down while the endpoint answered `{"status":"ok"}`, so an
 * operator's first question ("what is broken?") had no answer here.
 *
 * Readiness semantics are deliberate and unchanged for storage: only a CRITICAL
 * dependency failing takes the pod out of service (503). The rest are reported
 * as degraded on a 200 — rate limiting fails open by design, and the event bus
 * has an in-memory fallback, so pulling a pod from the load balancer because
 * Redis blipped would turn a QoS wobble into an outage.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildHealthReport } from '../health.js';

function probe(name: string, healthy: boolean, critical = false) {
  return { name, critical, check: vi.fn().mockResolvedValue(healthy) };
}

describe('buildHealthReport', () => {
  it('reports ok with every dependency named when all are healthy', async () => {
    const report = await buildHealthReport([
      probe('storage', true, true),
      probe('openfga', true),
      probe('cel', true),
    ]);

    expect(report.httpStatus).toBe(200);
    expect(report.body.status).toBe('ok');
    expect(report.body.checks).toEqual({
      storage: { healthy: true },
      openfga: { healthy: true },
      cel: { healthy: true },
    });
  });

  it('fails readiness when a critical dependency is down', async () => {
    const report = await buildHealthReport([
      probe('storage', false, true),
      probe('openfga', true),
    ]);

    expect(report.httpStatus).toBe(503);
    expect(report.body.status).toBe('degraded');
    expect(report.body.checks['storage']).toEqual({ healthy: false });
  });

  it('stays in service when a non-critical dependency is down', async () => {
    const report = await buildHealthReport([
      probe('storage', true, true),
      probe('redis', false),
    ]);

    // Reported, but the pod keeps serving — Redis fails open by design.
    expect(report.httpStatus).toBe(200);
    expect(report.body.status).toBe('degraded');
    expect(report.body.checks['redis']).toEqual({ healthy: false });
  });

  it('treats a probe that throws as unhealthy rather than crashing', async () => {
    const exploding = {
      name: 'cel',
      critical: false,
      check: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
    };

    const report = await buildHealthReport([probe('storage', true, true), exploding]);

    expect(report.httpStatus).toBe(200);
    expect(report.body.checks['cel']).toEqual({ healthy: false });
  });

  it('does not let one slow or failing probe hide the others', async () => {
    const report = await buildHealthReport([
      probe('storage', true, true),
      { name: 'openfga', critical: false, check: vi.fn().mockRejectedValue(new Error('boom')) },
      probe('redis', true),
    ]);

    expect(report.body.checks['storage']).toEqual({ healthy: true });
    expect(report.body.checks['openfga']).toEqual({ healthy: false });
    expect(report.body.checks['redis']).toEqual({ healthy: true });
  });
});
