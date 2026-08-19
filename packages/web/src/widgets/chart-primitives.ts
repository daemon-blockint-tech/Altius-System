/**
 * SVG chart primitives — scales, axes, and helpers for building
 * chart widgets without a charting library dependency.
 *
 * All charts render as inline SVG so they are responsive, styleable
 * via CSS, and have zero runtime dependencies beyond React.
 */

// ── Scales ─────────────────────────────────────────────────────

/** Linear scale: maps a domain [dMin, dMax] to a range [rMin, rMax]. */
export function linearScale(dMin: number, dMax: number, rMin: number, rMax: number): (v: number) => number {
  const dSpan = dMax - dMin || 1;
  const rSpan = rMax - rMin;
  return (v: number) => rMin + ((v - dMin) / dSpan) * rSpan;
}

/** Band scale: maps discrete categories to evenly-spaced bands. */
export function bandScale(categories: string[], rMin: number, rMax: number, padding = 0.1): {
  band: (cat: string) => number;
  bandwidth: number;
} {
  const rSpan = rMax - rMin;
  const n = categories.length || 1;
  const bandwidth = rSpan / n * (1 - padding);
  const step = rSpan / n;
  const band = (cat: string) => {
    const i = categories.indexOf(cat);
    return rMin + (i < 0 ? 0 : i) * step + step * padding / 2;
  };
  return { band, bandwidth };
}

/** Time scale: maps Date domain to a linear range. */
export function timeScale(dMin: Date, dMax: Date, rMin: number, rMax: number): (v: Date) => number {
  const dMinMs = dMin.getTime();
  const dMaxMs = dMax.getTime();
  const scale = linearScale(dMinMs, dMaxMs, rMin, rMax);
  return (v: Date) => scale(v.getTime());
}

// ── Domain helpers ─────────────────────────────────────────────

/** Compute the extent [min, max] of an array of numbers. */
export function extent(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Nice tick values for a linear axis. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const step = niceNumber(span / count);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}

function niceNumber(value: number): number {
  const exp = Math.floor(Math.log10(value));
  const frac = value / Math.pow(10, exp);
  let nice: number;
  if (frac < 1.5) nice = 1;
  else if (frac < 3) nice = 2;
  else if (frac < 7) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}

// ── Formatting ─────────────────────────────────────────────────

/** Format a number for axis labels. */
export function formatTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  if (Math.abs(v) < 0.01 && v !== 0) return v.toExponential(1);
  return v.toFixed(Math.abs(v) < 1 ? 2 : 0);
}

/** Format a Date for axis labels depending on the time span. */
export function formatDateTick(d: Date, span: 'date' | 'datetime' | 'time'): string {
  if (span === 'time') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (span === 'datetime') return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Path helpers ───────────────────────────────────────────────

/** Build an SVG path string for a line through points. */
export function linePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

/** Build an SVG path string for a closed area (line + baseline). */
export function areaPath(points: Array<{ x: number; y: number }>, baseline: number): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return [
    `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`,
    ...points.slice(1).map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
    `L ${last.x.toFixed(2)} ${baseline.toFixed(2)}`,
    `L ${first.x.toFixed(2)} ${baseline.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/** Build an SVG arc path for a pie slice. */
export function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

// ── Color palette ──────────────────────────────────────────────

export const CHART_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
  '#0d9488', '#be185d', '#a16207', '#1e40af', '#15803d',
];

export function colorFor(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length] ?? CHART_COLORS[0]!;
}
