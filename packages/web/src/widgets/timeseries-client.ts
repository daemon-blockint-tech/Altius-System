/**
 * Time-series client — helpers for fetching and transforming time-series data.
 *
 * Wraps the REST API at /api/v1/{plural}/:id/series/:property and
 * /api/v1/timeseries/aggregate.
 */

/** A single timestamped value in a time series. */
export interface TimeSeriesPoint {
  timestamp: string;
  value: number | string | boolean;
  tags?: Record<string, string>;
}

/** Bucketed/aggregated point. */
export interface TimeSeriesBucketPoint {
  timestamp: string;
  value: number;
  count: number;
}

/** Result of a time-series query. */
export interface TimeSeriesResult {
  objectType: string;
  objectId: string;
  property: string;
  points?: TimeSeriesPoint[];
  buckets?: TimeSeriesBucketPoint[];
  totalCount: number;
}

/** Query parameters for reading a time series. */
export interface TimeSeriesQuery {
  start?: string;
  end?: string;
  limit?: number;
  order?: 'asc' | 'desc';
  bucketInterval?: string;
  bucketFunction?: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'first' | 'last';
  tags?: Record<string, string>;
}

/** Statistical summary of a series. */
export interface SeriesSummary {
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  range: number;
  first: number;
  last: number;
  sum: number;
}

/** Detected anomaly. */
export interface AnomalyPoint {
  timestamp: string;
  value: number;
  method: string;
  score: number;
  expected: number;
}

/** Interval detection result. */
export interface IntervalDetectionResult {
  medianIntervalSeconds: number;
  meanIntervalSeconds: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  stdIntervalSeconds: number;
  detectedBucket: string;
  isRegular: boolean;
  gaps: Array<{ start: string; end: string; durationSeconds: number }>;
}

/**
 * Build the URL for a time-series query.
 */
export function timeSeriesUrl(
  objectType: string,
  objectId: string,
  property: string,
  baseUrl = '/api/v1',
): string {
  const plural = objectType.toLowerCase() + 's';
  return `${baseUrl}/${plural}/${encodeURIComponent(objectId)}/series/${encodeURIComponent(property)}`;
}

/**
 * Fetch a time series from the backend.
 */
export async function fetchTimeSeries(
  objectType: string,
  objectId: string,
  property: string,
  query?: TimeSeriesQuery,
  baseUrl = '/api/v1',
): Promise<TimeSeriesResult> {
  const url = new URL(timeSeriesUrl(objectType, objectId, property, baseUrl), window.location.origin);
  if (query?.start) url.searchParams.set('start', query.start);
  if (query?.end) url.searchParams.set('end', query.end);
  if (query?.limit) url.searchParams.set('limit', String(query.limit));
  if (query?.order) url.searchParams.set('order', query.order);
  if (query?.bucketInterval) url.searchParams.set('bucketInterval', query.bucketInterval);
  if (query?.bucketFunction) url.searchParams.set('bucketFunction', query.bucketFunction);
  if (query?.tags) url.searchParams.set('tags', JSON.stringify(query.tags));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Time-series fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<TimeSeriesResult>;
}

/**
 * Append points to a time series.
 */
export async function appendTimeSeriesPoints(
  objectType: string,
  objectId: string,
  property: string,
  points: TimeSeriesPoint[],
  baseUrl = '/api/v1',
): Promise<{ appended: number }> {
  const res = await fetch(timeSeriesUrl(objectType, objectId, property, baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) {
    throw new Error(`Time-series append failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<{ appended: number }>;
}

/**
 * Apply a transform to a time series (resample, rolling, lag, diff, etc.)
 */
export async function transformTimeSeries(
  objectType: string,
  objectId: string,
  property: string,
  operation: string,
  params?: Record<string, unknown>,
  query?: TimeSeriesQuery,
  baseUrl = '/api/v1',
): Promise<unknown> {
  const plural = objectType.toLowerCase() + 's';
  const url = `${baseUrl}/${plural}/${encodeURIComponent(objectId)}/series/${encodeURIComponent(property)}/transform`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, params, query }),
  });
  if (!res.ok) {
    throw new Error(`Transform failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Detect anomalies in a set of points.
 */
export async function detectAnomaliesApi(
  points: TimeSeriesPoint[],
  config?: { method?: string; zThreshold?: number; iqrMultiplier?: number; windowSize?: number; sigmaThreshold?: number },
  baseUrl = '/api/v1',
): Promise<{ anomalies: AnomalyPoint[] }> {
  const res = await fetch(`${baseUrl}/alerting/anomalies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points, config }),
  });
  if (!res.ok) {
    throw new Error(`Anomaly detection failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Detect the sampling interval of a series.
 */
export async function detectIntervalApi(
  points: TimeSeriesPoint[],
  baseUrl = '/api/v1',
): Promise<{ result: IntervalDetectionResult | null }> {
  const res = await fetch(`${baseUrl}/alerting/interval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) {
    throw new Error(`Interval detection failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
