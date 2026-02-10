# Pact MCP Server

MCP server that proxies tool calls to the Pact REST API. Use it from Cursor, Claude Desktop, or any MCP client.

## Running with the app (no binary path)

When the Pact app server starts, it **starts the MCP server** on an HTTP (SSE) port. Your MCP client only needs the URL—no `command` or `args`, no path to any binary.

1. Build the app and MCP: `npm run build && npm run build:mcp`
2. Start the app: `npm run start:dev` (or run the Docker container)
3. In Cursor, use the project `.cursor/mcp.json`, which points at `http://localhost:3002/sse`

The app spawns the MCP server process with `MCP_PORT=3002` by default. Set `MCP_PORT` to another port or `MCP_PORT=0` to disable.

## Operating model: no repo root required

The MCP server **does not need the repo root** (or any filesystem path) to operate. It is a thin proxy:

- It receives MCP tool calls and forwards them as HTTP requests to the Pact API.
- The only runtime configuration it uses is **`PACT_API_URL`** (default `http://localhost:3000`).
- It does not read the host filesystem; tool arguments (e.g. test file paths) are passed through to the API.

**Typical setup:** Pact runs as a self-contained Docker container on the same host as your dev environment. The Pact API is reachable at `localhost`. The MCP server runs alongside the app (same process tree) and clients connect via URL. No path configuration is required.

## Optional: run MCP standalone (stdio)

If you prefer to run the MCP server yourself (e.g. for a different port or without starting the full app), you can still use `command`/`args`:

- **Cursor (project config):** `"command": "node"`, `"args": ["${workspaceFolder}/dist/mcp/pact-mcp-server.js"]` (no SSE; stdio only).
- **With SSE on a port:** run `MCP_PORT=3002 node dist/mcp/pact-mcp-server.js`, then use `"url": "http://localhost:3002/sse"` in your client.

## Build and run

```bash
npm run build:mcp
npm run start:mcp
```

`start:mcp` runs the server on **stdio** (for clients that spawn the process). When the **app** runs, it starts the same binary with `MCP_PORT` set so the server listens on HTTP (SSE) instead.

## Environment

| Variable       | Default              | Description |
|----------------|----------------------|-------------|
| `PACT_API_URL` | `http://localhost:3000` | Pact REST API base URL |
| `MCP_PORT`     | `3002` (when started by app) | If set and not `0`, run SSE transport on this port. Omit or `0` for stdio-only. |

## Tools (12)

| Tool | Purpose |
|------|---------|
| `read_atom` | Read a single atom by UUID or human-readable ID (e.g. `IA-001`) |
| `list_atoms` | List atoms with filtering by status, category, scope |
| `search_atoms` | Full-text search across atom descriptions |
| `get_atom_for_test` | Find the atom linked to a specific test file |
| `suggest_atom` | Propose a new atom (created as `proposed`, requires HITL approval) |
| `get_implementable_atoms` | Find committed atoms that need test coverage, sorted by priority |
| `get_coupling_status` | Atom-test, test-atom, and code-atom coupling metrics |
| `get_epistemic_status` | Epistemic certainty metrics (proven/committed/inferred/unknown) |
| `get_intent_history` | Version history for an intent identity |
| `get_conflicts` | List active atom conflicts |
| `trigger_reconciliation` | Trigger a GitHub-based reconciliation run (branch + commitSha) |
| `get_reconciliation_status` | Check status of a run by runId, or list all active runs |

### Reconciliation tools

The `trigger_reconciliation` and `get_reconciliation_status` tools enable AI coding agents to trigger and monitor reconciliation runs against the configured GitHub repository. These require GitHub integration to be configured in Pact settings (owner, repo, PAT).

**Example flow from a coding agent:**
1. `trigger_reconciliation` with `branch: "main"` and `commitSha: "abc123"` — returns `runId`
2. `get_reconciliation_status` with `runId` — monitor progress until complete
3. `get_implementable_atoms` — find newly discovered atoms to implement
