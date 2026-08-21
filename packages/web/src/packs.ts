/**
 * Loaded domain packs, fetched from the gateway — replaces the hardcoded list.
 * The pack set is deployment config, so the app reads it at runtime rather than
 * shipping a bundle that only knows the three bundled packs.
 */

import type { PackOption } from './components/EditorialShell.js';

/** One pack as the /api/v1/packs endpoint returns it. */
export interface PackSummary {
  name: string;
  version: string;
  namespace: string;
  capabilities?: string[];
  objectTypes?: number;
  external?: boolean;
}

/** Map the endpoint's pack summaries to the shell's selector options. */
export function mapPackSummaries(raw: PackSummary[]): PackOption[] {
  return raw.map(p => ({
    // The id keys the (legacy) per-pack screens; the manifest name is stable.
    id: p.name,
    name: p.namespace || p.name,
    version: p.version,
  }));
}

export async function fetchPacks(getToken: (() => Promise<string>) | null): Promise<PackOption[]> {
  const token = getToken ? await getToken() : '';
  const res = await fetch('/api/v1/packs', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: PackSummary[] };
  return mapPackSummaries(json.data ?? []);
}
