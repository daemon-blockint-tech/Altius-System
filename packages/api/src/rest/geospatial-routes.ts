/**
 * REST routes for geospatial map services — layers, saved maps, annotations,
 * spatial search, geocoding, and geometry helpers.
 *
 *   POST   /api/v1/geo/layers                   — create layer
 *   GET    /api/v1/geo/layers                   — list layers
 *   GET    /api/v1/geo/layers/:id               — get layer
 *   PATCH  /api/v1/geo/layers/:id               — update layer
 *   DELETE /api/v1/geo/layers/:id               — delete layer
 *   POST   /api/v1/geo/maps                     — create saved map
 *   GET    /api/v1/geo/maps                     — list saved maps
 *   GET    /api/v1/geo/maps/:id                 — get saved map
 *   PATCH  /api/v1/geo/maps/:id                 — update saved map
 *   DELETE /api/v1/geo/maps/:id                 — delete saved map
 *   POST   /api/v1/geo/maps/:id/share           — share saved map
 *   POST   /api/v1/geo/annotations              — create annotation
 *   GET    /api/v1/geo/annotations              — list annotations
 *   DELETE /api/v1/geo/annotations/:id          — delete annotation
 *   POST   /api/v1/geo/search/intersect         — spatial intersect search
 *   POST   /api/v1/geo/search/around            — radius search
 *   POST   /api/v1/geo/search/bbox              — bounding box search
 *   GET    /api/v1/geo/geocode                  — forward geocode
 *   GET    /api/v1/geo/reverse-geocode          — reverse geocode
 *   POST   /api/v1/geo/geometry/buffer          — buffer a shape
 *   POST   /api/v1/geo/geometry/area            — polygon area
 *   POST   /api/v1/geo/geometry/distance        — distance between points
 *   POST   /api/v1/geo/geometry/contains        — point-in-shape test
 */

import type { Express } from 'express';
import type { ApiDependencies } from '../graphql/types.js';
import type { OidcAuthenticator } from '@altius/security';
import type { RequestContext, CreateMapLayerInput, CreateSavedMapInput, CreateAnnotationInput, GeoShape, GeoPointValue, GeoBBox, GeoPolygonValue } from '@altius/spi';
import { extractUser } from '../config.js';

function ctxFromUser(user: { tenantId: string; id: string }): RequestContext {
  return { tenantId: user.tenantId, actorId: user.id };
}

