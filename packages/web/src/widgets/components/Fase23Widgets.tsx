/**
 * Fase 23 widget implementations — ontology & schema tooling.
 */

import { useState, useCallback } from 'react';
import type { WidgetProps } from '../types.js';

// ─── 23A Action form configuration widget ─────────────────────────────────

export function ActionFormConfigWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { actionName?: string };
  const [form, setForm] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const name = config.actionName ?? 'Admit';
    const res = await fetch(`/api/v1/actions/${name}/form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      setForm(body['data'] as Record<string, unknown>);
    }
  }, [config.actionName]);

  return (
    <div className="ed-widget ed-action-form-config" data-widget-id={instance.id}>
      <div className="ed-action-form-config__title">Action Form Config</div>
      <button onClick={load} type="button" className="ed-button">Load form</button>
      {form && <div data-testid="form-name">{String(form['name'])}</div>}
    </div>
  );
}

// ─── 23B Ontology change manager widget ───────────────────────────────────

export function OntologyChangeManagerWidget({ instance }: WidgetProps): React.ReactNode {
  const [status, setStatus] = useState<string>('draft');
  const [errors, setErrors] = useState<string[]>([]);

  const validate = useCallback(async () => {
    const res = await fetch('/api/v1/ontology/changes/1/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: { valid?: boolean; errors?: string[] } };
      setErrors(body.data?.errors ?? []);
      setStatus(body.data?.valid ? 'valid' : 'invalid');
    }
  }, []);

  const apply = useCallback(async () => {
    const res = await fetch('/api/v1/ontology/changes/1/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) setStatus('applied');
  }, []);

  return (
    <div className="ed-widget ed-ontology-change-manager" data-widget-id={instance.id}>
      <div className="ed-ontology-change-manager__title">Ontology Change Manager</div>
      <div data-testid="change-status">{status}</div>
      <button onClick={validate} type="button" className="ed-button">Validate</button>
      <button onClick={apply} type="button" className="ed-button">Apply</button>
      {errors.length > 0 && <div data-testid="change-errors">{errors.join(', ')}</div>}
    </div>
  );
}

// ─── 23C Branch manager widget ────────────────────────────────────────────

export function BranchManagerWidget({ instance }: WidgetProps): React.ReactNode {
  const [branches, setBranches] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/branches');
    if (res.ok) {
      const body = (await res.json()) as { branches?: Array<{ name?: string }> };
      setBranches(body.branches?.map(b => b.name ?? '') ?? []);
    }
  }, []);

  return (
    <div className="ed-widget ed-branch-manager" data-widget-id={instance.id}>
      <div className="ed-branch-manager__title">Branch Manager</div>
      <button onClick={load} type="button" className="ed-button">Load branches</button>
      {branches.length > 0 && (
        <ul>
          {branches.map(b => <li key={b}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}

// ─── 23D Transform expression widget ──────────────────────────────────────

export function TransformExpressionWidget({ instance }: WidgetProps): React.ReactNode {
  const [selected, setSelected] = useState<string>('toUpper');
  const [result, setResult] = useState<unknown>(null);

  const run = useCallback(async () => {
    const res = await fetch('/api/v1/transform/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ function: selected, inputType: 'String', arguments: { value: 'hello' } }),
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: { result?: unknown } };
      setResult(body.data?.result);
    }
  }, [selected]);

  return (
    <div className="ed-widget ed-transform-expression" data-widget-id={instance.id}>
      <div className="ed-transform-expression__title">Transform Expression</div>
      <select value={selected} onChange={e => setSelected(e.target.value)}>
        <option value="toUpper">toUpper</option>
        <option value="toLower">toLower</option>
        <option value="trim">trim</option>
        <option value="coalesce">coalesce</option>
        <option value="concat">concat</option>
        <option value="length">length</option>
      </select>
      <button onClick={run} type="button" className="ed-button">Evaluate</button>
      {result !== null && <div data-testid="transform-result">{String(result)}</div>}
    </div>
  );
}
