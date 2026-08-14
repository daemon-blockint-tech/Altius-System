# MCP Server

Altius exposes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server at `POST /mcp` for external AI agents. It wraps the existing governed action surface and FGA-scoped read queries — an agent is just another OIDC principal calling the same 8-stage action pipeline as a human caller.

## Surface

The MCP server implements the [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) (JSON-RPC 2.0 over HTTP). It is **tools-only** and **stateless**:

- `initialize` — returns protocol version + server info
- `notifications/initialized` — acknowledged (no-op for stateless)
- `tools/list` — returns one tool per ActionType + one `search_<Type>` per ObjectType
- `tools/call` — executes an action or a read query

No `resources/*` or `prompts/*` methods. No session state between calls.

## Tools

### Action tools

One per `ActionType` in the loaded schema. The tool name is the action name (e.g. `AdmitPatient`); the `inputSchema` is derived from the action's `@param` fields (JSON Schema). Calling the tool runs the action through the full 8-stage governed pipeline (validate → authorise → consent → preconditions → execute → side-effects → audit → emit).

### Read tools

One `search_<Type>` per `ObjectType` (e.g. `search_Patient`). Input:

```json
{
  "filter": [{ "field": "status", "operator": "eq", "value": "ACTIVE" }],
  "limit": 20
}
```

Returns up to 50 objects, FGA-scoped to the caller's `viewer` relation on the type, with field-level redaction applied. No write tools — writes go through actions only.

## Auth

OIDC bearer token in the `Authorization` header, validated by the same `OidcAuthenticator` used by the REST/GraphQL surface. No special agent identity, no bypass. In dev mode (`NODE_ENV != production`), a missing token resolves to the dev-user identity.

## Capability gate

The MCP endpoint is mounted only when a loaded domain pack declares `mcp` in its `pack.yaml` `capabilities:` list. Non-NHS deployments expose no MCP surface. The `nhs-acute` pack declares `mcp`.

## Client configuration

### Claude Code / Claude Desktop

`~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "altius": {
      "url": "http://localhost:4000/mcp",
      "headers": { "Authorization": "Bearer <oidc-token>" }
    }
  }
}
```

### Anthropic SDK (TypeScript)

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:4000/mcp"),
  { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
);
const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const result = await client.callTool({
  name: "AdmitPatient",
  arguments: { patient: "p-1", ward: "w-1", reason: "Emergency" },
});
```

## Wire protocol examples

### initialize

```http
POST /mcp
Authorization: Bearer <token>
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"claude-code","version":"1.0"}}}
```

Response:
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","capabilities":{"tools":{}},"serverInfo":{"name":"altius-mcp","version":"0.1.0"}}}
```

### tools/list

```http
POST /mcp
Authorization: Bearer <token>

{"jsonrpc":"2.0","id":2,"method":"tools/list"}
```

### tools/call

```http
POST /mcp
Authorization: Bearer <token>

{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"AdmitPatient","arguments":{"patient":"p-1","ward":"w-1","reason":"Emergency"}}}
```

Response (success):
```json
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"success\":true,\"actionId\":\"act_...\",\"affectedObjects\":[...]}"}],"isError":false}}
```

Response (action denied by authz):
```json
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"success\":false,\"errors\":[{\"code\":\"AUTHORIZATION_DENIED\",...}]}"}],"isError":true}}
```

Response (unknown tool):
```json
{"jsonrpc":"2.0","id":3,"error":{"code":-32602,"message":"Unknown tool: Foo"}}
```

## Audit

Every `tools/call` that executes an action runs through `ActionExecutor`, which writes an audit record (success or denial) via the injected `AuditWriter`. The agent's OIDC identity appears in the `actor` field — agent-driven actions are audited identically to human-driven ones. No separate audit path.

## Security properties

- **No bypass:** agent calls ride the same 8-stage pipeline (validate, authorise, consent, preconditions, execute, side-effects, audit, emit) as REST/GraphQL calls.
- **Fail-closed auth:** no token → 401 (prod). Invalid token → 401.
- **FGA-scoped reads:** `search_<Type>` tools only return objects the caller has `viewer` access to; field-level redaction applies.
- **No per-user tool filtering in `tools/list`:** an agent sees all action names, but `tools/call` fails closed on unauthorized actions. Per-user filtering is a documented follow-up.
- **No new dependencies:** the MCP wire protocol is implemented in ~250 lines of TypeScript using only the Node.js stdlib. No `@modelcontextprotocol/sdk` dependency on the server side — the protocol is deterministic and stable (2025-03-26 spec), and avoiding the SDK eliminates API-drift risk.

## Deployment

No new ports, no new containers. The MCP endpoint rides on the existing api-gateway port (default 4000). No changes to Helm values or docker-compose. The `mcp` capability is declared per-pack in `pack.yaml`.
