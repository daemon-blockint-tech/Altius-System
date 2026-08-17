/**
 * Blob store interface for media and attachment properties.
 *
 * A blob store holds the raw bytes of uploaded files. The ontology
 * references them via an `AttachmentRef` stored as a JSONB property
 * on the object — the blob store itself is content-addressed and
 * knows nothing about object types or links.
 */

/**
 * A reference to a stored blob, embedded in an object property.
 *
 * The `blobId` is the key the blob store uses to retrieve the bytes.
 * The metadata (filename, content type, size) is denormalised here so
 * clients can render a preview without a second round-trip to the
 * blob store.
 */
export interface AttachmentRef {
  /** Blob store key (content-addressed or UUID). */
  blobId: string;
  /** Original filename from upload. */
  filename: string;
  /** MIME content type. */
  contentType: string;
  /** Size in bytes. */
  size: number;
  /** Optional SHA-256 hash for deduplication. */
  sha256?: string;
  /** Optional thumbnail blob ID for image previews. */
  thumbnailBlobId?: string;
  /** Upload timestamp (ISO 8601). */
  uploadedAt: string;
  /** Uploading actor ID. */
  uploadedBy?: string;
}

/** Metadata returned by a put operation. */
export interface BlobPutResult {
  blobId: string;
  size: number;
  sha256: string;
}

/** A retrieved blob with its content. */
export interface BlobContent {
  blobId: string;
  contentType: string;
  size: number;
  data: Buffer;
}

/**
 * Content-addressed blob store.
 *
 * Implementations may use local disk, S3, or any object store.
 * The interface is deliberately minimal: put, get, delete, and
 * existence check. Authorization is enforced at the API layer,
 * not here.
 */
export interface BlobStore {
  /** Store bytes, returning a content-addressed ID. */
  put(ctx: {
    tenantId: string;
    filename: string;
    contentType: string;
    data: Buffer;
    uploadedBy?: string;
  }): Promise<BlobPutResult>;

  /** Retrieve blob content by ID. Returns null if not found. */
  get(tenantId: string, blobId: string): Promise<BlobContent | null>;

  /** Delete a blob. No-op if not found. */
  delete(tenantId: string, blobId: string): Promise<void>;

  /** Check whether a blob exists. */
  exists(tenantId: string, blobId: string): Promise<boolean>;
}
