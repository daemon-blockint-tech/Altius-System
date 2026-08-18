/**
 * Layout, navigation, and device-capture widgets backend substrate.
 *
 * Provides:
 *   1. UI state/preferences service (per-user state saving, layout config)
 *   2. Device capture ingest (QR codes, camera frames, geolocation writes)
 *   3. Navigation/deep-link resolution
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// UI state / preferences
// ===========================================================================

/** A per-user UI state entry — saved layout, tab config, navigation state. */
export interface UiStateEntry {
  id: string;
  tenantId: string;
  /** User ID. */
  userId: string;
  /** State key (e.g. 'layout:patient-table', 'nav:active-tab'). */
  key: string;
  /** State value (JSON). */
  value: unknown;
  /** State scope. */
  scope: 'user' | 'app' | 'global';
  /** App context (if scoped to an app). */
  appContext?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** Input for setting UI state. */
export interface SetUiStateInput {
  key: string;
  value: unknown;
  scope?: UiStateEntry['scope'];
  appContext?: string;
}

// ===========================================================================
// Device capture
// ===========================================================================

/** A device capture record — QR scan, camera frame, or geolocation. */
export interface DeviceCapture {
  id: string;
  tenantId: string;
  /** Capture kind. */
  kind: 'qr_code' | 'camera_frame' | 'geolocation' | 'barcode';
  /** Captured data. */
  data: {
    /** QR/barcode value. */
    decodedValue?: string;
    /** Image base64 (for camera frames). */
    imageBase64?: string;
    /** Geolocation coordinates. */
    coordinates?: { lat: number; lng: number; accuracy?: number };
  };
  /** User ID who captured. */
  userId: string;
  /** Associated object type (if capture targets an object). */
  objectType?: string;
  /** Associated object ID (if capture targets an object). */
  objectId?: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

/** Input for recording a device capture. */
export interface RecordCaptureInput {
  kind: DeviceCapture['kind'];
  data: DeviceCapture['data'];
  objectType?: string;
  objectId?: string;
}

// ===========================================================================
// Navigation / deep links
// ===========================================================================

/** A resolved deep link. */
export interface ResolvedDeepLink {
  /** The original URL/path. */
  url: string;
  /** The target app ID. */
  appId?: string;
  /** The target screen/view. */
  screen?: string;
  /** Parameters extracted from the URL. */
  params: Record<string, string>;
  /** Whether the link is valid. */
  valid: boolean;
  /** Error message (if invalid). */
  error?: string;
}

// ===========================================================================
// Service
// ===========================================================================

/**
 * Layout and device-capture service — UI state management, device capture
 * ingest, and deep-link resolution.
 */
export interface LayoutDeviceCaptureService {
  // ── UI state ──
  setState(ctx: RequestContext, input: SetUiStateInput): Promise<UiStateEntry>;
  getState(ctx: RequestContext, key: string): Promise<UiStateEntry | null>;
  listState(ctx: RequestContext, userId?: string, appContext?: string): Promise<UiStateEntry[]>;
  deleteState(ctx: RequestContext, key: string): Promise<void>;

  // ── Device capture ──
  recordCapture(ctx: RequestContext, input: RecordCaptureInput): Promise<DeviceCapture>;
  getCapture(ctx: RequestContext, id: string): Promise<DeviceCapture | null>;
  listCaptures(ctx: RequestContext, kind?: DeviceCapture['kind']): Promise<DeviceCapture[]>;
  deleteCapture(ctx: RequestContext, id: string): Promise<void>;

  // ── Deep links ──
  resolveDeepLink(ctx: RequestContext, url: string): Promise<ResolvedDeepLink>;
  /** Register a deep-link pattern for an app. */
  registerDeepLinkPattern(ctx: RequestContext, appId: string, pattern: string, screen: string): Promise<void>;
}
