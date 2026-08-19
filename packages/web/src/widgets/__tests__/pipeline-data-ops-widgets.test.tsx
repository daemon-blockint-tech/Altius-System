/**
 * Pipeline Data Ops widget tests.
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

describe('Pipeline Data Ops widget registry', () => {
  it('registers all 11 Pipeline Data Ops widgets', () => {
    const widgets = [
      'dataset_table', 'batch_transform', 'sql_workbench', 'pipeline_builder',
      'data_expectations', 'rules_engine', 'variable_transformer', 'sql_analytics',
      'cdc_ingest', 'datasource_mapper', 'build_trigger',
    ];
    for (const w of widgets) {
      expect(isWidgetImplemented(w)).toBe(true);
    }
    expect(listRegisteredWidgets().length).toBeGreaterThanOrEqual(95);
  });
});

describe('Pipeline Data Ops widget rendering', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as never;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('DatasetTableWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('dataset_table', { datasetName: 'sample' })} ctx={makeCtx()} />);
    expect(screen.getByText('Dataset Table')).toBeTruthy();
    expect(screen.getByText('Load rows')).toBeTruthy();
  });

  it('BatchTransformWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('batch_transform')} ctx={makeCtx()} />);
    expect(screen.getByText('Batch Transform')).toBeTruthy();
    expect(screen.getByText('Run transform')).toBeTruthy();
  });

  it('SqlWorkbenchWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('sql_workbench')} ctx={makeCtx()} />);
    expect(screen.getByText('SQL Workbench')).toBeTruthy();
    expect(screen.getByText('Run query')).toBeTruthy();
  });

  it('PipelineBuilderWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('pipeline_builder')} ctx={makeCtx()} />);
    expect(screen.getByText('Pipeline Builder')).toBeTruthy();
    expect(screen.getByText('Run pipeline')).toBeTruthy();
  });

  it('DataExpectationsWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('data_expectations')} ctx={makeCtx()} />);
    expect(screen.getByText('Data Expectations')).toBeTruthy();
    expect(screen.getByText('Run checks')).toBeTruthy();
  });

  it('RulesEngineWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('rules_engine')} ctx={makeCtx()} />);
    expect(screen.getByText('Rules Engine')).toBeTruthy();
    expect(screen.getByText('Execute rule')).toBeTruthy();
  });

  it('VariableTransformerWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('variable_transformer')} ctx={makeCtx()} />);
    expect(screen.getByText('Variable Transformer')).toBeTruthy();
    expect(screen.getByText('Transform')).toBeTruthy();
  });

  it('SqlAnalyticsWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('sql_analytics')} ctx={makeCtx()} />);
    expect(screen.getByText('SQL Analytics')).toBeTruthy();
    expect(screen.getByText('Run analytics')).toBeTruthy();
  });

  it('CdcIngestWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('cdc_ingest')} ctx={makeCtx()} />);
    expect(screen.getByText('CDC Ingest')).toBeTruthy();
    expect(screen.getByText('Apply commits')).toBeTruthy();
  });

  it('DatasourceMapperWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('datasource_mapper')} ctx={makeCtx()} />);
    expect(screen.getByText('Datasource Mapper')).toBeTruthy();
    expect(screen.getByText('Map properties')).toBeTruthy();
  });

  it('BuildTriggerWidget renders', () => {
    render(<WidgetRenderer instance={makeWidget('build_trigger')} ctx={makeCtx()} />);
    expect(screen.getByText('Build Trigger')).toBeTruthy();
    expect(screen.getByText('Trigger build')).toBeTruthy();
  });
});
