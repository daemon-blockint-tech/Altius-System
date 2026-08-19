/**
 * MediaUploaderWidget — file upload widget that stores an AttachmentRef.
 *
 * Config:
 *   accept?: string          — MIME types or extensions to accept (e.g. "image/*")
 *   multiple?: boolean       — allow multiple files
 *   maxSize?: number         — max file size in bytes
 *   label?: string           — label text
 *   dragDrop?: boolean       — enable drag-and-drop zone
 *
 * Writes AttachmentRef (single) or AttachmentRef[] (multiple) to bound variable.
 * Also calls onUpload callback if configured.
 */

import { useState, useCallback, useRef } from 'react';
import type { WidgetProps } from '../types.js';
import { uploadAttachment, formatFileSize } from '../attachment-client.js';

interface MediaUploaderConfig {
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  label?: string;
  dragDrop?: boolean;
  baseUrl?: string;
}

export function MediaUploaderWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as MediaUploaderConfig;
  const varName = instance.boundVariable ?? 'attachment';
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Array<{ filename: string; size: number; blobId: string }>>([]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    if (config.maxSize) {
      for (const f of fileArray) {
        if (f.size > config.maxSize) {
          setError(`File "${f.name}" exceeds max size (${formatFileSize(config.maxSize)})`);
          return;
        }
      }
    }

    setUploading(true);
    setError(null);
    try {
      const refs = [];
      for (const file of fileArray) {
        const ref = await uploadAttachment(file, config.baseUrl ?? '/api/v1');
        refs.push(ref);
        setUploaded((prev) => [...prev, { filename: ref.filename, size: ref.size, blobId: ref.blobId }]);
      }
      if (config.multiple) {
        const existing = (ctx.variables[varName] as unknown[]) ?? [];
        ctx.setVariable(varName, [...existing, ...refs]);
      } else {
        ctx.setVariable(varName, refs[0]!);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [config.accept, config.maxSize, config.multiple, config.baseUrl, ctx, varName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div className="ed-widget ed-media-uploader" data-widget-id={instance.id}>
      <span className="ed-media-uploader__label">{config.label ?? 'Upload File'}</span>
      {config.dragDrop ? (
        <div
          className="ed-media-uploader__dropzone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <span className="ed-media-uploader__uploading">Uploading...</span>
          ) : (
            <span className="ed-media-uploader__hint">Drop files here or click to browse</span>
          )}
        </div>
      ) : (
        <button
          className="ed-media-uploader__btn"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : 'Choose File'}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={config.accept}
        multiple={config.multiple}
        className="ed-media-uploader__input"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      {error && <div className="ed-media-uploader__error">{error}</div>}
      {uploaded.length > 0 && (
        <div className="ed-media-uploader__list">
          {uploaded.map((u, i) => (
            <div key={i} className="ed-media-uploader__item">
              <span className="ed-media-uploader__item-name">{u.filename}</span>
              <span className="ed-media-uploader__item-size">{formatFileSize(u.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
