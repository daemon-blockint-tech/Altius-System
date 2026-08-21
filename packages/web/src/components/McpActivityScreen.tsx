/**
 * MCP activity screen — shows MCP server status and available tools.
 *
 * The MCP server is mounted at /mcp when a pack declares the `mcp` capability.
 * This screen queries the available tools via the GraphQL `availableTools` query
 * (filtered to MCP-exposed tools) and shows the MCP endpoint status.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ToolDescriptor {
  name: string;
  kind: string;
  description: string;
  parameters: Record<string, unknown>;
  requiredPermissions: string[];
  tags: string[];
}

export interface McpActivityScreenProps {
  endpoint: string;
  getToken: (() => Promise<string>) | null;
}

export function McpActivityScreen({ endpoint, getToken }: McpActivityScreenProps): ReactNode {
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const ticket = useRef(0);

  const fetchTools = useCallback(async () => {
    const mine = ++ticket.current;
    setStatus('loading');
    try {
      const token = getToken ? await getToken() : '';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          query: `query { availableTools { name kind description parameters requiredPermissions tags } }`,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as { data?: { availableTools?: ToolDescriptor[] }; errors?: unknown[] };
      if (json.errors) throw new Error(JSON.stringify(json.errors));
      if (mine !== ticket.current) return;
      setTools(json.data?.availableTools ?? []);
      setStatus('ready');
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [endpoint, getToken]);

  const checkMcpStatus = useCallback(async () => {
    try {
      const token = getToken ? await getToken() : '';
      const response = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      });
      setMcpStatus(response.ok ? 'available' : 'unavailable');
    } catch {
      setMcpStatus('unavailable');
    }
  }, [getToken]);

  useEffect(() => {
    void fetchTools();
    void checkMcpStatus();
  }, [fetchTools, checkMcpStatus]);

  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">INVESTIGATE · MCP</span>
        <h1 className="ed-main__title">MCP activity</h1>
        <p className="ed-main__lede">
          Model Context Protocol server status and available tools. The MCP endpoint
          exposes governed actions and query functions to external agents.
        </p>
      </header>

                        <div className="ed-table-wrap">
        <div style={{ marginBottom: 24 }}>
          <strong>MCP endpoint: </strong>
          <span className="ed-status-badge" data-tone={mcpStatus === 'available' ? 'delivered' : mcpStatus === 'unavailable' ? 'lost' : 'pending'}>
            {mcpStatus}
          </span>
          {mcpStatus === 'available' && <code style={{ marginLeft: 12 }}>POST /mcp</code>}
        </div>

        {status === 'error' && <div role="alert" className="ed-error"><p>{error}</p><button type="button" onClick={() => void fetchTools()}>Retry</button></div>}

        <h2 className="ed-subhead">
          Available tools ({tools.length})
        </h2>

        {status === 'loading' && <p aria-live="polite">Loading…</p>}

                {tools.length > 0 && (
          <div className="ed-form-row--inline">
            {tools.map((tool) => (
              <div key={tool.name} className="ed-tool-card">
                <div className="ed-tool-card__header">
                  <h3 className="ed-tool-card__title"><code>{tool.name}</code></h3>
                  <span className="ed-status-badge" data-tone="default">{tool.kind}</span>
                </div>
                {tool.description && <p className="ed-muted">{tool.description}</p>}
                {tool.requiredPermissions.length > 0 && (
                  <p className="ed-tool-card__meta">
                    <strong>Permissions:</strong> {tool.requiredPermissions.join(', ')}
                  </p>
                )}
                {tool.tags.length > 0 && (
                  <p className="ed-tool-card__meta">
                    <strong>Tags:</strong> {tool.tags.join(', ')}
                  </p>
                )}
                <details>
                  <summary>Parameters</summary>
                  <pre style={{ marginTop: 8 }}>
                    {JSON.stringify(tool.parameters, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}

        {status === 'ready' && tools.length === 0 && <p className="ed-muted">No tools available.</p>}
      </div>
    </main>
  );
}
