/**
 * The webhook ingest secret is compared in constant time.
 *
 * The gate used a plain `!==`, whose short-circuit leaks how many leading
 * characters of the secret matched — a timing side channel next to the agent
 * gateway's timingSafeEqual. The comparison is now constant-time; these cases
 * guard that the auth gate still accepts the right secret and rejects the wrong
 * or missing one (behaviour unchanged; the timing property is the fix).
 */

import { describe, it, expect } from 'vitest';
import { createIngestHandler, type IngestHandlerConfig } from '../ingest-handler.js';

function handler() {
  const config = {
    objectManager: {} as never, // unused: auth runs before any mapping/apply
    datasourceMappings: new Map(), // empty => a passed secret reaches the 404
    ingestSecret: 'correct-horse-battery-staple',
    tenantId: 'tenant-a',
  } as unknown as IngestHandlerConfig;
  return createIngestHandler(config);
}

describe('ingest secret authentication', () => {
  it('rejects a missing secret with 401', async () => {
    const res = await handler()({ datasource: 'ds', body: [] });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret with 401', async () => {
    const res = await handler()({ datasource: 'ds', body: [], secret: 'correct-horse-battery-stapla' });
    expect(res.status).toBe(401);
  });

  it('accepts the right secret (proceeds past auth to the datasource lookup)', async () => {
    const res = await handler()({ datasource: 'unknown-ds', body: [], secret: 'correct-horse-battery-staple' });
    // Past the auth gate: an unknown datasource is a 404, not a 401.
    expect(res.status).toBe(404);
  });
});
