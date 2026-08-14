/**
 * MCP server — Streamable HTTP transport over JSON-RPC 2.0.
 *
 * Implements the MCP 2025-03-26 Streamable HTTP transport as a single
 * `POST /mcp` endpoint. The server is stateless: each request is authenticated
 * independently, and no session state is retained between calls. This matches
 * how headless agents (Claude Code, Cursor, Anthropic SDK) consume remote MCP
 * servers.
 *
 * Supported methods:
 *   - initialize          → server info + capabilities
 *   - notifications/initialized → 202 (no body)
 *   - tools/list          → tool descriptors (actions + search_<Type>)
 *   - tools/call          → tool execution result
 *
 * Auth: OIDC bearer token validated by the same OidcAuthenticator used by the
 * REST/GraphQL surface. An agent is just another OIDC principal.
 */

import { randomUUID } from 'node:crypto';
import {
  MCP_PROTOCOL_VERSION,
  JSON_RPC_ERROR,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpInitializeResult,
  type McpToolsListResult,
  type McpCallToolResult,
  parseJsonRpcRequest,
  jsonRpcResult,
  jsonRpcError,
  isNotification,
} from './protocol.js';
import type { McpServerConfig, McpServerDependencies, McpCaller } from './types.js';
import { authenticateMcpRequest } from './auth.js';
import { buildToolList, invokeTool } from './tools.js';

/**
 * Framework-agnostic HTTP request shape. The API gateway adapts its
 * framework's request object to this interface before calling the handler.
 */
export interface McpHttpRequest {
  method: string;
  headers: Record<string, string | undefined>;
  body: unknown;
}

/**
 * Framework-agnostic HTTP response shape. The handler returns this; the API
 * gateway adapts it to its framework's response object.
 */
export interface McpHttpResponse {
  status: number;
  body: unknown;
}

/**
 * Create an MCP Streamable HTTP handler.
 *
 * The handler is framework-agnostic: it accepts an McpHttpRequest and returns
 * an McpHttpResponse. The API gateway mounts it with a thin adapter:
 *
 *   const handler = createMcpServer({ deps, isDev });
 *   app.post('/mcp', async (req, res) => {
 *     const out = await handler({ method: req.method, headers: req.headers, body: req.body });
 *     res.status(out.status).json(out.body);
 *   });
 *
 * The server is stateless: each request is authenticated independently, and
 * no session state is retained between calls.
 */
export function createMcpServer(config: McpServerConfig): (req: McpHttpRequest) => Promise<McpHttpResponse> {
  const { deps, serverName = 'altius-mcp', serverVersion = '0.1.0', isDev = false } = config;
  const toolList = buildToolList(deps);

  return async (req) => {
    // DELETE = session termination. Stateless server: no-op, return 200.
    if (req.method === 'DELETE') {
      return { status: 200, body: undefined };
    }

    if (req.method !== 'POST') {
      return {
        status: 405,
        body: {
          jsonrpc: '2.0',
          error: { code: JSON_RPC_ERROR.INVALID_REQUEST, message: 'Method Not Allowed: use POST' },
        },
      };
    }

    // ── Auth boundary ──
    const traceId = req.headers['x-trace-id']?.toString() ?? randomUUID();
    const authResult = await authenticateMcpRequest(
      req.headers.authorization,
      deps.authenticator,
      isDev,
      traceId,
    );

    if (!authResult.ok) {
      return {
        status: authResult.status,
        body: { error: { code: authResult.status, message: authResult.message } },
      };
    }

    const caller = { user: authResult.user, requestContext: authResult.requestContext };

    // ── Parse JSON-RPC request ──
    const parsed = parseJsonRpcRequest(req.body);
    if (!parsed.ok) {
      return { status: 200, body: parsed.response };
    }

    const request = parsed.request;

    // Notifications receive no response (202 Accepted, no body)
    if (isNotification(request)) {
      handleNotification(request, deps);
      return { status: 202, body: undefined };
    }

    // ── Dispatch JSON-RPC method ──
    try {
      const response = await dispatchMethod(request, caller, deps, toolList, serverName, serverVersion);
      return { status: 200, body: response };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return {
        status: 200,
        body: jsonRpcError(request.id ?? null, JSON_RPC_ERROR.INTERNAL_ERROR, message),
      };
    }
  };
}

/**
 * Dispatch a JSON-RPC method to its handler.
 */
async function dispatchMethod(
  request: JsonRpcRequest,
  caller: McpCaller,
  deps: McpServerDependencies,
  toolList: { name: string; description: string; inputSchema: unknown }[],
  serverName: string,
  serverVersion: string,
): Promise<JsonRpcResponse> {
  const id = request.id ?? null;

  switch (request.method) {
    case 'initialize': {
      const result: McpInitializeResult = {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: serverName, version: serverVersion },
      };
      return jsonRpcResult(id, result);
    }

    case 'tools/list': {
      const result: McpToolsListResult = { tools: toolList };
      return jsonRpcResult(id, result);
    }

    case 'tools/call': {
      const params = request.params as { name?: string; arguments?: unknown } | undefined;
      if (!params || typeof params.name !== 'string') {
        return jsonRpcError(
          id,
          JSON_RPC_ERROR.INVALID_PARAMS,
          'tools/call requires { name: string, arguments?: object }',
        );
      }

      const result: McpCallToolResult = await invokeTool(params.name, params.arguments, caller, deps);
      return jsonRpcResult(id, result);
    }

    default:
      return jsonRpcError(
        id,
        JSON_RPC_ERROR.METHOD_NOT_FOUND,
        `Method not found: ${request.method}`,
      );
  }
}

/**
 * Handle a JSON-RPC notification (no response expected).
 * Currently only `notifications/initialized` is meaningful — it's a no-op
 * for a stateless server.
 */
function handleNotification(request: JsonRpcRequest, _deps: McpServerDependencies): void {
  // notifications/initialized — no-op for stateless server
  void request;
}
