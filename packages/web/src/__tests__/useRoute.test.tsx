/**
 * The hook owns history, so the cases that matter are the ones a user feels:
 * Back returns to the previous screen, and a correction the user did not ask
 * for does not become a stop on the way back.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoute } from '../routing/useRoute.js';

beforeEach(() => {
  window.history.replaceState({}, '', '/supply-chain/operate/objects');
});

describe('useRoute', () => {
  it('starts at whatever the address bar says', () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current.route).toEqual({ pack: 'supply-chain', job: 'OP', screen: 'objects' });
  });

  it('is null when the URL is not a route, so the app can show a 404', () => {
    window.history.replaceState({}, '', '/nope');
    const { result } = renderHook(() => useRoute());
    expect(result.current.route).toBeNull();
  });

  it('navigate changes the address bar and the route', () => {
    const { result } = renderHook(() => useRoute());
    act(() => result.current.navigate({ pack: 'supply-chain', job: 'IN', screen: 'audit-trail' }));

    expect(window.location.pathname).toBe('/supply-chain/investigate/audit-trail');
    expect(result.current.route?.screen).toBe('audit-trail');
  });

  it('follows the browser back button', () => {
    const { result } = renderHook(() => useRoute());
    act(() => result.current.navigate({ pack: 'supply-chain', job: 'IN', screen: 'audit-trail' }));

    act(() => {
      window.history.replaceState({}, '', '/supply-chain/operate/objects');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.route?.screen).toBe('objects');
  });

  it('replace does not add a history entry', () => {
    const { result } = renderHook(() => useRoute());
    const before = window.history.length;
    act(() => result.current.replace({ pack: 'supply-chain', job: 'MO', screen: 'workshop' }));

    expect(window.location.pathname).toBe('/supply-chain/model/workshop');
    expect(window.history.length).toBe(before);
  });

  it('navigating to the current location adds nothing', () => {
    const { result } = renderHook(() => useRoute());
    const before = window.history.length;
    act(() => result.current.navigate({ pack: 'supply-chain', job: 'OP', screen: 'objects' }));
    expect(window.history.length).toBe(before);
  });
});
