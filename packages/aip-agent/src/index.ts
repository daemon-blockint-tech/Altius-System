/**
 * CLI entry point for the Altius AIP agent.
 *
 * Reads from stdin, streams responses. Each line is a new user message in
 * the same thread, so the agent retains conversation context.
 *
 * Environment variables:
 *   ALTIUS_URL    — Altius API base URL (default: http://localhost:4000)
 *   ALTIUS_TOKEN  — OIDC JWT or dev-bypass token (required in production)
 *   AGENT_MODEL   — LangChain model spec (default: openrouter:anthropic/claude-sonnet-4-6)
 *   OPENROUTER_API_KEY — OpenRouter API key (if using openrouter: prefix)
 *   ANTHROPIC_API_KEY  — Anthropic API key (if using anthropic: prefix)
 *   OPENAI_API_KEY     — OpenAI API key (if using openai: prefix)
 */
import { createAltiusAgent } from "./agent.js";

async function main() {
  const altiusUrl = process.env.ALTIUS_URL ?? "http://localhost:4000";
  const altiusToken = process.env.ALTIUS_TOKEN ?? "";

  if (!altiusToken) {
    console.error(
      "ALTIUS_TOKEN is required. Pass an OIDC JWT, or set " +
      "ALTIUS_MCP_DEV_AUTH_BYPASS=true on the Altius server and use any non-empty string.",
    );
    process.exit(1);
  }

  console.log(`Connecting to Altius at ${altiusUrl}/mcp ...`);
  const { agent, toolNames } = await createAltiusAgent({
    altiusUrl,
    altiusToken,
  });

  console.log(`Connected. ${toolNames.length} tools available:`);
  console.log(toolNames.map((n) => `  - ${n}`).join("\n"));
  console.log("\nType a message and press Enter. Ctrl+C to exit.\n");

  const threadId = `altius-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  // Read lines from stdin.
  const { createInterface } = await import("node:readline");
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  for await (const line of rl) {
    const input = line.trim();
    if (!input) continue;

    const result = await agent.invoke(
      {
        messages: [{ role: "user", content: input }],
      },
      config,
    );

    const lastMessage = result.messages[result.messages.length - 1];
    if (lastMessage && typeof lastMessage.content === "string") {
      console.log(`\n${lastMessage.content}\n`);
    }
  }
}

main().catch((err) => {
  console.error("Agent failed:", err);
  process.exit(1);
});
