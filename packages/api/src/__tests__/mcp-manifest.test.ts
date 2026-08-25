/**
 * Two-sided proof that the .mcp.json IDE manifest is valid and consumable.
 *
 * The gap: no packaged IDE integration existed — IDE setup was manual
 * bearer-token configuration. The fix: a .mcp.json manifest at the repo root
 * that IDEs (Cursor, Claude Code, Windsurf) auto-discover, plus the OAuth
 * protected-resource discovery endpoint (RFC 9728) already landed at
 * /.well-known/oauth-protected-resource.
 *
 * This test verifies:
 * 1. The .mcp.json file exists at the repo root.
 * 2. It has the expected shape: mcpServers.altius with a url and transport.
 * 3. The URL points at the /mcp endpoint.
 * 4. The transport is HTTP (Streamable HTTP, per the MCP server docs).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('.mcp.json IDE manifest', () => {
  const manifestPath = resolve(process.cwd(), '../../.mcp.json');

  it('exists at the repo root', () => {
    const content = readFileSync(manifestPath, 'utf-8');
    expect(content).toBeTruthy();
  });

  it('has mcpServers.altius with a url pointing at /mcp', () => {
    const content = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);
    expect(manifest.mcpServers).toBeDefined();
    expect(manifest.mcpServers.altius).toBeDefined();
    expect(manifest.mcpServers.altius.url).toMatch(/\/mcp$/);
  });

  it('declares HTTP transport', () => {
    const content = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);
    expect(manifest.mcpServers.altius.transport).toBe('http');
  });

  it('is valid JSON (no trailing commas, no comments)', () => {
    const content = readFileSync(manifestPath, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });
});
