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
 *
 * Fallback: when `LLM_FALLBACK_PROVIDER` is set, the primary and fallback
 * clients are wrapped in a `FallbackLLMClient` — the primary serves every
 * call, and the fallback takes over on a transient error (429, 5xx, network).
 * This lets a deployment point at a primary gateway (e.g. Daemon Protocol)
 * and fall back to a public provider (e.g. OpenRouter) when the primary is
 * unavailable, without the caller knowing which one served the response.
 *
 * Embedding split: when `LLM_EMBEDDING_PROVIDER` is set, a separate client is
 * built for `embed()` only. The completion chain (primary + fallback) handles
 * `complete()`/`stream()`; the embedding client handles `embed()`. This is for
 * deployments whose completion provider has no embeddings endpoint (e.g.
 * Daemon Protocol, Anthropic) but still want vector search via a different
 * provider (e.g. OpenRouter). The two are combined in a `CompositeLLMClient`.
 */

import type { LLMClient } from '@altius/spi';

import { NoOpLLMClient } from './noop-llm-client.js';
import { AnthropicLLMClient } from './anthropic-llm-client.js';
import { OpenAICompatibleLLMClient } from './openai-compatible-llm-client.js';
import { FallbackLLMClient } from './fallback-llm-client.js';
import { CompositeLLMClient } from './composite-llm-client.js';

export type LLMEnv = Record<string, string | undefined>;

export function createLLMClient(env: LLMEnv = process.env): LLMClient {
  const provider = (env['LLM_PROVIDER'] ?? '').trim().toLowerCase();
  const fallbackProvider = (env['LLM_FALLBACK_PROVIDER'] ?? '').trim().toLowerCase();
  const embeddingProvider = (env['LLM_EMBEDDING_PROVIDER'] ?? '').trim().toLowerCase();

  // ── Build the completion chain (primary + fallback) ──
  let completion: LLMClient;

  // No provider at all → no-op. A platform with no LLM must still boot.
  if (!provider || provider === 'none') {
    if (!fallbackProvider || fallbackProvider === 'none') {
      completion = new NoOpLLMClient();
    } else {
      // Primary is no-op but a fallback is configured — the fallback is the
      // real client. The FallbackLLMClient treats "not configured" as transient,
      // so every call goes straight to the fallback.
      const fallback = buildClient(fallbackProvider, env, 'FALLBACK');
      completion = new FallbackLLMClient({ primary: new NoOpLLMClient(), fallback });
    }
  } else {
    const primary = buildClient(provider, env, 'PRIMARY');
    if (!fallbackProvider || fallbackProvider === 'none') {
      completion = primary;
    } else {
      const fallback = buildClient(fallbackProvider, env, 'FALLBACK');
      completion = new FallbackLLMClient({
        primary,
        fallback,
        onPrimaryFailure: env['LLM_FALLBACK_LOG'] === 'true'
          ? (err, method) => console.warn(`[llm] primary failed on ${method}, falling back:`, err instanceof Error ? err.message : err)
          : undefined,
      });
    }
  }

  // ── Build the embedding client (separate provider) ──
  if (!embeddingProvider || embeddingProvider === 'none') {
    // No separate embedding provider — the completion chain handles embed()
    // too. This is the original behaviour: a single client for everything.
    return completion;
  }

  const embedding = buildClient(embeddingProvider, env, 'EMBEDDING');
  return new CompositeLLMClient({ completion, embedding });
}

/**
 * Build a single provider client from the environment.
 *
 * The `prefix` distinguishes primary, fallback, and embedding env vars so a
 * deployment can configure each independently:
 *   - PRIMARY:   LLM_PROVIDER, LLM_DAEMON_API_KEY, ...
 *   - FALLBACK:  LLM_FALLBACK_PROVIDER, LLM_FALLBACK_ANTHROPIC_API_KEY, ...
 *   - EMBEDDING: LLM_EMBEDDING_PROVIDER, LLM_EMBEDDING_OPENROUTER_API_KEY, ...
 *
 * For the OpenAI-compatible providers (daemon, openrouter, openai), the
 * provider-specific env vars (LLM_DAEMON_API_KEY, LLM_OPENROUTER_API_KEY) are
 * read first, then the generic prefixed vars (LLM_FALLBACK_API_KEY,
 * LLM_EMBEDDING_API_KEY), then the unprefixed shared vars (LLM_API_KEY). This
 * lets a deployment set one key for all roles or separate keys per role.
 */