export function registerGeospatialRoutes(
  app: Express,
  deps: ApiDependencies,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): void {
  if (!deps.geospatialMapService) return;
  const service = deps.geospatialMapService;

  // ── Layers ──

  app.post('/api/v1/geo/layers', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as CreateMapLayerInput;
      if (!body.name || !body.objectType || !body.geometryField || !body.kind) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields: name, objectType, geometryField, kind' });
        return;
      }
      const layer = await service.createLayer(ctx, body);
      res.status(201).json(layer);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/geo/layers', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const objectType = req.query['objectType'] as string | undefined;
      const layers = await service.listLayers(ctx, objectType);
      res.status(200).json({ layers });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/geo/layers/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const layer = await service.getLayer(ctx, req.params['id']!);
      if (!layer) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(layer);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.patch('/api/v1/geo/layers/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const updates = req.body as Partial<CreateMapLayerInput>;
      const layer = await service.updateLayer(ctx, req.params['id']!, updates);
      res.status(200).json(layer);
    } catch (err) {
      const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.delete('/api/v1/geo/layers/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await service.deleteLayer(ctx, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Saved Maps ──

  app.post('/api/v1/geo/maps', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as CreateSavedMapInput;
      if (!body.name || !body.layerIds || !body.viewport) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields: name, layerIds, viewport' });
        return;
      }
      const map = await service.createSavedMap(ctx, body);
      res.status(201).json(map);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/geo/maps', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const tags = req.query['tags'] ? (req.query['tags'] as string).split(',') : undefined;
      const maps = await service.listSavedMaps(ctx, tags);
      res.status(200).json({ maps });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/geo/maps/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const map = await service.getSavedMap(ctx, req.params['id']!);
      if (!map) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.status(200).json(map);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.patch('/api/v1/geo/maps/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const updates = req.body as Partial<CreateSavedMapInput>;
      const map = await service.updateSavedMap(ctx, req.params['id']!, updates);
      res.status(200).json(map);
    } catch (err) {
      const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.delete('/api/v1/geo/maps/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await service.deleteSavedMap(ctx, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/geo/maps/:id/share', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { userIds } = req.body as { userIds: string[] };
      if (!userIds || !Array.isArray(userIds)) {
        res.status(400).json({ error: 'INVALID', message: 'userIds array required' });
        return;
      }
      const map = await service.shareSavedMap(ctx, req.params['id']!, userIds);
      res.status(200).json(map);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Annotations ──

  app.post('/api/v1/geo/annotations', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const body = req.body as CreateAnnotationInput;
      if (!body.label || !body.shape || !body.kind) {
        res.status(400).json({ error: 'INVALID', message: 'Missing required fields: label, shape, kind' });
        return;
      }
      const ann = await service.createAnnotation(ctx, body);
      res.status(201).json(ann);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/geo/annotations', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const savedMapId = req.query['savedMapId'] as string | undefined;
      const annotations = await service.listAnnotations(ctx, savedMapId);
      res.status(200).json({ annotations });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.delete('/api/v1/geo/annotations/:id', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      await service.deleteAnnotation(ctx, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Spatial Search ──

  app.post('/api/v1/geo/search/intersect', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { objectType, geometryField, shape } = req.body as { objectType: string; geometryField: string; shape: GeoShape };
      if (!objectType || !geometryField || !shape) {
        res.status(400).json({ error: 'INVALID', message: 'objectType, geometryField, shape required' });
        return;
      }
      const results = await service.spatialIntersect(ctx, objectType, geometryField, shape);
      res.status(200).json({ results });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/geo/search/around', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { objectType, geometryField, center, radiusMeters, limit } = req.body as { objectType: string; geometryField: string; center: GeoPointValue; radiusMeters: number; limit?: number };
      if (!objectType || !geometryField || !center || radiusMeters === undefined) {
        res.status(400).json({ error: 'INVALID', message: 'objectType, geometryField, center, radiusMeters required' });
        return;
      }
      const results = await service.searchAround(ctx, objectType, geometryField, center, radiusMeters, limit);
      res.status(200).json({ results });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/geo/search/bbox', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { objectType, geometryField, bbox } = req.body as { objectType: string; geometryField: string; bbox: GeoBBox };
      if (!objectType || !geometryField || !bbox) {
        res.status(400).json({ error: 'INVALID', message: 'objectType, geometryField, bbox required' });
        return;
      }
      const results = await service.searchInBBox(ctx, objectType, geometryField, bbox);
      res.status(200).json({ results });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Geocoding ──

  app.get('/api/v1/geo/geocode', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const q = req.query['q'] as string | undefined;
      if (!q) { res.status(400).json({ error: 'INVALID', message: 'q query parameter required' }); return; }
      const result = await service.geocode(ctx, q);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.get('/api/v1/geo/reverse-geocode', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const lat = parseFloat(req.query['lat'] as string);
      const lng = parseFloat(req.query['lng'] as string);
      if (isNaN(lat) || isNaN(lng)) {
        res.status(400).json({ error: 'INVALID', message: 'lat and lng query parameters required' });
        return;
      }
      const result = await service.reverseGeocode(ctx, { lat, lng });
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // ── Geometry Helpers ──

  app.post('/api/v1/geo/geometry/buffer', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { shape, distanceMeters } = req.body as { shape: GeoShape; distanceMeters: number };
      if (!shape || distanceMeters === undefined) {
        res.status(400).json({ error: 'INVALID', message: 'shape, distanceMeters required' });
        return;
      }
      const result = await service.buffer(ctx, shape, distanceMeters);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/geo/geometry/area', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { polygon } = req.body as { polygon: GeoPolygonValue };
      if (!polygon || !polygon.rings) {
        res.status(400).json({ error: 'INVALID', message: 'polygon with rings required' });
        return;
      }
      const area = await service.area(ctx, polygon);
      res.status(200).json({ area });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/geo/geometry/distance', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { a, b } = req.body as { a: GeoPointValue; b: GeoPointValue };
      if (!a || !b) {
        res.status(400).json({ error: 'INVALID', message: 'a, b points required' });
        return;
      }
      const distance = await service.distance(ctx, a, b);
      res.status(200).json({ distance });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/v1/geo/geometry/contains', async (req, res) => {
    try {
      const user = await extractUser(req, authenticator, isDev);
      const ctx = ctxFromUser(user);
      const { shape, point } = req.body as { shape: GeoShape; point: GeoPointValue };
      if (!shape || !point) {
        res.status(400).json({ error: 'INVALID', message: 'shape, point required' });
        return;
      }
      const contained = await service.contains(ctx, shape, point);
      res.status(200).json({ contained });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed' });
    }
  });
}
