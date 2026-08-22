/**
 * The published contract must cover the routes the gateway actually mounts.
 *
 * Before this, /api/v1/attachments, the time-series, geospatial and workflow
 * families were all live and callable but missing from openapi.json, so an SDK
 * generated from the spec could not reach them.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import { collectMountedRoutes, mergeMountedRoutes } from '../rest/mounted-routes.js';

function appWithRoutes(): express.Express {
  const app = express();
  const ok: express.RequestHandler = (_req, res) => { res.json({}); };
  app.post('/api/v1/attachments', ok);
  app.get('/api/v1/attachments/:blobId/metadata', ok);
  app.get('/api/v1/geo/layers', ok);
  app.post('/api/v1/timeseries/aggregate', ok);
  app.get('/api/v1/workflow/graph/:objectType/:objectId', ok);
  app.all('/api/v1/cdm/*', ok);
  app.get('/health', ok);
  return app;
}

/** Minimal stand-in for the generated document. */
function baseSpec(): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    paths: {
      '/api/v1/patients': { get: { summary: 'hand-authored', operationId: 'listPatients' } },
    },
  };
}

describe('collectMountedRoutes', () => {
  it('reads method and path for every route registered on the app', () => {
    const routes = collectMountedRoutes(appWithRoutes());
    expect(routes).toContainEqual({ method: 'post', path: '/api/v1/attachments' });
    expect(routes).toContainEqual({ method: 'get', path: '/api/v1/geo/layers' });
    expect(routes).toContainEqual({ method: 'get', path: '/api/v1/workflow/graph/:objectType/:objectId' });
  });

  it('returns nothing rather than throwing when the router internals are absent', () => {
    expect(collectMountedRoutes({} as unknown as express.Express)).toEqual([]);
  });
});

describe('mergeMountedRoutes', () => {
  it('documents mounted routes the generated document is missing', () => {
    const spec = baseSpec();
    const result = mergeMountedRoutes(spec, collectMountedRoutes(appWithRoutes()));
    const paths = spec['paths'] as Record<string, Record<string, unknown>>;

    expect(paths['/api/v1/attachments']?.['post']).toBeDefined();
    expect(paths['/api/v1/attachments/{blobId}/metadata']?.['get']).toBeDefined();
    expect(paths['/api/v1/geo/layers']?.['get']).toBeDefined();
    expect(paths['/api/v1/timeseries/aggregate']?.['post']).toBeDefined();
    expect(paths['/api/v1/workflow/graph/{objectType}/{objectId}']?.['get']).toBeDefined();
    expect(result.added).toBeGreaterThanOrEqual(5);
  });

  it('declares path parameters and requires the bearer scheme', () => {
    const spec = baseSpec();
    mergeMountedRoutes(spec, collectMountedRoutes(appWithRoutes()));
    const op = (spec['paths'] as Record<string, Record<string, unknown>>)
      ['/api/v1/attachments/{blobId}/metadata']!['get'] as Record<string, unknown>;

    expect(op['parameters']).toEqual([
      { name: 'blobId', in: 'path', required: true, schema: { type: 'string' } },
    ]);
    expect(op['security']).toEqual([{ bearerAuth: [] }]);
  });

  it('never overwrites a hand-authored operation', () => {
    const spec = baseSpec();
    const app = express();
    app.get('/api/v1/patients', (_req, res) => { res.json({}); });
    mergeMountedRoutes(spec, collectMountedRoutes(app));

    const op = (spec['paths'] as Record<string, Record<string, unknown>>)['/api/v1/patients']!['get'] as Record<string, unknown>;
    expect(op['summary']).toBe('hand-authored');
  });

  it('lists wildcard mounts instead of silently dropping them', () => {
    const spec = baseSpec();
    const result = mergeMountedRoutes(spec, collectMountedRoutes(appWithRoutes()));

    expect(result.skipped).toContain('/api/v1/cdm/*');
    expect(spec['x-altius-wildcard-routes']).toContain('/api/v1/cdm/*');
    expect(Object.keys(spec['paths'] as object).some(p => p.includes('*'))).toBe(false);
  });

  it('leaves non-contract endpoints out of the contract', () => {
    const spec = baseSpec();
    mergeMountedRoutes(spec, collectMountedRoutes(appWithRoutes()));
    expect((spec['paths'] as Record<string, unknown>)['/health']).toBeUndefined();
  });
});
