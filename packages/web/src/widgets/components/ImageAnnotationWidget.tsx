/**
 * ImageAnnotationWidget — displays an image with annotation markers.
 *
 * Config:
 *   blobId?: string          — blob ID of the image
 *   attachment?: AttachmentRef
 *   annotations?: Array<{
 *     id: string
 *     x: number              — 0-1 relative position
 *     y: number              — 0-1 relative position
 *     label: string
 *     color?: string
 *   }>
 *   width?: number | string
 *   height?: number | string
 *   editable?: boolean       — allow adding markers by clicking
 *
 * Writes annotations to bound variable.
 */

import { useState, useRef, useCallback } from 'react';
import type { WidgetProps } from '../types.js';
import { attachmentUrl } from '../attachment-client.js';

interface Annotation {
  id: string;
  x: number;
  y: number;
  label: string;
  color?: string;
}
interface ImageAnnotationConfig {
  blobId?: string;
  attachment?: { blobId: string; filename: string; contentType: string; size: number };
  annotations?: Annotation[];
  width?: number | string;
  height?: number | string;
  editable?: boolean;
}

export function ImageAnnotationWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as ImageAnnotationConfig;
  const attachment = config.attachment ?? (instance.boundVariable ? ctx.variables[instance.boundVariable] as ImageAnnotationConfig['attachment'] : null);
  const blobId = attachment?.blobId ?? config.blobId;
  const varName = instance.boundVariable ?? 'annotations';
  const [annotations, setAnnotations] = useState<Annotation[]>(config.annotations ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const annCounter = useRef(0);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!config.editable || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const id = `ann-${++annCounter.current}`;
    const newAnn: Annotation = { id, x, y, label: `Annotation ${annCounter.current}`, color: '#dc2626' };
    const updated = [...annotations, newAnn];
    setAnnotations(updated);
    ctx.setVariable(varName, updated);
  }, [config.editable, annotations, ctx, varName]);

  if (!blobId) {
    return <div className="ed-widget ed-widget--empty" data-widget-id={instance.id}>No image to annotate</div>;
  }

  const url = attachmentUrl(blobId, true);
  const width = config.width ?? '100%';
  const height = config.height ?? 400;

  return (
    <div className="ed-widget ed-image-annotation" data-widget-id={instance.id}>
      <div
        ref={containerRef}
        className="ed-image-annotation__container"
        style={{ width, height: typeof height === 'number' ? `${height}px` : height, position: 'relative' }}
        onClick={handleClick}
      >
        <img src={url} alt={attachment?.filename ?? 'Image'} className="ed-image-annotation__img" />
        {annotations.map((ann) => (
          <div
            key={ann.id}
            className="ed-image-annotation__marker"
            style={{
              left: `${ann.x * 100}%`,
              top: `${ann.y * 100}%`,
              background: ann.color ?? '#dc2626',
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(selected === ann.id ? null : ann.id);
            }}
          >
            <span className="ed-image-annotation__marker-label">{ann.label}</span>
          </div>
        ))}
      </div>
      {config.editable && (
        <div className="ed-image-annotation__hint">Click on the image to add annotations</div>
      )}
      {annotations.length > 0 && (
        <div className="ed-image-annotation__list">
          {annotations.map((ann) => (
            <div
              key={ann.id}
              className={`ed-image-annotation__list-item${selected === ann.id ? ' ed-image-annotation__list-item--active' : ''}`}
              onClick={() => setSelected(selected === ann.id ? null : ann.id)}
            >
              <span className="ed-image-annotation__list-dot" style={{ background: ann.color ?? '#dc2626' }} />
              <span className="ed-image-annotation__list-label">{ann.label}</span>
              <span className="ed-image-annotation__list-pos">({(ann.x * 100).toFixed(0)}%, {(ann.y * 100).toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
