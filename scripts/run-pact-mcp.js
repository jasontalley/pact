#!/usr/bin/env node
/**
 * Wrapper to run the Pact MCP server without hardcoding dist path.
 * Resolves the server path relative to this script (repo root = scripts/..).
 *
 * Use when:
 * - Your MCP client does not support ${workspaceFolder} (e.g. global mcp.json).
 * - You want a single entry point: point config at this script path only.
 *
 * Cursor users: prefer .cursor/mcp.json in the project (uses ${workspaceFolder}).
 */
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const serverPath = path.join(repoRoot, 'dist', 'mcp', 'pact-mcp-server.js');

const child = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  env: process.env,
  cwd: repoRoot,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
