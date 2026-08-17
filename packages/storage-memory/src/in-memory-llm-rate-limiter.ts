/**
 * In-memory LLM rate limiter — sliding window per tenant.
 */

import type { RateLimitConfig, RateLimitResult, LLMRateLimiter } from '@altius/spi';
import { DEFAULT_RATE_LIMIT } from '@altius/spi';

interface WindowEntry {
  timestamp: number;
  tokens: number;
}

export class InMemoryLLMRateLimiter implements LLMRateLimiter {
  private readonly configs = new Map<string, RateLimitConfig>();
  private readonly minuteWindows = new Map<string, WindowEntry[]>();
  private readonly dayWindows = new Map<string, WindowEntry[]>();

  async check(tenantId: string, estimatedTokens: number): Promise<RateLimitResult> {
    const config = await this.getConfig(tenantId);
    const now = Date.now();
    const minuteAgo = now - 60_000;
    const dayAgo = now - 86_400_000;

    const minuteEntries = (this.minuteWindows.get(tenantId) ?? []).filter(e => e.timestamp > minuteAgo);
    const dayEntries = (this.dayWindows.get(tenantId) ?? []).filter(e => e.timestamp > dayAgo);

    const currentRequestsPerMinute = minuteEntries.length;
    const currentTokensPerMinute = minuteEntries.reduce((s, e) => s + e.tokens, 0);
    const currentRequestsPerDay = dayEntries.length;
    const currentTokensPerDay = dayEntries.reduce((s, e) => s + e.tokens, 0);

    if (currentRequestsPerMinute >= config.requestsPerMinute) {
      return { allowed: false, reason: 'Rate limit: requests per minute exceeded', currentRequestsPerMinute, currentTokensPerMinute };
    }
    if (currentTokensPerMinute + estimatedTokens > config.tokensPerMinute) {
      return { allowed: false, reason: 'Rate limit: tokens per minute exceeded', currentRequestsPerMinute, currentTokensPerMinute };
    }
    if (currentRequestsPerDay >= config.requestsPerDay) {
      return { allowed: false, reason: 'Rate limit: requests per day exceeded', currentRequestsPerMinute, currentTokensPerMinute };
    }
    if (currentTokensPerDay + estimatedTokens > config.tokensPerDay) {
      return { allowed: false, reason: 'Rate limit: tokens per day exceeded', currentRequestsPerMinute, currentTokensPerMinute };
    }

    return { allowed: true, currentRequestsPerMinute, currentTokensPerMinute };
  }

  async recordUsage(tenantId: string, tokens: number): Promise<void> {
    const now = Date.now();
    const entry: WindowEntry = { timestamp: now, tokens };

    const minuteEntries = this.minuteWindows.get(tenantId) ?? [];
    minuteEntries.push(entry);
    this.minuteWindows.set(tenantId, minuteEntries);

    const dayEntries = this.dayWindows.get(tenantId) ?? [];
    dayEntries.push(entry);
    this.dayWindows.set(tenantId, dayEntries);
  }

  async getConfig(tenantId: string): Promise<RateLimitConfig> {
    return this.configs.get(tenantId) ?? DEFAULT_RATE_LIMIT;
  }

  async setConfig(tenantId: string, config: RateLimitConfig): Promise<void> {
    this.configs.set(tenantId, config);
  }
}
