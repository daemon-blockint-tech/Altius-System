/**
 * In-memory LLM usage tracker.
 */

import type { LLMUsageRecord, UsageQuery, UsageSummary, LLMUsageTracker } from '@altius/spi';

export class InMemoryLLMUsageTracker implements LLMUsageTracker {
  private readonly records: LLMUsageRecord[] = [];

  async record(record: LLMUsageRecord): Promise<void> {
    this.records.push(record);
  }

  async query(query: UsageQuery): Promise<{ records: LLMUsageRecord[]; totalCount: number }> {
    let results = [...this.records];
    if (query.tenantId) results = results.filter(r => r.tenantId === query.tenantId);
    if (query.userId) results = results.filter(r => r.userId === query.userId);
    if (query.model) results = results.filter(r => r.model === query.model);
    if (query.startTime) results = results.filter(r => r.timestamp >= query.startTime!);
    if (query.endTime) results = results.filter(r => r.timestamp <= query.endTime!);

    const totalCount = results.length;
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (query.limit) results = results.slice(0, query.limit);

    return { records: results, totalCount };
  }

  async summarize(tenantId: string, startTime?: string, endTime?: string): Promise<UsageSummary> {
    let records = this.records.filter(r => r.tenantId === tenantId);
    if (startTime) records = records.filter(r => r.timestamp >= startTime!);
    if (endTime) records = records.filter(r => r.timestamp <= endTime!);

    const byModelMap = new Map<string, { requests: number; tokens: number }>();
    const byUserMap = new Map<string, { requests: number; tokens: number }>();

    for (const r of records) {
      const m = byModelMap.get(r.model) ?? { requests: 0, tokens: 0 };
      m.requests++;
      m.tokens += r.totalTokens;
      byModelMap.set(r.model, m);

      const u = byUserMap.get(r.userId) ?? { requests: 0, tokens: 0 };
      u.requests++;
      u.tokens += r.totalTokens;
      byUserMap.set(r.userId, u);
    }

    return {
      totalRequests: records.length,
      totalPromptTokens: records.reduce((s, r) => s + r.promptTokens, 0),
      totalCompletionTokens: records.reduce((s, r) => s + r.completionTokens, 0),
      totalTokens: records.reduce((s, r) => s + r.totalTokens, 0),
      byModel: Array.from(byModelMap.entries()).map(([model, v]) => ({ model, ...v })),
      byUser: Array.from(byUserMap.entries()).map(([userId, v]) => ({ userId, ...v })),
    };
  }

  async getTotalTokens(tenantId: string, startTime?: string, endTime?: string): Promise<number> {
    const summary = await this.summarize(tenantId, startTime, endTime);
    return summary.totalTokens;
  }

  /** Test helper. */
  clear(): void {
    this.records.length = 0;
  }
}
