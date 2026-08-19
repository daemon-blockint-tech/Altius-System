/**
 * AudioPlayerWidget — embeds an audio attachment with controls.
 *
 * Config:
 *   blobId?: string
 *   attachment?: AttachmentRef
 *   autoplay?: boolean
 *   loop?: boolean
 *   controls?: boolean       — default true
 *   showWaveform?: boolean   — placeholder for waveform visualization
 */

import type { WidgetProps } from '../types.js';
import { attachmentUrl, formatFileSize } from '../attachment-client.js';

interface AudioPlayerConfig {
  blobId?: string;
  attachment?: { blobId: string; filename: string; contentType: string; size: number };
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
  showWaveform?: boolean;
}

export function AudioPlayerWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as AudioPlayerConfig;
  const attachment = config.attachment ?? (instance.boundVariable ? ctx.variables[instance.boundVariable] as AudioPlayerConfig['attachment'] : null);
  const blobId = attachment?.blobId ?? config.blobId;

  if (!blobId) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No audio to play</div>;
  }

  const url = attachmentUrl(blobId, true);

  return (
    <div className="ed-widget ed-audio-player" data-widget-id={instance.id}>
      <div className="ed-audio-player__header">
        <span className="ed-audio-player__icon">🎵</span>
        <span className="ed-audio-player__filename">{attachment?.filename ?? 'Audio file'}</span>
        {attachment && (
          <span className="ed-audio-player__size">{formatFileSize(attachment.size)}</span>
        )}
      </div>
      {config.showWaveform && (
        <div className="ed-audio-player__waveform">
          {/* Simple placeholder waveform — a real waveform would require
              Web Audio API decoding + canvas rendering */}
          {Array.from({ length: 40 }).map((_, i) => (
            <span
              key={i}
              className="ed-audio-player__bar"
              style={{ height: `${20 + Math.sin(i * 0.5) * 30 + Math.random() * 20}%` }}
            />
          ))}
        </div>
      )}
      <audio
        src={url}
        controls={config.controls !== false}
        autoPlay={config.autoplay}
        loop={config.loop}
        className="ed-audio-player__audio"
      />
    </div>
  );
}
