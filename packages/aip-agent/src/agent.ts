/**
 * Altius AIP agent — Deep Agents harness over MCP.
 *
 * Connects to an Altius platform instance's MCP endpoint (Streamable HTTP at
 * /mcp) and exposes every ontology tool (search, traverse, action, function)
 * to a Deep Agents reasoning loop. The agent discovers tools at runtime via
 * the MCP tools/list call — no hardcoded tool names.
 *
 * Usage:
 *   ALTIUS_URL=http://localhost:4000 \
 *   ALTIUS_TOKEN=<OIDC JWT or dev-bypass> \
 *   OPENROUTER_API_KEY=<key> \
 *   pnpm --filter @altius/aip-agent dev
 */
import { createDeepAgent } from "deepagents";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { MemorySaver } from "@langchain/langgraph";
import { initChatModel } from "langchain/chat_models/universal";
import { altiusSystemPrompt } from "./prompt.js";

export interface AltiusAgentConfig {
  /** Altius API base URL, e.g. http://localhost:4000 */
  altiusUrl: string;
  /** Bearer token for the MCP endpoint (OIDC JWT or dev-bypass). */
  altiusToken: string;
  /**
   * LangChain model specifier. Defaults to OpenRouter.
   * Examples:
   *   "openrouter:anthropic/claude-sonnet-4-6"
   *   "openrouter:openai/gpt-4o"
   *   "anthropic:claude-sonnet-4-6"
   *   "openai:gpt-4o"
   */
  model?: string;
  /** Optional system prompt override. */
  systemPrompt?: string;
}

/**
 * Create an Altius AIP agent.
 *
 * The agent is a LangGraph compiled graph. Call `.invoke({ messages })` or
 * `.stream({ messages })` to run it. Pass a checkpointer for multi-turn
 * memory across calls with the same thread_id.
 */
export async function createAltiusAgent(
  config: AltiusAgentConfig,
): Promise<{ agent: ReturnType<typeof createDeepAgent>; tools: Awaited<ReturnType<MultiServerMCPClient["getTools"]>>; toolNames: string[] }> {
  const {
    altiusUrl,
    altiusToken,
    model = process.env.AGENT_MODEL ?? "openrouter:anthropic/claude-sonnet-4-6",
    systemPrompt = altiusSystemPrompt,
  } = config;

  // ── MCP client ──────────────────────────────────────────────────────
  // Streamable HTTP transport. Altius mounts MCP at /mcp and validates
  // the Authorization: Bearer header against the configured OIDC provider
  // (Keycloak in the shipped deployment). In dev, set
  // ALTIUS_MCP_DEV_AUTH_BYPASS=true on the server to skip auth.
  const mcpClient = new MultiServerMCPClient({
    altius: {
      transport: "http",
      url: `${altiusUrl}/mcp`,
      headers: {
        Authorization: `Bearer ${altiusToken}`,
      },
    },
  });

  // Load every tool the Altius MCP server advertises for this caller.
  // The tool list is FGA-scoped: a caller only sees actions and types they
  // have permission to use. Tools are named:
  //   search_<Type>    — filtered object reads
  //   traverse_<Type>  — multi-hop link traversal
  //   action_<Name>    — governed write through the 8-stage pipeline
  //   function_<Name>  — user-authored server-side function
  const tools = await mcpClient.getTools();

  if (tools.length === 0) {
    throw new Error(
      "Altius MCP server returned no tools. Check that the MCP capability is " +
      "enabled in at least one loaded domain pack and that the caller has " +
      "permissions on at least one object type or action.",
    );
  }

  // ── Model ───────────────────────────────────────────────────────────
  const chatModel = await initChatModel(model);

  // ── Deep Agent ──────────────────────────────────────────────────────
  // Deep Agents wraps the LangGraph tool-calling loop with:
  //   - virtual filesystem for context management
  //   - subagent spawning for parallel tasks
  //   - automatic context summarization for long conversations
  //   - optional task planning
  // The checkpointer gives multi-turn memory: pass the same thread_id
  // across calls and the agent remembers prior messages.
  const checkpointer = new MemorySaver();

  const agent = await createDeepAgent({
    model: chatModel,
    tools,
    systemPrompt,
    checkpointer,
  });

  return { agent, tools, toolNames: tools.map((t) => t.name) };
}
