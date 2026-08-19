/**
 * MapWidget — interactive geospatial map with tile layers, markers,
 * radius search, and geocoding.
 *
 * Config:
 *   dataSources?: Array<{ objectType: string; geometryField: string; filter?: Record<string, unknown> }>
 *   tileUrl?: string         — OSM tile URL template (default: OSM)
 *   center?: { lat: number; lng: number }
 *   zoom?: number            — default 13
 *   width?: number           — default 600
 *   height?: number          — default 400
 *   enableGeocode?: boolean  — show geocode search bar
 *   enableRadiusSearch?: boolean — show radius search controls
 *   radiusMeters?: number    — default 1000
 *   layers?: Array<{ name: string; objectType: string; geometryField: string; visible?: boolean; color?: string }>
 *
 * Bound variable: when a marker is clicked, its object ID is written to
 * the bound variable as { objectId, objectType, lat, lng }.
 *
 * The map renders as an SVG overlay on top of a tile layer. Markers are
 * projected from lat/lng to pixel coordinates using the Web Mercator
 * projection at the configured zoom level.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { WidgetProps } from '../types.js';
import {
  searchAround,
  geocode,
  type GeoPoint,
  type SpatialSearchResult,
  type GeocodeResult,
} from '../geospatial-client.js';

interface MapDataSource {
  objectType: string;
  geometryField: string;
  filter?: Record<string, unknown>;
}

interface MapLayerConfig {
  name: string;
  objectType: string;
  geometryField: string;
  visible?: boolean;
  color?: string;
}

interface MapConfig {
  dataSources?: MapDataSource[];
  tileUrl?: string;
  center?: GeoPoint;
  zoom?: number;
  width?: number;
  height?: number;
  enableGeocode?: boolean;
  enableRadiusSearch?: boolean;
  radiusMeters?: number;
  layers?: MapLayerConfig[];
}

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_CENTER: GeoPoint = { lat: 51.5074, lng: -0.1278 }; // London
const DEFAULT_ZOOM = 13;
const TILE_SIZE = 256;

/** Web Mercator projection: lat/lng → pixel x/y at zoom level. */
function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n * TILE_SIZE;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * TILE_SIZE;
  return { x, y };
}

/** Inverse projection: pixel x/y → lat/lng at zoom level. */
function unproject(x: number, y: number, zoom: number): GeoPoint {
  const n = Math.pow(2, zoom);
  const lng = (x / (n * TILE_SIZE)) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / (n * TILE_SIZE))));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

