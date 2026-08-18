/**
 * Platform-resource widgets — resource catalog, file-to-object linking,
 * upload-and-link.
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Resource catalog
// ===========================================================================

/** A platform resource — a file, project, or browsable item. */
export interface PlatformResource {
  id: string;
  tenantId: string;
  /** Resource name. */
  name: string;
  /** Resource kind. */
  kind: 'file' | 'project' | 'folder' | 'dataset' | 'notebook' | 'report' | 'model';
  /** Parent resource ID (for hierarchy). */
  parentId?: string;
  /** Path within the resource hierarchy. */
  path: string;
  description: string;
  /** MIME type (for files). */
  mimeType?: string;
  /** Size in bytes (for files). */
  sizeBytes?: number;
  /** Storage URL or blob reference. */
  storageRef?: string;
  /** Whether the resource is a folder. */
  isFolder: boolean;
  /** Tags. */
  tags: string[];
  /** Owner user ID. */
  ownerId: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** Input for creating a resource. */
export interface CreateResourceInput {
  name: string;
  kind: PlatformResource['kind'];
  parentId?: string;
  description?: string;
  mimeType?: string;
  sizeBytes?: number;
  storageRef?: string;
  isFolder?: boolean;
  tags?: string[];
}

// ===========================================================================
// Resource-to-object links
// ===========================================================================

/** A link between a resource and an ontology object. */
export interface ResourceObjectLink {
  id: string;
  tenantId: string;
  /** Resource ID. */
  resourceId: string;
  /** Object type. */
  objectType: string;
  /** Object ID. */
  objectId: string;
  /** Link kind. */
  linkKind: 'attachment' | 'reference' | 'source' | 'output' | 'annotation';
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the link. */
  createdBy: string;
}

/** Input for linking a resource to an object. */
export interface LinkResourceInput {
  resourceId: string;
  objectType: string;
  objectId: string;
  linkKind?: ResourceObjectLink['linkKind'];
}

// ===========================================================================
// Upload-and-link
// ===========================================================================

/** Result of an upload-and-link operation. */
export interface UploadAndLinkResult {
  resource: PlatformResource;
  link: ResourceObjectLink;
}

/** Input for upload-and-link. */
export interface UploadAndLinkInput {
  name: string;
  objectType: string;
  objectId: string;
  mimeType: string;
  sizeBytes: number;
  storageRef: string;
  linkKind?: ResourceObjectLink['linkKind'];
  tags?: string[];
}

// ===========================================================================
// Service
// ===========================================================================

/**
 * Platform resource service — resource catalog, file-to-object linking,
 * and upload-and-link operations.
 */
export interface PlatformResourceService {
  // ── Resource catalog ──
  createResource(ctx: RequestContext, input: CreateResourceInput): Promise<PlatformResource>;
  getResource(ctx: RequestContext, id: string): Promise<PlatformResource | null>;
  listResources(ctx: RequestContext, parentId?: string, kind?: PlatformResource['kind']): Promise<PlatformResource[]>;
  updateResource(ctx: RequestContext, id: string, updates: Partial<CreateResourceInput>): Promise<PlatformResource>;
  deleteResource(ctx: RequestContext, id: string): Promise<void>;
  /** Browse the resource hierarchy. */
  browse(ctx: RequestContext, path?: string): Promise<PlatformResource[]>;
  /** Search resources by name or tag. */
  search(ctx: RequestContext, query: string): Promise<PlatformResource[]>;

  // ── Resource-to-object links ──
  linkToObject(ctx: RequestContext, input: LinkResourceInput): Promise<ResourceObjectLink>;
  unlinkFromObject(ctx: RequestContext, linkId: string): Promise<void>;
  getLinksForResource(ctx: RequestContext, resourceId: string): Promise<ResourceObjectLink[]>;
  getLinksForObject(ctx: RequestContext, objectType: string, objectId: string): Promise<ResourceObjectLink[]>;

  // ── Upload-and-link ──
  /** Upload a file and link it to an object in one operation. */
  uploadAndLink(ctx: RequestContext, input: UploadAndLinkInput): Promise<UploadAndLinkResult>;
}
