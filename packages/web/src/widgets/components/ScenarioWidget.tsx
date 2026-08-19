/**
 * ScenarioWidget — what-if scenario management panel.
 *
 * Config:
 *   targetId?: string         — model/chain ID to run scenarios against
 *   targetType?: 'model' | 'chain'  — default 'model'
 *   showCompare?: boolean     — show side-by-side comparison view
 *   showStaging?: boolean     — show action staging controls
 *   tsInputs?: Array<{ objectType, objectId, property, inputKey }> — TS data sources
 *   width?: number            — default 600
 *   height?: number           — default 500
 *
 * Features:
 *   - List scenarios from backend
 *   - Create new scenario with input overrides
 *   - Run scenario and view results (outputs, baseline, diff)
 *   - Compare two scenarios side-by-side
 *   - Stage and apply actions (all-or-nothing)
 *   - Load time-series data as simulation inputs
 *   - Persist scenarios to backend
 */

import { useState, useEffect, useCallback } from 'react';
import type { WidgetProps } from '../types.js';
import {
  listScenarios,
  createScenario,
  runScenario,
  compareScenarios,
  getScenarioResults,
  stageActions,
  applyStagedActions,
  loadTsInputs,
  type Scenario,
  type ScenarioResult,
  type ScenarioComparison,
  type StagedAction,
} from '../scenario-client.js';

interface ScenarioConfig {
  targetId?: string;
  targetType?: 'model' | 'chain';
  showCompare?: boolean;
  showStaging?: boolean;
  tsInputs?: Array<{ objectType: string; objectId: string; property: string; inputKey: string }>;
  width?: number;
  height?: number;
}

const STATE_COLORS: Record<string, string> = {
  draft: '#6b7280',
  running: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
};

