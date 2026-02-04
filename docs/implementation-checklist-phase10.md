# Implementation Checklist: Phase 10 — External Access

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 10 |
| **Focus** | MCP server for external agent access |
| **Status** | Not Started |
| **Prerequisites** | Phase 8 (Foundation), Phase 9 (Visibility) |
| **Related Docs** | [implementation-checklist-bootstrap.md](implementation-checklist-bootstrap.md), [bootstrap-completion-plan.md](bootstrap-completion-plan.md) |

---

## Overview

Phase 10 enables external coding agents (Claude, Cursor, etc.) to query Pact via the Model Context Protocol (MCP). This is a critical bootstrap capability: without MCP, external agents cannot access Pact's truth during development.

Three tool groups:

1. **Core Tools** — read_atom, list_atoms, get_atom_for_test, search_atoms
2. **Coupling Tools** — get_coupling_status
3. **Epistemic Tools** — get_epistemic_status, get_intent_history, get_conflicts

Currently, no `src/mcp/` directory exists.

---

## 10.1 MCP Server Scaffolding

### Tasks

- [ ] **10.1.1** Install MCP SDK dependency
  - **File**: `package.json`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - `npm install @modelcontextprotocol/sdk`
    - Add to production dependencies (not devDependencies)

- [ ] **10.1.2** Create MCP server entry point
  - **File**: `src/mcp/pact-mcp-server.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Import Server from `@modelcontextprotocol/sdk/server/index.js`
    - Import StdioServerTransport from `@modelcontextprotocol/sdk/server/stdio.js`
    - Configure server metadata: `{ name: 'pact-mcp-server', version: '1.0.0' }`
    - Enable tool capabilities
    - Handle ListTools and CallTool request handlers
    - Connect via StdioServerTransport
    - The MCP server operates as a **proxy** — it calls the Pact HTTP API internally
    - Configure PACT_API_URL from environment variable (default: `http://localhost:3000`)

- [ ] **10.1.3** Create HTTP client for MCP→Pact API communication
  - **File**: `src/mcp/pact-api-client.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 10.1.2
  - **Details**:
    - Simple HTTP client (using fetch or axios) for MCP server to call Pact API
    - Methods mirror REST endpoints:
      - `getAtom(id: string)`
      - `listAtoms(filters?)`
      - `getAtomForTest(testPath: string)`
      - `getCouplingMetrics()`
      - `getEpistemicMetrics()`
      - `getConflicts(filters?)`
      - `getIntentHistory(intentIdentity: string)`
    - Error handling: convert HTTP errors to MCP tool errors

- [ ] **10.1.4** Add build script for MCP server
  - **File**: `package.json`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 10.1.2
  - **Details**:
    - Add `"build:mcp": "tsc src/mcp/pact-mcp-server.ts --outDir dist/mcp --module esnext --target es2020 --moduleResolution node"`
    - Or configure separate tsconfig for MCP build
    - Ensure output is a standalone executable Node script

- [ ] **10.1.5** Create MCP server Docker configuration
  - **File**: `Dockerfile.mcp`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 10.1.4
  - **Details**:
    - Based on Node.js 20 Alpine image
    - Copy built MCP server files
    - Set PACT_API_URL environment variable
    - Entrypoint: `node dist/mcp/pact-mcp-server.js`

- [ ] **10.1.6** Create Claude Desktop configuration example
  - **File**: `src/mcp/claude-desktop-config.example.json`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 10.1.4
  - **Details**:
    ```json
    {
      "mcpServers": {
        "pact": {
          "command": "node",
          "args": ["<path-to-pact>/dist/mcp/pact-mcp-server.js"],
          "env": {
            "PACT_API_URL": "http://localhost:3000"
          }
        }
      }
    }
    ```

---

## 10.2 Core MCP Tools

### Tasks

- [ ] **10.2.1** Implement `read_atom` tool
  - **File**: `src/mcp/tools/read-atom.tool.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 10.1.2
  - **Details**:
    - Name: `read_atom`
    - Description: "Get the full description, acceptance criteria, and status for an intent atom"
    - Input schema: `{ atomId: string }` (e.g., "IA-042" or UUID)
    - Output: Full atom object including description, category, status, observableOutcomes, falsifiabilityCriteria, tags, qualityScore, intentIdentity, intentVersion
    - Calls: `GET /api/atoms/:id` or `GET /api/atoms?atomId=IA-042`

