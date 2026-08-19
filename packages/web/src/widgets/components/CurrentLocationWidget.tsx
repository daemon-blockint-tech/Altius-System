/**
 * CurrentLocationWidget — requests and displays the user's geolocation.
 *
 * Config:
 *   label?: string
 *   showAccuracy?: boolean
 *   autoRequest?: boolean  — request on mount
 *
 * Writes { lat, lng, accuracy } to bound variable.
 */

import { useState, useEffect, useCallback } from 'react';
import type { WidgetProps } from '../types.js';

interface CurrentLocationConfig {
  label?: string;
  showAccuracy?: boolean;
  autoRequest?: boolean;
}

interface LocationData { lat: number; lng: number; accuracy?: number; }

export function CurrentLocationWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as CurrentLocationConfig;
  const varName = instance.boundVariable ?? 'currentLocation';
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const data: LocationData = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setLocation(data);
        ctx.setVariable(varName, data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, [ctx, varName]);

  useEffect(() => {
    if (config.autoRequest) request();
  }, [config.autoRequest, request]);

  return (
    <div className="ed-widget ed-current-location" data-widget-id={instance.id}>
      <div className="ed-current-location__header">
        <span className="ed-current-location__label">{config.label ?? 'Current Location'}</span>
        <button className="ed-current-location__btn" onClick={request} disabled={loading}>
          {loading ? '...' : 'Locate'}
        </button>
      </div>
      {error && <div className="ed-current-location__error">{error}</div>}
      {location && (
        <div className="ed-current-location__data">
          <span className="ed-current-location__coord">Lat: {location.lat.toFixed(4)}</span>
          <span className="ed-current-location__coord">Lng: {location.lng.toFixed(4)}</span>
          {config.showAccuracy && location.accuracy !== undefined && (
            <span className="ed-current-location__accuracy">±{Math.round(location.accuracy)}m</span>
          )}
        </div>
      )}
      {!location && !error && !loading && (
        <div className="ed-current-location__empty">Click "Locate" to get your position</div>
      )}
    </div>
  );
}
