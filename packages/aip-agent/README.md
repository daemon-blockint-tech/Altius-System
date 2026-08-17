# @altius/aip-agent

AIP agent — [Deep Agents](https://github.com/langchain-ai/deepagentsjs) harness connected to the Altius ontology platform via MCP.

The agent discovers all ontology tools (search, traverse, action, function) at runtime from the Altius MCP endpoint. No tool names are hardcoded — the agent adapts to whatever domain packs are loaded on the Altius instance.

## Architecture

```
User ──→ Deep Agents loop ──→ MCP tools ──→ Altius /mcp endpoint
         (LangGraph + LLM)     │              (Streamable HTTP)
                               │
                               ├─ search_<Type>   (filtered reads)
                               ├─ traverse_<Type> (multi-hop links)
                               ├─ action_<Name>   (governed writes)
                               └─ function_<Name> (server-side logic)
```

Every tool call goes through Altius's 8-stage governed pipeline: parameter validation, OpenFGA authorization, consent checks, marking enforcement, transactional execution, audit, event emission, and webhook delivery. The agent cannot bypass any of these — it is just another OIDC-authenticated caller.

## Prerequisites

1. An Altius instance running with at least one domain pack that declares the `mcp` capability (e.g. `nhs-acute`)
2. An OIDC token from the Altius Keycloak realm, OR dev auth bypass enabled

## Setup

```bash
# Install dependencies
pnpm install

# Set environment variables
export ALTIUS_URL=http://localhost:4000
export ALTIUS_TOKEN=<your OIDC JWT>

# For dev without OIDC, set this on the Altius SERVER (not here):
#   ALTIUS_MCP_DEV_AUTH_BYPASS=true
# Then any non-empty token string works.

# Set your LLM provider key
export OPENROUTER_API_KEY=<key>
# Or use a different provider:
#   export ANTHROPIC_API_KEY=<key>
#   export OPENAI_API_KEY=<key>
```

## Run

```bash
# Interactive CLI chat
pnpm --filter @altius/aip-agent dev

# Or build and run
pnpm --filter @altius/aip-agent build
pnpm --filter @altius/aip-agent start
```

## Use a different model

```bash
# OpenRouter (default) — multi-provider router
export AGENT_MODEL="openrouter:anthropic/claude-sonnet-4-6"
export OPENROUTER_API_KEY=<key>

# Direct Anthropic
export AGENT_MODEL="anthropic:claude-sonnet-4-6"
export ANTHROPIC_API_KEY=<key>

# OpenAI
export AGENT_MODEL="openai:gpt-4o"
export OPENAI_API_KEY=<key>

# Google Gemini
export AGENT_MODEL="google_genai:gemini-2.0-flash"
export GOOGLE_API_KEY=<key>
```

## Programmatic usage

```typescript
import { createAltiusAgent } from "@altius/aip-agent";

const { agent, tools, toolNames } = await createAltiusAgent({
  altiusUrl: "http://localhost:4000",
  altiusToken: process.env.ALTIUS_TOKEN!,
  model: "openrouter:anthropic/claude-sonnet-4-6",
});

// Single-turn
const result = await agent.invoke({
  messages: [{ role: "user", content: "Find all patients in the acute ward" }],
}, { configurable: { thread_id: "session-1" } });

// Multi-turn — same thread_id retains conversation context
const result2 = await agent.invoke({
  messages: [{ role: "user", content: "Admit John Doe to ward 3" }],
}, { configurable: { thread_id: "session-1" } });

// Streaming
const stream = await agent.stream({
  messages: [{ role: "user", content: "Show me the discharge history for patient p-1" }],
}, { configurable: { thread_id: "session-1" } });

for await (const chunk of stream) {
  // chunk has .messages, .tools, .files etc.
  console.log(chunk);
}
```

## How tool discovery works

The agent does not know which object types, actions, or functions exist until it connects. On startup:

1. `MultiServerMCPClient` connects to `POST /mcp` (Streamable HTTP)
2. Calls `tools/list` — Altius returns every tool the caller has permission to use
3. `getTools()` converts them to LangChain tool objects
4. Deep Agents passes them to the LLM as callable tools

Tool naming convention:
- `search_Patient` — filtered reads on Patient objects
- `traverse_Patient` — multi-hop link traversal starting from a Patient
- `action_AdmitPatient` — governed write through the action pipeline
- `function_ScoreRisk` — user-authored server-side function

Tool visibility is per-caller: the OpenFGA authorization layer filters the tool list so the agent only sees what the authenticated user can access.
