/**
 * Saved view store — per-user and shared widget view configurations.
 *
 * A SavedView captures the display state of a widget or page so a user can
 * return to it later: column configuration, filters, sort order, density,
 * and arbitrary widget-specific config. Views can be private (owner-only)
 * or shared (visible to all users in the tenant).
 */

import type { RequestContext } from './ontology.js';
import type { DateTime } from './scalars.js';
import type { FilterExpression } from './ontology.js';

/** A persisted widget view configuration scoped to a tenant and user. */
export interface SavedView {
  id: string;
  /** Tenant scope. */
  tenantId: string;
  /** View name (user-provided). */
  name: string;
  /** Optional description. */
  description?: string;
  /** The object type this view applies to (for object-table/list views). */
  objectType?: string;
  /** The widget type this view applies to (e.g. 'object_table', 'chart_xy'). */
  widgetType?: string;
  /** The app/page context this view belongs to. */
  appId?: string;
  /** Column configuration: ordered list of column definitions. */
  columns?: Array<{
    field: string;
    label?: string;
    visible: boolean;
    width?: number;
    frozen?: boolean;
    order?: number;
  }>;
  /** Saved filter expression. */
  filter?: FilterExpression;
  /** Saved sort order. */
  orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  /** Display density. */
  density?: 'compact' | 'comfortable' | 'spacious';
  /** Page size preference. */
  pageSize?: number;
  /** Arbitrary widget-specific configuration. */
  widgetConfig?: Record<string, unknown>;
  /** Whether the view is shared with other users in the tenant. */
  isPublic: boolean;
  /** Owner user ID. */
  createdBy: string;
  /** Creation timestamp. */
  createdAt: DateTime;
  /** Last update timestamp. */
  updatedAt: DateTime;
}

/** Input for creating a saved view. */
export interface CreateSavedViewInput {
  name: string;
  description?: string;
  objectType?: string;
  widgetType?: string;
  appId?: string;
  columns?: SavedView['columns'];
  filter?: FilterExpression;
  orderBy?: SavedView['orderBy'];
  density?: SavedView['density'];
  pageSize?: number;
  widgetConfig?: Record<string, unknown>;
  isPublic?: boolean;
}

/** Storage interface for saved views. */
export interface SavedViewStore {
  /** Create a new saved view. */
  create(ctx: RequestContext, input: CreateSavedViewInput): Promise<SavedView>;
  /** Get a saved view by ID. Returns null if not found or not visible to the caller. */
  get(ctx: RequestContext, id: string): Promise<SavedView | null>;
  /** List saved views visible to the caller (own + public), optionally filtered. */
  list(ctx: RequestContext, filter?: { objectType?: string; widgetType?: string; appId?: string }): Promise<SavedView[]>;
  /** Update a saved view. Only the owner can update. */
  update(ctx: RequestContext, id: string, updates: Partial<CreateSavedViewInput>): Promise<SavedView>;
  /** Delete a saved view. Only the owner can delete. */
  delete(ctx: RequestContext, id: string): Promise<void>;
}
