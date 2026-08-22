import { authedFetch } from './auth-fetch.js';
/**
 * Scenario client — helpers for fetching and managing scenarios from the backend.
 *
 * Wraps the REST API at /api/v1/scenarios/*.
 */

/** A scenario. */
export interface Scenario {
  id: string;
  name: string;
  description: string;
  targetId: string;
  targetType: 'model' | 'chain';
  inputOverrides: Record<string, unknown>;
  isBaseline: boolean;
  state: 'draft' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  timeWindow?: { startTime: string; endTime: string };
  smoothing?: { method: 'none' | 'moving_average' | 'exponential'; windowSize?: number; alpha?: number };
}

/** Result of running a scenario. */
export interface ScenarioResult {
  scenarioId: string;
  success: boolean;
  outputs?: Record<string, unknown>;
  baselineOutputs?: Record<string, unknown>;
  diff?: Record<string, { baseline: unknown; scenario: unknown; delta: number | string }>;
  executedAt: string;
  durationMs: number;
  errorMessage?: string;
}

/** Comparison of two scenarios. */
export interface ScenarioComparison {
  scenarioA: Scenario;
  scenarioB: Scenario;
  outputDiff: Record<string, { a: unknown; b: unknown; delta: number | string }>;
}

/** A staged action. */
export interface StagedAction {
  actionType: string;
  objectId: string;
  objectType: string;
  params: Record<string, unknown>;
}

// ── CRUD ──

export async function listScenarios(
  query?: { targetId?: string; targetType?: string; state?: string; tags?: string[]; limit?: number },
  baseUrl = '/api/v1',
): Promise<{ scenarios: Scenario[]; totalCount: number }> {
  const url = new URL(`${baseUrl}/scenarios`, window.location.origin);
  if (query?.targetId) url.searchParams.set('targetId', query.targetId);
  if (query?.targetType) url.searchParams.set('targetType', query.targetType);
  if (query?.state) url.searchParams.set('state', query.state);
  if (query?.tags?.length) url.searchParams.set('tags', query.tags.join(','));
  if (query?.limit) url.searchParams.set('limit', String(query.limit));
  const res = await authedFetch(url.toString());
  if (!res.ok) throw new Error(`listScenarios: ${res.status}`);
  return res.json() as Promise<{ scenarios: Scenario[]; totalCount: number }>;
}

export async function getScenario(id: string, baseUrl = '/api/v1'): Promise<Scenario> {
  const res = await authedFetch(`${baseUrl}/scenarios/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`getScenario: ${res.status}`);
  return res.json() as Promise<Scenario>;
}

export async function createScenario(
  input: {
    name: string;
    description?: string;
    targetId: string;
    targetType: 'model' | 'chain';
    inputOverrides: Record<string, unknown>;
    isBaseline?: boolean;
    tags?: string[];
    timeWindow?: { startTime: string; endTime: string };
    smoothing?: { method: 'none' | 'moving_average' | 'exponential'; windowSize?: number; alpha?: number };
  },
  baseUrl = '/api/v1',
): Promise<Scenario> {
  const res = await authedFetch(`${baseUrl}/scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createScenario: ${res.status}`);
  return res.json() as Promise<Scenario>;
}

export async function updateScenario(
  id: string,
  updates: Partial<Scenario>,
  baseUrl = '/api/v1',
): Promise<Scenario> {
  const res = await authedFetch(`${baseUrl}/scenarios/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`updateScenario: ${res.status}`);
  return res.json() as Promise<Scenario>;
}

export async function deleteScenario(id: string, baseUrl = '/api/v1'): Promise<void> {
  const res = await authedFetch(`${baseUrl}/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteScenario: ${res.status}`);
}

// ── Run / Compare / Results ──

export async function runScenario(
  id: string,
  tsInputs?: Array<{ objectType: string; objectId: string; property: string; inputKey: string }>,
  baseUrl = '/api/v1',
): Promise<ScenarioResult> {
  const res = await authedFetch(`${baseUrl}/scenarios/${encodeURIComponent(id)}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tsInputs }),
  });
  if (!res.ok) throw new Error(`runScenario: ${res.status}`);
  return res.json() as Promise<ScenarioResult>;
}

export async function getScenarioResults(id: string, baseUrl = '/api/v1'): Promise<ScenarioResult[]> {
  const res = await authedFetch(`${baseUrl}/scenarios/${encodeURIComponent(id)}/results`);
  if (!res.ok) throw new Error(`getScenarioResults: ${res.status}`);
  const data = await res.json() as { results: ScenarioResult[] };
  return data.results;
}

export async function compareScenarios(
  scenarioIdA: string,
  scenarioIdB: string,
  baseUrl = '/api/v1',
): Promise<ScenarioComparison> {
  const res = await authedFetch(`${baseUrl}/scenarios/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioIdA, scenarioIdB }),
  });
  if (!res.ok) throw new Error(`compareScenarios: ${res.status}`);
  return res.json() as Promise<ScenarioComparison>;
}

export async function duplicateScenario(id: string, newName: string, baseUrl = '/api/v1'): Promise<Scenario> {
  const res = await authedFetch(`${baseUrl}/scenarios/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  });
  if (!res.ok) throw new Error(`duplicateScenario: ${res.status}`);
  return res.json() as Promise<Scenario>;
}

// ── Staging / Apply ──

export async function stageActions(
  scenarioId: string,
  actions: StagedAction[],
  baseUrl = '/api/v1',
): Promise<{ staged: StagedAction[]; count: number }> {
  const res = await authedFetch(`${baseUrl}/scenarios/${encodeURIComponent(scenarioId)}/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions }),
  });
  if (!res.ok) throw new Error(`stageActions: ${res.status}`);
  return res.json() as Promise<{ staged: StagedAction[]; count: number }>;
}

export async function applyStagedActions(
  scenarioId: string,
  allOrNothing?: boolean,
  baseUrl = '/api/v1',
): Promise<{
  applied: number;
  failed: number;
  results: Array<{ actionType: string; objectId: string; success: boolean; error?: string }>;
  allOrNothing: boolean;
  rolledBack: boolean;
}> {
  const res = await authedFetch(`${baseUrl}/scenarios/${encodeURIComponent(scenarioId)}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allOrNothing }),
  });
  if (!res.ok) throw new Error(`applyStagedActions: ${res.status}`);
  return res.json();
}

// ── TS Inputs ──

export async function loadTsInputs(
  scenarioId: string,
  tsInputs: Array<{ objectType: string; objectId: string; property: string; inputKey: string }>,
  baseUrl = '/api/v1',
): Promise<{
  inputs: Record<string, { points: Array<{ timestamp: string; value: number | string | boolean }>; values: number[]; count: number }>;
}> {
  const res = await authedFetch(`${baseUrl}/scenarios/${encodeURIComponent(scenarioId)}/ts-inputs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tsInputs }),
  });
  if (!res.ok) throw new Error(`loadTsInputs: ${res.status}`);
  return res.json();
}
