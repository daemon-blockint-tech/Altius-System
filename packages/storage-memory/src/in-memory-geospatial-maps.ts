/**
 * In-memory geospatial map service.
 */

import { randomUUID } from 'node:crypto';
import type {
  GeospatialMapService,
  MapLayer,
  CreateMapLayerInput,
  SavedMap,
  CreateSavedMapInput,
  MapAnnotation,
  CreateAnnotationInput,
  GeoShape,
  GeoPointValue,
  GeoBBox,
  SpatialSearchResult,
  SearchAroundResult,
  GeocodeResult,
  ReverseGeocodeResult,
  RequestContext,
} from '@altius/spi';

// ── Geometry helpers ──────────────────────────────────────────────────

function haversineMeters(a: GeoPointValue, b: GeoPointValue): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pointInBBox(p: GeoPointValue, bbox: GeoBBox): boolean {
  return p.lat >= bbox.south && p.lat <= bbox.north && p.lng >= bbox.west && p.lng <= bbox.east;
}

function pointInPolygon(p: GeoPointValue, rings: GeoPointValue[][]): boolean {
  // Ray-casting on the exterior ring
  const ring = rings[0];
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]!.lng, yi = ring[i]!.lat;
    const xj = ring[j]!.lng, yj = ring[j]!.lat;
    if (((yi > p.lat) !== (yj > p.lat)) && (p.lng < (xj - xi) * (p.lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInCircle(p: GeoPointValue, center: GeoPointValue, radiusMeters: number): boolean {
  return haversineMeters(p, center) <= radiusMeters;
}

function shapeContainsPoint(shape: GeoShape, p: GeoPointValue): boolean {
  switch (shape.type) {
    case 'point': return haversineMeters(shape.coordinates, p) < 1;
    case 'bbox': return pointInBBox(p, shape.bbox);
    case 'circle': return pointInCircle(p, shape.circle.center, shape.circle.radiusMeters);
    case 'polygon': return pointInPolygon(p, shape.polygon.rings);
    case 'linestring': return false; // lines don't contain points
  }
}

// ── Service ───────────────────────────────────────────────────────────

// Object store type — the service needs access to objects to perform spatial search.
// In a real implementation this would query the StorageProvider; here we accept
// an injected object reader for testability.
export type ObjectReader = (
  ctx: RequestContext,
  objectType: string,
  filter?: Record<string, unknown>,
) => Promise<Array<{ id: string; properties: Record<string, unknown> }>>;

export class InMemoryGeospatialMapService implements GeospatialMapService {
  private readonly layers = new Map<string, Map<string, MapLayer>>();
  private readonly savedMaps = new Map<string, Map<string, SavedMap>>();
  private readonly annotations = new Map<string, Map<string, MapAnnotation>>();
  private readonly objectReader?: ObjectReader;

  constructor(objectReader?: ObjectReader) {
    this.objectReader = objectReader;
  }

  // ── Layers ──

  async createLayer(ctx: RequestContext, input: CreateMapLayerInput): Promise<MapLayer> {
    const id = randomUUID();
    const layer: MapLayer = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      objectType: input.objectType, geometryField: input.geometryField,
      kind: input.kind, baseUrl: input.baseUrl,
      style: input.style ?? {},
      filter: input.filter,
      visible: input.visible ?? true,
      opacity: input.opacity ?? 1,
      zIndex: input.zIndex ?? 0,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getLayerMap(ctx.tenantId).set(id, layer);
    return layer;
  }

  async getLayer(ctx: RequestContext, id: string): Promise<MapLayer | null> {
    return this.layers.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listLayers(ctx: RequestContext, objectType?: string): Promise<MapLayer[]> {
    const m = this.layers.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (objectType) list = list.filter(l => l.objectType === objectType);
    return list.sort((a, b) => a.zIndex - b.zIndex);
  }

  async updateLayer(ctx: RequestContext, id: string, updates: Partial<CreateMapLayerInput>): Promise<MapLayer> {
    const layer = this.layers.get(ctx.tenantId)?.get(id);
    if (!layer) throw new Error(`Layer not found: ${id}`);
    const updated: MapLayer = {
      ...layer,
      name: updates.name ?? layer.name,
      description: updates.description ?? layer.description,
      objectType: updates.objectType ?? layer.objectType,
      geometryField: updates.geometryField ?? layer.geometryField,
      kind: updates.kind ?? layer.kind,
      baseUrl: updates.baseUrl ?? layer.baseUrl,
      style: updates.style ? { ...layer.style, ...updates.style } : layer.style,
      filter: updates.filter ?? layer.filter,
      visible: updates.visible ?? layer.visible,
      opacity: updates.opacity ?? layer.opacity,
      zIndex: updates.zIndex ?? layer.zIndex,
    };
    this.getLayerMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteLayer(ctx: RequestContext, id: string): Promise<void> {
    this.layers.get(ctx.tenantId)?.delete(id);
  }

  // ── Saved maps ──

  async createSavedMap(ctx: RequestContext, input: CreateSavedMapInput): Promise<SavedMap> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const map: SavedMap = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      layerIds: input.layerIds,
      viewport: input.viewport,
      annotationIds: [],
      ownerId: ctx.actorId ?? 'system',
      sharedWith: [],
      isPublic: input.isPublic ?? false,
      tags: input.tags ?? [],
      createdAt: now, updatedAt: now,
    };
    this.getMapMap(ctx.tenantId).set(id, map);
    return map;
  }

  async getSavedMap(ctx: RequestContext, id: string): Promise<SavedMap | null> {
    return this.savedMaps.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listSavedMaps(ctx: RequestContext, tags?: string[]): Promise<SavedMap[]> {
    const m = this.savedMaps.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (tags && tags.length > 0) list = list.filter(map => tags.some(t => map.tags.includes(t)));
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateSavedMap(ctx: RequestContext, id: string, updates: Partial<CreateSavedMapInput>): Promise<SavedMap> {
    const map = this.savedMaps.get(ctx.tenantId)?.get(id);
    if (!map) throw new Error(`Saved map not found: ${id}`);
    const updated: SavedMap = {
      ...map,
      name: updates.name ?? map.name,
      description: updates.description ?? map.description,
      layerIds: updates.layerIds ?? map.layerIds,
      viewport: updates.viewport ?? map.viewport,
      isPublic: updates.isPublic ?? map.isPublic,
      tags: updates.tags ?? map.tags,
      updatedAt: new Date().toISOString(),
    };
    this.getMapMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteSavedMap(ctx: RequestContext, id: string): Promise<void> {
    this.savedMaps.get(ctx.tenantId)?.delete(id);
  }

  async shareSavedMap(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedMap> {
    const map = this.savedMaps.get(ctx.tenantId)?.get(id);
    if (!map) throw new Error(`Saved map not found: ${id}`);
    const updated = { ...map, sharedWith: [...new Set([...map.sharedWith, ...userIds])] };
    this.getMapMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  // ── Annotations ──

  async createAnnotation(ctx: RequestContext, input: CreateAnnotationInput): Promise<MapAnnotation> {
    const id = randomUUID();
    const ann: MapAnnotation = {
      id, tenantId: ctx.tenantId,
      label: input.label, description: input.description ?? '',
      shape: input.shape,
      kind: input.kind,
      style: input.style,
      objectId: input.objectId,
      objectType: input.objectType,
      ownerId: ctx.actorId ?? 'system',
      createdAt: new Date().toISOString(),
    };
    this.getAnnotationMap(ctx.tenantId).set(id, ann);
    return ann;
  }

  async getAnnotation(ctx: RequestContext, id: string): Promise<MapAnnotation | null> {
    return this.annotations.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listAnnotations(ctx: RequestContext, _savedMapId?: string): Promise<MapAnnotation[]> {
    const m = this.annotations.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async deleteAnnotation(ctx: RequestContext, id: string): Promise<void> {
    this.annotations.get(ctx.tenantId)?.delete(id);
  }

  // ── Spatial search ──

  async spatialIntersect(ctx: RequestContext, objectType: string, geometryField: string, shape: GeoShape): Promise<SpatialSearchResult[]> {
    if (!this.objectReader) return [];
    const objects = await this.objectReader(ctx, objectType);
    const results: SpatialSearchResult[] = [];
    for (const obj of objects) {
      const geom = obj.properties[geometryField] as GeoPointValue | undefined;
      if (!geom || typeof geom.lat !== 'number') continue;
      if (shapeContainsPoint(shape, geom)) {
        results.push({ objectType, objectId: obj.id, geometry: geom, properties: obj.properties });
      }
    }
    return results;
  }

  async searchAround(ctx: RequestContext, objectType: string, geometryField: string, center: GeoPointValue, radiusMeters: number, limit?: number): Promise<SearchAroundResult[]> {
    if (!this.objectReader) return [];
    const objects = await this.objectReader(ctx, objectType);
    const results: SearchAroundResult[] = [];
    for (const obj of objects) {
      const geom = obj.properties[geometryField] as GeoPointValue | undefined;
      if (!geom || typeof geom.lat !== 'number') continue;
      const dist = haversineMeters(center, geom);
      if (dist <= radiusMeters) {
        results.push({ objectType, objectId: obj.id, geometry: geom, properties: obj.properties, distanceMeters: dist });
      }
    }
    results.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
    return limit ? results.slice(0, limit) : results;
  }

  async searchInBBox(ctx: RequestContext, objectType: string, geometryField: string, bbox: GeoBBox): Promise<SpatialSearchResult[]> {
    return this.spatialIntersect(ctx, objectType, geometryField, { type: 'bbox', bbox });
  }

  // ── Geocoding (stub — no external geocoder in-memory) ──

  async geocode(_ctx: RequestContext, query: string): Promise<GeocodeResult> {
    // In-memory: no real geocoder. Return empty results.
    return { query, results: [] };
  }

  async reverseGeocode(_ctx: RequestContext, coordinates: GeoPointValue): Promise<ReverseGeocodeResult> {
    return { coordinates, label: `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}`, components: {} };
  }

  // ── Geometry helpers ──

  async buffer(_ctx: RequestContext, shape: GeoShape, distanceMeters: number): Promise<GeoShape> {
    // Simplified: buffer a point → circle
    if (shape.type === 'point') {
      return { type: 'circle', circle: { center: shape.coordinates, radiusMeters: distanceMeters } };
    }
    return shape;
  }

  async area(_ctx: RequestContext, polygon: { rings: GeoPointValue[][] }): Promise<number> {
    // Simplified spherical area using the exterior ring
    const ring = polygon.rings[0];
    if (!ring || ring.length < 3) return 0;
    let area = 0;
    const R = 6371000;
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      const lat1 = ring[i]!.lat * Math.PI / 180;
      const lat2 = ring[j]!.lat * Math.PI / 180;
      const dLng = (ring[j]!.lng - ring[i]!.lng) * Math.PI / 180;
      area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    return Math.abs(area * R * R / 2);
  }

  async distance(_ctx: RequestContext, a: GeoPointValue, b: GeoPointValue): Promise<number> {
    return haversineMeters(a, b);
  }

  async contains(_ctx: RequestContext, shape: GeoShape, point: GeoPointValue): Promise<boolean> {
    return shapeContainsPoint(shape, point);
  }

  // ── Private maps ──

  private getLayerMap(tenantId: string): Map<string, MapLayer> {
    let m = this.layers.get(tenantId);
    if (!m) { m = new Map(); this.layers.set(tenantId, m); }
    return m;
  }
  private getMapMap(tenantId: string): Map<string, SavedMap> {
    let m = this.savedMaps.get(tenantId);
    if (!m) { m = new Map(); this.savedMaps.set(tenantId, m); }
    return m;
  }
  private getAnnotationMap(tenantId: string): Map<string, MapAnnotation> {
    let m = this.annotations.get(tenantId);
    if (!m) { m = new Map(); this.annotations.set(tenantId, m); }
    return m;
  }
}