export function ScenarioWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as ScenarioConfig;
  const width = config.width ?? 600;
  const height = config.height ?? 500;
  const targetId = config.targetId ?? '';
  const targetType = config.targetType ?? 'model';
  const showCompare = config.showCompare ?? false;
  const showStaging = config.showStaging ?? false;
  const tsInputs = config.tsInputs ?? [];

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [results, setResults] = useState<ScenarioResult[]>([]);
  const [comparison, setComparison] = useState<ScenarioComparison | null>(null);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagedCount, setStagedCount] = useState(0);
  const [applyResult, setApplyResult] = useState<{ applied: number; failed: number; rolledBack: boolean } | null>(null);

  // New scenario form
  const [newName, setNewName] = useState('');
  const [newOverrides, setNewOverrides] = useState('{}');
  const [newTags, setNewTags] = useState('');

  // Load scenarios on mount and when targetId changes
  const loadScenarios = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listScenarios({ targetId: targetId || undefined, targetType: targetType === 'model' ? 'model' : 'chain' });
      setScenarios(result.scenarios);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scenarios');
    } finally {
      setLoading(false);
    }
  }, [targetId, targetType]);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  // Select scenario and load results
  const selectScenario = useCallback(async (s: Scenario) => {
    setSelected(s);
    setResults([]);
    setComparison(null);
    try {
      const r = await getScenarioResults(s.id);
      setResults(r);
    } catch {
      // ignore
    }
  }, []);

  // Create scenario
  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !targetId) return;
    setLoading(true);
    setError(null);
    try {
      let overrides: Record<string, unknown> = {};
      try { overrides = JSON.parse(newOverrides); } catch { overrides = {}; }
      const tags = newTags.split(',').map(t => t.trim()).filter(Boolean);
      const s = await createScenario({
        name: newName,
        targetId,
        targetType,
        inputOverrides: overrides,
        tags: tags.length ? tags : undefined,
      });
      setScenarios(prev => [s, ...prev]);
      setNewName('');
      setNewOverrides('{}');
      setNewTags('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scenario');
    } finally {
      setLoading(false);
    }
  }, [newName, newOverrides, newTags, targetId, targetType]);

  // Run scenario
  const handleRun = useCallback(async (s: Scenario) => {
    setLoading(true);
    setError(null);
    try {
      const result = await runScenario(s.id, tsInputs.length ? tsInputs : undefined);
      setResults(prev => [...prev, result]);
      // Refresh scenario list to get updated state
      await loadScenarios();
      const updated = await getScenarioResults(s.id);
      setResults(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run scenario');
    } finally {
      setLoading(false);
    }
  }, [tsInputs, loadScenarios]);

  // Compare scenarios
  const handleCompare = useCallback(async () => {
    if (!compareA || !compareB) return;
    setLoading(true);
    setError(null);
    try {
      const comp = await compareScenarios(compareA, compareB);
      setComparison(comp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compare');
    } finally {
      setLoading(false);
    }
  }, [compareA, compareB]);

  // Stage a test action
  const handleStage = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const testAction: StagedAction = {
        actionType: 'updateProperty',
        objectId: selected.id,
        objectType: 'Scenario',
        params: { overrides: selected.inputOverrides },
      };
      const result = await stageActions(selected.id, [testAction]);
      setStagedCount(result.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stage');
    } finally {
      setLoading(false);
    }
  }, [selected]);

  // Apply staged actions
  const handleApply = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const result = await applyStagedActions(selected.id, true);
      setApplyResult({ applied: result.applied, failed: result.failed, rolledBack: result.rolledBack });
      setStagedCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setLoading(false);
    }
  }, [selected]);

  // Load TS inputs
  const handleLoadTsInputs = useCallback(async () => {
    if (!selected || tsInputs.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadTsInputs(selected.id, tsInputs);
      // Update the selected scenario's overrides with TS data
      const newOverrides = { ...selected.inputOverrides };
      for (const [key, data] of Object.entries(result.inputs)) {
        newOverrides[key] = data.values;
      }
      setSelected({ ...selected, inputOverrides: newOverrides });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load TS inputs');
    } finally {
      setLoading(false);
    }
  }, [selected, tsInputs]);

  const lastResult = results[results.length - 1];

  return (
    <div style={{ width, height, border: '1px solid #ccc', fontFamily: 'sans-serif', fontSize: 12, overflow: 'auto', padding: 8, boxSizing: 'border-box' }} aria-label="Scenario panel">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>Scenarios</strong>
        <button onClick={loadScenarios} disabled={loading} style={{ fontSize: 11, padding: '2px 8px' }}>
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fee', color: '#c00', padding: '4px 8px', borderRadius: 4, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {/* Create new scenario */}
      <div style={{ marginBottom: 12, padding: 8, background: '#f9fafb', borderRadius: 4 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>New Scenario</div>
        <input
          type="text"
          placeholder="Scenario name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ width: '100%', padding: '2px 4px', marginBottom: 4, border: '1px solid #ddd', fontSize: 11 }}
          aria-label="Scenario name"
        />
        <textarea
          placeholder='{"input": 1.5}'
          value={newOverrides}
          onChange={(e) => setNewOverrides(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: '2px 4px', marginBottom: 4, border: '1px solid #ddd', fontSize: 11, fontFamily: 'monospace' }}
          aria-label="Input overrides JSON"
        />
        <input
          type="text"
          placeholder="tags (comma-separated)"
          value={newTags}
          onChange={(e) => setNewTags(e.target.value)}
          style={{ width: '100%', padding: '2px 4px', marginBottom: 4, border: '1px solid #ddd', fontSize: 11 }}
          aria-label="Scenario tags"
        />
        <button onClick={handleCreate} disabled={loading || !newName.trim()} style={{ padding: '2px 12px', fontSize: 11 }}>
          Create
        </button>
      </div>

      {/* Scenario list */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Scenarios ({scenarios.length})</div>
        {scenarios.length === 0 && <div style={{ color: '#999' }}>No scenarios yet</div>}
        {scenarios.map((s) => (
          <div
            key={s.id}
            onClick={() => selectScenario(s)}
            style={{
              padding: '4px 8px',
              cursor: 'pointer',
              background: selected?.id === s.id ? '#e0f2fe' : 'transparent',
              borderRadius: 4,
              marginBottom: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{s.name}</span>
            <span style={{ color: STATE_COLORS[s.state] ?? '#999', fontSize: 10 }}>{s.state}</span>
          </div>
        ))}
      </div>

      {/* Selected scenario detail */}
      {selected && (
        <div style={{ marginBottom: 12, padding: 8, background: '#f0fdf4', borderRadius: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{selected.name}</div>
          <div style={{ color: '#666', marginBottom: 4 }}>{selected.description}</div>
          <div style={{ marginBottom: 4 }}>
            <strong>Target:</strong> {selected.targetType} / {selected.targetId}
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong>Overrides:</strong>
            <pre style={{ fontSize: 10, margin: '2px 0', maxHeight: 60, overflow: 'auto' }}>
              {JSON.stringify(selected.inputOverrides, null, 2)}
            </pre>
          </div>
          {selected.timeWindow && (
            <div style={{ marginBottom: 4 }}>
              <strong>Time window:</strong> {selected.timeWindow.startTime} → {selected.timeWindow.endTime}
            </div>
          )}
          {selected.smoothing && (
            <div style={{ marginBottom: 4 }}>
              <strong>Smoothing:</strong> {selected.smoothing.method}
              {selected.smoothing.windowSize ? ` (window: ${selected.smoothing.windowSize})` : ''}
              {selected.smoothing.alpha ? ` (alpha: ${selected.smoothing.alpha})` : ''}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={() => handleRun(selected)} disabled={loading} style={{ padding: '2px 8px', fontSize: 11 }}>
              {loading ? '...' : 'Run'}
            </button>
            {tsInputs.length > 0 && (
              <button onClick={handleLoadTsInputs} disabled={loading} style={{ padding: '2px 8px', fontSize: 11 }}>
                Load TS Inputs
              </button>
            )}
            {showStaging && (
              <>
                <button onClick={handleStage} disabled={loading} style={{ padding: '2px 8px', fontSize: 11 }}>
                  Stage ({stagedCount})
                </button>
                <button onClick={handleApply} disabled={loading || stagedCount === 0} style={{ padding: '2px 8px', fontSize: 11 }}>
                  Apply
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Last result */}
      {lastResult && (
        <div style={{ marginBottom: 12, padding: 8, background: '#fef3c7', borderRadius: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Last Result {lastResult.success ? '✓' : '✗'}
          </div>
          {lastResult.errorMessage && (
            <div style={{ color: '#c00' }}>{lastResult.errorMessage}</div>
          )}
          {lastResult.outputs && (
            <div>
              <strong>Outputs:</strong>
              <pre style={{ fontSize: 10, margin: '2px 0', maxHeight: 80, overflow: 'auto' }}>
                {JSON.stringify(lastResult.outputs, null, 2)}
              </pre>
            </div>
          )}
          {lastResult.diff && (
            <div>
              <strong>Diff vs baseline:</strong>
              <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <th style={{ textAlign: 'left' }}>Key</th>
                    <th style={{ textAlign: 'right' }}>Baseline</th>
                    <th style={{ textAlign: 'right' }}>Scenario</th>
                    <th style={{ textAlign: 'right' }}>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(lastResult.diff).map(([key, d]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td style={{ textAlign: 'right' }}>{String(d.baseline)}</td>
                      <td style={{ textAlign: 'right' }}>{String(d.scenario)}</td>
                      <td style={{ textAlign: 'right', color: typeof d.delta === 'number' ? (d.delta > 0 ? '#10b981' : d.delta < 0 ? '#ef4444' : '#999') : '#999' }}>
                        {String(d.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ color: '#999', fontSize: 10, marginTop: 4 }}>
            {lastResult.durationMs}ms · {lastResult.executedAt}
          </div>
        </div>
      )}

      {/* Apply result */}
      {applyResult && (
        <div style={{ marginBottom: 12, padding: 8, background: applyResult.rolledBack ? '#fee2e2' : '#d1fae5', borderRadius: 4 }}>
          <strong>Apply:</strong> {applyResult.applied} applied, {applyResult.failed} failed
          {applyResult.rolledBack && ' (rolled back — all-or-nothing)'}
        </div>
      )}

      {/* Compare view */}
      {showCompare && scenarios.length >= 2 && (
        <div style={{ marginBottom: 12, padding: 8, background: '#ede9fe', borderRadius: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Compare Scenarios</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <select value={compareA} onChange={(e) => setCompareA(e.target.value)} aria-label="Scenario A" style={{ fontSize: 11, flex: 1 }}>
              <option value="">Select A...</option>
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={compareB} onChange={(e) => setCompareB(e.target.value)} aria-label="Scenario B" style={{ fontSize: 11, flex: 1 }}>
              <option value="">Select B...</option>
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button onClick={handleCompare} disabled={loading || !compareA || !compareB} style={{ padding: '2px 12px', fontSize: 11 }}>
            Compare
          </button>
          {comparison && (
            <div style={{ marginTop: 8 }}>
              <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <th style={{ textAlign: 'left' }}>Key</th>
                    <th style={{ textAlign: 'right' }}>{comparison.scenarioA.name}</th>
                    <th style={{ textAlign: 'right' }}>{comparison.scenarioB.name}</th>
                    <th style={{ textAlign: 'right' }}>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(comparison.outputDiff).map(([key, d]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td style={{ textAlign: 'right' }}>{String(d.a)}</td>
                      <td style={{ textAlign: 'right' }}>{String(d.b)}</td>
                      <td style={{ textAlign: 'right', color: typeof d.delta === 'number' ? (d.delta > 0 ? '#10b981' : d.delta < 0 ? '#ef4444' : '#999') : '#999' }}>
                        {String(d.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
