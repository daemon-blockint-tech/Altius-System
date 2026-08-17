/**
 * Time-series store interface for first-class timestamped-value properties.
 *
 * A time-series property is declared with `@timeSeries` on an ODL field.
 * Unlike a regular property that holds a single value, a time-series
 * property holds a sequence of (timestamp, value) points ordered by time.
 *
 * The store is separate from the object store because:
 * 1. Time-series data has different access patterns (range scans, bucketing)
 * 2. Storage backends may use specialized formats (hypertables, columnar)
 * 3. The value count can be very large without bloating the object row
 *
 * The object property itself holds a summary or the latest point — the
 * full series is fetched on demand via this interface.
 */

/** A single timestamped value in a time series. */
export interface TimeSeriesPoint {
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** The measured value (number for numeric series, string for enum series). */
  value: number | string | boolean;
  /** Optional tags for filtering (e.g. {sensor: "temp1", unit: "celsius"}). */
  tags?: Record<string, string>;
}

/** Query parameters for reading a time series. */
export interface TimeSeriesQuery {
  /** Start of the time range (inclusive). ISO 8601. */
  start?: string;
  /** End of the time range (exclusive). ISO 8601. */
  end?: string;
  /** Maximum number of points to return. */
  limit?: number;
  /** Order: 'asc' (oldest first) or 'desc' (newest first). Default 'asc'. */
  order?: 'asc' | 'desc';
  /** Optional bucketing: aggregate points into fixed-width time buckets. */
  bucket?: TimeSeriesBucket;
  /** Optional tag filter — only points with matching tags are included. */
  tags?: Record<string, string>;
}

/** Bucketing configuration for downsampling. */
export interface TimeSeriesBucket {
  /** Bucket width: e.g. "1h", "1d", "5m", "1w". */
  interval: string;
  /** Aggregation function within each bucket. */
  function: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'first' | 'last';
}

/** A bucketed/aggregated point. */
export interface TimeSeriesBucketPoint {
  /** Bucket start timestamp. */
  timestamp: string;
  /** Aggregated value. */
  value: number;
  /** Number of raw points in this bucket. */
  count: number;
}

/** Result of a time-series query. */
export interface TimeSeriesResult {
  /** The object type this series belongs to. */
  objectType: string;
  /** The object ID. */
  objectId: string;
  /** The property name. */
  property: string;
  /** Raw points (when no bucketing is requested). */
  points?: TimeSeriesPoint[];
  /** Bucketed points (when bucketing is requested). */
  buckets?: TimeSeriesBucketPoint[];
  /** Total number of points in the queried range (before limit). */
  totalCount: number;
}

/**
 * Time-series store — holds timestamped values for `@timeSeries` properties.
 *
 * Implementations may use a dedicated table, hypertable, or external
 * time-series database. The store is keyed by (objectType, objectId,
 * property) — each object's property is an independent series.
 */
export interface TimeSeriesStore {
  /** Append a point to a time series. Creates the series if it doesn't exist. */
  putPoint(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    point: TimeSeriesPoint,
  ): Promise<void>;

  /** Append multiple points in a single operation. */
  putPoints(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    points: TimeSeriesPoint[],
  ): Promise<void>;

  /** Query a time series with optional range, limit, and bucketing. */
  getSeries(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    query: TimeSeriesQuery,
  ): Promise<TimeSeriesResult>;

  /** Delete points in a time range. */
  deleteRange(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
    start: string,
    end: string,
  ): Promise<number>;

  /** Get the latest point in a series (for object property materialization). */
  getLatestPoint(
    ctx: { tenantId: string; branch?: string },
    objectType: string,
    objectId: string,
    property: string,
  ): Promise<TimeSeriesPoint | null>;
}
