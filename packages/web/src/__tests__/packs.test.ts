import { describe, it, expect, vi, afterEach } from 'vitest';
import { mapPackSummaries, fetchPacks } from '../packs.js';

describe('mapPackSummaries', () => {
  it('maps endpoint summaries to selector options (id=name, label=namespace)', () => {
    const opts = mapPackSummaries([
      { name: 'nhs-acute', version: '0.2.0', namespace: 'nhs.acute' },
      { name: 'core', version: '1.0.0', namespace: '' }, // empty namespace falls back to name
    ]);
    expect(opts).toEqual([
      { id: 'nhs-acute', name: 'nhs.acute', version: '0.2.0' },
      { id: 'core', name: 'core', version: '1.0.0' },
    ]);
  });
});

describe('fetchPacks', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches /api/v1/packs with the bearer token and maps the result', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/v1/packs');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return { ok: true, json: async () => ({ data: [{ name: 'aml', version: '0.1.0', namespace: 'aml' }] }) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const opts = await fetchPacks(async () => 'tok');
    expect(opts).toEqual([{ id: 'aml', name: 'aml', version: '0.1.0' }]);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 }) as unknown as Response));
    await expect(fetchPacks(null)).rejects.toThrow('HTTP 401');
  });
});
