/**
 * Tests for Phase 14 media widgets.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetRenderer } from '../WidgetRenderer.js';
import { isWidgetImplemented, listRegisteredWidgets } from '../WidgetRegistry.js';
import type { WidgetContext, WorkshopWidgetInstance } from '../types.js';

function makeCtx(overrides?: Partial<WidgetContext>): WidgetContext {
  return {
    client: {},
    variables: {},
    setVariable: () => {},
    navigate: () => {},
    currentPageId: 'page-1',
    tenantId: 'test-tenant',
    userId: 'test-user',
    ...overrides,
  };
}

function makeWidget(type: string, config: Record<string, unknown>, boundVariable?: string): WorkshopWidgetInstance {
  return { id: `w-${type}`, widgetType: type, config, boundVariable, visible: true };
}

// ── Registry ──────────────────────────────────────────────────

describe('Phase 14 widget registry', () => {
  it('registers 64 widget types total', () => {
    expect(listRegisteredWidgets().length).toBe(64);
  });

  it('marks media widgets as implemented', () => {
    expect(isWidgetImplemented('media_preview')).toBe(true);
    expect(isWidgetImplemented('media_uploader')).toBe(true);
    expect(isWidgetImplemented('pdf_viewer')).toBe(true);
    expect(isWidgetImplemented('image_annotation')).toBe(true);
    expect(isWidgetImplemented('spreadsheet_display')).toBe(true);
    expect(isWidgetImplemented('video_player')).toBe(true);
    expect(isWidgetImplemented('audio_player')).toBe(true);
  });
});

// ── MediaPreviewWidget ────────────────────────────────────────

describe('MediaPreviewWidget', () => {
  it('renders image preview', () => {
    const widget = makeWidget('media_preview', {
      attachment: { blobId: 'b1', filename: 'photo.jpg', contentType: 'image/jpeg', size: 1024 },
      showMetadata: true,
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toContain('/attachments/b1');
    expect(screen.getByText('photo.jpg')).toBeTruthy();
    expect(screen.getByText('image/jpeg')).toBeTruthy();
  });

  it('renders video preview', () => {
    const widget = makeWidget('media_preview', {
      attachment: { blobId: 'b2', filename: 'clip.mp4', contentType: 'video/mp4', size: 10240 },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video!.getAttribute('src')).toContain('/attachments/b2');
  });

  it('renders audio preview', () => {
    const widget = makeWidget('media_preview', {
      attachment: { blobId: 'b3', filename: 'song.mp3', contentType: 'audio/mpeg', size: 5120 },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
  });

  it('renders PDF preview as iframe', () => {
    const widget = makeWidget('media_preview', {
      attachment: { blobId: 'b4', filename: 'doc.pdf', contentType: 'application/pdf', size: 2048 },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute('src')).toContain('/attachments/b4');
  });

  it('renders fallback download link for unknown types', () => {
    const widget = makeWidget('media_preview', {
      attachment: { blobId: 'b5', filename: 'data.bin', contentType: 'application/octet-stream', size: 100 },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toContain('/attachments/b5');
  });

  it('renders empty state when no attachment', () => {
    const widget = makeWidget('media_preview', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No media to preview')).toBeTruthy();
  });

  it('renders from bound variable', () => {
    const widget = makeWidget('media_preview', {}, 'myAttachment');
    const ctx = makeCtx({
      variables: {
        myAttachment: { blobId: 'b6', filename: 'test.png', contentType: 'image/png', size: 500 },
      },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={ctx} />);
    expect(container.querySelector('img')).toBeTruthy();
  });
});

// ── MediaUploaderWidget ───────────────────────────────────────

describe('MediaUploaderWidget', () => {
  it('renders upload button', () => {
    const widget = makeWidget('media_uploader', { label: 'Upload Photo' });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Upload Photo')).toBeTruthy();
    expect(screen.getByText('Choose File')).toBeTruthy();
  });

  it('renders drag-and-drop zone when enabled', () => {
    const widget = makeWidget('media_uploader', { dragDrop: true, label: 'Drop here' });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const dropzone = container.querySelector('.ed-media-uploader__dropzone');
    expect(dropzone).toBeTruthy();
    expect(screen.getByText('Drop files here or click to browse')).toBeTruthy();
  });

  it('renders hidden file input with accept attribute', () => {
    const widget = makeWidget('media_uploader', { accept: 'image/*' });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toBe('image/*');
  });
});

// ── PdfViewerWidget ───────────────────────────────────────────

describe('PdfViewerWidget', () => {
  it('renders PDF iframe with toolbar', () => {
    const widget = makeWidget('pdf_viewer', {
      attachment: { blobId: 'pdf1', filename: 'report.pdf', contentType: 'application/pdf', size: 5000 },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(screen.getByText('Download')).toBeTruthy();
  });

  it('renders empty state when no blob', () => {
    const widget = makeWidget('pdf_viewer', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No PDF to display')).toBeTruthy();
  });
});

// ── ImageAnnotationWidget ─────────────────────────────────────

describe('ImageAnnotationWidget', () => {
  it('renders image with annotations', () => {
    const widget = makeWidget('image_annotation', {
      blobId: 'img1',
      annotations: [
        { id: 'a1', x: 0.2, y: 0.3, label: 'Wound', color: '#dc2626' },
        { id: 'a2', x: 0.7, y: 0.5, label: 'Bruise', color: '#ca8a04' },
      ],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(container.querySelector('img')).toBeTruthy();
    const markers = container.querySelectorAll('.ed-image-annotation__marker');
    expect(markers.length).toBe(2);
    // Labels appear in both marker and list — use getAllByText
    expect(screen.getAllByText('Wound').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bruise').length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty state when no blob', () => {
    const widget = makeWidget('image_annotation', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No image to annotate')).toBeTruthy();
  });

  it('shows hint when editable', () => {
    const widget = makeWidget('image_annotation', { blobId: 'img2', editable: true });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('Click on the image to add annotations')).toBeTruthy();
  });
});

// ── SpreadsheetDisplayWidget ──────────────────────────────────

describe('SpreadsheetDisplayWidget', () => {
  it('renders tabular data', () => {
    const widget = makeWidget('spreadsheet_display', {
      data: [
        { name: 'Alice', age: 30, role: 'admin' },
        { name: 'Bob', age: 25, role: 'user' },
      ],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
  });

  it('shows row and column count', () => {
    const widget = makeWidget('spreadsheet_display', {
      data: [{ a: 1, b: 2 }],
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const info = container.querySelector('.ed-spreadsheet__info');
    expect(info).toBeTruthy();
    expect(info!.textContent).toContain('1 rows');
    expect(info!.textContent).toContain('2 columns');
  });

  it('renders empty state when no data', () => {
    const widget = makeWidget('spreadsheet_display', { data: [] });
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('supports sorting', () => {
    const widget = makeWidget('spreadsheet_display', {
      data: [
        { name: 'Zara', age: 30 },
        { name: 'Alice', age: 25 },
      ],
      sortable: true,
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const th = screen.getByText('name');
    fireEvent.click(th);
    // After sorting ascending, Alice should be first
    const firstRow = container.querySelector('tbody tr');
    expect(firstRow?.textContent).toContain('Alice');
  });
});

// ── VideoPlayerWidget ─────────────────────────────────────────

describe('VideoPlayerWidget', () => {
  it('renders video element', () => {
    const widget = makeWidget('video_player', {
      attachment: { blobId: 'vid1', filename: 'demo.mp4', contentType: 'video/mp4', size: 50000 },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video!.getAttribute('src')).toContain('/attachments/vid1');
    expect(video!.controls).toBe(true);
  });

  it('renders empty state when no blob', () => {
    const widget = makeWidget('video_player', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No video to display')).toBeTruthy();
  });
});

// ── AudioPlayerWidget ─────────────────────────────────────────

describe('AudioPlayerWidget', () => {
  it('renders audio element with filename', () => {
    const widget = makeWidget('audio_player', {
      attachment: { blobId: 'aud1', filename: 'voice.mp3', contentType: 'audio/mpeg', size: 8000 },
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
    expect(audio!.getAttribute('src')).toContain('/attachments/aud1');
    expect(screen.getByText('voice.mp3')).toBeTruthy();
  });

  it('renders waveform when enabled', () => {
    const widget = makeWidget('audio_player', {
      blobId: 'aud2',
      showWaveform: true,
    });
    const { container } = render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    const waveform = container.querySelector('.ed-audio-player__waveform');
    expect(waveform).toBeTruthy();
    const bars = waveform!.querySelectorAll('.ed-audio-player__bar');
    expect(bars.length).toBe(40);
  });

  it('renders empty state when no blob', () => {
    const widget = makeWidget('audio_player', {});
    render(<WidgetRenderer instance={widget} ctx={makeCtx()} />);
    expect(screen.getByText('No audio to play')).toBeTruthy();
  });
});
