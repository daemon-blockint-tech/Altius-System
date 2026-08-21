/**
 * Variable transform execution — one implementation of every step, both providers.
 *
 * A `TransformStep` is a declarative operation — upper, round, formatDate,
 * pickFields, coalesce — and a pipeline is an ordered list of them reduced over
 * an input value. Applying one is a pure function of the step and the value:
 * nothing about it is storage-specific.
 *
 * It lives here rather than in each provider for the same reason the conflict
 * resolver does: **the output is data**. A pipeline is run to produce a value
 * that something downstream then uses, so two providers that disagreed about
 * what `round` or `dateDiff` means would produce different values from the same
 * pipeline and the same input, with neither erring. The disagreement would
 * surface later, in whatever consumed the result.
 *
 * ── Behaviour reproduced verbatim, including the sharp edges ──
 *
 * This is the in-memory implementation moved, not rewritten. Several steps are
 * lenient in ways worth knowing about, and they are matched rather than
 * tightened because tightening them would change what an existing pipeline
 * produces:
 *
 *   - an unrecognised `kind` returns the input unchanged rather than throwing,
 *     so a typo in a step name is a silent no-op
 *   - the string steps coerce with `String(input)`, so `upper` on `null` is
 *     the string "NULL" rather than an error
 *   - the math steps coerce with `as number` and no validation, so `add` on a
 *     non-numeric input yields NaN
 *
 * Changing any of those is a contract change and belongs in its own change,
 * applied to both providers at once.
 */

import type { TransformStep } from './datasets.js';

export function applyTransformStep(step: TransformStep, input: unknown): unknown {
  const { kind, args } = step;
  const a = args as Record<string, unknown>;
  switch (kind) {
    // String operations
    case 'upper': return String(input).toUpperCase();
    case 'lower': return String(input).toLowerCase();
    case 'trim': return String(input).trim();
    case 'substring': {
      const s = String(input);
      const start = (a.start as number) ?? 0;
      const end = a.end as number | undefined;
      return end !== undefined ? s.slice(start, end) : s.slice(start);
    }
    case 'concat': return String(input) + String(a.suffix ?? '');
    case 'replace': return String(input).split(a.from as string).join(a.to as string);
    case 'split': return String(input).split(a.delimiter as string);
    case 'pad': {
      const len = a.length as number;
      const pad = a.pad as string ?? ' ';
      const s = String(input);
      return s.length >= len ? s : (a.side === 'left' ? pad.repeat(len - s.length) + s : s + pad.repeat(len - s.length));
    }
    // Math operations
    case 'add': return (input as number) + (a.value as number);
    case 'subtract': return (input as number) - (a.value as number);
    case 'multiply': return (input as number) * (a.value as number);
    case 'divide': return (input as number) / (a.value as number);
    case 'round': return Math.round(input as number);
    case 'abs': return Math.abs(input as number);
    case 'mod': return (input as number) % (a.value as number);
    case 'power': return Math.pow(input as number, a.value as number);
    // Date operations
    case 'formatDate': return new Date(input as string).toISOString();
    case 'parseDate': return new Date(input as string).getTime();
    case 'dateAdd': {
      const d = new Date(input as string);
      const n = a.amount as number;
      const unit = a.unit as string;
      if (unit === 'days') d.setDate(d.getDate() + n);
      else if (unit === 'hours') d.setHours(d.getHours() + n);
      else if (unit === 'minutes') d.setMinutes(d.getMinutes() + n);
      return d.toISOString();
    }
    case 'dateDiff': {
      const d1 = new Date(input as string).getTime();
      const d2 = new Date(a.other as string).getTime();
      const unit = a.unit as string;
      const ms = d1 - d2;
      if (unit === 'days') return ms / 86400000;
      if (unit === 'hours') return ms / 3600000;
      if (unit === 'minutes') return ms / 60000;
      return ms;
    }
    case 'extractDatePart': {
      const d = new Date(input as string);
      const part = a.part as string;
      if (part === 'year') return d.getFullYear();
      if (part === 'month') return d.getMonth() + 1;
      if (part === 'day') return d.getDate();
      if (part === 'hour') return d.getHours();
      if (part === 'minute') return d.getMinutes();
      return null;
    }
    // Array operations
    case 'arrayLength': return Array.isArray(input) ? input.length : 0;
    case 'arrayJoin': return Array.isArray(input) ? input.join(a.delimiter as string ?? ',') : '';
    case 'arrayMap': {
      if (!Array.isArray(input)) return [];
      const expr = a.expr as string;
      return input.map((v) => {
        if (expr === 'upper') return String(v).toUpperCase();
        if (expr === 'lower') return String(v).toLowerCase();
        if (expr === 'trim') return String(v).trim();
        return v;
      });
    }
    case 'arrayFilter': {
      if (!Array.isArray(input)) return [];
      const op = a.op as string;
      const val = a.value;
      return input.filter(v => {
        if (op === 'eq') return v === val;
        if (op === 'neq') return v !== val;
        if (op === 'gt') return (v as number) > (val as number);
        if (op === 'lt') return (v as number) < (val as number);
        return true;
      });
    }
    case 'arraySort': {
      if (!Array.isArray(input)) return [];
      const dir = a.direction as string ?? 'asc';
      return [...input].sort((x, y) => {
        if (x === y) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return dir === 'asc' ? (x < y ? -1 : 1) : (x > y ? -1 : 1);
      });
    }
    // Object operations
    case 'getField': return (input as Record<string, unknown>)?.[a.field as string];
    case 'setField': return { ...(input as Record<string, unknown>), [a.field as string]: a.value };
    case 'pickFields': {
      const fields = a.fields as string[];
      const obj = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const f of fields) if (f in obj) out[f] = obj[f];
      return out;
    }
    case 'omitFields': {
      const fields = new Set(a.fields as string[]);
      const obj = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) if (!fields.has(k)) out[k] = v;
      return out;
    }
    case 'mergeObjects': return { ...(input as Record<string, unknown>), ...(a.other as Record<string, unknown>) };
    // Type conversions
    case 'toString': return String(input);
    case 'toNumber': return Number(input);
    case 'toBoolean': return Boolean(input);
    case 'toDate': return new Date(input as string).toISOString();
    // Conditional
    case 'ifElse': return input ? a.then : a.else;
    case 'coalesce': return input !== null && input !== undefined ? input : a.value;
    case 'nullIf': return input === a.value ? null : input;
    default: return input;
  }
}
