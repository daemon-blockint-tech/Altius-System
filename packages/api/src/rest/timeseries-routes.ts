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
import {
  resample,
  rollingAggregate,
  lag,
  diff,
  forwardFill,
  linearInterpolate,
  exponentialSmoothing,
  addSeries,
  subtractSeries,
  multiplySeries,
  divideSeries,
  summarize,
} from '@altius/spi';
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

  // ── POST /api/v1/{plural}/:id/series/:property/transform — apply TS transform ──
  //
  // Body: { operation: 'resample'|'rolling'|'lag'|'diff'|'forwardFill'|
  //         'linearInterpolate'|'exponentialSmoothing'|'summarize',
  //         params: { intervalSeconds?, windowSize?, lag?, alpha?, ... },
  //         query?: TimeSeriesQuery }
  //
  // The endpoint fetches raw points from the store (using `query` if
  // provided), applies the named transform, and returns the result.
  app.post('/api/v1/:plural/:id/series/:property/transform', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const typeName = typeMap.get(req.params['plural']!);
      if (!typeName) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown object type' });
        return;
      }

      const objectId = req.params['id']!;
      const property = req.params['property']!;

      const ot = deps.schema.objectTypes.find(t => t.name === typeName);
      const field = ot?.fields.find(f => f.name === property);
      if (!field?.directives.some(d => d.kind === 'timeSeries')) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Not a time-series property' });
        return;
      }

      const body = req.body as {
        operation: string;
        params?: Record<string, unknown>;
        query?: TimeSeriesQuery;
      };

      if (!body.operation) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'operation is required' });
        return;
      }

      // Fetch raw points
      const result = await store.getSeries(
        { tenantId: user.tenantId, branch: 'main' },
        typeName,
        objectId,
        property,
        body.query ?? {},
      );
      const points = result.points ?? [];

      const p = body.params ?? {};
      let output: unknown;

      switch (body.operation) {
        case 'resample':
          output = resample(points, Number(p.intervalSeconds), (p.aggregation as 'avg'|'sum'|'min'|'max'|'count'|'first'|'last') ?? 'avg');
          break;
        case 'rolling':
          output = rollingAggregate(points, Number(p.windowSize), (p.aggregation as 'avg'|'sum'|'min'|'max'|'std') ?? 'avg');
          break;
        case 'lag':
          output = lag(points, Number(p.lag ?? 1));
          break;
        case 'diff':
          output = diff(points);
          break;
        case 'forwardFill':
          output = forwardFill(points);
          break;
        case 'linearInterpolate':
          output = linearInterpolate(points, Number(p.intervalSeconds));
          break;
        case 'exponentialSmoothing':
          output = exponentialSmoothing(points, Number(p.alpha ?? 0.3));
          break;
        case 'summarize':
          output = summarize(points);
          break;
        default:
          res.status(400).json({ error: 'INVALID_INPUT', message: `Unknown operation: ${body.operation}` });
          return;
      }

      res.status(200).json({ operation: body.operation, result: output });
    } catch (err) {
      res.status(500).json({
        error: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Transform failed',
      });
    }
  });

  // ── POST /api/v1/timeseries/aggregate — multi-series arithmetic ──
  //
  // Body: { operation: 'add'|'subtract'|'multiply'|'divide',
  //         series: Array<{ objectType, objectId, property, query? }> }
  //
  // Fetches each named series, aligns by timestamp, and applies the
  // arithmetic operation pairwise.
  app.post('/api/v1/timeseries/aggregate', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const body = req.body as {
        operation: 'add' | 'subtract' | 'multiply' | 'divide';
        series: Array<{ objectType: string; objectId: string; property: string; query?: TimeSeriesQuery }>;
      };

      if (!body.operation || !body.series || body.series.length < 2) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'operation and at least 2 series are required' });
        return;
      }

      const fetched: TimeSeriesPoint[][] = [];
      for (const s of body.series) {
        const r = await store.getSeries(
          { tenantId: user.tenantId, branch: 'main' },
          s.objectType,
          s.objectId,
          s.property,
          s.query ?? {},
        );
        fetched.push(r.points ?? []);
      }

      let result: TimeSeriesPoint[];
      switch (body.operation) {
        case 'add': result = fetched.reduce((acc, s) => acc.length === 0 ? s : addSeries(acc, s)); break;
        case 'subtract':
          result = fetched.slice(1).reduce((acc, s) => subtractSeries(acc, s), fetched[0]!); break;
        case 'multiply': result = fetched.reduce((acc, s) => acc.length === 0 ? s : multiplySeries(acc, s)); break;
        case 'divide':
          result = fetched.slice(1).reduce((acc, s) => divideSeries(acc, s), fetched[0]!); break;
        default:
          res.status(400).json({ error: 'INVALID_INPUT', message: `Unknown operation: ${body.operation}` });
          return;
      }

      res.status(200).json({ operation: body.operation, points: result });
    } catch (err) {
      res.status(500).json({
        error: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Aggregate failed',
      });
    }
  });
}
