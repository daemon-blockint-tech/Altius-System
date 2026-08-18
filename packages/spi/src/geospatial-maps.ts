/**
 * Geospatial map services — map workspace, interactive map application,
 * and geospatial mapping capabilities.
 *
 * Covers three backlog rows:
 *   - misc-3/geospatial-map-workspace (selection, shapes, intersect, layers)
 *   - misc-2/interactive-geospatial-map-application (layers, geocode, saved maps, search-around)
 *   - misc-1/interactive-geospatial-mapping (overlays, geo search, annotations)
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Geometry types
// ===========================================================================

/** A geographic point. */
export interface GeoPointValue {
  lat: number;
  lng: number;
}

/** A geographic bounding box. */
export interface GeoBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** A geographic polygon (array of rings; first ring is exterior). */
export interface GeoPolygonValue {
  rings: GeoPointValue[][];
}

/** A geographic circle (center + radius). */
export interface GeoCircleValue {
  center: GeoPointValue;
  radiusMeters: number;
}

/** Union of geometry shapes for drawing/selection. */
export type GeoShape =
  | { type: 'point'; coordinates: GeoPointValue }
  | { type: 'bbox'; bbox: GeoBBox }
  | { type: 'circle'; circle: GeoCircleValue }
  | { type: 'polygon'; polygon: GeoPolygonValue }
  | { type: 'linestring'; coordinates: GeoPointValue[] };

// ===========================================================================
// Map layers
// ===========================================================================

/** A map layer — a styled data layer rendered on the map. */
export interface MapLayer {
  id: string;
  tenantId: string;
  /** Layer name. */
  name: string;
  description: string;
  /** Object type this layer visualizes. */
  objectType: string;
  /** Geometry field on the object type. */
  geometryField: string;
  /** Layer kind. */
  kind: 'point' | 'heatmap' | 'cluster' | 'line' | 'polygon' | 'tile';
  /** Base layer URL (for tile layers). */
  baseUrl?: string;
  /** Styling rules. */
  style: MapLayerStyle;
  /** Filter applied to objects in this layer. */
  filter?: Record<string, unknown>;
  /** Whether the layer is visible by default. */
  visible: boolean;
  /** Layer opacity (0-1). */
  opacity: number;
  /** Z-index for layer ordering. */
  zIndex: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the layer. */
  createdBy: string;
}

/** Styling for a map layer. */
export interface MapLayerStyle {
  /** Fill color (CSS). */
  fillColor?: string;
  /** Fill opacity (0-1). */
  fillOpacity?: number;
  /** Stroke color (CSS). */
  strokeColor?: string;
  /** Stroke width in pixels. */
  strokeWidth?: number;
  /** Point radius in pixels. */
  pointRadius?: number;
  /** Color property (field-based coloring). */
  colorProperty?: string;
  /** Size property (field-based sizing). */
  sizeProperty?: string;
  /** Icon URL for point markers. */
  iconUrl?: string;
  /** Label property. */
  labelProperty?: string;
}

/** Input for creating a map layer. */
export interface CreateMapLayerInput {
  name: string;
  description?: string;
  objectType: string;
  geometryField: string;
  kind: MapLayer['kind'];
  baseUrl?: string;
  style?: Partial<MapLayerStyle>;
  filter?: Record<string, unknown>;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
}

// ===========================================================================
// Saved maps
// ===========================================================================

