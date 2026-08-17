/**
 * Select an LLM client from the environment.
 *
 * `NoOpLLMClient`'s error has told operators to "set LLM_PROVIDER and
 * associated credentials" since the surface was built, but nothing read that
 * variable — there was no second implementation for it to select, so the
 * instruction was unfollowable. This is what makes it true.
 *
 * Unset means the no-op, which is the right default: a platform with no LLM
 * configured must boot and answer 503 on the LLM routes, not refuse to start.
 * A provider named but misconfigured is the opposite case and throws — a
 * deployment that asked for Anthropic and got a silent no-op would look
 * healthy and 503 every call, and the operator would have no way to tell that
 * from "not configured yet".
 */

import type { LLMClient } from '@altius/spi';

import { NoOpLLMClient } from './noop-llm-client.js';
import { AnthropicLLMClient } from './anthropic-llm-client.js';

export type LLMEnv = Record<string, string | undefined>;

export function createLLMClient(env: LLMEnv = process.env): LLMClient {
  const provider = (env['LLM_PROVIDER'] ?? '').trim().toLowerCase();
  if (!provider || provider === 'none') return new NoOpLLMClient();

  if (provider === 'anthropic') {
    const apiKey = env['ANTHROPIC_API_KEY']?.trim();
    if (!apiKey) {
      throw new Error(
        'LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY. Unset LLM_PROVIDER ' +
          'to run without an LLM provider.',
      );
    }
    const timeoutRaw = env['LLM_TIMEOUT_MS']?.trim();
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      throw new Error(`LLM_TIMEOUT_MS must be a positive number, got "${timeoutRaw}"`);
    }

    return new AnthropicLLMClient({
      apiKey,
      ...(env['LLM_BASE_URL']?.trim() ? { baseUrl: env['LLM_BASE_URL']!.trim() } : {}),
      ...(env['LLM_MODEL']?.trim() ? { defaultModel: env['LLM_MODEL']!.trim() } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
  }

  throw new Error(
    `Unknown LLM_PROVIDER "${provider}". Supported: anthropic. Unset it to run without a provider.`,
  );
}
