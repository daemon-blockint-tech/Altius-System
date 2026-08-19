/**
 * Workshop client — helpers for fetching and managing workshop apps from the backend.
 *
 * Wraps the REST API at /api/v1/workshop/*.
 */

export interface WorkshopAppDefinition {
  id: string;
  name: string;
  description?: string;
  pages: unknown[];
  header?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  ownerId?: string;
  sharedWith?: string[];
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ReactiveVariable {
  id: string;
  appId: string;
  name: string;
  type: string;
  source: { kind: string; dependencies?: string[] };
  lazy: boolean;
  transformations?: Array<{ type: string }>;
}

export interface VariableLineage {
  variableId: string;
  variableName: string;
  dependsOn: string[];
  dependedBy: string[];
}

export interface AppModule {
  id: string;
  name: string;
  description?: string;
  interface: { inputs: unknown[]; outputs: unknown[] };
  sections: unknown[];
  published: boolean;
  version: number;
}

// ── Apps ──

export async function listApps(baseUrl = '/api/v1'): Promise<WorkshopAppDefinition[]> {
  const res = await fetch(`${baseUrl}/workshop/apps`);
  if (!res.ok) throw new Error(`listApps: ${res.status}`);
  const data = await res.json() as { apps: WorkshopAppDefinition[] };
  return data.apps;
}

export async function getApp(id: string, baseUrl = '/api/v1'): Promise<WorkshopAppDefinition> {
  const res = await fetch(`${baseUrl}/workshop/apps/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`getApp: ${res.status}`);
  return res.json() as Promise<WorkshopAppDefinition>;
}

export async function createApp(
  input: { name: string; description?: string },
  baseUrl = '/api/v1',
): Promise<WorkshopAppDefinition> {
  const res = await fetch(`${baseUrl}/workshop/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createApp: ${res.status}`);
  return res.json() as Promise<WorkshopAppDefinition>;
}

export async function updateApp(
  id: string,
  updates: Record<string, unknown>,
  baseUrl = '/api/v1',
): Promise<WorkshopAppDefinition> {
  const res = await fetch(`${baseUrl}/workshop/apps/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`updateApp: ${res.status}`);
  return res.json() as Promise<WorkshopAppDefinition>;
}

export async function deleteApp(id: string, baseUrl = '/api/v1'): Promise<void> {
  const res = await fetch(`${baseUrl}/workshop/apps/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteApp: ${res.status}`);
}

export async function shareApp(id: string, userIds: string[], baseUrl = '/api/v1'): Promise<WorkshopAppDefinition> {
  const res = await fetch(`${baseUrl}/workshop/apps/${encodeURIComponent(id)}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds }),
  });
  if (!res.ok) throw new Error(`shareApp: ${res.status}`);
  return res.json() as Promise<WorkshopAppDefinition>;
}

export async function duplicateApp(id: string, newName: string, baseUrl = '/api/v1'): Promise<WorkshopAppDefinition> {
  const res = await fetch(`${baseUrl}/workshop/apps/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  });
  if (!res.ok) throw new Error(`duplicateApp: ${res.status}`);
  return res.json() as Promise<WorkshopAppDefinition>;
}

// ── Variables ──

export async function listVariables(appId: string, baseUrl = '/api/v1'): Promise<ReactiveVariable[]> {
  const res = await fetch(`${baseUrl}/workshop/apps/${encodeURIComponent(appId)}/variables`);
  if (!res.ok) throw new Error(`listVariables: ${res.status}`);
  const data = await res.json() as { variables: ReactiveVariable[] };
  return data.variables;
}

export async function createVariable(
  appId: string,
  input: { name: string; type: string; source: { kind: string }; lazy?: boolean },
  baseUrl = '/api/v1',
): Promise<ReactiveVariable> {
  const res = await fetch(`${baseUrl}/workshop/apps/${encodeURIComponent(appId)}/variables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createVariable: ${res.status}`);
  return res.json() as Promise<ReactiveVariable>;
}

export async function evaluateVariable(variableId: string, baseUrl = '/api/v1'): Promise<unknown> {
  const res = await fetch(`${baseUrl}/workshop/variables/${encodeURIComponent(variableId)}/evaluate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`evaluateVariable: ${res.status}`);
  const data = await res.json() as { value: unknown };
  return data.value;
}

export async function getVariableLineage(appId: string, baseUrl = '/api/v1'): Promise<VariableLineage[]> {
  const res = await fetch(`${baseUrl}/workshop/apps/${encodeURIComponent(appId)}/lineage`);
  if (!res.ok) throw new Error(`getVariableLineage: ${res.status}`);
  const data = await res.json() as { lineage: VariableLineage[] };
  return data.lineage;
}

// ── Modules ──

export async function listModules(baseUrl = '/api/v1'): Promise<AppModule[]> {
  const res = await fetch(`${baseUrl}/workshop/modules`);
  if (!res.ok) throw new Error(`listModules: ${res.status}`);
  const data = await res.json() as { modules: AppModule[] };
  return data.modules;
}

// ── URL state ──

export async function encodeState(appId: string, variables: Record<string, unknown>, baseUrl = '/api/v1'): Promise<string> {
  const res = await fetch(`${baseUrl}/workshop/state/encode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, variables }),
  });
  if (!res.ok) throw new Error(`encodeState: ${res.status}`);
  const data = await res.json() as { encoded: string };
  return data.encoded;
}

export async function decodeState(encoded: string, baseUrl = '/api/v1'): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}/workshop/state/decode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encoded }),
  });
  if (!res.ok) throw new Error(`decodeState: ${res.status}`);
  const data = await res.json() as { variables: Record<string, unknown> };
  return data.variables;
}
