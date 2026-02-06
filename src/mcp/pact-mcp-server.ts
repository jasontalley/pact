#!/usr/bin/env node
/**
 * Pact MCP Server
 *
 * Enables external coding agents (Claude, Cursor, etc.) to query Pact
 * via the Model Context Protocol (MCP).
 *
 * The server acts as a proxy: it translates MCP tool calls into HTTP
 * requests to the Pact REST API.
 *
 * Environment variables:
 *   PACT_API_URL - Base URL for the Pact API (default: http://localhost:3000)
 *   MCP_PORT     - If set, run SSE transport on this port (GET /sse, POST /message). Otherwise use stdio.
 */
import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { toolDefinitions, toolHandlers } from './tools/index.js';

function createMcpServer(): Server {
  const server = new Server({
    name: 'pact-mcp-server',
    version: '1.0.0',
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolDefinitions };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = toolHandlers.get(name);
    if (!handler) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    const result = await handler(args ?? {});
    return { content: result.content, isError: result.isError };
  });

  return server;
}

async function runStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runSse(port: number): Promise<void> {
  const sessions: Array<{ server: Server; transport: SSEServerTransport }> = [];

  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/sse') {
      const transport = new SSEServerTransport('/message', res);
      const server = createMcpServer();
      sessions.push({ server, transport });
      server.onclose = () => {
        const i = sessions.findIndex((s) => s.server === server);
        if (i !== -1) sessions.splice(i, 1);
      };
      server.connect(transport).catch((err) => {
        console.error('MCP SSE connect error:', err);
        res.destroy();
      });
      return;
    }

    if (req.method === 'POST' && req.url?.startsWith('/message')) {
      const sessionId = new URL(req.url, `http://localhost`).searchParams.get('sessionId');
      const session = sessions.find((s) => s.transport.sessionId === sessionId);
      if (!session) {
        res.writeHead(404).end('Session not found');
        return;
      }
      session.transport.handlePostMessage(req, res).catch((err) => {
        console.error('MCP POST error:', err);
        if (!res.headersSent) res.writeHead(500).end(String(err));
      });
      return;
    }

    res.writeHead(404).end('Not found');
  });

  httpServer.listen(port, () => {
    console.error(`Pact MCP server (SSE) listening on http://localhost:${port}/sse`);
  });
}

async function main(): Promise<void> {
  const port = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : NaN;
  if (!Number.isNaN(port) && port > 0) {
    await runSse(port);
  } else {
    await runStdio();
  }
}

main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
