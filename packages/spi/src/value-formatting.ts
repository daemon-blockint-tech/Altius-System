/**
 * Value and conditional formatting runtime.
 *
 * Provides a service-level runtime for display-friendly rendering rules
 * (number, date, currency, percent, duration, sparkline) and conditional
 * rules (colour badges, thresholds, ranges) that can be declared on
 * `@display` directives or applied ad-hoc at query time.
 */

import type { RequestContext } from './ontology.js';

/** Supported format kinds. */
export type FormatKind =
  | 'text'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'duration'
  | 'sparkline'
  | 'markdown';

/** A single formatting rule. */
export interface FormatRule {
  kind: FormatKind;
  /** Format-specific parameters (e.g. currency code, precision, locale). */
  params?: Record<string, unknown>;
}

/** A conditional formatting rule. */
export interface ConditionalFormatRule {
  /** Human-readable name. */
  name?: string;
  /** Predicate operator. */
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between' | 'contains';
  /** Value or values to compare against. */
  value?: unknown;
  /** Secondary value for `between`. */
  valueTo?: unknown;
  /** Resulting style when matched. */
  style: {
    color?: string;
    backgroundColor?: string;
    icon?: string;
    fontWeight?: 'normal' | 'bold';
  };
}

/** Input for formatting a single value. */
export interface FormatValueInput {
  value: unknown;
  rule: FormatRule;
  conditionalRules?: ConditionalFormatRule[];
}

/** Formatted output for a value. */
export interface FormattedValue {
  raw: unknown;
  text: string;
  kind: FormatKind;
  appliedRule?: ConditionalFormatRule;
  style?: ConditionalFormatRule['style'];
}

/** Input for batch formatting a collection of objects. */
export interface FormatCollectionInput {
  objectType: string;
  field: string;
  objects: Record<string, unknown>[];
  rule: FormatRule;
  conditionalRules?: ConditionalFormatRule[];
}

/** Result for a collection format. */
export interface FormatCollectionResult {
  objectType: string;
  field: string;
  values: FormattedValue[];
}

/**
 * Value formatting service — runtime formatting and conditional rule evaluation.
 */
export interface ValueFormattingService {
  /** Format a single value. */
  formatValue(ctx: RequestContext, input: FormatValueInput): Promise<FormattedValue>;

  /** Format a field across a collection of objects. */
  formatCollection(ctx: RequestContext, input: FormatCollectionInput): Promise<FormatCollectionResult>;

  /** Evaluate a conditional rule against a raw value without formatting it. */
  evaluateConditional(ctx: RequestContext, value: unknown, rule: ConditionalFormatRule): Promise<boolean>;
}
