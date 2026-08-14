/**
 * @altius/mcp-server — Model Context Protocol adapter over governed actions.
 *
 * Exposes Altius actions and read queries as MCP tools consumable by external
 * AI agents (Claude Code, Cursor, Anthropic SDK, OpenAI SDK) over the
 * Streamable HTTP transport. Auth is OIDC bearer token — an agent is just
 * another OIDC principal calling the same governed action pipeline.
 */

export { createMcpServer } from './server.js';
export type { McpServerConfig, McpServerDependencies, ManifestRegistry, McpCaller } from './types.js';
export type { McpHttpRequest, McpHttpResponse } from './server.js';
export type {
  McpTool,
  McpCallToolResult,
  McpContentBlock,
  McpInitializeResult,
  McpToolsListResult,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
} from './protocol.js';
export { MCP_PROTOCOL_VERSION, JSON_RPC_ERROR } from './protocol.js';
