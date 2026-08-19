/**
 * Ontology Schema widget tests.
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

describe('Ontology Schema widget registry', () => {
  it('registers all 4 Ontology Schema widgets', () => {
    const widgets = [
      'action_form_config',
      'ontology_change_manager',
      'branch_manager',
      'transform_expression',
    ];
    for (const w of widgets) {
      expect(isWidgetImplemented(w)).toBe(true);
    }
    expect(listRegisteredWidgets().length).toBeGreaterThanOrEqual(89);
  });
});

describe('Ontology Schema widget rendering', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as never;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('ActionFormConfigWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('action_form_config', { actionName: 'Admit' })} ctx={makeCtx()} />);
    expect(screen.getByText('Action Form Config')).toBeTruthy();
    expect(screen.getByText('Load form')).toBeTruthy();
  });

  it('OntologyChangeManagerWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('ontology_change_manager')} ctx={makeCtx()} />);
    expect(screen.getByText('Ontology Change Manager')).toBeTruthy();
    expect(screen.getByText('Validate')).toBeTruthy();
    expect(screen.getByText('Apply')).toBeTruthy();
  });

  it('BranchManagerWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('branch_manager')} ctx={makeCtx()} />);
    expect(screen.getByText('Branch Manager')).toBeTruthy();
    expect(screen.getByText('Load branches')).toBeTruthy();
  });

  it('TransformExpressionWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('transform_expression')} ctx={makeCtx()} />);
    expect(screen.getByText('Transform Expression')).toBeTruthy();
    expect(screen.getByText('Evaluate')).toBeTruthy();
  });
});
