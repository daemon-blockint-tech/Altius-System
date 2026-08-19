/**
 * Fase 21 widget tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

function makeWidget(type: string, config: Record<string, unknown> = {}, boundVariable?: string): WorkshopWidgetInstance {
  return { id: `w-${type}`, widgetType: type, config, boundVariable, visible: true };
}

describe('Fase 21 widget registry', () => {
  it('registers all 11 Fase 21 widgets', () => {
    const widgets = [
      'data_freshness', 'ontology_change_history', 'value_formatting', 'design_system_theme',
      'function_backed', 'live_data_push', 'qr_code_reader', 'camera_capture',
      'visual_ontology_manager', 'ontology_metadata_catalog', 'kiosk_mode',
    ];
    for (const w of widgets) {
      expect(isWidgetImplemented(w)).toBe(true);
    }
    expect(listRegisteredWidgets().length).toBeGreaterThanOrEqual(80);
  });
});

describe('Fase 21 widget rendering', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as never;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('DataFreshnessWidget renders title', () => {
    render(<WidgetRenderer instance={makeWidget('data_freshness', { objectType: 'Patient' })} ctx={makeCtx()} />);
    expect(screen.getByText('Data Freshness')).toBeTruthy();
  });

  it('ValueFormattingWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('value_formatting', { value: 123, format: 'number' })} ctx={makeCtx()} />);
    expect(screen.getByText('Value Formatting')).toBeTruthy();
  });

  it('OntologyMetadataCatalogWidget renders search', () => {
    render(<WidgetRenderer instance={makeWidget('ontology_metadata_catalog', {})} ctx={makeCtx()} />);
    expect(screen.getByText('Ontology Catalog')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search types…')).toBeTruthy();
  });

  it('KioskModeWidget renders launch button', () => {
    render(<WidgetRenderer instance={makeWidget('kiosk_mode', { objectTypes: ['Patient'] })} ctx={makeCtx()} />);
    expect(screen.getByText('Kiosk Mode')).toBeTruthy();
    expect(screen.getByText('Launch read-only session')).toBeTruthy();
  });
});
