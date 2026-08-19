/**
 * AIP LLM widget tests.
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

describe('AIP LLM widget registry', () => {
  it('registers all 10 AIP LLM widgets', () => {
    const widgets = [
      'llm_gateway', 'agent_builder', 'aip_chat', 'model_catalog',
      'prompt_playground', 'eval_framework', 'ai_proposal_review',
      'vector_search', 'llm_usage', 'embedded_copilot',
    ];
    for (const w of widgets) {
      expect(isWidgetImplemented(w)).toBe(true);
    }
    expect(listRegisteredWidgets().length).toBeGreaterThanOrEqual(105);
  });
});

describe('AIP LLM widget rendering', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as never;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('LlmGatewayWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('llm_gateway')} ctx={makeCtx()} />);
    expect(screen.getByText('LLM Gateway')).toBeTruthy();
    expect(screen.getByText('List models')).toBeTruthy();
  });

  it('AgentBuilderWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('agent_builder')} ctx={makeCtx()} />);
    expect(screen.getByText('Agent Builder')).toBeTruthy();
    expect(screen.getByText('Create')).toBeTruthy();
  });

  it('AipChatWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('aip_chat')} ctx={makeCtx()} />);
    expect(screen.getByText('AI Assistant')).toBeTruthy();
    expect(screen.getByLabelText('Chat input')).toBeTruthy();
  });

  it('ModelCatalogWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('model_catalog')} ctx={makeCtx()} />);
    expect(screen.getByText('Model Catalog')).toBeTruthy();
    expect(screen.getByText('List models')).toBeTruthy();
  });

  it('PromptPlaygroundWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('prompt_playground')} ctx={makeCtx()} />);
    expect(screen.getByText('Prompt Playground')).toBeTruthy();
    expect(screen.getByText('Run')).toBeTruthy();
  });

  it('EvalFrameworkWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('eval_framework')} ctx={makeCtx()} />);
    expect(screen.getByText('Eval Framework')).toBeTruthy();
    expect(screen.getByText('List suites')).toBeTruthy();
  });

  it('AiProposalReviewWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('ai_proposal_review')} ctx={makeCtx()} />);
    expect(screen.getByText('AI Proposals')).toBeTruthy();
    expect(screen.getByText('Load proposals')).toBeTruthy();
  });

  it('VectorSearchWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('vector_search')} ctx={makeCtx()} />);
    expect(screen.getByText('Vector Search')).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
  });

  it('LlmUsageWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('llm_usage')} ctx={makeCtx()} />);
    expect(screen.getByText('LLM Usage')).toBeTruthy();
    expect(screen.getByText('Load usage')).toBeTruthy();
  });

  it('EmbeddedCopilotWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('embedded_copilot')} ctx={makeCtx()} />);
    expect(screen.getByText('Embedded Copilot')).toBeTruthy();
    expect(screen.getByText('Suggest')).toBeTruthy();
  });
});
