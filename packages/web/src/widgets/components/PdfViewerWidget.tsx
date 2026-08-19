/**
 * PdfViewerWidget — embeds a PDF attachment in an iframe.
 *
 * Config:
 *   blobId?: string          — blob ID of the PDF
 *   attachment?: AttachmentRef
 *   width?: number | string
 *   height?: number | string
 *   showToolbar?: boolean    — show download button
 */

import type { WidgetProps } from '../types.js';
import { attachmentUrl, formatFileSize } from '../attachment-client.js';

interface PdfViewerConfig {
  blobId?: string;
  attachment?: { blobId: string; filename: string; contentType: string; size: number };
  width?: number | string;
  height?: number | string;
  showToolbar?: boolean;
}

export function PdfViewerWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as PdfViewerConfig;
  const attachment = config.attachment ?? (instance.boundVariable ? ctx.variables[instance.boundVariable] as PdfViewerConfig['attachment'] : null);
  const blobId = attachment?.blobId ?? config.blobId;
  const width = config.width ?? '100%';
  const height = config.height ?? 500;

  if (!blobId) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No PDF to display</div>;
  }

  const url = attachmentUrl(blobId, true);
  const filename = attachment?.filename ?? 'document.pdf';

  return (
    <div className="ed-widget ed-pdf-viewer" data-widget-id={instance.id}>
      {config.showToolbar !== false && (
        <div className="ed-pdf-viewer__toolbar">
          <span className="ed-pdf-viewer__filename">{filename}</span>
          {attachment && (
            <span className="ed-pdf-viewer__size">{formatFileSize(attachment.size)}</span>
          )}
          <a href={attachmentUrl(blobId, false)} download={filename} className="ed-pdf-viewer__download">
            Download
          </a>
        </div>
      )}
      <iframe
        src={url}
        className="ed-pdf-viewer__iframe"
        style={{ width, height: typeof height === 'number' ? `${height}px` : height }}
        title={filename}
      />
    </div>
  );
}