/** A saved map — a named configuration of layers, viewport, and annotations. */
export interface SavedMap {
  id: string;
  tenantId: string;
  /** Map name. */
  name: string;
  description: string;
  /** Layer IDs included in this map. */
  layerIds: string[];
  /** Viewport configuration. */
  viewport: MapViewport;
  /** Annotations on the map. */
  annotationIds: string[];
  /** Owner user ID. */
  ownerId: string;
  /** Shared with user IDs. */
  sharedWith: string[];
  /** Whether the map is public within the tenant. */
  isPublic: boolean;
  /** Tags. */
  tags: string[];
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** Map viewport — the current view state of a map. */
export interface MapViewport {
  /** Center point. */
  center: GeoPointValue;
  /** Zoom level. */
  zoom: number;
  /** Bounding box of the current view. */
  bbox?: GeoBBox;
  /** Rotation in degrees. */
  bearing?: number;
  /** Pitch in degrees (3D tilt). */
  pitch?: number;
}

/** Input for creating a saved map. */
export interface CreateSavedMapInput {
  name: string;
  description?: string;
  layerIds: string[];
  viewport: MapViewport;
  isPublic?: boolean;
  tags?: string[];
}

// ===========================================================================
// Annotations
// ===========================================================================

/** A map annotation — a drawn shape or marker with metadata. */
export interface MapAnnotation {
  id: string;
  tenantId: string;
  /** Annotation label. */
  label: string;
  description: string;
  /** The drawn shape. */
  shape: GeoShape;
  /** Annotation kind. */
  kind: 'marker' | 'shape' | 'measurement' | 'note';
  /** Style. */
  style?: MapLayerStyle;
  /** Associated object ID (if linked to an ontology object). */
  objectId?: string;
  /** Associated object type. */
  objectType?: string;
  /** Measurement value (for measurement annotations). */
  measurement?: {
    value: number;
    unit: string;
  };
  /** Owner user ID. */
  ownerId: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Input for creating an annotation. */
export interface CreateAnnotationInput {
  label: string;
  description?: string;
  shape: GeoShape;
  kind: MapAnnotation['kind'];
  style?: Partial<MapLayerStyle>;
  objectId?: string;
  objectType?: string;
}

// ===========================================================================
// Geocoding
// ===========================================================================

/** A geocode result. */
export interface GeocodeResult {
  query: string;
  results: Array<{
    label: string;
    coordinates: GeoPointValue;
    bbox?: GeoBBox;
    type: string;
    confidence: number;
  }>;
}

/** Reverse geocode result. */
export interface ReverseGeocodeResult {
  coordinates: GeoPointValue;
  label: string;
  components: Record<string, string>;
}

// ===========================================================================
// Spatial search
// ===========================================================================

/** Result of a spatial intersect search. */
export interface SpatialSearchResult {
  objectType: string;
  objectId: string;
  geometry: GeoPointValue;
  properties: Record<string, unknown>;
  distanceMeters?: number;
}

/** Search-around result (objects within a radius of a point). */
export interface SearchAroundResult extends SpatialSearchResult {}

// ===========================================================================
// Map workspace service
// ===========================================================================

/**
 * Geospatial map workspace service — layers, saved maps, annotations,
 * spatial search, geocoding, and shape operations.
 */
export interface GeospatialMapService {
  // ── Layers ──
  createLayer(ctx: RequestContext, input: CreateMapLayerInput): Promise<MapLayer>;
  getLayer(ctx: RequestContext, id: string): Promise<MapLayer | null>;
  listLayers(ctx: RequestContext, objectType?: string): Promise<MapLayer[]>;
  updateLayer(ctx: RequestContext, id: string, updates: Partial<CreateMapLayerInput>): Promise<MapLayer>;
  deleteLayer(ctx: RequestContext, id: string): Promise<void>;

  // ── Saved maps ──
  createSavedMap(ctx: RequestContext, input: CreateSavedMapInput): Promise<SavedMap>;
  getSavedMap(ctx: RequestContext, id: string): Promise<SavedMap | null>;
  listSavedMaps(ctx: RequestContext, tags?: string[]): Promise<SavedMap[]>;
  updateSavedMap(ctx: RequestContext, id: string, updates: Partial<CreateSavedMapInput>): Promise<SavedMap>;
  deleteSavedMap(ctx: RequestContext, id: string): Promise<void>;
  shareSavedMap(ctx: RequestContext, id: string, userIds: string[]): Promise<SavedMap>;

  // ── Annotations ──
  createAnnotation(ctx: RequestContext, input: CreateAnnotationInput): Promise<MapAnnotation>;
  getAnnotation(ctx: RequestContext, id: string): Promise<MapAnnotation | null>;
  listAnnotations(ctx: RequestContext, savedMapId?: string): Promise<MapAnnotation[]>;
  deleteAnnotation(ctx: RequestContext, id: string): Promise<void>;

  // ── Spatial search ──
  /** Find objects of a type whose geometry intersects a shape. */
  spatialIntersect(ctx: RequestContext, objectType: string, geometryField: string, shape: GeoShape): Promise<SpatialSearchResult[]>;
  /** Search-around: find objects within a radius of a point. */
  searchAround(ctx: RequestContext, objectType: string, geometryField: string, center: GeoPointValue, radiusMeters: number, limit?: number): Promise<SearchAroundResult[]>;
  /** Find objects within a bounding box. */
  searchInBBox(ctx: RequestContext, objectType: string, geometryField: string, bbox: GeoBBox): Promise<SpatialSearchResult[]>;

  // ── Geocoding ──
  /** Forward geocode: address string → coordinates. */
  geocode(ctx: RequestContext, query: string): Promise<GeocodeResult>;
  /** Reverse geocode: coordinates → address. */
  reverseGeocode(ctx: RequestContext, coordinates: GeoPointValue): Promise<ReverseGeocodeResult>;

  // ── Geometry helpers ──
  /** Buffer a shape by a distance (in meters). */
  buffer(ctx: RequestContext, shape: GeoShape, distanceMeters: number): Promise<GeoShape>;
  /** Calculate the area of a polygon (in square meters). */
  area(ctx: RequestContext, polygon: GeoPolygonValue): Promise<number>;
  /** Calculate the distance between two points (in meters). */
  distance(ctx: RequestContext, a: GeoPointValue, b: GeoPointValue): Promise<number>;
  /** Check if a point is inside a shape. */
  contains(ctx: RequestContext, shape: GeoShape, point: GeoPointValue): Promise<boolean>;
}
