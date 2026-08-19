/**
 * Fase 22 widget tests.
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

describe('Fase 22 widget registry', () => {
  it('registers all 7 Fase 22 widgets', () => {
    const widgets = [
      'mobile_app_launcher', 'viewport_switcher', 'qr_deep_link_launch',
      'geolocation_prompt', 'graph_visualization', 'filter_state', 'command_launcher',
    ];
    for (const w of widgets) {
      expect(isWidgetImplemented(w)).toBe(true);
    }
    expect(listRegisteredWidgets().length).toBeGreaterThanOrEqual(85);
  });
});

describe('Fase 22 widget rendering', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as never;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('MobileAppLauncherWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('mobile_app_launcher', { appId: 'app-1' })} ctx={makeCtx()} />);
    expect(screen.getByText('Mobile App Launcher')).toBeTruthy();
    expect(screen.getByText('Launch mobile session')).toBeTruthy();
  });

  it('ViewportSwitcherWidget renders options', () => {
    render(<WidgetRenderer instance={makeWidget('viewport_switcher')} ctx={makeCtx()} />);
    expect(screen.getByText('Viewport')).toBeTruthy();
    expect(screen.getByText('desktop')).toBeTruthy();
    expect(screen.getByText('mobile')).toBeTruthy();
  });

  it('QRDeepLinkLaunchWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('qr_deep_link_launch', { appId: 'app-1' })} ctx={makeCtx()} />);
    expect(screen.getByText('QR / Deep Link')).toBeTruthy();
    expect(screen.getByText('Generate launch link')).toBeTruthy();
  });

  it('GeolocationPromptWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('geolocation_prompt')} ctx={makeCtx()} />);
    expect(screen.getByText('Geolocation')).toBeTruthy();
    expect(screen.getByText('Allow location')).toBeTruthy();
  });

  it('GraphVisualizationWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('graph_visualization', { rootObjectType: 'Patient', rootObjectId: '1' })} ctx={makeCtx()} />);
    expect(screen.getByText('Interactive Graph')).toBeTruthy();
  });

  it('ObjectSetFilterStateWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('filter_state', { objectSetId: '1' })} ctx={makeCtx()} />);
    expect(screen.getByText('Filter State')).toBeTruthy();
  });

  it('CommandLauncherWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('command_launcher')} ctx={makeCtx()} />);
    expect(screen.getByText('Command Launcher')).toBeTruthy();
  });
});
