/**
 * JSON-RPC 2.0 wire types for the MCP Streamable HTTP transport.
 *
 * The MCP protocol (2025-03-26 spec) is JSON-RPC 2.0 over HTTP. This module
 * defines the minimal wire types and protocol constants needed to serve
 * `initialize`, `tools/list`, and `tools/call` over a single `POST /mcp`
 * endpoint. No external SDK — the protocol is small and deterministic.
 *
 * Reference: https://modelcontextprotocol.io/specification/2025-03-26
 */

/** MCP protocol version implemented by this server. */
export const MCP_PROTOCOL_VERSION = '2025-03-26';

/** JSON-RPC 2.0 error codes. */
export const JSON_RPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** JSON-RPC 2.0 request/notification envelope. */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

/** JSON-RPC 2.0 response envelope. */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/** JSON-RPC 2.0 error object. */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** MCP tool definition as returned by `tools/list`. */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

/** MCP content block in a `tools/call` result. */
export interface McpContentBlock {
  type: 'text';
  text: string;
}

/** MCP `tools/call` result. */
export interface McpCallToolResult {
  content: McpContentBlock[];
  isError: boolean;
}

/** `initialize` result returned to the client. */
export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: { tools: Record<string, never> };
  serverInfo: { name: string; version: string };
}

/** `tools/list` result. */
export interface McpToolsListResult {
  tools: McpTool[];
}

/**
 * Build a JSON-RPC error response.
 */
export function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

/**
 * Build a JSON-RPC success response.
 */
export function jsonRpcResult(
  id: string | number | null,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Parse and validate an incoming JSON-RPC request body.
 * Returns the parsed request or a JSON-RPC error response.
 */
export function parseJsonRpcRequest(
  body: unknown,
): { ok: true; request: JsonRpcRequest } | { ok: false; response: JsonRpcResponse } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      ok: false,
      response: jsonRpcError(
        null,
        JSON_RPC_ERROR.INVALID_REQUEST,
        'Request must be a JSON-RPC 2.0 object',
      ),
    };
  }

  const obj = body as Record<string, unknown>;
  if (obj['jsonrpc'] !== '2.0') {
    return {
      ok: false,
      response: jsonRpcError(
        typeof obj['id'] === 'string' || typeof obj['id'] === 'number' ? obj['id'] : null,
        JSON_RPC_ERROR.INVALID_REQUEST,
        'jsonrpc must be "2.0"',
      ),
    };
  }

  if (typeof obj['method'] !== 'string' || obj['method'].length === 0) {
    return {
      ok: false,
      response: jsonRpcError(
        typeof obj['id'] === 'string' || typeof obj['id'] === 'number' ? obj['id'] : null,
        JSON_RPC_ERROR.INVALID_REQUEST,
        'method must be a non-empty string',
      ),
    };
  }

  const id = obj['id'];
  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: typeof id === 'string' || typeof id === 'number' || id === null ? (id as string | number | null) : null,
    method: obj['method'],
    params: obj['params'],
  };

  return { ok: true, request };
}

/**
 * A JSON-RPC notification has no `id` field (or `id` is null). Notifications
 * never receive a response — the server returns `202 Accepted` with no body.
 */
export function isNotification(request: JsonRpcRequest): boolean {
  return request.id === undefined || request.id === null;
}
