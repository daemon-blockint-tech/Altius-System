/**
 * MobileAppLauncher — renders a mobile-optimized app shell.
 *
 * This component wraps an AppRenderer in a mobile frame: bottom
 * navigation bar, QR code reader trigger, geolocation prompt,
 * and browser history navigation. It is the mobile delivery
 * surface for Workshop apps.
 *
 * Config:
 *   navItems: Array<{ label: string; pageId: string; icon?: string }>
 *   navPosition: 'bottom' | 'top' | 'hidden'
 *   qrReaderEnabled: boolean
 *   geolocationEnabled: boolean
 *   historyNavigation: boolean
 *   deepLinkPattern?: string
 */

import { useState, useCallback, useEffect } from 'react';
import type { WorkshopAppDefinition } from '../types.js';
import { AppRenderer } from '../AppRenderer.js';

export interface MobileAppLauncherProps {
  app: WorkshopAppDefinition;
  client: unknown;
  tenantId: string;
  userId: string;
  navItems?: Array<{ label: string; pageId: string; icon?: string }>;
  navPosition?: 'bottom' | 'top' | 'hidden';
  qrReaderEnabled?: boolean;
  geolocationEnabled?: boolean;
  historyNavigation?: boolean;
  deepLinkPattern?: string;
}

export function MobileAppLauncher({
  app,
  client,
  tenantId,
  userId,
  navItems,
  navPosition = 'bottom',
  qrReaderEnabled = false,
  geolocationEnabled = false,
  historyNavigation = true,
  deepLinkPattern,
}: MobileAppLauncherProps): React.ReactNode {
  const [currentPageId, setCurrentPageId] = useState(app.pages[0]?.id ?? '');
  const [history, setHistory] = useState<string[]>([app.pages[0]?.id ?? '']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [qrActive, setQrActive] = useState(false);

  // Derive nav items from app pages if not provided
  const items = navItems ?? app.pages.map((p) => ({
    label: p.navigation?.title ?? p.name,
    pageId: p.id,
    icon: p.navigation?.icon,
  }));

  const navigate = useCallback((pageId: string) => {
    setCurrentPageId(pageId);
    if (historyNavigation) {
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), pageId]);
      setHistoryIndex((i) => i + 1);
    }
  }, [historyNavigation, historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex((i) => i - 1);
      setCurrentPageId(history[historyIndex - 1]!);
    }
  }, [history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex((i) => i + 1);
      setCurrentPageId(history[historyIndex + 1]!);
    }
  }, [history, historyIndex]);

  // Deep link: parse URL hash on mount
  useEffect(() => {
    if (!deepLinkPattern) return;
    const hash = window.location.hash;
    if (hash) {
      const pageId = hash.replace('#', '');
      const page = app.pages.find((p) => p.id === pageId || p.path === pageId);
      if (page) navigate(page.id);
    }
  }, [deepLinkPattern, app.pages, navigate]);

  // Geolocation
  const requestLocation = useCallback(() => {
    if (!geolocationEnabled || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
    );
  }, [geolocationEnabled]);

  const nav = navPosition !== 'hidden' && (
    <nav className={`ed-mobile__nav ed-mobile__nav--${navPosition}`}>
      {historyNavigation && historyIndex > 0 && (
        <button className="ed-mobile__nav-btn" onClick={goBack} aria-label="Back">‹</button>
      )}
      {items.map((item) => (
        <button
          key={item.pageId}
          className={`ed-mobile__nav-item${item.pageId === currentPageId ? ' ed-mobile__nav-item--active' : ''}`}
          onClick={() => navigate(item.pageId)}
        >
          {item.icon && <span className="ed-mobile__nav-icon">{item.icon}</span>}
          <span className="ed-mobile__nav-label">{item.label}</span>
        </button>
      ))}
      {historyNavigation && historyIndex < history.length - 1 && (
        <button className="ed-mobile__nav-btn" onClick={goForward} aria-label="Forward">›</button>
      )}
    </nav>
  );

  return (
    <div className="ed-mobile" data-app-id={app.id}>
      {navPosition === 'top' && nav}
      <div className="ed-mobile__frame">
        <div className="ed-mobile__screen">
          <AppRenderer
            app={app}
            client={client}
            tenantId={tenantId}
            userId={userId}
            initialVariables={location ? { currentLocation: location } : undefined}
          />
        </div>
      </div>
      {navPosition === 'bottom' && nav}
      <div className="ed-mobile__actions">
        {qrReaderEnabled && (
          <button
            className={`ed-mobile__action-btn${qrActive ? ' ed-mobile__action-btn--active' : ''}`}
            onClick={() => setQrActive((v) => !v)}
            aria-label="QR code reader"
          >
            ⊞
          </button>
        )}
        {geolocationEnabled && (
          <button
            className={`ed-mobile__action-btn${location ? ' ed-mobile__action-btn--active' : ''}`}
            onClick={requestLocation}
            aria-label="Geolocation"
          >
            ⊙
          </button>
        )}
      </div>
      {qrActive && (
        <div className="ed-mobile__qr-overlay" onClick={() => setQrActive(false)}>
          <div className="ed-mobile__qr-frame">
            <p>QR Code Scanner</p>
            <p className="ed-mobile__qr-hint">Point camera at QR code</p>
          </div>
        </div>
      )}
    </div>
  );
}
