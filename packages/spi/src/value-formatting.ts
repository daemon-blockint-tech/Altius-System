/**
 * Value and conditional formatting metadata.
 *
 * Display-friendly rendering rules for values, numbers, dates, and sparklines.
 * Applied at the presentation layer (UI) without changing underlying data.
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Value formatting
// ===========================================================================

/** Format kind for a value. */
export type ValueFormatKind =
  | 'number'      // decimal places, thousands separator, currency
  | 'currency'    // currency-specific formatting
  | 'percent'     // percentage with decimals
  | 'date'        // date display format
  | 'datetime'    // date+time display format
  | 'duration'    // human-readable duration
  | 'bytes'       // file size (KB/MB/GB)
  | 'boolean'     // true/false display
  | 'enum'        // enum value → display label
  | 'custom';     // custom format string

/** A value format rule — how to render a value for display. */
export interface ValueFormat {
  id: string;
  tenantId: string;
  /** Rule name. */
  name: string;
  description: string;
  /** Format kind. */
  kind: ValueFormatKind;
  /** Object type this applies to (optional, if null applies to all). */
  objectType?: string;
  /** Field this applies to (optional, if null applies to all fields of kind). */
  field?: string;
  /** Format parameters. */
  params: ValueFormatParams;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the rule. */
  createdBy: string;
}

/** Parameters for value formatting. */
export interface ValueFormatParams {
  // Number/currency/percent
  /** Decimal places (default: 2). */
  decimals?: number;
  /** Thousands separator (default: ','). */
  thousandsSeparator?: string;
  /** Decimal separator (default: '.'). */
  decimalSeparator?: string;
  /** Currency code (for currency kind). */
  currencyCode?: string;
  /** Currency symbol position. */
  currencyPosition?: 'before' | 'after';
  // Date/datetime
  /** Date format pattern (e.g. 'yyyy-MM-dd'). */
  datePattern?: string;
  /** Timezone for display. */
  timezone?: string;
  // Duration
  /** Duration units (e.g. 'hms', 'dhms'). */
  durationUnits?: 'hms' | 'dhms' | 'ms';
  // Bytes
  /** Binary vs decimal units. */
  binaryUnits?: boolean;
  // Boolean
  /** Display text for true. */
  trueLabel?: string;
  /** Display text for false. */
  falseLabel?: string;
  // Enum
  /** Enum value → label mapping. */
  enumLabels?: Record<string, string>;
  // Custom
  /** Custom format template (e.g. '{value} units'). */
  template?: string;
  /** Prefix. */
  prefix?: string;
  /** Suffix. */
  suffix?: string;
}

// ===========================================================================
// Conditional formatting
// ===========================================================================

/** A condition kind for conditional formatting. */
export type ConditionKind =
  | 'range'         // value within [min, max]
  | 'comparison'    // value compared to threshold
  | 'equals'        // value equals a target
  | 'contains'      // string contains substring
  | 'regex'         // string matches regex
  | 'null'          // value is null/undefined
  | 'not_null'      // value is not null
  | 'in_set'        // value is in a set
  | 'expression';   // custom boolean expression

/** Comparison operator. */
export type ComparisonOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

/** A conditional formatting rule — applies styling when a condition is met. */
export interface ConditionalFormatRule {
  id: string;
  tenantId: string;
  /** Rule name. */
  name: string;
  description: string;
  /** Object type this applies to. */
  objectType?: string;
  /** Field this applies to. */
  field?: string;
  /** Condition kind. */
  conditionKind: ConditionKind;
  /** Condition parameters. */
  condition: ConditionParams;
  /** Styling to apply when the condition is met. */
  style: ConditionalStyle;
  /** Priority (lower = higher priority). */
  priority: number;
  /** Whether the rule is enabled. */
  enabled: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the rule. */
  createdBy: string;
}

/** Parameters for a conditional format condition. */
export interface ConditionParams {
  /** Min value (for range). */
  min?: number;
  /** Max value (for range). */
  max?: number;
  /** Comparison operator (for comparison). */
  operator?: ComparisonOperator;
  /** Threshold value (for comparison). */
  threshold?: unknown;
  /** Target value (for equals). */
  value?: unknown;
  /** Substring (for contains). */
  substring?: string;
  /** Regex pattern (for regex). */
  pattern?: string;
  /** Value set (for in_set). */
  values?: unknown[];
  /** Expression (for expression). */
  expression?: string;
}

/** Styling applied when a condition is met. */
export interface ConditionalStyle {
  /** Text color (CSS color). */
  textColor?: string;
  /** Background color (CSS color). */
  backgroundColor?: string;
  /** Font weight. */
  fontWeight?: 'normal' | 'bold';
  /** Font style. */
  fontStyle?: 'normal' | 'italic';
  /** Text decoration. */
  textDecoration?: 'none' | 'underline' | 'line-through';
  /** Icon to display. */
  icon?: string;
  /** Badge label. */
  badge?: string;
  /** Whether to hide the value. */
  hidden?: boolean;
}