- [ ] **10.2.2** Implement `list_atoms` tool
  - **File**: `src/mcp/tools/list-atoms.tool.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 10.1.2
  - **Details**:
    - Name: `list_atoms`
    - Description: "List intent atoms with optional filtering by status, category, or tags"
    - Input schema: `{ status?: string, category?: string, tags?: string[], search?: string, limit?: number }`
    - Output: `{ atoms: AtomSummary[], total: number }`
    - Calls: `GET /api/atoms` with query params

- [ ] **10.2.3** Implement `get_atom_for_test` tool
  - **File**: `src/mcp/tools/get-atom-for-test.tool.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 10.1.2
  - **Details**:
    - Name: `get_atom_for_test`
    - Description: "Given a test file path, find the atom(s) it validates or should validate"
    - Input schema: `{ testFilePath: string }`
    - Output:
      ```typescript
      {
        linkedAtoms: AtomSummary[];     // Atoms explicitly linked via @atom annotation
        suggestedAtoms: AtomSummary[];  // Atoms that might be relevant (by semantic similarity)
        isOrphan: boolean;              // True if no @atom annotation found
      }
      ```
    - Implementation:
      1. Check TestRecord table for matching filePath
      2. If test has atomRecommendationId → follow to atom
      3. If test has linkedAtomId → return directly
      4. If neither → mark as orphan, optionally suggest related atoms

- [ ] **10.2.4** Implement `search_atoms` tool
  - **File**: `src/mcp/tools/search-atoms.tool.ts`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 10.1.2
  - **Details**:
    - Name: `search_atoms`
    - Description: "Search atoms by description content, tags, or category"
    - Input schema: `{ query: string, category?: string, status?: string, limit?: number }`
    - Output: `{ results: AtomSummary[], total: number }`
    - Uses: Full-text search on atom descriptions (PostgreSQL `ILIKE` or `tsvector`)

---

## 10.3 Epistemic MCP Tools

### Tasks

- [ ] **10.3.1** Implement `get_coupling_status` tool
  - **File**: `src/mcp/tools/get-coupling-status.tool.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: Phase 8.2
  - **Details**:
    - Name: `get_coupling_status`
    - Description: "Get atom-test-code coupling metrics and identify coverage gaps"
    - Input schema: `{ directory?: string }`
    - Output: CouplingMetrics object from `/api/metrics/coupling`
    - Highlights orphan counts prominently for agent awareness

- [ ] **10.3.2** Implement `get_epistemic_status` tool
  - **File**: `src/mcp/tools/get-epistemic-status.tool.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: Phase 9.1
  - **Details**:
    - Name: `get_epistemic_status`
    - Description: "Get the system's epistemic certainty levels: what is proven, committed, inferred, and unknown"
    - Input schema: `{}` (no inputs)
    - Output: EpistemicMetrics from `/api/metrics/epistemic`
    - Agent use case: "Before implementing, check what Pact knows about this area"

- [ ] **10.3.3** Implement `get_intent_history` tool
  - **File**: `src/mcp/tools/get-intent-history.tool.ts`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: Phase 8.4
  - **Details**:
    - Name: `get_intent_history`
    - Description: "Get the version history of an intent, showing how it evolved through supersessions"
    - Input schema: `{ intentIdentity?: string, atomId?: string }` (one required)
    - Output: `{ intentIdentity: string, versions: Atom[], currentVersion: Atom }`
    - If atomId provided: lookup atom, extract intentIdentity, return all versions
    - Calls: `GET /api/atoms/intent/:intentIdentity`

- [ ] **10.3.4** Implement `get_conflicts` tool
  - **File**: `src/mcp/tools/get-conflicts.tool.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: Phase 8.1
  - **Details**:
    - Name: `get_conflicts`
    - Description: "Get open intent conflicts that need resolution"
    - Input schema: `{ status?: string, type?: string, atomId?: string }`
    - Output: `{ conflicts: ConflictRecord[], total: number }`
    - Agent use case: "Check for conflicts before creating new atoms"

- [ ] **10.3.5** Create tool index and registration
  - **File**: `src/mcp/tools/index.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: All tools
  - **Details**:
    - Central registry of all MCP tools
    - Export tool definitions array for ListTools handler
    - Export tool handler map for CallTool handler
    - Each tool has: name, description, inputSchema (JSON Schema)