const LAYER_COLORS = ['#e6194B', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45'];

export function MapWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as MapConfig;
  const boundVar = instance.boundVariable;
  const width = config.width ?? 600;
  const height = config.height ?? 400;
  const zoom = config.zoom ?? DEFAULT_ZOOM;
  const tileUrl = config.tileUrl ?? DEFAULT_TILE_URL;
  const center = config.center ?? DEFAULT_CENTER;
  const radiusMeters = config.radiusMeters ?? 1000;
  const enableGeocode = config.enableGeocode ?? false;
  const enableRadiusSearch = config.enableRadiusSearch ?? false;

  const [viewCenter, setViewCenter] = useState<GeoPoint>(center);
  const [viewZoom, setViewZoom] = useState(zoom);
  const [markers, setMarkers] = useState<Array<GeoPoint & { objectId?: string; objectType?: string; color?: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geocodeQuery, setGeocodeQuery] = useState('');
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResult | null>(null);
  const [searchCenter, setSearchCenter] = useState<GeoPoint | null>(null);
  const [searchRadius, setSearchRadius] = useState(radiusMeters);
  const svgRef = useRef<SVGSVGElement>(null);

  // Load markers from config data sources (static data from variables)
  useEffect(() => {
    if (config.dataSources && config.dataSources.length > 0) {
      // For each data source, look for data in ctx.variables
      const allMarkers: Array<GeoPoint & { objectId?: string; objectType?: string; color?: string }> = [];
      config.dataSources.forEach((ds, idx) => {
        const varData = ctx.variables[`${ds.objectType}_data`] as Array<Record<string, unknown>> | undefined;
        if (varData && Array.isArray(varData)) {
          const color = LAYER_COLORS[idx % LAYER_COLORS.length];
          varData.forEach((obj) => {
            const geo = obj[ds.geometryField] as GeoPoint | undefined;
            if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
              allMarkers.push({
                ...geo,
                objectId: obj['_id'] as string | undefined,
                objectType: ds.objectType,
                color,
              });
            }
          });
        }
      });
      setMarkers(allMarkers);
    }
  }, [config.dataSources, ctx.variables]);

  // Radius search
  const doRadiusSearch = useCallback(async () => {
    if (!searchCenter || !config.dataSources?.length) return;
    setLoading(true);
    setError(null);
    try {
      const ds = config.dataSources[0]!;
      const results = await searchAround(ds.objectType, ds.geometryField, searchCenter, searchRadius);
      const newMarkers = results.map((r: SpatialSearchResult) => ({
        lat: r.geometry.lat,
        lng: r.geometry.lng,
        objectId: r.objectId,
        objectType: r.objectType,
        color: '#ff0000',
        distanceMeters: r.distanceMeters,
      }));
      setMarkers(newMarkers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [searchCenter, searchRadius, config.dataSources]);

  // Geocode
  const doGeocode = useCallback(async () => {
    if (!geocodeQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await geocode(geocodeQuery);
      setGeocodeResults(result);
      if (result.results.length > 0) {
        setViewCenter(result.results[0]!.coordinates);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Geocode failed');
    } finally {
      setLoading(false);
    }
  }, [geocodeQuery]);

  // Pan/zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    setViewZoom((z) => Math.max(1, Math.min(19, z + delta)));
  }, []);

  // Click on map to set search center
  const handleMapClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!enableRadiusSearch || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // Convert pixel to lat/lng using current view
    const centerPx = project(viewCenter.lat, viewCenter.lng, viewZoom);
    const worldX = centerPx.x + (px - width / 2);
    const worldY = centerPx.y + (py - height / 2);
    const pt = unproject(worldX, worldY, viewZoom);
    setSearchCenter(pt);
  }, [enableRadiusSearch, viewCenter, viewZoom, width, height]);

  // Project markers to screen coordinates
  const centerPx = useMemo(() => project(viewCenter.lat, viewCenter.lng, viewZoom), [viewCenter, viewZoom]);
  const projectedMarkers = useMemo(() => {
    return markers.map((m) => {
      const px = project(m.lat, m.lng, viewZoom);
      return {
        ...m,
        screenX: px.x - centerPx.x + width / 2,
        screenY: px.y - centerPx.y + height / 2,
      };
    });
  }, [markers, viewZoom, centerPx, width, height]);

  // Generate tile URLs for the current view
  const tiles = useMemo(() => {
    const n = Math.pow(2, viewZoom);
    const centerTileX = Math.floor((viewCenter.lng + 180) / 360 * n);
    const centerTileY = Math.floor((1 - Math.log(Math.tan(viewCenter.lat * Math.PI / 180) + 1 / Math.cos(viewCenter.lat * Math.PI / 180)) / Math.PI) / 2 * n);
    const tilesArr: Array<{ url: string; x: number; y: number }> = [];
    const tilesPerSide = Math.ceil(Math.max(width, height) / TILE_SIZE) + 2;
    for (let dx = -tilesPerSide; dx <= tilesPerSide; dx++) {
      for (let dy = -tilesPerSide; dy <= tilesPerSide; dy++) {
        const tx = ((centerTileX + dx) % n + n) % n;
        const ty = ((centerTileY + dy) % n + n) % n;
        if (ty < 0 || ty >= n) continue;
        const url = tileUrl
          .replace('{z}', String(viewZoom))
          .replace('{x}', String(tx))
          .replace('{y}', String(ty));
        const screenX = dx * TILE_SIZE - ((centerTileX * TILE_SIZE) - centerPx.x) + width / 2 - TILE_SIZE / 2;
        const screenY = dy * TILE_SIZE - ((centerTileY * TILE_SIZE) - centerPx.y) + height / 2 - TILE_SIZE / 2;
        tilesArr.push({ url, x: screenX, y: screenY });
      }
    }
    return tilesArr;
  }, [viewZoom, viewCenter, tileUrl, width, height, centerPx]);

  // Radius circle in pixels
  const radiusPixels = useMemo(() => {
    if (!searchCenter) return 0;
    const centerScreen = project(searchCenter.lat, searchCenter.lng, viewZoom);
    const offsetLng = searchCenter.lng + (searchRadius / 111320) * (1 / Math.cos(searchCenter.lat * Math.PI / 180));
    const edgeScreen = project(searchCenter.lat, offsetLng, viewZoom);
    return Math.abs(edgeScreen.x - centerScreen.x);
  }, [searchCenter, searchRadius, viewZoom]);

  const radiusCenterScreen = useMemo(() => {
    if (!searchCenter) return null;
    const px = project(searchCenter.lat, searchCenter.lng, viewZoom);
    return { x: px.x - centerPx.x + width / 2, y: px.y - centerPx.y + height / 2 };
  }, [searchCenter, viewZoom, centerPx, width, height]);

  const handleMarkerClick = useCallback((m: typeof markers[number]) => {
    setSelected(m.objectId ?? `${m.lat},${m.lng}`);
    if (boundVar) {
      ctx.setVariable(boundVar, {
        objectId: m.objectId,
        objectType: m.objectType,
        lat: m.lat,
        lng: m.lng,
      });
    }
  }, [boundVar, ctx]);

  return (
    <div style={{ width, height, position: 'relative', border: '1px solid #ccc', overflow: 'hidden', fontFamily: 'sans-serif' }}>
      {/* Geocode search bar */}
      {enableGeocode && (
        <div style={{ position: 'absolute', top: 4, left: 4, zIndex: 10, background: 'white', padding: 4, borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
          <input
            type="text"
            placeholder="Search address..."
            value={geocodeQuery}
            onChange={(e) => setGeocodeQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doGeocode()}
            style={{ width: 180, padding: '2px 4px', fontSize: 12, border: '1px solid #ccc' }}
            aria-label="Geocode search"
          />
          <button onClick={doGeocode} disabled={loading} style={{ marginLeft: 4, padding: '2px 8px', fontSize: 12 }}>
            {loading ? '...' : 'Go'}
          </button>
          {geocodeResults && geocodeResults.results.length > 1 && (
            <select
              aria-label="Geocode results"
              onChange={(e) => {
                const r = geocodeResults.results[parseInt(e.target.value)];
                if (r) setViewCenter(r.coordinates);
              }}
              style={{ display: 'block', marginTop: 4, width: '100%', fontSize: 11 }}
            >
              {geocodeResults.results.map((r, i) => (
                <option key={i} value={i}>{r.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Radius search controls */}
      {enableRadiusSearch && (
        <div style={{ position: 'absolute', top: enableGeocode ? 48 : 4, left: 4, zIndex: 10, background: 'white', padding: 4, borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', fontSize: 11 }}>
          <label>
            Radius: {searchRadius}m
            <input type="range" min="100" max="50000" step="100" value={searchRadius}
              onChange={(e) => setSearchRadius(Number(e.target.value))}
              aria-label="Search radius"
            />
          </label>
          <button onClick={doRadiusSearch} disabled={loading || !searchCenter} style={{ display: 'block', marginTop: 4, width: '100%', padding: '2px 4px', fontSize: 11 }}>
            {searchCenter ? `Search (${searchCenter.lat.toFixed(3)}, ${searchCenter.lat.toFixed(3)})` : 'Click map to set center'}
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={{ position: 'absolute', bottom: 4, left: 4, zIndex: 10, background: '#fee', color: '#c00', padding: '4px 8px', borderRadius: 4, fontSize: 11 }}>
          {error}
        </div>
      )}

      {/* Map SVG */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onWheel={handleWheel}
        onClick={handleMapClick}
        style={{ display: 'block', cursor: enableRadiusSearch ? 'crosshair' : 'grab', background: '#aad3df' }}
        aria-label="Interactive map"
      >
        {/* Tile layer */}
        {tiles.map((t, i) => (
          <image
            key={i}
            href={t.url}
            x={t.x}
            y={t.y}
            width={TILE_SIZE}
            height={TILE_SIZE}
            preserveAspectRatio="none"
          />
        ))}

        {/* Radius search circle */}
        {radiusCenterScreen && radiusPixels > 0 && (
          <circle
            cx={radiusCenterScreen.x}
            cy={radiusCenterScreen.y}
            r={radiusPixels}
            fill="rgba(255,0,0,0.1)"
            stroke="rgba(255,0,0,0.5)"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        )}

        {/* Markers */}
        {projectedMarkers.map((m, i) => {
          const isSel = selected === (m.objectId ?? `${m.lat},${m.lng}`);
          const color = m.color ?? '#e6194B';
          return (
            <g key={i} onClick={(e) => { e.stopPropagation(); handleMarkerClick(m); }} style={{ cursor: 'pointer' }}>
              <circle
                cx={m.screenX}
                cy={m.screenY}
                r={isSel ? 8 : 5}
                fill={color}
                stroke={isSel ? '#000' : '#fff'}
                strokeWidth={isSel ? 2 : 1}
              />
              {isSel && m.objectId && (
                <text x={m.screenX + 10} y={m.screenY + 4} fontSize={10} fill="#000" style={{ pointerEvents: 'none' }}>
                  {m.objectId.slice(0, 8)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button onClick={() => setViewZoom((z) => Math.min(19, z + 1))} style={{ width: 28, height: 28, fontSize: 18, padding: 0 }} aria-label="Zoom in">+</button>
        <button onClick={() => setViewZoom((z) => Math.max(1, z - 1))} style={{ width: 28, height: 28, fontSize: 18, padding: 0 }} aria-label="Zoom out">−</button>
      </div>

      {/* Status bar */}
      <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'rgba(255,255,255,0.8)', padding: '2px 6px', fontSize: 10, color: '#666' }}>
        z{viewZoom} · {markers.length} markers
      </div>
    </div>
  );
}
