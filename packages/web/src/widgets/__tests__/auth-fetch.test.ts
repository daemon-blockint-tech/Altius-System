import { describe, it, expect, vi, afterEach } from 'vitest';
import { authedFetch, setWidgetAuthProvider } from '../auth-fetch.js';

describe('authedFetch', () => {
  afterEach(() => { vi.restoreAllMocks(); setWidgetAuthProvider(null); });

  it('attaches the bearer token and preserves other headers', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);
    setWidgetAuthProvider(async () => 'tok-123');

    await authedFetch('/api/v1/workshop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' } });

    const init = fetchMock.mock.calls[0]![1]!;
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok-123');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.method).toBe('POST');
  });

  it('sends no Authorization header when no provider is registered', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);
    setWidgetAuthProvider(null);

    await authedFetch('/api/v1/workshop/apps');

    const headers = fetchMock.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
  });
});
