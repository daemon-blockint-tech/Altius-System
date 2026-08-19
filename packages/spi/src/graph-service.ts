/**
 * Interactive graph visualization service — builds node-link graphs from
 * ontology objects and their links.
 */

import type { RequestContext } from './ontology.js';

// ── Graph primitives ────────────────────────────────────────────────────

/** A graph node. */
export interface GraphNode {
  id: string;
  label: string;
  /** Optional object type. */
  objectType?: string;
  /** Optional object ID. */
  objectId?: string;
  /** Optional group for coloring. */
  group?: string;
  /** Optional layout position. */
  x?: number;
  y?: number;
}

/** A graph edge. */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** Optional link/edge label. */
  label?: string;
}

/** A graph layout. */
export interface GraphLayout {
  algorithm: 'force' | 'circle' | 'grid' | 'hierarchical';
  width?: number;
  height?: number;
}

/** Result of building a graph. */
export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: GraphLayout;
}

/** A saved graph view. */
export interface SavedGraphView {
  id: string;
  tenantId: string;
  name: string;
  rootObjectType: string;
  rootObjectId: string;
  layout: GraphLayout;
  selectedNodeIds: string[];
  zoom: number;
  createdAt: string;
  updatedAt: string;
}

/** Input for building a graph. */
export interface BuildGraphInput {
  /** Layout algorithm. */
  layout?: GraphLayout['algorithm'];
  /** Max traversal depth. */
  maxDepth?: number;
  /** Link types to follow (all if empty). */
  linkTypes?: string[];
  /** Object types to include as nodes (all if empty). */
  objectTypes?: string[];
}

// ── Service ─────────────────────────────────────────────────────────────

/**
 * GraphService — builds interactive node-link graphs from ontology objects.
 */
export interface GraphService {
  /** Build a graph rooted at an object. */
  buildGraph(
    ctx: RequestContext,
    rootObjectType: string,
    rootObjectId: string,
    input?: BuildGraphInput,
  ): Promise<GraphResult>;

  /** Save a graph view. */
  saveView(ctx: RequestContext, input: Omit<SavedGraphView, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<SavedGraphView>;
  /** Get a saved graph view. */
  getView(ctx: RequestContext, id: string): Promise<SavedGraphView | null>;
  /** List saved graph views. */
  listViews(ctx: RequestContext, rootObjectType?: string): Promise<SavedGraphView[]>;
}
