/**
 * In-memory value and conditional formatting service.
 */

import { randomUUID } from 'node:crypto';
import type {
  ValueFormattingService,
  ValueFormat,
  CreateValueFormatInput,
  ConditionalFormatRule,
  CreateConditionalFormatInput,
  SparklineConfig,
  CreateSparklineInput,
  FormattedValue,
  ConditionalStyle,
  RequestContext,
} from '@altius/spi';

export class InMemoryValueFormattingService implements ValueFormattingService {
  private readonly valueFormats = new Map<string, Map<string, ValueFormat>>();
  private readonly conditionalFormats = new Map<string, Map<string, ConditionalFormatRule>>();
  private readonly sparklines = new Map<string, Map<string, SparklineConfig>>();

  async createValueFormat(ctx: RequestContext, input: CreateValueFormatInput): Promise<ValueFormat> {
    const id = randomUUID();
    const fmt: ValueFormat = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      kind: input.kind,
      objectType: input.objectType, field: input.field,
      params: input.params,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getVFMap(ctx.tenantId).set(id, fmt);
    return fmt;
  }

  async getValueFormat(ctx: RequestContext, id: string): Promise<ValueFormat | null> {
    return this.valueFormats.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listValueFormats(ctx: RequestContext, objectType?: string, field?: string): Promise<ValueFormat[]> {
    const m = this.valueFormats.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (objectType) list = list.filter(f => f.objectType === objectType || f.objectType === undefined);
    if (field) list = list.filter(f => f.field === field || f.field === undefined);
    return list;
  }

  async updateValueFormat(ctx: RequestContext, id: string, updates: Partial<CreateValueFormatInput>): Promise<ValueFormat> {
    const fmt = this.valueFormats.get(ctx.tenantId)?.get(id);
    if (!fmt) throw new Error(`Value format not found: ${id}`);
    const updated: ValueFormat = {
      ...fmt,
      name: updates.name ?? fmt.name,
      description: updates.description ?? fmt.description,
      kind: updates.kind ?? fmt.kind,
      objectType: updates.objectType ?? fmt.objectType,
      field: updates.field ?? fmt.field,
      params: updates.params ?? fmt.params,
    };
    this.getVFMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteValueFormat(ctx: RequestContext, id: string): Promise<void> {
    this.valueFormats.get(ctx.tenantId)?.delete(id);
  }

  async createConditionalFormat(ctx: RequestContext, input: CreateConditionalFormatInput): Promise<ConditionalFormatRule> {
    const id = randomUUID();
    const rule: ConditionalFormatRule = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      objectType: input.objectType, field: input.field,
      conditionKind: input.conditionKind,
      condition: input.condition,
      style: input.style,
      priority: input.priority ?? 100,
      enabled: input.enabled ?? true,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getCFMap(ctx.tenantId).set(id, rule);
    return rule;
  }

  async getConditionalFormat(ctx: RequestContext, id: string): Promise<ConditionalFormatRule | null> {
    return this.conditionalFormats.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listConditionalFormats(ctx: RequestContext, objectType?: string, field?: string): Promise<ConditionalFormatRule[]> {
    const m = this.conditionalFormats.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (objectType) list = list.filter(r => r.objectType === objectType || r.objectType === undefined);
    if (field) list = list.filter(r => r.field === field || r.field === undefined);
    return list.sort((a, b) => a.priority - b.priority);
  }

  async updateConditionalFormat(ctx: RequestContext, id: string, updates: Partial<CreateConditionalFormatInput>): Promise<ConditionalFormatRule> {
    const rule = this.conditionalFormats.get(ctx.tenantId)?.get(id);
    if (!rule) throw new Error(`Conditional format not found: ${id}`);
    const updated: ConditionalFormatRule = {
      ...rule,
      name: updates.name ?? rule.name,
      description: updates.description ?? rule.description,
      objectType: updates.objectType ?? rule.objectType,
      field: updates.field ?? rule.field,
      conditionKind: updates.conditionKind ?? rule.conditionKind,
      condition: updates.condition ?? rule.condition,
      style: updates.style ?? rule.style,
      priority: updates.priority ?? rule.priority,
      enabled: updates.enabled ?? rule.enabled,
    };
    this.getCFMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteConditionalFormat(ctx: RequestContext, id: string): Promise<void> {
    this.conditionalFormats.get(ctx.tenantId)?.delete(id);
  }

  async createSparkline(ctx: RequestContext, input: CreateSparklineInput): Promise<SparklineConfig> {
    const id = randomUUID();
    const config: SparklineConfig = {
      id, tenantId: ctx.tenantId,
      name: input.name,
      objectType: input.objectType,
      field: input.field,
      kind: input.kind,
      width: input.width ?? 80,
      height: input.height ?? 24,
      color: input.color ?? '#2f6b4f',
      fillColor: input.fillColor ?? '#2f6b4f33',
      showMinMax: input.showMinMax ?? false,
      showLastValue: input.showLastValue ?? false,
      lineWidth: input.lineWidth ?? 1.5,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getSLMap(ctx.tenantId).set(id, config);
    return config;
  }

  async getSparkline(ctx: RequestContext, id: string): Promise<SparklineConfig | null> {
    return this.sparklines.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listSparklines(ctx: RequestContext, objectType?: string): Promise<SparklineConfig[]> {
    const m = this.sparklines.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (objectType) list = list.filter(s => s.objectType === objectType || s.objectType === undefined);
    return list;
  }

  async updateSparkline(ctx: RequestContext, id: string, updates: Partial<CreateSparklineInput>): Promise<SparklineConfig> {
    const config = this.sparklines.get(ctx.tenantId)?.get(id);
    if (!config) throw new Error(`Sparkline not found: ${id}`);
    const updated: SparklineConfig = {
      ...config,
      name: updates.name ?? config.name,
      objectType: updates.objectType ?? config.objectType,
      field: updates.field ?? config.field,
      kind: updates.kind ?? config.kind,
      width: updates.width ?? config.width,
      height: updates.height ?? config.height,
      color: updates.color ?? config.color,
      fillColor: updates.fillColor ?? config.fillColor,
      showMinMax: updates.showMinMax ?? config.showMinMax,
      showLastValue: updates.showLastValue ?? config.showLastValue,
      lineWidth: updates.lineWidth ?? config.lineWidth,
    };
    this.getSLMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteSparkline(ctx: RequestContext, id: string): Promise<void> {
    this.sparklines.get(ctx.tenantId)?.delete(id);
  }

  async format(ctx: RequestContext, value: unknown, objectType?: string, field?: string): Promise<FormattedValue> {
    const formats = await this.listValueFormats(ctx, objectType, field);
    // Find the most specific matching format
    const matching = formats.find(f => f.objectType === objectType && f.field === field)
      ?? formats.find(f => f.objectType === objectType && !f.field)
      ?? formats.find(f => !f.objectType && f.field === field)
      ?? formats.find(f => !f.objectType && !f.field);
    let formatted: string;
    if (matching) {
      formatted = this.applyValueFormat(value, matching);
    } else {
      formatted = this.defaultFormat(value);
    }
    const style = await this.evaluateConditions(ctx, value, objectType, field);
    // Check for sparkline config
    const sparklines = await this.listSparklines(ctx, objectType);
    const sparkline = sparklines.find(s => s.field === field);
    return { raw: value, formatted, style: style ?? undefined, sparkline };
  }

  async formatBatch(ctx: RequestContext, values: Array<{ value: unknown; objectType?: string; field?: string }>): Promise<FormattedValue[]> {
    return Promise.all(values.map(v => this.format(ctx, v.value, v.objectType, v.field)));
  }

  async evaluateConditions(ctx: RequestContext, value: unknown, objectType?: string, field?: string): Promise<ConditionalStyle | null> {
    const rules = await this.listConditionalFormats(ctx, objectType, field);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (this.evaluateCondition(value, rule)) return rule.style;
    }
    return null;
  }

  private applyValueFormat(value: unknown, fmt: ValueFormat): string {
    if (value === null || value === undefined) return '';
    const p = fmt.params;
    switch (fmt.kind) {
      case 'number': {
        const n = Number(value);
        const decimals = p.decimals ?? 2;
        const sep = p.thousandsSeparator ?? ',';
        const decSep = p.decimalSeparator ?? '.';
        const fixed = n.toFixed(decimals);
        const [int, dec] = fixed.split('.');
        const intWithSep = int!.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
        return (p.prefix ?? '') + (dec ? intWithSep + decSep + dec : intWithSep) + (p.suffix ?? '');
      }
      case 'currency': {
        const n = Number(value);
        const decimals = p.decimals ?? 2;
        const symbol = p.currencyCode === 'USD' ? '$' : p.currencyCode === 'EUR' ? '€' : p.currencyCode === 'GBP' ? '£' : (p.currencyCode ?? '');
        const formatted = n.toFixed(decimals);
        return p.currencyPosition === 'after' ? `${formatted} ${symbol}` : `${symbol}${formatted}`;
      }
      case 'percent': {
        const n = Number(value);
        const decimals = p.decimals ?? 1;
        return `${(n * 100).toFixed(decimals)}%`;
      }
      case 'date':
      case 'datetime': {
        const d = new Date(value as string);
        if (isNaN(d.getTime())) return String(value);
        if (p.datePattern) {
          // Simple pattern substitution
          return p.datePattern
            .replace('yyyy', String(d.getFullYear()))
            .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
            .replace('dd', String(d.getDate()).padStart(2, '0'))
            .replace('HH', String(d.getHours()).padStart(2, '0'))
            .replace('mm', String(d.getMinutes()).padStart(2, '0'))
            .replace('ss', String(d.getSeconds()).padStart(2, '0'));
        }
        return fmt.kind === 'date' ? d.toISOString().slice(0, 10) : d.toISOString();
      }
      case 'duration': {
        const ms = Number(value);
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (p.durationUnits === 'hms') return `${h}h ${m}m ${sec}s`;
        return `${s}s`;
      }
      case 'bytes': {
        const bytes = Number(value);
        const units = p.binaryUnits ? ['B', 'KiB', 'MiB', 'GiB', 'TiB'] : ['B', 'KB', 'MB', 'GB', 'TB'];
        const base = p.binaryUnits ? 1024 : 1000;
        let i = 0;
        let n = bytes;
        while (n >= base && i < units.length - 1) { n /= base; i++; }
        return `${n.toFixed(2)} ${units[i]}`;
      }
      case 'boolean': {
        return value === true ? (p.trueLabel ?? 'Yes') : (p.falseLabel ?? 'No');
      }
      case 'enum': {
        const key = String(value);
        return p.enumLabels?.[key] ?? key;
      }
      case 'custom': {
        return (p.template ?? '{value}').replace('{value}', String(value));
      }
      default:
        return String(value);
    }
  }

  private defaultFormat(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  }

  private evaluateCondition(value: unknown, rule: ConditionalFormatRule): boolean {
    const c = rule.condition;
    switch (rule.conditionKind) {
      case 'range': {
        const n = Number(value);
        if (isNaN(n)) return false;
        if (c.min !== undefined && n < c.min) return false;
        if (c.max !== undefined && n > c.max) return false;
        return true;
      }
      case 'comparison': {
        const n = Number(value);
        if (isNaN(n)) return false;
        const threshold = Number(c.threshold);
        switch (c.operator) {
          case 'gt': return n > threshold;
          case 'gte': return n >= threshold;
          case 'lt': return n < threshold;
          case 'lte': return n <= threshold;
          case 'eq': return n === threshold;
          case 'neq': return n !== threshold;
          default: return false;
        }
      }
      case 'equals':
        return value === c.value;
      case 'contains':
        return typeof value === 'string' && typeof c.substring === 'string' && value.includes(c.substring);
      case 'regex':
        try { return typeof value === 'string' && typeof c.pattern === 'string' && new RegExp(c.pattern).test(value); } catch { return false; }
      case 'null':
        return value === null || value === undefined;
      case 'not_null':
        return value !== null && value !== undefined;
      case 'in_set':
        return Array.isArray(c.values) && c.values.includes(value);
      case 'expression':
        // In-memory: no expression evaluator; return false
        return false;
      default:
        return false;
    }
  }

  private getVFMap(tenantId: string): Map<string, ValueFormat> {
    let m = this.valueFormats.get(tenantId);
    if (!m) { m = new Map(); this.valueFormats.set(tenantId, m); }
    return m;
  }
  private getCFMap(tenantId: string): Map<string, ConditionalFormatRule> {
    let m = this.conditionalFormats.get(tenantId);
    if (!m) { m = new Map(); this.conditionalFormats.set(tenantId, m); }
    return m;
  }
  private getSLMap(tenantId: string): Map<string, SparklineConfig> {
    let m = this.sparklines.get(tenantId);
    if (!m) { m = new Map(); this.sparklines.set(tenantId, m); }
    return m;
  }
}
