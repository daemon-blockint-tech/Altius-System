/**
 * REST routes for time-series data.
 *
 *   GET    /api/v1/{plural}/:id/series/:property          — query series
 *   POST   /api/v1/{plural}/:id/series/:property          — append points
 *   DELETE /api/v1/{plural}/:id/series/:property          — delete range
 *
 * Query parameters:
 *   start, end, limit, order, bucketInterval, bucketFunction, tags
 */

import type { Express } from 'express';
import type { TimeSeriesPoint, TimeSeriesQuery } from '@altius/spi';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import { extractUser } from '../config.js';

export function registerTimeSeriesRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.timeSeriesStore) return;

  const store = deps.timeSeriesStore;

  // Build a map of plural -> objectType for route matching
  const typeMap = new Map<string, string>();
  for (const ot of deps.schema.objectTypes) {
    const plural = ot.name.toLowerCase() + 's';
    typeMap.set(plural, ot.name);
  }

  // ── GET /api/v1/{plural}/:id/series/:property — query series ──
  app.get('/api/v1/:plural/:id/series/:property', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const typeName = typeMap.get(req.params['plural']!);
      if (!typeName) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown object type' });
        return;
      }

      const objectId = req.params['id']!;
      const property = req.params['property']!;

      // Verify the property is a @timeSeries field
      const ot = deps.schema.objectTypes.find(t => t.name === typeName);
      const field = ot?.fields.find(f => f.name === property);
      if (!field?.directives.some(d => d.kind === 'timeSeries')) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Not a time-series property' });
        return;
      }

      const query: TimeSeriesQuery = {};
      if (req.query['start']) query.start = String(req.query['start']);
      if (req.query['end']) query.end = String(req.query['end']);
      if (req.query['limit']) query.limit = parseInt(String(req.query['limit']), 10);
      if (req.query['order']) query.order = String(req.query['order']) as 'asc' | 'desc';
      if (req.query['bucketInterval'] && req.query['bucketFunction']) {
        query.bucket = {
          interval: String(req.query['bucketInterval']),
          function: String(req.query['bucketFunction']) as 'avg' | 'sum' | 'min' | 'max' | 'count' | 'first' | 'last',
        };
      }
      if (req.query['tags']) {
        try {
          query.tags = JSON.parse(String(req.query['tags']));
        } catch {
          // Ignore malformed tags
        }
      }

      const result = await store.getSeries(
        { tenantId: user.tenantId, branch: 'main' },
        typeName,
        objectId,
        property,
        query,
      );
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({
        error: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Query failed',
      });
    }
  });

  // ── POST /api/v1/{plural}/:id/series/:property — append points ──
  app.post('/api/v1/:plural/:id/series/:property', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const typeName = typeMap.get(req.params['plural']!);
      if (!typeName) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown object type' });
        return;
      }

      const objectId = req.params['id']!;
      const property = req.params['property']!;

      // Verify the property is a @timeSeries field
      const ot = deps.schema.objectTypes.find(t => t.name === typeName);
      const field = ot?.fields.find(f => f.name === property);
      if (!field?.directives.some(d => d.kind === 'timeSeries')) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Not a time-series property' });
        return;
      }

      const body = req.body as { points?: TimeSeriesPoint[] } | TimeSeriesPoint[];
      const points = Array.isArray(body) ? body : (body.points ?? []);
      if (points.length === 0) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'No points provided' });
        return;
      }

      await store.putPoints(
        { tenantId: user.tenantId, branch: 'main' },
        typeName,
        objectId,
        property,
        points,
      );
      res.status(201).json({ appended: points.length });
    } catch (err) {
      res.status(500).json({
        error: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Append failed',
      });
    }
  });

  // ── DELETE /api/v1/{plural}/:id/series/:property — delete range ──
  app.delete('/api/v1/:plural/:id/series/:property', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const typeName = typeMap.get(req.params['plural']!);
      if (!typeName) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown object type' });
        return;
      }

      const objectId = req.params['id']!;
      const property = req.params['property']!;
      const start = req.query['start'];
      const end = req.query['end'];
      if (!start || !end) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'start and end are required' });
        return;
      }

      const deleted = await store.deleteRange(
        { tenantId: user.tenantId, branch: 'main' },
        typeName,
        objectId,
        property,
        String(start),
        String(end),
      );
      res.status(200).json({ deleted });
    } catch (err) {
      res.status(500).json({
        error: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  });
}
