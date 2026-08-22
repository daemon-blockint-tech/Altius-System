import { authedFetch } from './auth-fetch.js';
/**
 * Geospatial client — helpers for fetching map data from the backend.
 *
 * Wraps the REST API at /api/v1/geo/*.
 */

/** A geographic point. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** A bounding box. */
export interface GeoBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** A map layer definition. */
export interface MapLayer {
  id: string;
  name: string;
  description: string;
  objectType: string;
  geometryField: string;
  kind: 'point' | 'heatmap' | 'cluster' | 'line' | 'polygon' | 'tile';
  baseUrl?: string;
  style: MapLayerStyle;
  filter?: Record<string, unknown>;
  visible: boolean;
  opacity: number;
  zIndex: number;
  createdAt: string;
  createdBy: string;
}

export interface MapLayerStyle {
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  pointRadius?: number;
  colorProperty?: string;
  sizeProperty?: string;
  iconUrl?: string;
  labelProperty?: string;
}

/** A saved map. */
export interface SavedMap {
  id: string;
  name: string;
  description: string;
  layerIds: string[];
  viewport: { center: GeoPoint; zoom: number; bbox?: GeoBBox; bearing?: number; pitch?: number };
  annotationIds: string[];
  ownerId: string;
  sharedWith: string[];
  isPublic: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** A map annotation. */
export interface MapAnnotation {
  id: string;
  label: string;
  description: string;
  shape: GeoShape;
  kind: 'marker' | 'shape' | 'measurement' | 'note';
  style?: MapLayerStyle;
  objectId?: string;
  objectType?: string;
  measurement?: { value: number; unit: string };
  ownerId: string;
  createdAt: string;
}

/** A geocode result. */
export interface GeocodeResult {
  query: string;
  results: Array<{
    label: string;
    coordinates: GeoPoint;
    bbox?: GeoBBox;
    type: string;
    confidence: number;
  }>;
}

/** A reverse geocode result. */
export interface ReverseGeocodeResult {
  coordinates: GeoPoint;
  label: string;
  components: Record<string, string>;
}

/** A spatial search result. */
export interface SpatialSearchResult {
  objectType: string;
  objectId: string;
  geometry: GeoPoint;
  properties: Record<string, unknown>;
  distanceMeters?: number;
}

/** Union of geometry shapes. */
export type GeoShape =
  | { type: 'point'; coordinates: GeoPoint }
  | { type: 'bbox'; bbox: GeoBBox }
  | { type: 'circle'; circle: { center: GeoPoint; radiusMeters: number } }
  | { type: 'polygon'; polygon: { rings: GeoPoint[][] } }
  | { type: 'linestring'; coordinates: GeoPoint[] };

// ── Layers ──

export async function listLayers(
  objectType?: string,
  baseUrl = '/api/v1',
): Promise<MapLayer[]> {
  const url = new URL(`${baseUrl}/geo/layers`, window.location.origin);
  if (objectType) url.searchParams.set('objectType', objectType);
  const res = await authedFetch(url.toString());
  if (!res.ok) throw new Error(`listLayers: ${res.status}`);
  const data = await res.json() as { layers: MapLayer[] };
  return data.layers;
}

export async function createLayer(
  input: {
    name: string;
    objectType: string;
    geometryField: string;
    kind: MapLayer['kind'];
    baseUrl?: string;
    style?: Partial<MapLayerStyle>;
    filter?: Record<string, unknown>;
    visible?: boolean;
    opacity?: number;
    zIndex?: number;
  },
  apiBaseUrl = '/api/v1',
): Promise<MapLayer> {
  const res = await authedFetch(`${apiBaseUrl}/geo/layers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createLayer: ${res.status}`);
  return res.json() as Promise<MapLayer>;
}

// ── Saved Maps ──

export async function listSavedMaps(
  tags?: string[],
  baseUrl = '/api/v1',
): Promise<SavedMap[]> {
  const url = new URL(`${baseUrl}/geo/maps`, window.location.origin);
  if (tags?.length) url.searchParams.set('tags', tags.join(','));
  const res = await authedFetch(url.toString());
  if (!res.ok) throw new Error(`listSavedMaps: ${res.status}`);
  const data = await res.json() as { maps: SavedMap[] };
  return data.maps;
}

// ── Annotations ──

export async function listAnnotations(
  savedMapId?: string,
  baseUrl = '/api/v1',
): Promise<MapAnnotation[]> {
  const url = new URL(`${baseUrl}/geo/annotations`, window.location.origin);
  if (savedMapId) url.searchParams.set('savedMapId', savedMapId);
  const res = await authedFetch(url.toString());
  if (!res.ok) throw new Error(`listAnnotations: ${res.status}`);
  const data = await res.json() as { annotations: MapAnnotation[] };
  return data.annotations;
}

// ── Spatial Search ──

export async function searchAround(
  objectType: string,
  geometryField: string,
  center: GeoPoint,
  radiusMeters: number,
  limit?: number,
  baseUrl = '/api/v1',
): Promise<SpatialSearchResult[]> {
  const res = await authedFetch(`${baseUrl}/geo/search/around`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectType, geometryField, center, radiusMeters, limit }),
  });
  if (!res.ok) throw new Error(`searchAround: ${res.status}`);
  const data = await res.json() as { results: SpatialSearchResult[] };
  return data.results;
}

export async function searchIntersect(
  objectType: string,
  geometryField: string,
  shape: GeoShape,
  baseUrl = '/api/v1',
): Promise<SpatialSearchResult[]> {
  const res = await authedFetch(`${baseUrl}/geo/search/intersect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectType, geometryField, shape }),
  });
  if (!res.ok) throw new Error(`searchIntersect: ${res.status}`);
  const data = await res.json() as { results: SpatialSearchResult[] };
  return data.results;
}

export async function searchBBox(
  objectType: string,
  geometryField: string,
  bbox: GeoBBox,
  baseUrl = '/api/v1',
): Promise<SpatialSearchResult[]> {
  const res = await authedFetch(`${baseUrl}/geo/search/bbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectType, geometryField, bbox }),
  });
  if (!res.ok) throw new Error(`searchBBox: ${res.status}`);
  const data = await res.json() as { results: SpatialSearchResult[] };
  return data.results;
}

// ── Geocoding ──

export async function geocode(
  query: string,
  baseUrl = '/api/v1',
): Promise<GeocodeResult> {
  const url = new URL(`${baseUrl}/geo/geocode`, window.location.origin);
  url.searchParams.set('q', query);
  const res = await authedFetch(url.toString());
  if (!res.ok) throw new Error(`geocode: ${res.status}`);
  return res.json() as Promise<GeocodeResult>;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  baseUrl = '/api/v1',
): Promise<ReverseGeocodeResult> {
  const url = new URL(`${baseUrl}/geo/reverse-geocode`, window.location.origin);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lng));
  const res = await authedFetch(url.toString());
  if (!res.ok) throw new Error(`reverseGeocode: ${res.status}`);
  return res.json() as Promise<ReverseGeocodeResult>;
}

// ── Geometry Helpers ──

export async function distance(
  a: GeoPoint,
  b: GeoPoint,
  baseUrl = '/api/v1',
): Promise<number> {
  const res = await authedFetch(`${baseUrl}/geo/geometry/distance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ a, b }),
  });
  if (!res.ok) throw new Error(`distance: ${res.status}`);
  const data = await res.json() as { distance: number };
  return data.distance;
}
