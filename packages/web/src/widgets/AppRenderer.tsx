/**
 * AppRenderer — renders a complete Workshop app definition.
 *
 * Takes a WorkshopAppDefinition (from WorkshopPlatformService) and
 * renders it as a live React tree: header, navigation, and the
 * current page's sections with their widget instances.
 *
 * This is the top-level component that turns a declarative app
 * definition into a running application — no hardcoded screens.
 */

import { useState, useCallback, useMemo } from 'react';
import type { WidgetContext, WorkshopAppDefinition } from './types.js';
import { PageRenderer } from './PageRenderer.js';

export interface AppRendererProps {
  app: WorkshopAppDefinition;
  /** Initial variable values (e.g. from URL params or saved state). */
  initialVariables?: Record<string, unknown>;
  /** The SDK client. */
  client: unknown;
  /** Tenant ID. */
  tenantId: string;
  /** User ID. */
  userId: string;
}

export function AppRenderer({
  app,
  initialVariables = {},
  client,
  tenantId,
  userId,
}: AppRendererProps): React.ReactNode {
  const [currentPageId, setCurrentPageId] = useState(
    app.pages[0]?.id ?? '',
  );
  const [variables, setVariables] = useState(initialVariables);

  const setVariable = useCallback((name: string, value: unknown) => {
    setVariables((prev) => ({ ...prev, [name]: value }));
  }, []);

  const navigate = useCallback((pageId: string) => {
    setCurrentPageId(pageId);
  }, []);

  const ctx: WidgetContext = useMemo(
    () => ({ client, variables, setVariable, navigate, currentPageId, tenantId, userId }),
    [client, variables, setVariable, navigate, currentPageId, tenantId, userId],
  );

  const currentPage = app.pages.find((p) => p.id === currentPageId) ?? app.pages[0];

  if (!currentPage) {
    return (
      <div className="ed-app ed-app--empty">
        <p>This app has no pages.</p>
      </div>
    );
  }

  return (
    <div className="ed-app" data-app-id={app.id}>
      {app.header && (
        <header className="ed-app__header">
          <h1 className="ed-app__title">{app.header.title}</h1>
          {app.header.subtitle && <p className="ed-app__subtitle">{app.header.subtitle}</p>}
        </header>
      )}
      <nav className="ed-app__nav">
        {app.pages.map((page) => (
          <button
            key={page.id}
            className={`ed-app__nav-item${page.id === currentPageId ? ' ed-app__nav-item--active' : ''}`}
            onClick={() => navigate(page.id)}
          >
            {page.navigation?.title ?? page.name}
          </button>
        ))}
      </nav>
      <main className="ed-app__main">
        <PageRenderer page={currentPage} ctx={ctx} />
      </main>
    </div>
  );
}
