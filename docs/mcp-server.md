# MCP Server

**Updated:** 21 August 2026

Altius exposes a Model Context Protocol (MCP) server at `POST /mcp` for external AI agents and IDEs. The server is an adapter over the same schema, identity, authorization, consent, field-redaction, marking, function, and action services used by the REST and GraphQL surfaces.

## Protocol surface

The server implements JSON-RPC 2.0 over the MCP Streamable HTTP transport and currently negotiates protocol version `2025-03-26`.

Supported methods:

- `initialize` — negotiates the implemented protocol version and returns server identity.
- `server/discover` — compatibility discovery for newer clients; reports the supported version and tool capability.
- `notifications/initialized` — accepted as a no-op.
- `tools/list` — returns the tools visible and usable by the authenticated caller.
- `tools/call` — invokes an action, function, search, aggregate, or traversal tool.

`DELETE /mcp` is accepted as stateless session termination. The server exposes no MCP resources or prompts and stores no protocol session state between requests.

## Generated tools

Tools are generated from the merged ODL schema loaded from the active domain packs.

| Schema primitive | Tool name | Execution path |
|---|---|---|
| `ActionType` | `<ActionName>` | Full `ActionExecutor` pipeline |
| `FunctionType` | `function_<Name>` | Shared governed `invokeFunction` path |
| `ObjectType` | `search_<Type>` | FGA-scoped object query, redaction, consent |
| `ObjectType` | `aggregate_<Type>` | FGA/consent-scoped aggregate query |
| `ObjectType` | `traverse_<Type>` | Mixed-type graph traversal with per-node controls |

Function tools are advertised only when a function invoker is wired. Read tools for a marking-hidden ObjectType are indistinguishable from unknown tools.

### Permission-scoped discovery

`tools/list` is caller-specific:

- Function tools are hidden unless the caller holds one of the function's `requiredRoles`.
- Action tools are hidden when the corresponding action relation resolves to no usable object for the caller.
- Read tools remain visible when they can legitimately return an empty FGA-scoped result, but tools for mandatory-marking-hidden types are removed.

This discovery filtering is an affordance control. Every `tools/call` still repeats the authoritative execution-time checks.

## Action invocation

Calling an action tool constructs an actor with `type: "agent"` and runs:

```text
validate parameters
→ mandatory marking checks
→ authorization
→ consent
→ justification capture (when required)
→ object resolution and CEL preconditions
→ one SPI transaction for effects
→ post-commit side effects
→ audit
→ CloudEvents and relationship-tuple synchronization
```

Reserved tool arguments are removed before action parameter validation:

- `dryRun: true` — runs validation and policy checks without effects.
- `_justification` — supplies the reason required by a manifest with `requiresJustification: true`.
- `_holdId` — retries a high-risk action after human approval.

### Human approval for high-risk actions

Actions containing destructive `deleteObject` or `deleteLink` effects are high-risk by default. Additional names may be configured with `MCP_HIGH_RISK_ACTIONS`.

Without an approved hold, the first call returns `POLICY_HOLD` and a hold ID. A reviewer uses the role-gated `/api/v1/agent-holds` API to approve or reject it. The agent retries once with `_holdId`; the hold must match the action, agent, and tenant and is consumed one-shot.

## Read behavior

### `search_<Type>`

Input example:

```json
{
  "filter": [{ "field": "status", "operator": "eq", "value": "ACTIVE" }],
  "limit": 20
}
```

The server:

1. rejects predicates on fields the caller cannot read;
2. obtains the caller's `viewer` object set from the tenant's OpenFGA store;
3. queries through `ObjectManager` so computed fields are included;
4. applies field redaction;
5. applies consent filtering;
6. reports a post-consent count.

### `aggregate_<Type>`

Aggregates are restricted to authorized and consented objects. Aggregate, grouping, bucket, ordering, and filter fields are validated against schema and field visibility before storage is called.

### `traverse_<Type>`

Traversal validates the starting object and each link step, applies a hard step/node bound, and checks every returned node against its own ObjectType. Nodes, edges, and counts that would reveal a hidden endpoint are removed.

## Function invocation

`function_<Name>` delegates to the shared API function invoker. It enforces:

- per-object ReBAC when the function has an ObjectType parameter;
- `requiredRoles` deny-by-default;
- caller-bound ontology reads with field redaction and consent;
- writes only through governed actions;
- function audit records.

## Authentication and access enablement

Every request is authenticated independently with an OIDC bearer token using the shared `OidcAuthenticator`. The resulting identity supplies user ID, tenant, roles, groups, and effective markings.

Production never permits an unauthenticated fallback. Development bypass requires both:

```text
NODE_ENV != production
ALTIUS_MCP_DEV_AUTH_BYPASS=true
```

Optional deployment allowlists provide an outer MCP access gate:

- `MCP_ALLOWED_USERS`
- `MCP_ALLOWED_GROUPS` (matches groups or roles)

When either variable is configured, callers not named by either list receive `403` before tool discovery. Per-tool governance remains active after this gate.

## OAuth discovery

The API gateway exposes RFC 9728 protected-resource metadata at:

```text
GET /.well-known/oauth-protected-resource
```

A `401` from `/mcp` includes a `WWW-Authenticate: Bearer` challenge with the `resource_metadata` URL, allowing OAuth-capable MCP clients to discover the configured OIDC issuer.

Set `API_PUBLIC_URL` to the externally routable API origin so generated discovery URLs are correct behind ingress or a proxy.

## Capability gate

`/mcp` is mounted only when at least one loaded domain pack declares:

```yaml
capabilities:
  - mcp
```

The `nhs-acute` reference pack enables it, but MCP is not healthcare-specific; any pack may opt in.

## Client configuration

A client must send the OIDC access token on every request:

```json
{
  "mcpServers": {
    "altius": {
      "url": "https://altius.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <oidc-access-token>"
      }
    }
  }
}
```

For clients supporting OAuth protected-resource discovery, configure the `/mcp` URL and allow the client to follow the `WWW-Authenticate` challenge instead of manually pasting a long-lived token.

## Wire examples

### Initialize

```http
POST /mcp
Authorization: Bearer <token>
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"client","version":"1.0"}}}
```

### List caller-scoped tools

```http
POST /mcp
Authorization: Bearer <token>
Content-Type: application/json

{"jsonrpc":"2.0","id":2,"method":"tools/list"}
```

### Call an action

```http
POST /mcp
Authorization: Bearer <token>
Content-Type: application/json

{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"AdmitPatient","arguments":{"patient":"p-1","ward":"w-1","reason":"Emergency"}}}
```

Tool-level failures are normally returned as a successful JSON-RPC response whose MCP result has `isError: true`, allowing an agent to inspect the policy or validation error and recover. Malformed JSON-RPC requests and unknown JSON-RPC methods use protocol error codes.

## Auditing

- Action calls are stamped as agent actions and audited by `ActionExecutor`.
- Function calls use the shared function audit path.
- MCP search, aggregate, and traversal calls are audited at the read-tool dispatcher.

Audit writes are best-effort after the authoritative access decision; an audit-store outage does not grant access or roll back already committed ontology effects.

## Deployment

The MCP server adds no port or container. It is mounted on the API gateway's existing port. Per-principal rate limiting uses the same limiter as REST and GraphQL; with Redis it is shared across gateway replicas, otherwise it is per-process.

The server implementation deliberately uses the repository's local wire types instead of a server-side MCP SDK. Protocol changes therefore require explicit updates to `packages/mcp-server/src/protocol.ts`, compatibility tests, and this document.