function buildClient(
  provider: string,
  env: LLMEnv,
  prefix: 'PRIMARY' | 'FALLBACK' | 'EMBEDDING',
): LLMClient {
  const p = prefix === 'FALLBACK' ? 'LLM_FALLBACK_' : prefix === 'EMBEDDING' ? 'LLM_EMBEDDING_' : 'LLM_';

  const timeoutRaw = env[`${p}TIMEOUT_MS`]?.trim() ?? env['LLM_TIMEOUT_MS']?.trim();
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error(`LLM_TIMEOUT_MS must be a positive number, got "${timeoutRaw}"`);
  }

  const label = prefix === 'FALLBACK' ? 'LLM_FALLBACK_PROVIDER' : prefix === 'EMBEDDING' ? 'LLM_EMBEDDING_PROVIDER' : 'LLM_PROVIDER';

  switch (provider) {
    case 'anthropic': {
      const apiKey = env[`${p}ANTHROPIC_API_KEY`]?.trim() ?? env['ANTHROPIC_API_KEY']?.trim();
      if (!apiKey) {
        throw new Error(
          `${label}=anthropic requires ANTHROPIC_API_KEY. ` +
            'Unset it to run without an LLM provider.',
        );
      }
      return new AnthropicLLMClient({
        apiKey,
        ...(env[`${p}BASE_URL`]?.trim() ?? env['LLM_BASE_URL']?.trim()
          ? { baseUrl: (env[`${p}BASE_URL`]?.trim() ?? env['LLM_BASE_URL']!.trim())! }
          : {}),
        ...(env[`${p}MODEL`]?.trim() ?? env['LLM_MODEL']?.trim()
          ? { defaultModel: (env[`${p}MODEL`]?.trim() ?? env['LLM_MODEL']!.trim())! }
          : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
    }

    case 'daemon': {
      const apiKey = (env['LLM_DAEMON_API_KEY'] ?? env[`${p}API_KEY`])?.trim();
      if (!apiKey) {
        throw new Error(
          `${label}=daemon requires LLM_DAEMON_API_KEY. ` +
            'Set it to the Daemon Protocol API key.',
        );
      }
      const baseUrl = (env['LLM_DAEMON_BASE_URL'] ?? 'https://llm.daemonprotocol.com/v1').trim();
      const defaultModel = (env['LLM_DAEMON_MODEL'] ?? 'oc/deepseek-v4-flash-free').trim();
      const defaultEmbeddingModel = (env['LLM_DAEMON_EMBEDDING_MODEL'] ?? env[`${p}EMBEDDING_MODEL`])?.trim();
      return new OpenAICompatibleLLMClient({
        apiKey,
        baseUrl,
        defaultModel,
        ...(defaultEmbeddingModel ? { defaultEmbeddingModel } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
    }

    case 'openrouter': {
      const apiKey = (env['LLM_OPENROUTER_API_KEY'] ?? env[`${p}API_KEY`])?.trim();
      if (!apiKey) {
        throw new Error(
          `${label}=openrouter requires LLM_OPENROUTER_API_KEY. ` +
            'Set it to your OpenRouter API key.',
        );
      }
      const baseUrl = (env['LLM_OPENROUTER_BASE_URL'] ?? 'https://openrouter.ai/api/v1').trim();
      const defaultModel = (env['LLM_OPENROUTER_MODEL'] ?? 'deepseek/deepseek-v4-flash').trim();
      const defaultEmbeddingModel = (env['LLM_OPENROUTER_EMBEDDING_MODEL'] ?? env[`${p}EMBEDDING_MODEL`])?.trim();
      // OpenRouter recommends these headers for attribution; they are optional.
      const extraHeaders: Record<string, string> = {};
      if (env['LLM_OPENROUTER_REFERER']?.trim()) {
        extraHeaders['HTTP-Referer'] = env['LLM_OPENROUTER_REFERER']!.trim();
      }
      if (env['LLM_OPENROUTER_TITLE']?.trim()) {
        extraHeaders['X-Title'] = env['LLM_OPENROUTER_TITLE']!.trim();
      }
      return new OpenAICompatibleLLMClient({
        apiKey,
        baseUrl,
        defaultModel,
        ...(defaultEmbeddingModel ? { defaultEmbeddingModel } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(Object.keys(extraHeaders).length > 0 ? { extraHeaders } : {}),
      });
    }

    case 'openai': {
      const apiKey = (env['LLM_OPENAI_API_KEY'] ?? env['OPENAI_API_KEY'] ?? env[`${p}API_KEY`])?.trim();
      if (!apiKey) {
        throw new Error(
          `${label}=openai requires LLM_OPENAI_API_KEY or OPENAI_API_KEY. ` +
            'Set it to your OpenAI API key.',
        );
      }
      const baseUrl = (env['LLM_OPENAI_BASE_URL'] ?? env[`${p}BASE_URL`] ?? 'https://api.openai.com/v1').trim();
      const defaultModel = (env['LLM_OPENAI_MODEL'] ?? 'gpt-4o').trim();
      const defaultEmbeddingModel = (env['LLM_OPENAI_EMBEDDING_MODEL'] ?? 'text-embedding-3-small').trim();
      return new OpenAICompatibleLLMClient({
        apiKey,
        baseUrl,
        defaultModel,
        defaultEmbeddingModel,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
    }

    default:
      throw new Error(
        `Unknown ${label} "${provider}". Supported: anthropic, daemon, openrouter, openai. ` +
          'Unset it to run without a provider.',
      );
  }
}
