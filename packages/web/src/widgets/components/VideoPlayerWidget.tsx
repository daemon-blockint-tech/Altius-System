/**
 * VideoPlayerWidget — embeds a video attachment with controls.
 *
 * Config:
 *   blobId?: string
 *   attachment?: AttachmentRef
 *   width?: number | string
 *   height?: number | string
 *   autoplay?: boolean
 *   loop?: boolean
 *   muted?: boolean
 *   controls?: boolean       — default true
 *   poster?: string          — poster image URL
 */

import type { WidgetProps } from '../types.js';
import { attachmentUrl, formatFileSize } from '../attachment-client.js';

interface VideoPlayerConfig {
  blobId?: string;
  attachment?: { blobId: string; filename: string; contentType: string; size: number };
  width?: number | string;
  height?: number | string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  poster?: string;
}

export function VideoPlayerWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as VideoPlayerConfig;
  const attachment = config.attachment ?? (instance.boundVariable ? ctx.variables[instance.boundVariable] as VideoPlayerConfig['attachment'] : null);
  const blobId = attachment?.blobId ?? config.blobId;

  if (!blobId) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No video to display</div>;
  }

  const url = attachmentUrl(blobId, true);
  const width = config.width ?? '100%';
  const height = config.height ?? 'auto';

  return (
    <div className="ed-widget ed-video-player" data-widget-id={instance.id}>
      <video
        src={url}
        controls={config.controls !== false}
        autoPlay={config.autoplay}
        loop={config.loop}
        muted={config.muted}
        poster={config.poster}
        className="ed-video-player__video"
        style={{ width, height: typeof height === 'number' ? `${height}px` : height }}
      />
      {attachment && (
        <div className="ed-video-player__meta">
          <span className="ed-video-player__filename">{attachment.filename}</span>
          <span className="ed-video-player__size">{formatFileSize(attachment.size)}</span>
        </div>
      )}
    </div>
  );
}
