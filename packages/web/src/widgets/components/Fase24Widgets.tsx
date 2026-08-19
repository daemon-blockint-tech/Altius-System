/**
 * Fase 24 widget implementations — Pipeline & Data Ops.
 */

import { useState, useCallback } from 'react';
import type { WidgetProps } from '../types.js';

// ─── 24A Dataset table widget ─────────────────────────────────────────────

export function DatasetTableWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { datasetName?: string };
  const [rows, setRows] = useState<number>(0);
  const load = useCallback(async () => {
    const name = config.datasetName ?? 'sample';
    const res = await fetch(`/api/v1/datasets/${name}/read?limit=10`, { method: 'GET' });
    if (res.ok) {
      const body = (await res.json()) as { data?: { rows?: unknown[] } };
      setRows(body.data?.rows?.length ?? 0);
    }
  }, [config.datasetName]);
  return (
    <div className="ed-widget ed-dataset-table" data-widget-id={instance.id}>
      <div className="ed-dataset-table__title">Dataset Table</div>
      <button onClick={load} type="button" className="ed-button">Load rows</button>
      {rows > 0 && <div data-testid="dataset-row-count">{rows} rows</div>}
    </div>
  );
}

// ─── 24B Batch transform widget ───────────────────────────────────────────

export function BatchTransformWidget({ instance }: WidgetProps): React.ReactNode {
  const [build, setBuild] = useState<string>('');
  const run = useCallback(async () => {
    const res = await fetch('/api/v1/transforms/sample/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (res.ok) {
      const body = (await res.json()) as { data?: { id?: string } };
      setBuild(body.data?.id ?? 'ok');
    }
  }, []);
  return (
    <div className="ed-widget ed-batch-transform" data-widget-id={instance.id}>
      <div className="ed-batch-transform__title">Batch Transform</div>
      <button onClick={run} type="button" className="ed-button">Run transform</button>
      {build && <div data-testid="transform-build-id">{build}</div>}
    </div>
  );
}

// ─── 24C SQL workbench widget ─────────────────────────────────────────────

export function SqlWorkbenchWidget({ instance }: WidgetProps): React.ReactNode {
  const [status, setStatus] = useState<string>('');
  const query = useCallback(async () => {
    const res = await fetch('/api/v1/sql/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: 'SELECT * FROM sample' }) });
    if (res.ok) {
      const body = (await res.json()) as { data?: { state?: string } };
      setStatus(body.data?.state ?? 'ok');
    }
  }, []);
  return (
    <div className="ed-widget ed-sql-workbench" data-widget-id={instance.id}>
      <div className="ed-sql-workbench__title">SQL Workbench</div>
      <button onClick={query} type="button" className="ed-button">Run query</button>
      {status && <div data-testid="sql-status">{status}</div>}
    </div>
  );
}

// ─── 24D Pipeline builder widget ──────────────────────────────────────────

export function PipelineBuilderWidget({ instance }: WidgetProps): React.ReactNode {
  const [runId, setRunId] = useState<string>('');
  const run = useCallback(async () => {
    const res = await fetch('/api/v1/pipelines/p-1/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (res.ok) {
      const body = (await res.json()) as { data?: { id?: string } };
      setRunId(body.data?.id ?? 'ok');
    }
  }, []);
  return (
    <div className="ed-widget ed-pipeline-builder" data-widget-id={instance.id}>
      <div className="ed-pipeline-builder__title">Pipeline Builder</div>
      <button onClick={run} type="button" className="ed-button">Run pipeline</button>
      {runId && <div data-testid="pipeline-run-id">{runId}</div>}
    </div>
  );
}

// ─── 24E Data expectations widget ─────────────────────────────────────────

export function DataExpectationsWidget({ instance }: WidgetProps): React.ReactNode {
  const [passed, setPassed] = useState<boolean | null>(null);
  const run = useCallback(async () => {
    const res = await fetch('/api/v1/expectations/e-1/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [{ x: 1 }] }) });
    if (res.ok) setPassed(true);
  }, []);
  return (
    <div className="ed-widget ed-data-expectations" data-widget-id={instance.id}>
      <div className="ed-data-expectations__title">Data Expectations</div>
      <button onClick={run} type="button" className="ed-button">Run checks</button>
      {passed === true && <div data-testid="expectation-passed">passed</div>}
    </div>
  );
}

// ─── 24F Rules engine widget ──────────────────────────────────────────────

export function RulesEngineWidget({ instance }: WidgetProps): React.ReactNode {
  const [result, setResult] = useState<string>('');
  const run = useCallback(async () => {
    const res = await fetch('/api/v1/rules/r-1/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) });
    if (res.ok) {
      const body = (await res.json()) as { data?: { success?: boolean } };
      setResult(body.data?.success ? 'success' : 'failed');
    }
  }, []);
  return (
    <div className="ed-widget ed-rules-engine" data-widget-id={instance.id}>
      <div className="ed-rules-engine__title">Rules Engine</div>
      <button onClick={run} type="button" className="ed-button">Execute rule</button>
      {result && <div data-testid="rules-result">{result}</div>}
    </div>
  );
}

// ─── 24G Variable transformer widget ──────────────────────────────────────

export function VariableTransformerWidget({ instance }: WidgetProps): React.ReactNode {
  const [out, setOut] = useState<string>('');
  const transform = useCallback(async () => {
    const res = await fetch('/api/v1/variables/transform', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pipeline: 'upper', input: 'hello' }) });
    if (res.ok) setOut('ok');
  }, []);
  return (
    <div className="ed-widget ed-variable-transformer" data-widget-id={instance.id}>
      <div className="ed-variable-transformer__title">Variable Transformer</div>
      <button onClick={transform} type="button" className="ed-button">Transform</button>
      {out && <div data-testid="variable-transformed">{out}</div>}
    </div>
  );
}

