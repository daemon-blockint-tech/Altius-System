/**
 * Shared AIP agent runtime behaviour, so the in-memory and Postgres AgentService
 * implementations produce identical responses — only where the agent record and
 * chat threads are stored differs between them.
 */

import type { RequestContext } from './ontology.js';
import type { LLMClient } from './llm-client.js';
import type { AgentDefinition } from './aip-llm.js';

/**
 * Produce an agent's response to a message. Uses the LLM client when configured;
 * otherwise a deterministic synthetic reply so the platform is usable (and
 * testable) without a provider. Errors from the client fall through to the
 * synthetic reply rather than failing the turn.
 */
export async function generateAgentResponse(
  llmClient: LLMClient | undefined,
  ctx: RequestContext,
  agent: Pick<AgentDefinition, 'name' | 'systemPrompt' | 'modelRid'>,
  message: string,
): Promise<string> {
  if (llmClient?.isConfigured()) {
    try {
      const result = await llmClient.complete(ctx, message, {
        model: agent.modelRid,
        systemPrompt: agent.systemPrompt,
      });
      return result.text;
    } catch {
      // fall through to synthetic response
    }
  }
  return `${agent.name} says: I received "${message}". ${agent.systemPrompt}`;
}
