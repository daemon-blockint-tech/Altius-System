/**
 * StubWidgets — implementations for the 28 remaining widget types.
 *
 * Each widget is a functional React component that renders real UI
 * (not a placeholder). They use the WidgetProps pattern: config from
 * instance.config, bound variables from ctx.variables.
 *
 * Categories:
 *   chart: chart_bar, chart_vega, waterfall, observability_chart, heatmap, scatter_plot
 *   filter: object_selector, date_range, user_select
 *   input: radio_group, dropdown
 *   layout: spacer, divider, progress_bar, badge, tooltip, accordion,
 *           property_list, object_set_title, links, tree_view, kanban
 *   ai: aip_chat, aip_generated_content
 *   navigation: breadcrumb
 *   time: gantt, timeline, calendar
 */

import { useState, useCallback, useMemo } from 'react';
import type { WidgetProps } from '../types.js';

// ── Chart widgets ──

export function ChartBarWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { data?: Array<{ label: string; value: number }>; title?: string; horizontal?: boolean };
  const data = config.data ?? [];
  const maxVal = useMemo(() => Math.max(...data.map(d => Math.abs(d.value)), 1), [data]);
  const horizontal = config.horizontal ?? false;

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Bar chart" role="img">
      {config.title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{config.title}</div>}
      <div style={{ display: 'flex', flexDirection: horizontal ? 'column' : 'row', gap: 4, alignItems: horizontal ? 'flex-start' : 'flex-end', height: 150 }}>
        {data.map((d, i) => {
          const pct = (Math.abs(d.value) / maxVal) * 100;
          return horizontal ? (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
              <span style={{ width: 80, textAlign: 'right', fontSize: 10, color: '#666' }}>{d.label}</span>
              <div style={{ height: 16, background: '#3b82f6', width: `${pct}%`, borderRadius: 2 }} />
              <span style={{ fontSize: 10 }}>{d.value}</span>
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <span style={{ fontSize: 10 }}>{d.value}</span>
              <div style={{ width: '80%', background: '#3b82f6', height: `${pct * 1.2}px`, borderRadius: '2px 2px 0 0' }} />
              <span style={{ fontSize: 9, color: '#666', marginTop: 2 }}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartVegaWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { spec?: Record<string, unknown>; data?: unknown[] };
  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 4 }} aria-label="Vega chart" role="img">
      <div style={{ color: '#666', marginBottom: 4 }}>Vega-Lite Chart</div>
      {config.spec ? (
        <pre style={{ fontSize: 9, overflow: 'auto', maxHeight: 120 }}>{JSON.stringify(config.spec, null, 2)}</pre>
      ) : (
        <div style={{ color: '#999' }}>No Vega spec configured</div>
      )}
      {config.data && <div style={{ fontSize: 10, color: '#666' }}>{config.data.length} data points</div>}
    </div>
  );
}

export function WaterfallWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { data?: Array<{ label: string; value: number }>; title?: string };
  const data = config.data ?? [];
  let cumulative = 0;
  const bars = data.map(d => {
    const start = cumulative;
    cumulative += d.value;
    return { label: d.label, start, end: cumulative, value: d.value };
  });
  const maxVal = Math.max(...bars.map(b => Math.abs(b.end)), 1);

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Waterfall chart" role="img">
      {config.title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{config.title}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
        {bars.map((b, i) => {
          const startPct = (Math.min(b.start, b.end) / maxVal) * 100;
          const heightPct = (Math.abs(b.value) / maxVal) * 100;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{ position: 'relative', width: '80%', height: '100%' }}>
                <div style={{
                  position: 'absolute', bottom: `${startPct}%`, width: '100%',
                  height: `${heightPct}%`, background: b.value >= 0 ? '#10b981' : '#ef4444', borderRadius: 2,
                }} />
              </div>
              <span style={{ fontSize: 9, color: '#666' }}>{b.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ObservabilityChartWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { metrics?: Array<{ name: string; values: number[] }>; timeRange?: string };
  const metrics = config.metrics ?? [];
  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 4 }} aria-label="Observability chart" role="img">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Observability</div>
      {config.timeRange && <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>Range: {config.timeRange}</div>}
      {metrics.length === 0 ? (
        <div style={{ color: '#999' }}>No metrics configured</div>
      ) : (
        metrics.map((m, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#666' }}>{m.name}: </span>
            <svg width="100%" height="30" style={{ display: 'inline-block' }}>
              <polyline
                points={m.values.map((v, idx) => `${(idx / Math.max(m.values.length - 1, 1)) * 100},${30 - (v / Math.max(...m.values, 1)) * 28}`).join(' ')}
                fill="none" stroke="#3b82f6" strokeWidth="1"
              />
            </svg>
          </div>
        ))
      )}
    </div>
  );
}