// ===========================================================================
// Sparkline formatting
// ===========================================================================

/** A sparkline configuration — inline chart for time-series values. */
export interface SparklineConfig {
  id: string;
  tenantId: string;
  /** Rule name. */
  name: string;
  /** Object type this applies to. */
  objectType?: string;
  /** Field holding the time-series data or reference. */
  field: string;
  /** Sparkline kind. */
  kind: 'line' | 'bar' | 'area' | 'column';
  /** Width in pixels. */
  width?: number;
  /** Height in pixels. */
  height?: number;
  /** Color (CSS). */
  color?: string;
  /** Fill color for area/column (CSS). */
  fillColor?: string;
  /** Whether to show min/max markers. */
  showMinMax?: boolean;
  /** Whether to show the last value. */
  showLastValue?: boolean;
  /** Line width. */
  lineWidth?: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the config. */
  createdBy: string;
}

// ===========================================================================
// Formatting service
// ===========================================================================

/** Input for creating a value format. */
export interface CreateValueFormatInput {
  name: string;
  description?: string;
  kind: ValueFormatKind;
  objectType?: string;
  field?: string;
  params: ValueFormatParams;
}

/** Input for creating a conditional format rule. */
export interface CreateConditionalFormatInput {
  name: string;
  description?: string;
  objectType?: string;
  field?: string;
  conditionKind: ConditionKind;
  condition: ConditionParams;
  style: ConditionalStyle;
  priority?: number;
  enabled?: boolean;
}

/** Input for creating a sparkline config. */
export interface CreateSparklineInput {
  name: string;
  objectType?: string;
  field: string;
  kind: SparklineConfig['kind'];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  showMinMax?: boolean;
  showLastValue?: boolean;
  lineWidth?: number;
}

/** Result of applying formatting to a value. */
export interface FormattedValue {
  /** Original raw value. */
  raw: unknown;
  /** Formatted display string. */
  formatted: string;
  /** Applied conditional style (if any). */
  style?: ConditionalStyle;
  /** Sparkline config (if applicable). */
  sparkline?: SparklineConfig;
}

/**
 * Value and conditional formatting service — manages display rendering rules
 * for values, numbers, dates, sparklines, and conditional styling.
 */
export interface ValueFormattingService {
  // ── Value formats ──
  createValueFormat(ctx: RequestContext, input: CreateValueFormatInput): Promise<ValueFormat>;
  getValueFormat(ctx: RequestContext, id: string): Promise<ValueFormat | null>;
  listValueFormats(ctx: RequestContext, objectType?: string, field?: string): Promise<ValueFormat[]>;
  updateValueFormat(ctx: RequestContext, id: string, updates: Partial<CreateValueFormatInput>): Promise<ValueFormat>;
  deleteValueFormat(ctx: RequestContext, id: string): Promise<void>;

  // ── Conditional formats ──
  createConditionalFormat(ctx: RequestContext, input: CreateConditionalFormatInput): Promise<ConditionalFormatRule>;
  getConditionalFormat(ctx: RequestContext, id: string): Promise<ConditionalFormatRule | null>;
  listConditionalFormats(ctx: RequestContext, objectType?: string, field?: string): Promise<ConditionalFormatRule[]>;
  updateConditionalFormat(ctx: RequestContext, id: string, updates: Partial<CreateConditionalFormatInput>): Promise<ConditionalFormatRule>;
  deleteConditionalFormat(ctx: RequestContext, id: string): Promise<void>;

  // ── Sparklines ──
  createSparkline(ctx: RequestContext, input: CreateSparklineInput): Promise<SparklineConfig>;
  getSparkline(ctx: RequestContext, id: string): Promise<SparklineConfig | null>;
  listSparklines(ctx: RequestContext, objectType?: string): Promise<SparklineConfig[]>;
  updateSparkline(ctx: RequestContext, id: string, updates: Partial<CreateSparklineInput>): Promise<SparklineConfig>;
  deleteSparkline(ctx: RequestContext, id: string): Promise<void>;

  // ── Formatting application ──
  /** Format a single value using applicable rules. */
  format(ctx: RequestContext, value: unknown, objectType?: string, field?: string): Promise<FormattedValue>;
  /** Format multiple values. */
  formatBatch(ctx: RequestContext, values: Array<{ value: unknown; objectType?: string; field?: string }>): Promise<FormattedValue[]>;
  /** Evaluate conditional formats for a value and return the matching style. */
  evaluateConditions(ctx: RequestContext, value: unknown, objectType?: string, field?: string): Promise<ConditionalStyle | null>;
}
