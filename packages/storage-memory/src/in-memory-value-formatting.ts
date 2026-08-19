/**
 * In-memory value and conditional formatting service.
 */

import type {
  ValueFormattingService,
  FormatValueInput,
  FormattedValue,
  FormatCollectionInput,
  FormatCollectionResult,
  ConditionalFormatRule,
  RequestContext,
} from '@altius/spi';

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function formatSparkline(values: unknown[]): string {
  const nums = values.map(asNumber).filter((n): n is number => n !== undefined);
  if (nums.length === 0) return '—';
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  return nums.map(n => {
    const h = Math.round(((n - min) / range) * 7);
    return '▁▂▃▄▅▆▇█'[h];
  }).join('');
}

export class InMemoryValueFormattingService implements ValueFormattingService {
  async formatValue(_ctx: RequestContext, input: FormatValueInput): Promise<FormattedValue> {
    const { value, rule, conditionalRules } = input;
    const num = asNumber(value);
    const matched = conditionalRules ? await this.matchConditional(value, conditionalRules) : undefined;

    let text: string;
    switch (rule.kind) {
      case 'number':
        text = num !== undefined ? num.toFixed((rule.params?.precision as number | undefined) ?? 0) : String(value);
        break;
      case 'currency':
        text = num !== undefined
          ? new Intl.NumberFormat((rule.params?.locale as string | undefined) ?? 'en-US', {
              style: 'currency',
              currency: (rule.params?.currency as string | undefined) ?? 'USD',
            }).format(num)
          : String(value);
        break;
      case 'percent':
        text = num !== undefined ? `${(num * 100).toFixed((rule.params?.precision as number | undefined) ?? 1)}%` : String(value);
        break;
      case 'date':
        text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
        break;
      case 'datetime':
        text = value instanceof Date ? value.toISOString() : String(value);
        break;
      case 'duration':
        text = num !== undefined ? `${num} ${(rule.params?.unit as string | undefined) ?? 'ms'}` : String(value);
        break;
      case 'sparkline':
        text = Array.isArray(value) ? formatSparkline(value) : String(value);
        break;
      case 'markdown':
      case 'text':
      default:
        text = String(value ?? '');
    }

    return {
      raw: value,
      text,
      kind: rule.kind,
      appliedRule: matched,
      style: matched?.style,
    };
  }

  async formatCollection(_ctx: RequestContext, input: FormatCollectionInput): Promise<FormatCollectionResult> {
    const values: FormattedValue[] = [];
    for (const obj of input.objects) {
      const value = obj[input.field];
      const fv = await this.formatValue(_ctx, { value, rule: input.rule, conditionalRules: input.conditionalRules });
      values.push(fv);
    }
    return { objectType: input.objectType, field: input.field, values };
  }

  async evaluateConditional(_ctx: RequestContext, value: unknown, rule: ConditionalFormatRule): Promise<boolean> {
    const rules = [rule];
    const matched = await this.matchConditional(value, rules);
    return matched === rule;
  }

  private async matchConditional(value: unknown, rules: ConditionalFormatRule[]): Promise<ConditionalFormatRule | undefined> {
    for (const rule of rules) {
      const matched = await this.testRule(value, rule);
      if (matched) return rule;
    }
    return undefined;
  }

  private async testRule(value: unknown, rule: ConditionalFormatRule): Promise<boolean> {
    const num = asNumber(value);
    const rhs = asNumber(rule.value) ?? rule.value;
    switch (rule.operator) {
      case 'eq': return value === rule.value;
      case 'ne': return value !== rule.value;
      case 'gt': return num !== undefined && typeof rhs === 'number' ? num > rhs : false;
      case 'gte': return num !== undefined && typeof rhs === 'number' ? num >= rhs : false;
      case 'lt': return num !== undefined && typeof rhs === 'number' ? num < rhs : false;
      case 'lte': return num !== undefined && typeof rhs === 'number' ? num <= rhs : false;
      case 'in': return Array.isArray(rule.value) ? rule.value.includes(value) : false;
      case 'between':
        if (num === undefined || rule.value === undefined || rule.valueTo === undefined) return false;
        const lo = asNumber(rule.value) ?? Number.NEGATIVE_INFINITY;
        const hi = asNumber(rule.valueTo) ?? Number.POSITIVE_INFINITY;
        return num >= lo && num <= hi;
      case 'contains':
        return typeof value === 'string' && typeof rule.value === 'string' ? value.includes(rule.value) : false;
      default: return false;
    }
  }
}
