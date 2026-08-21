import { authedFetch } from './auth-fetch.js';
/**
 * Attachment client — helpers for uploading and downloading attachments.
 *
 * These functions wrap the REST API at /api/v1/attachments.
 * They are framework-agnostic (use fetch) and can be used from any
 * widget that needs to upload or display media.
 */

/**
 * Minimal AttachmentRef type (mirrors @altius/spi BlobStore.AttachmentRef).
 * Defined inline to avoid a cross-package type dependency from the web package.
 */
export interface AttachmentRef {
  blobId: string;
  filename: string;
  contentType: string;
  size: number;
  sha256?: string;
  thumbnailBlobId?: string;
  uploadedAt: string;
  uploadedBy?: string;
}

/**
 * Upload a file to the blob store.
 * @param file The file to upload (from an <input type="file"> or drag-and-drop)
 * @param baseUrl The API base URL (default: '/api/v1')
 * @returns The AttachmentRef to store as an object property value
 */
export async function uploadAttachment(
  file: File | Blob,
  baseUrl = '/api/v1',
): Promise<AttachmentRef> {
  const headers: Record<string, string> = {
    'Content-Type': file.type || 'application/octet-stream',
  };
  if (file instanceof File) {
    headers['x-filename'] = file.name;
  }
  const res = await authedFetch(`${baseUrl}/attachments`, {
    method: 'POST',
    body: file,
    headers,
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<AttachmentRef>;
}

/**
 * Get the download URL for a blob.
 * @param blobId The blob ID from an AttachmentRef
 * @param inline If true, set Content-Disposition: inline (for embedding in <img>, <video>, etc.)
 * @param baseUrl The API base URL (default: '/api/v1')
 */
export function attachmentUrl(blobId: string, inline = false, baseUrl = '/api/v1'): string {
  const q = inline ? '?inline=1' : '';
  return `${baseUrl}/attachments/${encodeURIComponent(blobId)}${q}`;
}

/**
 * Get the metadata URL for a blob.
 * @param blobId The blob ID from an AttachmentRef
 * @param baseUrl The API base URL (default: '/api/v1')
 */
export function attachmentMetadataUrl(blobId: string, baseUrl = '/api/v1'): string {
  return `${baseUrl}/attachments/${encodeURIComponent(blobId)}/metadata`;
}

/**
 * Fetch attachment metadata without downloading the blob content.
 * @param blobId The blob ID from an AttachmentRef
 * @param baseUrl The API base URL (default: '/api/v1')
 */
export async function getAttachmentMetadata(
  blobId: string,
  baseUrl = '/api/v1',
): Promise<AttachmentRef | null> {
  const res = await authedFetch(attachmentMetadataUrl(blobId, baseUrl));
  if (!res.ok) return null;
  return res.json() as Promise<AttachmentRef>;
}

/**
 * Delete an attachment from the blob store.
 * @param blobId The blob ID to delete
 * @param baseUrl The API base URL (default: '/api/v1')
 */
export async function deleteAttachment(
  blobId: string,
  baseUrl = '/api/v1',
): Promise<void> {
  const res = await authedFetch(`${baseUrl}/attachments/${encodeURIComponent(blobId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Delete failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Format file size into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Check if a content type is an image.
 */
export function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/');
}

/**
 * Check if a content type is a video.
 */
export function isVideoType(contentType: string): boolean {
  return contentType.startsWith('video/');
}

/**
 * Check if a content type is audio.
 */
export function isAudioType(contentType: string): boolean {
  return contentType.startsWith('audio/');
}

/**
 * Check if a content type is a PDF.
 */
export function isPdfType(contentType: string): boolean {
  return contentType === 'application/pdf';
}

/**
 * Check if a content type is a spreadsheet.
 */
export function isSpreadsheetType(contentType: string): boolean {
  return (
    contentType === 'application/vnd.ms-excel' ||
    contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    contentType === 'text/csv' ||
 contentType === 'application/vnd.oasis.opendocument.spreadsheet'
  );
}