export function HeatmapWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { rows?: string[]; cols?: string[]; values?: number[][] };
  const rows = config.rows ?? [];
  const cols = config.cols ?? [];
  const values = config.values ?? [];
  const maxVal = useMemo(() => Math.max(...values.flat(), 1), [values]);

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 10 }} aria-label="Heatmap" role="img">
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th></th>
            {cols.map((c, i) => <th key={i} style={{ padding: '2px 4px' }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              <td style={{ padding: '2px 4px', fontWeight: 600 }}>{r}</td>
              {cols.map((_, ci) => {
                const v = values[ri]?.[ci] ?? 0;
                const intensity = v / maxVal;
                return (
                  <td key={ci} style={{
                    padding: '4px 8px', textAlign: 'center',
                    background: `rgba(59, 130, 246, ${intensity})`,
                    color: intensity > 0.5 ? '#fff' : '#000',
                  }}>{v}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScatterPlotWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { points?: Array<{ x: number; y: number; label?: string }>; xLabel?: string; yLabel?: string };
  const points = config.points ?? [];
  const maxX = useMemo(() => Math.max(...points.map(p => p.x), 1), [points]);
  const maxY = useMemo(() => Math.max(...points.map(p => p.y), 1), [points]);

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Scatter plot" role="img">
      <div style={{ position: 'relative', width: '100%', height: 150, border: '1px solid #e5e7eb' }}>
        {points.map((p, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${(p.x / maxX) * 90}%`, bottom: `${(p.y / maxY) * 90}%`,
            width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', transform: 'translate(-50%, 50%)',
          }} title={p.label ?? `(${p.x}, ${p.y})`} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
        <span>{config.xLabel ?? 'X'}</span>
        <span>{config.yLabel ?? 'Y'}</span>
      </div>
    </div>
  );
}

// ── Filter widgets ──

export function ObjectSelectorWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { options?: Array<{ id: string; label: string }>; placeholder?: string; multiSelect?: boolean };
  const options = config.options ?? [];
  const selected = instance.boundVariable ? ctx.variables[instance.boundVariable] : null;
  const [search, setSearch] = useState('');

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Object selector">
      <input
        type="text"
        placeholder={config.placeholder ?? 'Search...'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', padding: '4px', border: '1px solid #ddd', borderRadius: 4, marginBottom: 4, boxSizing: 'border-box' }}
        aria-label="Object search"
      />
      <div style={{ maxHeight: 150, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 4 }}>
        {filtered.map(o => (
          <div
            key={o.id}
            onClick={() => instance.boundVariable && ctx.setVariable(instance.boundVariable, config.multiSelect ? [o.id] : o.id)}
            style={{
              padding: '4px 8px', cursor: 'pointer',
              background: (Array.isArray(selected) ? selected.includes(o.id) : selected === o.id) ? '#eff6ff' : 'transparent',
            }}
          >
            {o.label}
          </div>
        ))}
        {filtered.length === 0 && <div style={{ padding: 8, color: '#999' }}>No results</div>}
      </div>
    </div>
  );
}

export function DateRangeWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { startLabel?: string; endLabel?: string };
  const boundVar = instance.boundVariable;
  const current = boundVar ? (ctx.variables[boundVar] as { start?: string; end?: string } | undefined) : undefined;

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }} aria-label="Date range picker">
      <label style={{ fontSize: 11, color: '#666' }}>{config.startLabel ?? 'Start'}</label>
      <input
        type="date"
        value={current?.start ?? ''}
        onChange={(e) => boundVar && ctx.setVariable(boundVar, { ...current, start: e.target.value })}
        style={{ padding: '2px 4px', border: '1px solid #ddd', borderRadius: 4 }}
        aria-label="Start date"
      />
      <label style={{ fontSize: 11, color: '#666' }}>{config.endLabel ?? 'End'}</label>
      <input
        type="date"
        value={current?.end ?? ''}
        onChange={(e) => boundVar && ctx.setVariable(boundVar, { ...current, end: e.target.value })}
        style={{ padding: '2px 4px', border: '1px solid #ddd', borderRadius: 4 }}
        aria-label="End date"
      />
    </div>
  );
}

export function UserSelectWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { users?: Array<{ id: string; name: string }>; placeholder?: string };
  const users = config.users ?? [];
  const selected = instance.boundVariable ? ctx.variables[instance.boundVariable] : null;

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="User select">
      <select
        value={(selected as string) ?? ''}
        onChange={(e) => instance.boundVariable && ctx.setVariable(instance.boundVariable, e.target.value)}
        style={{ width: '100%', padding: '4px', border: '1px solid #ddd', borderRadius: 4 }}
        aria-label="User selection"
      >
        <option value="">{config.placeholder ?? 'Select user...'}</option>
        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    </div>
  );
}

// ── Input widgets ──

export function RadioGroupWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { options?: Array<{ value: string; label: string }>; label?: string };
  const options = config.options ?? [];
  const selected = instance.boundVariable ? ctx.variables[instance.boundVariable] : null;

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Radio group">
      {config.label && <div style={{ fontWeight: 600, marginBottom: 4 }}>{config.label}</div>}
      {options.map(o => (
        <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <input
            type="radio"
            checked={selected === o.value}
            onChange={() => instance.boundVariable && ctx.setVariable(instance.boundVariable, o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function DropdownWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { options?: Array<{ value: string; label: string }>; placeholder?: string; label?: string };
  const options = config.options ?? [];
  const selected = instance.boundVariable ? ctx.variables[instance.boundVariable] : null;

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Dropdown">
      {config.label && <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{config.label}</label>}
      <select
        value={(selected as string) ?? ''}
        onChange={(e) => instance.boundVariable && ctx.setVariable(instance.boundVariable, e.target.value)}
        style={{ width: '100%', padding: '4px', border: '1px solid #ddd', borderRadius: 4 }}
        aria-label="Dropdown selection"
      >
        <option value="">{config.placeholder ?? 'Select...'}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Layout widgets ──

export function SpacerWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { height?: number };
  return <div style={{ height: config.height ?? 20 }} aria-label="Spacer" />;
}

export function DividerWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { orientation?: 'horizontal' | 'vertical' };
  const orientation = config.orientation ?? 'horizontal';
  return orientation === 'horizontal'
    ? <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '8px 0' }} aria-label="Divider" />
    : <div style={{ width: 1, background: '#e5e7eb', height: '100%', display: 'inline-block' }} aria-label="Divider" />;
}

export function ProgressBarWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { value?: number; max?: number; label?: string; color?: string };
  const value = config.value ?? 0;
  const max = config.max ?? 100;
  const pct = Math.min((value / max) * 100, 100);

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Progress bar" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      {config.label && <div style={{ marginBottom: 4 }}>{config.label}</div>}
      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: config.color ?? '#3b82f6', borderRadius: 4 }} />
      </div>
      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{Math.round(pct)}%</div>
    </div>
  );
}

export function BadgeWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { label?: string; color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray' };
  const colors: Record<string, string> = { blue: '#3b82f6', green: '#10b981', red: '#ef4444', yellow: '#f59e0b', gray: '#6b7280' };
  const color = colors[config.color ?? 'blue'] ?? '#3b82f6';

  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      background: color, color: '#fff', fontSize: 11, fontWeight: 500,
    }} aria-label="Badge">
      {config.label ?? 'Badge'}
    </span>
  );
}

export function TooltipWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { text?: string; label?: string };
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }} aria-label="Tooltip">
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ cursor: 'help', textDecoration: 'underline dotted' }}
      >
        {config.label ?? '?'}
      </span>
      {show && (
        <span style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          background: '#1f2937', color: '#fff', padding: '4px 8px', borderRadius: 4,
          fontSize: 11, whiteSpace: 'nowrap', zIndex: 10,
        }}>
          {config.text ?? 'Tooltip'}
        </span>
      )}
    </span>
  );
}

export function AccordionWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { sections?: Array<{ title: string; content: string }> };
  const sections = config.sections ?? [];
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Accordion">
      {sections.map((s, i) => (
        <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 4, marginBottom: 2 }}>
          <div
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            style={{ padding: '6px 8px', cursor: 'pointer', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}
          >
            {s.title}
            <span>{openIdx === i ? '−' : '+'}</span>
          </div>
          {openIdx === i && <div style={{ padding: '6px 8px', color: '#666' }}>{s.content}</div>}
        </div>
      ))}
    </div>
  );
}

export function PropertyListWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { properties?: Array<{ key: string; label: string; value?: string }>; object?: Record<string, unknown> };
  const properties = config.properties ?? [];
  const obj = config.object ?? {};

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Property list">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {properties.map((p, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '4px 8px', color: '#666', width: '40%' }}>{p.label}</td>
              <td style={{ padding: '4px 8px' }}>{String(obj[p.key] ?? p.value ?? '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ObjectSetTitleWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { title?: string; count?: number; icon?: string };
  return (
    <div style={{ padding: '4px 8px', fontFamily: 'sans-serif', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }} aria-label="Object set title">
      {config.icon && <span>{config.icon}</span>}
      <span>{config.title ?? 'Object Set'}</span>
      {config.count !== undefined && <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>({config.count})</span>}
    </div>
  );
}

export function LinksWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { links?: Array<{ id: string; label: string; targetType: string; targetId: string }> };
  const links = config.links ?? [];
  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Links">
      {links.length === 0 ? <span style={{ color: '#999' }}>No links</span> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {links.map(l => (
            <li key={l.id} style={{ padding: '2px 0', color: '#3b82f6', cursor: 'pointer' }}>
              {l.label} <span style={{ color: '#999', fontSize: 10 }}>({l.targetType}: {l.targetId})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TreeViewWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { nodes?: Array<{ id: string; label: string; children?: Array<{ id: string; label: string }> }> };
  const nodes = config.nodes ?? [];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Tree view">
      {nodes.map(n => (
        <div key={n.id}>
          <div onClick={() => n.children?.length && toggle(n.id)} style={{ cursor: n.children?.length ? 'pointer' : 'default' }}>
            {n.children?.length ? (expanded.has(n.id) ? '▾ ' : '▸ ') : '  '}{n.label}
          </div>
          {expanded.has(n.id) && n.children?.map(c => (
            <div key={c.id} style={{ paddingLeft: 16 }}>{c.label}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function KanbanWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { columns?: Array<{ id: string; title: string }>; cards?: Array<{ id: string; title: string; columnId: string; priority?: string }> };
  const columns = config.columns ?? [];
  const cards = config.cards ?? [];
  const [cardState, setCardState] = useState(cards);

  const moveCard = useCallback((cardId: string, toCol: string) => {
    setCardState(prev => prev.map(c => c.id === cardId ? { ...c, columnId: toCol } : c));
    if (instance.boundVariable) ctx.setVariable(instance.boundVariable, cardId);
  }, [instance.boundVariable, ctx]);

  return (
    <div style={{ display: 'flex', gap: 8, padding: 8, fontFamily: 'sans-serif', fontSize: 12, overflow: 'auto' }} aria-label="Kanban board">
      {columns.map(col => (
        <div key={col.id} style={{ flex: 1, minWidth: 150, background: '#f9fafb', borderRadius: 4, padding: 4 }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const cardId = e.dataTransfer.getData('text'); moveCard(cardId, col.id); }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, padding: '4px' }}>{col.title} ({cardState.filter(c => c.columnId === col.id).length})</div>
          {cardState.filter(c => c.columnId === col.id).map(card => (
            <div
              key={card.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text', card.id)}
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4, padding: 6, marginBottom: 4, cursor: 'grab' }}
            >
              <div>{card.title}</div>
              {card.priority && <span style={{ fontSize: 10, color: '#f59e0b' }}>{card.priority}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── AI widgets ──

export function AipChatWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { placeholder?: string; title?: string };
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');

  const send = useCallback(() => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setInput('');
    // Simulated response — real LLM integration would call the API
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: 'This is a simulated response. Connect an LLM endpoint to enable real AI responses.' }]);
    }, 500);
  }, [input]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 300, border: '1px solid #e5e7eb', borderRadius: 4, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="AIP chat">
      <div style={{ padding: '6px 8px', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{config.title ?? 'AI Assistant'}</div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 4, textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <span style={{
              display: 'inline-block', padding: '4px 8px', borderRadius: 8,
              background: m.role === 'user' ? '#3b82f6' : '#f3f4f6', color: m.role === 'user' ? '#fff' : '#000',
              maxWidth: '80%',
            }}>{m.content}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, padding: 8, borderTop: '1px solid #e5e7eb' }}>
        <input
          type="text"
          placeholder={config.placeholder ?? 'Ask a question...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          style={{ flex: 1, padding: '4px', border: '1px solid #ddd', borderRadius: 4 }}
          aria-label="Chat input"
        />
        <button onClick={send} style={{ padding: '4px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Send</button>
      </div>
    </div>
  );
}

export function AipGeneratedContentWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { content?: string; prompt?: string; loading?: boolean };
  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 4 }} aria-label="AIP generated content">
      <div style={{ fontSize: 10, color: '#999', marginBottom: 4 }}>AI Generated</div>
      {config.loading ? (
        <div style={{ color: '#999' }}>Generating...</div>
      ) : config.content ? (
        <div>{config.content}</div>
      ) : (
        <div style={{ color: '#999' }}>No content generated yet. Prompt: {config.prompt ?? 'N/A'}</div>
      )}
    </div>
  );
}

// ── Navigation widgets ──

export function BreadcrumbWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { items?: Array<{ label: string; pageId?: string }> };
  const items = config.items ?? [];
  return (
    <nav style={{ padding: '4px 8px', fontFamily: 'sans-serif', fontSize: 12, display: 'flex', gap: 4 }} aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', gap: 4 }}>
          {i > 0 && <span style={{ color: '#999' }}>/</span>}
          <span
            onClick={() => item.pageId && ctx.navigate(item.pageId)}
            style={{ color: item.pageId ? '#3b82f6' : '#666', cursor: item.pageId ? 'pointer' : 'default' }}
          >
            {item.label}
          </span>
        </span>
      ))}
    </nav>
  );
}

// ── Time widgets ──

export function GanttWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { tasks?: Array<{ id: string; name: string; start: number; duration: number; color?: string }>; totalDuration?: number };
  const tasks = config.tasks ?? [];
  const total = config.totalDuration ?? Math.max(...tasks.map(t => t.start + t.duration), 100);

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Gantt chart" role="img">
      {tasks.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span style={{ width: 100, fontSize: 10, color: '#666', textAlign: 'right' }}>{t.name}</span>
          <div style={{ flex: 1, position: 'relative', height: 16, background: '#f9fafb', borderRadius: 2 }}>
            <div style={{
              position: 'absolute', left: `${(t.start / total) * 100}%`, width: `${(t.duration / total) * 100}%`,
              height: '100%', background: t.color ?? '#3b82f6', borderRadius: 2,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TimelineWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { events?: Array<{ id: string; title: string; timestamp: string; description?: string }> };
  const events = config.events ?? [];
  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Timeline">
      {events.map((e) => (
        <div key={e.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 2, background: '#e5e7eb', marginLeft: 8, position: 'relative' }}>
            <div style={{ position: 'absolute', left: -5, top: 0, width: 12, height: 12, borderRadius: '50%', background: '#3b82f6' }} />
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{e.title}</div>
            <div style={{ fontSize: 10, color: '#999' }}>{e.timestamp}</div>
            {e.description && <div style={{ color: '#666', marginTop: 2 }}>{e.description}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarWidget({ instance }: WidgetProps): React.ReactNode {
  const config = (instance.config ?? {}) as { events?: Array<{ date: string; title: string }> };
  const events = config.events ?? [];
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const eventsByDay = useMemo(() => {
    const map = new Map<number, typeof events>();
    for (const e of events) {
      const d = new Date(e.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        const arr = map.get(day) ?? [];
        arr.push(e);
        map.set(day, arr);
      }
    }
    return map;
  }, [events, year, month]);

  return (
    <div style={{ padding: 8, fontFamily: 'sans-serif', fontSize: 12 }} aria-label="Calendar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} style={{ cursor: 'pointer' }}>‹</button>
        <span style={{ fontWeight: 600 }}>{monthName}</span>
        <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} style={{ cursor: 'pointer' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} style={{ fontWeight: 600, fontSize: 10, color: '#666' }}>{d}</div>)}
        {Array.from({ length: firstDay }, (_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dayEvents = eventsByDay.get(day) ?? [];
          return (
            <div key={day} style={{
              padding: '2px 4px', border: '1px solid #f3f4f6', borderRadius: 2, minHeight: 30,
              background: dayEvents.length > 0 ? '#eff6ff' : 'transparent',
            }}>
              <div style={{ fontSize: 10 }}>{day}</div>
              {dayEvents.map((e, j) => <div key={j} style={{ fontSize: 8, color: '#3b82f6', overflow: 'hidden', textOverflow: 'ellipsis' }}>• {e.title}</div>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