// ─── 24H SQL analytics widget ─────────────────────────────────────────────

export function SqlAnalyticsWidget({ instance }: WidgetProps): React.ReactNode {
  const [columns, setColumns] = useState<number>(0);
  const query = useCallback(async () => {
    const res = await fetch('/api/v1/sql/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: 'SELECT id FROM sample' }) });
    if (res.ok) {
      const body = (await res.json()) as { data?: { columns?: string[] } };
      setColumns(body.data?.columns?.length ?? 0);
    }
  }, []);
  return (
    <div className="ed-widget ed-sql-analytics" data-widget-id={instance.id}>
      <div className="ed-sql-analytics__title">SQL Analytics</div>
      <button onClick={query} type="button" className="ed-button">Run analytics</button>
      {columns > 0 && <div data-testid="sql-analytics-columns">{columns} columns</div>}
    </div>
  );
}

// ─── 24I CDC ingest widget ────────────────────────────────────────────────

export function CdcIngestWidget({ instance }: WidgetProps): React.ReactNode {
  const [applied, setApplied] = useState<number>(0);
  const apply = useCallback(async () => {
    const res = await fetch('/api/v1/sync/cdc/c-1/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (res.ok) {
      const body = (await res.json()) as { data?: { applied?: number } };
      setApplied(body.data?.applied ?? 0);
    }
  }, []);
  return (
    <div className="ed-widget ed-cdc-ingest" data-widget-id={instance.id}>
      <div className="ed-cdc-ingest__title">CDC Ingest</div>
      <button onClick={apply} type="button" className="ed-button">Apply commits</button>
      {applied > 0 && <div data-testid="cdc-applied">{applied} applied</div>}
    </div>
  );
}

// ─── 24J Datasource mapper widget ─────────────────────────────────────────

export function DatasourceMapperWidget({ instance }: WidgetProps): React.ReactNode {
  const [mapped, setMapped] = useState<boolean>(false);
  const map = useCallback(async () => {
    const res = await fetch('/api/v1/datasources/d-1/map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: [{ column: 'col', property: 'prop' }] }) });
    if (res.ok) setMapped(true);
  }, []);
  return (
    <div className="ed-widget ed-datasource-mapper" data-widget-id={instance.id}>
      <div className="ed-datasource-mapper__title">Datasource Mapper</div>
      <button onClick={map} type="button" className="ed-button">Map properties</button>
      {mapped && <div data-testid="datasource-mapped">mapped</div>}
    </div>
  );
}

// ─── 24K Build trigger widget ─────────────────────────────────────────────

export function BuildTriggerWidget({ instance }: WidgetProps): React.ReactNode {
  const [builds, setBuilds] = useState<number>(0);
  const trigger = useCallback(async () => {
    const res = await fetch('/api/v1/build-triggers/t-1/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (res.ok) {
      const body = (await res.json()) as { data?: unknown[] };
      setBuilds(Array.isArray(body.data) ? body.data.length : 0);
    }
  }, []);
  return (
    <div className="ed-widget ed-build-trigger" data-widget-id={instance.id}>
      <div className="ed-build-trigger__title">Build Trigger</div>
      <button onClick={trigger} type="button" className="ed-button">Trigger build</button>
      {builds > 0 && <div data-testid="builds-triggered">{builds} builds</div>}
    </div>
  );
}
