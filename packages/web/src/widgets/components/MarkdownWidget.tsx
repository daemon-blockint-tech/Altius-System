/**
 * MarkdownWidget — renders markdown content from config or a bound variable.
 *
 * Config:
 *   content: string    — markdown source text
 */

import type { WidgetProps } from '../types.js';

interface MarkdownConfig {
  content?: string;
}

export function MarkdownWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as unknown as MarkdownConfig;
  const content = (instance.boundVariable
    ? String(ctx.variables[instance.boundVariable] ?? '')
    : config.content ?? '');

  return (
    <div
      className="ed-widget ed-markdown"
      data-widget-id={instance.id}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}

/**
 * Minimal markdown renderer — handles headings, bold, italic, code,
 * links, lists, and paragraphs. Not a full CommonMark implementation;
 * sufficient for widget content authored by users in a module builder.
 */
function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) { html.push('</ul>'); inList = false; }
      continue;
    }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h && h[1] && h[2]) {
      if (inList) { html.push('</ul>'); inList = false; }
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    // List items
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${inline(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }

    if (inList) { html.push('</ul>'); inList = false; }
    html.push(`<p>${inline(trimmed)}</p>`);
  }
  if (inList) html.push('</ul>');

  return html.join('');
}

function inline(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}
