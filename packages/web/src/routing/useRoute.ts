/**
 * Bind the browser's location to React.
 *
 * `navigate` pushes so back and forward work; `replace` is for corrections the
 * user did not ask for (landing on `/`, or a screen the active pack cannot
 * show) — those must not become history entries, or Back walks through them
 * one by one and never leaves.
 */

import { useCallback, useEffect, useState } from 'react';
import { parseRoute, formatRoute, sameRoute } from './route.js';
import type { Route } from './route.js';

export interface Navigation {
  /** The current location, or null when the URL is not a route (a 404). */
  route: Route | null;
  /** Go somewhere, adding a history entry. */
  navigate: (to: Route) => void;
  /** Correct where we are without adding a history entry. */
  replace: (to: Route) => void;
}

export function useRoute(): Navigation {
  const [route, setRoute] = useState<Route | null>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = (): void => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const go = useCallback((to: Route, mode: 'push' | 'replace') => {
    const path = formatRoute(to);
    // Navigating to where you already are should do nothing at all: pushing it
    // makes Back a no-op that the user has to press twice.
    if (mode === 'push' && sameRoute(to, parseRoute(window.location.pathname))) return;
    window.history[mode === 'push' ? 'pushState' : 'replaceState']({}, '', path);
    setRoute(to);
  }, []);

  return {
    route,
    navigate: useCallback((to: Route) => go(to, 'push'), [go]),
    replace: useCallback((to: Route) => go(to, 'replace'), [go]),
  };
}
