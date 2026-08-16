/**
 * Side-effect delivery failures must leave a trace.
 *
 * SideEffectExecutor logs every failed attempt at warn and the final failure at
 * error — but through `this.config.logger?.`, an OPTIONAL field. The production
 * wiring in server.ts constructed the executor with {httpClient, eventBus, env}
 * and no logger, so every one of those calls was a no-op: a webhook that 500'd
 * through all its retries returned success:true with zero trace anywhere in the
 * running system, under the LOG_AND_CONTINUE policy both bundled packs use.
 *
 * Two things are pinned here, because the defect needed both to be wrong:
 *  1. the executor reports failures when a logger IS supplied (behaviour), and
 *  2. the production construction actually supplies one (wiring).
 *
 * (2) is a source assertion because the wiring lives inside server.ts's
 * non-exported `main()` bootstrap, which cannot be constructed in a unit test
 * without a live Postgres and OIDC. Same approach as
 * prometheus-rule-metrics.test.ts, which asserts against the Helm template.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { SideEffectExecutor } from '@altius/actions';
import type { HttpClient } from '@altius/actions';
import { pinoSideEffectLogger } from '../side-effect-logger.js';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER_SRC = resolve(here, '../server.ts');

/** An HTTP client that always fails, like a webhook endpoint returning 500. */
const failingHttpClient: HttpClient = {
  post: vi.fn().mockRejectedValue(new Error('500 Internal Server Error')),
};

describe('side-effect delivery failures are reported', () => {
  it('logs each failed attempt and the final failure', async () => {
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const executor = new SideEffectExecutor({
      httpClient: failingHttpClient,
      logger: log,
    });

    const result = await executor.execute(
      'NotifyDownstream',
      'webhook',
      { url: 'https://example.invalid/hook', method: 'POST' },
      {},
      2,
    );

    expect(result.success).toBe(false);
    // One warn per attempt...
    expect(log.warn).toHaveBeenCalledTimes(2);
    // ...and one error for the give-up, naming the side-effect.
    expect(log.error).toHaveBeenCalledTimes(1);
    const [msg, data] = log.error.mock.calls[0]!;
    expect(msg).toContain('NotifyDownstream');
    expect(data).toMatchObject({ name: 'NotifyDownstream', type: 'webhook', attempts: 2 });
  });

  it('maps (msg, data) onto pino\'s (data, msg) rather than passing it straight through', () => {
    // Passing the pino instance directly still logs — just with the message as
    // the structured payload — so this is silent when wrong.
    const pino = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const adapted = pinoSideEffectLogger(pino as never);

    adapted.warn('attempt failed', { name: 'NotifyDownstream', attempt: 1 });
    expect(pino.warn).toHaveBeenCalledWith({ name: 'NotifyDownstream', attempt: 1 }, 'attempt failed');

    adapted.error('gave up', { attempts: 3 });
    expect(pino.error).toHaveBeenCalledWith({ attempts: 3 }, 'gave up');

    // No data → still a valid pino call, not `undefined` as the merge object.
    adapted.info('delivered');
    expect(pino.info).toHaveBeenCalledWith({}, 'delivered');
  });

  it('wires a logger into the production SideEffectExecutor', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    const start = src.indexOf('new SideEffectExecutor(');
    expect(start, 'server.ts no longer constructs a SideEffectExecutor').toBeGreaterThan(-1);
    const construction = src.slice(start, src.indexOf('});', start));

    // The whole defect was this argument being absent.
    expect(construction, 'SideEffectExecutor is constructed without a logger — delivery failures will be silent')
      .toMatch(/logger:/);
  });
});