---

## 10.4 Testing and Documentation

### Tasks

- [ ] **10.4.1** Create MCP integration test suite
  - **File**: `test/mcp/mcp-tools.e2e-spec.ts`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: All tools
  - **Details**:
    - Test each tool with valid inputs
    - Test error handling (invalid atom ID, missing required params)
    - Test that API client correctly translates responses
    - Mock HTTP calls to Pact API for isolated testing

- [ ] **10.4.2** Create MCP server documentation
  - **File**: `src/mcp/README.md`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: All tools
  - **Details**:
    - Setup instructions for Claude Desktop, Cursor, etc.
    - Tool reference (name, description, input/output schemas)
    - Environment variable reference
    - Troubleshooting common issues

- [ ] **10.4.3** Add MCP to docker-compose for development
  - **File**: `docker-compose.yml`
  - **Priority**: Low | **Effort**: S
  - **Dependencies**: 10.1.5
  - **Details**:
    - Add `mcp-server` service (optional, for testing)
    - Connect to app service network
    - Set PACT_API_URL to internal Docker network address

---

## Phase 10 Completion Criteria

| Criterion | Validation |
|-----------|------------|
| MCP server starts via `node dist/mcp/pact-mcp-server.js` | Server runs without errors |
| `read_atom` returns correct atom data | Test with known atom ID |
| `list_atoms` supports filtering | Test with status/category filters |
| `get_atom_for_test` finds linked atoms | Test with annotated test file |
| `get_atom_for_test` identifies orphan tests | Test with unannotated test |
| `get_coupling_status` returns valid metrics | Compare to dashboard values |
| `get_epistemic_status` returns 4-level breakdown | Verify counts match |
| `get_intent_history` returns version chain | Test with superseded atom |
| `get_conflicts` returns open conflicts | Create test conflict, query |
| Claude Desktop can connect and query | Add config, test from Claude |
| Integration tests pass | `npm run test:mcp` |

---

## File Inventory

### New Files

| File | Task | Purpose |
|------|------|---------|
| `src/mcp/pact-mcp-server.ts` | 10.1.2 | Server entry point |
| `src/mcp/pact-api-client.ts` | 10.1.3 | HTTP client |
| `src/mcp/tools/index.ts` | 10.3.5 | Tool registry |
| `src/mcp/tools/read-atom.tool.ts` | 10.2.1 | Tool |
| `src/mcp/tools/list-atoms.tool.ts` | 10.2.2 | Tool |
| `src/mcp/tools/get-atom-for-test.tool.ts` | 10.2.3 | Tool |
| `src/mcp/tools/search-atoms.tool.ts` | 10.2.4 | Tool |
| `src/mcp/tools/get-coupling-status.tool.ts` | 10.3.1 | Tool |
| `src/mcp/tools/get-epistemic-status.tool.ts` | 10.3.2 | Tool |
| `src/mcp/tools/get-intent-history.tool.ts` | 10.3.3 | Tool |
| `src/mcp/tools/get-conflicts.tool.ts` | 10.3.4 | Tool |
| `src/mcp/claude-desktop-config.example.json` | 10.1.6 | Config example |
| `src/mcp/README.md` | 10.4.2 | Documentation |
| `Dockerfile.mcp` | 10.1.5 | Docker build |
| `test/mcp/mcp-tools.e2e-spec.ts` | 10.4.1 | Tests |

### Modified Files

| File | Task | Changes |
|------|------|---------|
| `package.json` | 10.1.1, 10.1.4 | Add MCP SDK dependency, build script |
| `docker-compose.yml` | 10.4.3 | Add optional MCP server service |
| `tsconfig.json` | 10.1.4 | Potentially add MCP build path |

---

*Phase 10 depends on Phase 8 and 9. It can run in parallel with Phase 11 (Conversation).*
