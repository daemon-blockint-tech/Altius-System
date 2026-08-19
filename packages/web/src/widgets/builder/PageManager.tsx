/**
 * PageManager — add, remove, rename, and reorder pages.
 *
 * Shows the list of pages in the app definition with controls
 * to add a new page, rename an existing page, delete a page,
 * and reorder pages (move up/down).
 */

import type { WorkshopAppDefinition } from '../types.js';

export interface PageManagerProps {
  app: WorkshopAppDefinition;
  currentPageId: string;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (pageId: string) => void;
  onMovePage: (pageId: string, direction: 'up' | 'down') => void;
}

export function PageManager({
  app,
  currentPageId,
  onSelectPage,
  onAddPage,
  onRenamePage,
  onDeletePage,
  onMovePage,
}: PageManagerProps): React.ReactNode {
  return (
    <div className="ed-builder__page-manager">
      <div className="ed-builder__page-manager-header">
        <h3 className="ed-builder__page-manager-title">Pages</h3>
        <button className="ed-builder__page-add" onClick={onAddPage}>+ Page</button>
      </div>
      <ul className="ed-builder__page-list">
        {app.pages.map((page, i) => (
          <li
            key={page.id}
            className={`ed-builder__page-item${page.id === currentPageId ? ' ed-builder__page-item--active' : ''}`}
          >
            <button
              className="ed-builder__page-select"
              onClick={() => onSelectPage(page.id)}
            >
              {page.name}
            </button>
            <div className="ed-builder__page-controls">
              <input
                type="text"
                className="ed-builder__page-rename"
                value={page.name}
                onChange={(e) => onRenamePage(page.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Rename ${page.name}`}
              />
              <button
                className="ed-builder__page-move"
                onClick={() => onMovePage(page.id, 'up')}
                disabled={i === 0}
                title="Move up"
              >
                ↑
              </button>
              <button
                className="ed-builder__page-move"
                onClick={() => onMovePage(page.id, 'down')}
                disabled={i === app.pages.length - 1}
                title="Move down"
              >
                ↓
              </button>
              <button
                className="ed-builder__page-delete"
                onClick={() => onDeletePage(page.id)}
                disabled={app.pages.length <= 1}
                title="Delete page"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
