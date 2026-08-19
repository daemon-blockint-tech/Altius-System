/**
 * MediaPreviewWidget — displays an attachment preview based on content type.
 *
 * Config:
 *   attachment?: AttachmentRef     — the attachment to preview
 *   blobId?: string                — alternatively, just the blob ID
 *   showMetadata?: boolean         — show filename, size, type
 *   width?: number | string
 *   height?: number | string
 *
 * Renders:
 *   - Images: <img> with inline blob URL
 *   - Videos: <video controls>
 *   - Audio: <audio controls>
 *   - PDF: <iframe> with PDF viewer
 *   - Other: download link with file icon
 */

import { useState, useEffect } from 'react';
import type { WidgetProps } from '../types.js';
import { attachmentUrl, formatFileSize, isImageType, isVideoType, isAudioType, isPdfType } from '../attachment-client.js';

interface MediaPreviewConfig {
  attachment?: { blobId: string; filename: string; contentType: string; size: number };
  blobId?: string;
  showMetadata?: boolean;
  width?: number | string;
  height?: number | string;
}

export function MediaPreviewWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as MediaPreviewConfig;

  // Resolve attachment from config or bound variable
  const attachment = config.attachment ?? (instance.boundVariable ? ctx.variables[instance.boundVariable] as MediaPreviewConfig['attachment'] : null);
  const blobId = attachment?.blobId ?? config.blobId;

  const [meta, setMeta] = useState<MediaPreviewConfig['attachment'] | null>(attachment ?? null);

  useEffect(() => {
    if (attachment) {
      setMeta(attachment);
    } else if (config.blobId) {
      // Could fetch metadata from API, but for now use the blobId directly
      setMeta({ blobId: config.blobId, filename: 'Unknown', contentType: 'application/octet-stream', size: 0 });
    } else {
      setMeta(null);
    }
  }, [attachment, config.blobId]);

  if (!blobId) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No media to preview</div>;
  }

  const width = config.width ?? '100%';
  const height = config.height ?? 300;
  const url = attachmentUrl(blobId, true);
  const contentType = meta?.contentType ?? 'application/octet-stream';

  return (
    <div className="ed-widget ed-media-preview" data-widget-id={instance.id}>
      <div className="ed-media-preview__container" style={{ width, height: typeof height === 'number' ? `${height}px` : height }}>
        {isImageType(contentType) && (
          <img src={url} alt={meta?.filename ?? 'Image'} className="ed-media-preview__img" />
        )}
        {isVideoType(contentType) && (
          <video src={url} controls className="ed-media-preview__video" />
        )}
        {isAudioType(contentType) && (
          <audio src={url} controls className="ed-media-preview__audio" />
        )}
        {isPdfType(contentType) && (
          <iframe src={url} className="ed-media-preview__pdf" title={meta?.filename ?? 'PDF'} />
        )}
        {!isImageType(contentType) && !isVideoType(contentType) && !isAudioType(contentType) && !isPdfType(contentType) && (
          <div className="ed-media-preview__fallback">
            <span className="ed-media-preview__icon">📎</span>
            <a href={attachmentUrl(blobId, false)} download={meta?.filename} className="ed-media-preview__link">
              {meta?.filename ?? 'Download file'}
            </a>
          </div>
        )}
      </div>
      {config.showMetadata && meta && (
        <div className="ed-media-preview__meta">
          <span className="ed-media-preview__filename">{meta.filename}</span>
          <span className="ed-media-preview__size">{formatFileSize(meta.size)}</span>
          <span className="ed-media-preview__type">{meta.contentType}</span>
        </div>
      )}
    </div>
  );
}
