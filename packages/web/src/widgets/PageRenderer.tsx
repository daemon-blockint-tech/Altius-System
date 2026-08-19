/**
 * PageRenderer — renders a page with its sections.
 *
 * A page is a vertical stack of sections. The page name is rendered
 * as a heading if present.
 */

import type { WidgetContext, WorkshopAppPage } from './types.js';
import { SectionRenderer } from './SectionRenderer.js';

export interface PageRendererProps {
  page: WorkshopAppPage;
  ctx: WidgetContext;
}

export function PageRenderer({ page, ctx }: PageRendererProps): React.ReactNode {
  return (
    <div className="ed-page" data-page-id={page.id}>
      <h2 className="ed-page__title">{page.name}</h2>
      {page.sections.map((section) => (
        <SectionRenderer key={section.id} section={section} ctx={ctx} />
      ))}
    </div>
  );
}
