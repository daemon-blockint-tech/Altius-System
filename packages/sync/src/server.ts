/**
 * Sync Engine service entrypoint.
 *
 * This process is a HOST, not a worker: the sync scheduler runs inside the API
 * gateway (see packages/api/src/sync-boot.ts, gated on SYNC_SCHEDULER_ENABLED),
 * and this package is consumed there as a library. The container exists so the
 * deployment has a place to put sync-specific configuration and so the image is
 * built and scanned.
 *
 * That matters for the probes. `/health` used to answer
 * `{"status":"ok","service":"sync-engine"}` unconditionally, which reads as "the
 * sync engine is working" — a pod permanently green while ingesting nothing. It
 * now says what it actually is, and points at where the real answer lives
 * (GET /api/v1/sync/status on the gateway). Liveness stays unconditional,
 * because "the process is up" is exactly what liveness means.
 */

import http from 'node:http';
import { createLogger } from '@altius/observability';

const logger = createLogger('sync-engine');
const PORT = parseInt(process.env['PORT'] ?? '4003', 10);

/**
 * What this process is doing. `library-host` is the only mode implemented: no
 * scheduler is started here, so the field is a statement of fact rather than a
 * placeholder for a future one.
 */
const ROLE = 'library-host';

const server = http.createServer((req, res) => {
  // Liveness — the process answers, nothing more is claimed.
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'pass', service: 'sync-engine' }));
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'sync-engine',
        role: ROLE,
        // Named so an operator reading a green probe does not conclude that
        // ingestion is running here.
        scheduler: 'not-in-this-process',
        schedulerStatusEndpoint: 'GET /api/v1/sync/status (api-gateway)',
      }),
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.on('error', (err) => {
  logger.fatal({ err }, 'Sync Engine server error');
  process.exit(1);
});

server.listen(PORT, () => {
  logger.info({ port: PORT, role: ROLE }, 'Sync Engine listening');
});
