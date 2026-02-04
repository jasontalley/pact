# Implementation Checklist: Phase 17 — Local/Remote Split

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 17 |
| **Focus** | Decouple Pact from direct filesystem access; enable remote deployment via Client SDK |
| **Status** | Not Started |
| **Prerequisites** | Phase 14 (Ingestion Boundary), Phase 15 (Pact Main Governance) |
| **Related Docs** | [implementation-checklist-phase15.md](implementation-checklist-phase15.md), [implementation-checklist-phase16.md](implementation-checklist-phase16.md) |

---

## Overview

Phase 17 decouples Pact from direct filesystem access, enabling deployment as a remote service that clients connect to from VSCode extensions, CLI tools, CI/CD pipelines, or a PactHub multi-tenant environment.

**Current state:** 40+ direct `fs.*` calls scattered across 13+ source files. Every reconciliation pipeline node, the context builder, the quality analyzer, and the apply service assume Pact runs on the same machine as the project.

**Target state:** A **ContentProvider** abstraction replaces all direct fs calls. A **@pact/client-sdk** npm package handles client-side file reading, git operations, coverage collection, and pushing pre-read content to a remote Pact server. Local overlays enable offline work with sync to remote.

**Deployment models enabled:**

| Model | Client | Server | How Content Arrives |
|-------|--------|--------|---------------------|
| A: Co-located (current) | Same machine | Same machine | FilesystemContentProvider reads files |
| B: Local Client + Remote | VSCode ext / CLI | Remote server | Client SDK reads files, sends via API |
| C: CI/CD Pipeline | GitHub Action / script | Remote server | Pipeline reads files, uploads via API |
| D: PactHub | Multiple local instances | Shared remote | Each pushes intent data, pulls Main state |

**All four models use the same server code.** The difference is only in how data arrives.

### Current Filesystem Dependencies

| File | fs Calls | Role |
|------|----------|------|
| `src/modules/agents/graphs/nodes/reconciliation/structure.node.ts` | `readdirSync` | Walks repo structure |
| `src/modules/agents/graphs/nodes/reconciliation/discover-fullscan.node.ts` | `readFileSync`, `existsSync` | Reads test files |
| `src/modules/agents/graphs/nodes/reconciliation/discover-delta.node.ts` | `readFileSync`, `existsSync` | Reads changed test files |
| `src/modules/agents/graphs/nodes/reconciliation/context.node.ts` | `readdirSync`, `readFileSync`, `existsSync` | Reads docs + source files |
| `src/modules/agents/tools/reconciliation-tools.service.ts` | `readdirSync`, `readFileSync`, `existsSync` | Tool executors |
| `src/modules/agents/apply.service.ts` | `readFile`, `writeFile`, `access` | Injects @atom annotations |
| `src/modules/agents/context-builder.service.ts` | `readFileSync`, `existsSync`, `readdirSync` (12 calls) | Core context building |
| `src/modules/agents/brownfield-analysis.service.ts` | `readFileSync`, `readdirSync` | Brownfield analysis |
| `src/modules/agents/test-atom-coupling.service.ts` | `readFileSync`, `existsSync` | Coupling analysis |
| `src/modules/agents/utils/dependency-analyzer.ts` | `readFileSync` | Import graph analysis |
| `src/modules/quality/test-quality.service.ts` | `readFileSync` | Quality analysis |

---

## 17A: ContentProvider Abstraction Layer

### Context

Define a ContentProvider interface and refactor all filesystem calls to use it. This is a behavioral no-op refactor — everything works exactly as before, but through the abstraction.

### Tasks

- [ ] **17A.1** Define ContentProvider interface
  - **File**: `src/modules/agents/content/content-provider.interface.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    ```typescript
    interface ContentProvider {
      listFiles(dir: string, options?: ListOptions): Promise<FileEntry[]>;
      walkDirectory(rootDir: string, excludePatterns: string[], maxFiles: number): Promise<string[]>;
      readFile(filePath: string): Promise<string>;
      exists(filePath: string): Promise<boolean>;
      readFileOrNull(filePath: string): Promise<string | null>;
      getCommitHash?(): Promise<string | null>;
      readonly providerType: 'filesystem' | 'pre-read' | 'hybrid';
    }
    ```
    - Also define `FileEntry { path, isDirectory, size? }` and `ListOptions { withFileTypes?, recursive? }`

- [ ] **17A.2** Create FilesystemContentProvider
  - **File**: `src/modules/agents/content/filesystem-content-provider.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Wraps existing `fs.*` calls
    - Extract `walkDirectory()` logic from structure.node.ts
    - All methods return `Promise<>` (consistent with pre-read provider)
    - Error handling: `readFile` throws on missing file, `readFileOrNull` returns null

- [ ] **17A.3** Create PreReadContentProvider
  - **File**: `src/modules/agents/content/pre-read-content-provider.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Backed by `Map<string, string>` (path → content) and `FileEntry[]` (file tree)
    - Populated from API payload (17C)
    - `readFile` throws if path not in map (`File not available in pre-read content`)
    - `walkDirectory` returns filtered file tree entries
    - `exists` checks map keys

- [ ] **17A.4** Create WriteProvider interface
  - **File**: `src/modules/agents/content/write-provider.interface.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - For the apply service's @atom injection (the only write operation)
    ```typescript
    interface WriteProvider {
      writeFile(filePath: string, content: string): Promise<void>;
      patchFile(filePath: string, lineNumber: number, insertLine: string): Promise<void>;
    }
    ```
    - `FilesystemWriteProvider` for co-located mode
    - `PatchInstructionProvider` for remote mode (returns patch instructions instead of writing)

- [ ] **17A.5** Add ContentProvider to graph node configuration
  - **File**: `src/modules/agents/graphs/nodes/reconciliation/node-config.ts` (or wherever NodeConfig is defined)
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Add `contentProvider: ContentProvider` to the config passed to all pipeline nodes

- [ ] **17A.6** Refactor structure node
  - **File**: `src/modules/agents/graphs/nodes/reconciliation/structure.node.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Remove `import * as fs from 'fs'`
    - Remove inline `walkDirectory()` function
    - Use `config.contentProvider.walkDirectory()` instead
    - Same output shape — no state schema changes

- [ ] **17A.7** Refactor discover-fullscan node
  - **File**: `src/modules/agents/graphs/nodes/reconciliation/discover-fullscan.node.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Replace `fs.readFileSync(filePath, 'utf-8')` with `await contentProvider.readFile(filePath)`
    - Replace `fs.existsSync()` with `await contentProvider.exists()`
    - `parseTestFile()` becomes async (accepts content string)

- [ ] **17A.8** Refactor discover-delta node
  - **File**: `src/modules/agents/graphs/nodes/reconciliation/discover-delta.node.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Same pattern as discover-fullscan

- [ ] **17A.9** Refactor context node
  - **File**: `src/modules/agents/graphs/nodes/reconciliation/context.node.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Replace fs calls in `buildDocumentationIndex()` and `createFallbackAnalysis()`
    - Use content provider for all file reads and directory listings

- [ ] **17A.10** Refactor ContextBuilderService
  - **File**: `src/modules/agents/context-builder.service.ts`
  - **Priority**: High | **Effort**: L
  - **Details**:
    - Largest single refactor (~12 call sites)
    - Inject `ContentProvider` (or accept as parameter per method)
    - Replace all `fs.readFileSync`, `fs.existsSync`, `fs.readdirSync`

- [ ] **17A.11** Refactor ReconciliationToolsService
  - **File**: `src/modules/agents/tools/reconciliation-tools.service.ts`
  - **Priority**: High | **Effort**: L
  - **Details**:
    - Inject ContentProvider
    - Replace fs calls in: `getRepoStructure()`, `discoverOrphansDelta()`, `searchDocsByConcepts()`, `analyzeDependencies()`, `findDocFiles()`

- [ ] **17A.12** Refactor ApplyService
  - **File**: `src/modules/agents/apply.service.ts`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - `injectAtomAnnotation()` uses WriteProvider instead of direct `fs.writeFile`
    - In co-located mode: `FilesystemWriteProvider` (same behavior as today)
    - In remote mode: `PatchInstructionProvider` returns patches for client to apply

- [ ] **17A.13** Refactor remaining services
  - **Files**: `brownfield-analysis.service.ts`, `test-atom-coupling.service.ts`, `dependency-analyzer.ts`, `test-quality.service.ts`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Inject ContentProvider into each
    - Replace all remaining fs calls

- [ ] **17A.14** Wire ContentProvider in GraphRegistryService
  - **File**: `src/modules/agents/graphs/graph-registry.service.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Create `FilesystemContentProvider` by default (co-located mode)
    - Pass through NodeConfig to all graph nodes
    - Add method `createGraphWithContentProvider(name, provider)` for alternative providers

- [ ] **17A.15** Create barrel export
  - **File**: `src/modules/agents/content/index.ts`
  - **Priority**: Low | **Effort**: S

### Verification

- [ ] All existing tests pass with no behavioral changes
- [ ] `grep -r "from 'fs'" src/modules/agents/graphs/nodes/` returns zero results (except test files)
- [ ] `grep -r "from 'fs'" src/modules/agents/*.service.ts` returns zero results (except test files)
- [ ] Reconciliation pipeline produces identical results via ContentProvider as via direct fs

---

## 17B: Client SDK Package

### Context

Create `@pact/client-sdk` as a separate npm package within the monorepo. This package provides client-side file reading, git utilities, a typed API client, and sync capabilities.

### Tasks

- [ ] **17B.1** Set up package structure
  - **Files**: `packages/client-sdk/package.json`, `packages/client-sdk/tsconfig.json`, `packages/client-sdk/src/index.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Package name: `@pact/client-sdk`
    - Zero dependency on NestJS (uses only `node:fs`, `node:path`, `node:child_process`, `fetch`)
    - Update root `package.json` with workspaces: `["packages/*"]`

- [ ] **17B.2** Create PactClient core
  - **File**: `packages/client-sdk/src/client.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    ```typescript
    interface PactClientConfig {
      serverUrl: string;
      projectId?: string;
      authToken?: string;
      projectRoot: string;
      timeout?: number;
    }
    class PactClient {
      get reconciliation(): ReconciliationClient;
      get atoms(): AtomsClient;
      get molecules(): MoleculesClient;
      get sync(): SyncClient;
      get overlay(): OverlayClient;
    }
    ```

- [ ] **17B.3** Create FileReader module
  - **File**: `packages/client-sdk/src/file-reader.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `readForReconciliation(options)` — reads all test files + related source files, returns `ReadContent`
    - `readFiles(paths)` — reads specific files by path
    - `buildManifest(options)` — walks directory for file manifest
    - Returns `{ manifest: FileManifest, contents: Map<string, string>, totalSize: number }`

- [ ] **17B.4** Create GitClient module
  - **File**: `packages/client-sdk/src/git-client.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - `getCurrentCommitHash()`, `getChangedFiles(since)`, `isGitRepository()`, `getDiff(base)`
    - Consolidates logic from existing `src/modules/agents/utils/git-utils.ts`

- [ ] **17B.5** Create PactApiClient module
  - **File**: `packages/client-sdk/src/api-client.ts`
  - **Priority**: High | **Effort**: L
  - **Details**:
    - Typed HTTP client for all Pact REST endpoints
    - Reconciliation: `startReconciliation()`, `submitPreReadContent()`, `getRunDetails()`, `getRecommendations()`, `applyRecommendations()`
    - Atoms: `listAtoms(filters?)`, `getAtom(id)`, `commitAtom(id)`
    - Molecules: `listMolecules()`, `getMolecule(id)`
    - Sync: `pushLocalOverlay()`, `pullMainState(since?)`
    - Drift: `listDrift()`, `getDriftSummary()`

- [ ] **17B.6** Create CoverageCollector module
  - **File**: `packages/client-sdk/src/coverage-collector.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - `collectFromFile(coveragePath)` — reads Istanbul/c8/lcov coverage and transforms for API
    - `upload(client, data)` — uploads coverage to remote Pact

- [ ] **17B.7** Create PatchApplicator module
  - **File**: `packages/client-sdk/src/patch-applicator.ts`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - `applyAnnotationPatches(patches)` — applies @atom annotation patches to local files
    - `previewPatches(patches)` — preview changes without applying
    - Handles the client side of the apply service's patch instructions (17A.12)

- [ ] **17B.8** Create type definitions
  - **File**: `packages/client-sdk/src/types.ts`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Shared types for API requests/responses, file manifests, sync payloads
    - Aligned with server-side DTOs

### Verification

- [ ] `npm run build` in `packages/client-sdk` succeeds
- [ ] All unit tests pass
- [ ] Package can be `npm link`ed from an external project
- [ ] Zero dependency on NestJS or any server-side code

---

## 17C: Pre-Read Content API Endpoints

### Context

Add server-side API endpoints that accept pre-read file content instead of requiring filesystem access. This is the server-side counterpart to the client SDK.

### Tasks

- [ ] **17C.1** Create PreReadContentDto
  - **File**: `src/modules/agents/dto/pre-read-reconciliation.dto.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    ```typescript
    class PreReadContentDto {
      rootDirectory: string;
      manifest: { files: string[]; testFiles: string[]; sourceFiles: string[] };
      fileContents: Record<string, string>;  // path → content
      commitHash?: string;
      options?: ReconciliationOptionsDto;
    }
    ```

- [ ] **17C.2** Add pre-read reconciliation endpoint
  - **File**: `src/modules/agents/reconciliation.controller.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - `POST /agents/reconciliation/analyze/pre-read`
    - Accepts `PreReadContentDto`
    - Returns same `AnalysisStartResult` as filesystem-based endpoint

- [ ] **17C.3** Add pre-read support to ReconciliationService
  - **File**: `src/modules/agents/reconciliation.service.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `analyzeWithPreReadContent(dto)` method
    - Creates `PreReadContentProvider` from DTO's `fileContents` map
    - Creates graph with pre-read content provider
    - Invokes graph same as filesystem-based flow

- [ ] **17C.4** Add provider override to GraphRegistryService
  - **File**: `src/modules/agents/graphs/graph-registry.service.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 17A.14
  - **Details**:
    - `createGraphWithContentProvider(name, provider)` creates graph instance with specified provider in NodeConfig

- [ ] **17C.5** Add content size limits
  - **Priority**: Low | **Effort**: S
  - **Details**:
    - Configure max payload size (e.g., 50MB) for pre-read endpoint
    - Optional gzip compression support via `Content-Encoding` header

### Verification

- [ ] `POST /agents/reconciliation/analyze/pre-read` accepts JSON with file contents
- [ ] Produces identical reconciliation results as filesystem-based `POST /agents/reconciliation/analyze`
- [ ] Handles missing files gracefully (clear error messages)
- [ ] Payload size limits enforced

---

## 17D: Local Overlay and Sync Protocol

### Context

Enable clients to maintain a local overlay of cached Pact Main state combined with local discoveries, and sync these with the remote server.

### Tasks

- [ ] **17D.1** Define local overlay data model
  - **File**: `packages/client-sdk/src/overlay.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    ```typescript
    interface LocalOverlay {
      mainSnapshot: MainStateSnapshot;       // Cached Pact Main
      lastSyncedAt: Date;
      localAtomTestLinks: LocalAtomTestLink[];
      localTestResults: LocalTestResult[];
      localRecommendations: LocalRecommendation[];
      projectId?: string;
      projectRoot: string;
      commitHash?: string;
    }
    interface MainStateSnapshot {
      atoms: AtomSummary[];
      molecules: MoleculeSummary[];
      atomTestLinks: AtomTestLinkSummary[];
      snapshotVersion: number;
      generatedAt: Date;
    }
    ```

- [ ] **17D.2** Create OverlayStore
  - **File**: `packages/client-sdk/src/overlay-store.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Persists overlay to `.pact/overlay.json` in project root
    - `load()`, `save()`, `merge(remote, local)` methods
    - `.pact/` directory added to `.gitignore`

- [ ] **17D.3** Create pull sync
  - **File**: `packages/client-sdk/src/sync/pull.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `pull()` — fetches latest Main state from remote since `lastSyncedAt`
    - Merges with local overlay
    - Returns `PullResult { updatedAtoms, updatedMolecules, conflicts }`

- [ ] **17D.4** Create push sync
  - **File**: `packages/client-sdk/src/sync/push.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `push()` — sends unpushed local recommendations to remote
    - Marks as pushed on success
    - Returns `PushResult { pushed, conflicts }`

- [ ] **17D.5** Create conflict detector
  - **File**: `packages/client-sdk/src/sync/conflict-detector.ts`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Detect conflicts between local recommendations and remote state
    - Types: `duplicate_atom`, `overlapping_test_link`, `stale_snapshot`
    - Default resolution: `remote_wins` (remote is authoritative for Main)
    - Supports `local_wins`, `merge`, `manual` for user override

- [ ] **17D.6** Create server-side sync endpoints
  - **File**: `src/modules/agents/sync.service.ts` + controller additions
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `GET /agents/reconciliation/main-state?since=` — returns Main state snapshot
    - `POST /agents/reconciliation/sync/push` — accepts local overlay, detects conflicts, merges
    - `SyncService.getMainStateSnapshot(since?)` — atoms, molecules, links since timestamp
    - `SyncService.pushLocalOverlay(overlay)` — validate, detect conflicts, merge

### Verification

- [ ] Local overlay can be created, populated, saved, and loaded
- [ ] Pull retrieves only updates since last sync
- [ ] Push sends unpushed recommendations, marks as pushed
- [ ] Duplicate atom detection works across instances
- [ ] Conflict resolution defaults to remote-wins
- [ ] `.pact/overlay.json` is gitignored

---

## 17E: Scope Middleware and Agent Filtering

### Context

Agents see only Pact Main state by default. Local overlays are advisory. Project-level scope isolation.

### Tasks

- [ ] **17E.1** Create scope middleware
  - **File**: `src/common/middleware/scope.middleware.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Extract `x-pact-project-id` and `x-pact-scope` headers
    - Store in `req['pactScope']` for downstream use
    - Default scope: `'main'` when header not provided

- [ ] **17E.2** Create scope decorator
  - **File**: `src/common/decorators/scope.decorator.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - `@PactScope()` parameter decorator extracts scope context from request
    - `PactScopeContext { projectId?, scope: 'main' | 'local' | 'merged' }`

- [ ] **17E.3** Add scope-filtered queries to services
  - **Files**: `atoms.service.ts`, `molecules.service.ts`, `reconciliation.repository.ts`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Accept optional `projectId` for filtering
    - Agents operating on Main state see only committed atoms (status: 'committed')
    - Local overlay recommendations tagged with `scope: 'local'`

- [ ] **17E.4** Configure agent scope
  - **File**: `src/modules/agents/graphs/graph-registry.service.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - When invoking reconciliation graph, pass scope context
    - Agents see Main-scope data unless explicitly configured for merged view

### Verification

- [ ] When `x-pact-project-id` header is set, only that project's data is returned
- [ ] Agents see only Main-scope data by default
- [ ] Scope filtering does not break existing behavior when headers are absent

---

## 17F: MCP Integration and Deployment Verification

### Context

Update MCP tools to use the client SDK and verify all four deployment models work end-to-end.

### Tasks

- [ ] **17F.1** Migrate MCP API client to SDK
  - **File**: `src/mcp/pact-api-client.ts`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Replace internal HTTP client with `@pact/client-sdk` PactApiClient
    - MCP server becomes thin wrapper around client SDK

- [ ] **17F.2** Add MCP pre-read reconciliation tool
  - **File**: `src/mcp/tools/` (new tool)
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - `pact_reconcile_pre_read` tool
    - Uses client SDK's FileReader to gather local files
    - Submits via PactApiClient.submitPreReadContent()

- [ ] **17F.3** Create VSCode extension example
  - **File**: `packages/client-sdk/examples/vscode-extension/example.ts`
  - **Priority**: Low | **Effort**: M
  - **Details**:
    - Shows how a VSCode extension uses PactClient
    - FileReader → submitPreReadContent → receive recommendations → PatchApplicator

- [ ] **17F.4** Create CLI tool example
  - **File**: `packages/client-sdk/examples/cli/example.ts`
  - **Priority**: Low | **Effort**: M
  - **Details**:
    - `pact reconcile` — reads files, submits to remote, displays results
    - `pact sync pull` / `push` — sync operations
    - `pact apply` — applies patches locally

- [ ] **17F.5** Create CI/CD pipeline example
  - **File**: `packages/client-sdk/examples/ci/example.ts`
  - **Priority**: Low | **Effort**: S
  - **Details**:
    - GitHub Action / script pattern
    - FileReader + CoverageCollector → submit to remote → fail on quality issues

- [ ] **17F.6** PactHub multi-instance verification
  - **Priority**: Low | **Effort**: L
  - **Details**:
    - Test scenario: two client instances → same server → both reconcile → both push → conflict detection
    - Verify: no data loss, conflicts detected, eventual consistency

### Verification

- [ ] VSCode extension example connects to remote Pact, submits files, receives recommendations, applies patches — all without server filesystem access
- [ ] CLI tool works end-to-end with remote server
- [ ] CI pipeline example runs without filesystem access on server side
- [ ] Multi-instance push/pull maintains consistency with conflict detection

---

## Files Inventory

### New Files (~40+ files)

**17A: ContentProvider**

| File | Purpose |
|------|---------|
| `src/modules/agents/content/content-provider.interface.ts` | ContentProvider interface |
| `src/modules/agents/content/filesystem-content-provider.ts` | Filesystem implementation |
| `src/modules/agents/content/pre-read-content-provider.ts` | Pre-read (in-memory) implementation |
| `src/modules/agents/content/write-provider.interface.ts` | WriteProvider interface |
| `src/modules/agents/content/index.ts` | Barrel export |

**17B: Client SDK**

| File | Purpose |
|------|---------|
| `packages/client-sdk/package.json` | Package definition |
| `packages/client-sdk/tsconfig.json` | TypeScript config |
| `packages/client-sdk/src/index.ts` | Package entry point |
| `packages/client-sdk/src/client.ts` | PactClient core |
| `packages/client-sdk/src/file-reader.ts` | Local file reading |
| `packages/client-sdk/src/git-client.ts` | Git operations |
| `packages/client-sdk/src/api-client.ts` | Typed HTTP API client |
| `packages/client-sdk/src/coverage-collector.ts` | Coverage collection |
| `packages/client-sdk/src/patch-applicator.ts` | Patch application |
| `packages/client-sdk/src/types.ts` | Shared type definitions |

**17C: Pre-Read API**

| File | Purpose |
|------|---------|
| `src/modules/agents/dto/pre-read-reconciliation.dto.ts` | Pre-read content DTO |

**17D: Overlay and Sync**

| File | Purpose |
|------|---------|
| `packages/client-sdk/src/overlay.ts` | Overlay data model |
| `packages/client-sdk/src/overlay-store.ts` | Overlay persistence |
| `packages/client-sdk/src/sync/pull.ts` | Pull sync |
| `packages/client-sdk/src/sync/push.ts` | Push sync |
| `packages/client-sdk/src/sync/conflict-detector.ts` | Conflict detection |
| `packages/client-sdk/src/sync/index.ts` | Sync barrel |
| `src/modules/agents/sync.service.ts` | Server-side sync service |

**17E: Scope Middleware**

| File | Purpose |
|------|---------|
| `src/common/middleware/scope.middleware.ts` | Scope extraction |
| `src/common/decorators/scope.decorator.ts` | Scope parameter decorator |

**17F: Examples**

| File | Purpose |
|------|---------|
| `packages/client-sdk/examples/vscode-extension/example.ts` | VSCode extension example |
| `packages/client-sdk/examples/cli/example.ts` | CLI tool example |
| `packages/client-sdk/examples/ci/example.ts` | CI/CD pipeline example |

### Modified Files (~13 files)

| File | Changes |
|------|---------|
| `src/modules/agents/graphs/nodes/reconciliation/structure.node.ts` | Use ContentProvider |
| `src/modules/agents/graphs/nodes/reconciliation/discover-fullscan.node.ts` | Use ContentProvider |
| `src/modules/agents/graphs/nodes/reconciliation/discover-delta.node.ts` | Use ContentProvider |
| `src/modules/agents/graphs/nodes/reconciliation/context.node.ts` | Use ContentProvider |
| `src/modules/agents/graphs/graph-registry.service.ts` | Wire ContentProvider |
| `src/modules/agents/tools/reconciliation-tools.service.ts` | Inject ContentProvider |
| `src/modules/agents/apply.service.ts` | Use WriteProvider |
| `src/modules/agents/context-builder.service.ts` | Inject ContentProvider |
| `src/modules/agents/brownfield-analysis.service.ts` | Inject ContentProvider |
| `src/modules/agents/test-atom-coupling.service.ts` | Inject ContentProvider |
| `src/modules/agents/utils/dependency-analyzer.ts` | Accept ContentProvider |
| `src/modules/quality/test-quality.service.ts` | Inject ContentProvider |
| `src/modules/agents/reconciliation.controller.ts` | Add pre-read + sync endpoints |
| `src/modules/agents/reconciliation.service.ts` | Add pre-read method |
| `src/mcp/pact-api-client.ts` | Replace with SDK |
| `package.json` | Add workspaces |

### Test Files

| File | Purpose |
|------|---------|
| `src/modules/agents/content/content-provider.spec.ts` | Interface contract tests |
| `src/modules/agents/content/filesystem-content-provider.spec.ts` | Filesystem tests |
| `src/modules/agents/content/pre-read-content-provider.spec.ts` | Pre-read tests |
| `packages/client-sdk/src/__tests__/file-reader.spec.ts` | FileReader tests |
| `packages/client-sdk/src/__tests__/git-client.spec.ts` | GitClient tests |
| `packages/client-sdk/src/__tests__/api-client.spec.ts` | API client tests |
| `packages/client-sdk/src/__tests__/coverage-collector.spec.ts` | Coverage tests |
| `packages/client-sdk/src/__tests__/patch-applicator.spec.ts` | Patch tests |
| `packages/client-sdk/src/__tests__/overlay-store.spec.ts` | Overlay tests |
| `packages/client-sdk/src/__tests__/sync/pull.spec.ts` | Pull sync tests |
| `packages/client-sdk/src/__tests__/sync/push.spec.ts` | Push sync tests |
| `packages/client-sdk/src/__tests__/sync/conflict-detector.spec.ts` | Conflict tests |
| `src/modules/agents/sync.service.spec.ts` | Server sync tests |
| `src/modules/agents/reconciliation.service.pre-read.spec.ts` | Pre-read reconciliation tests |
| `src/common/middleware/scope.middleware.spec.ts` | Scope middleware tests |
| `test/reconciliation-pre-read.e2e-spec.ts` | E2E pre-read test |

---

## Implementation Order

```
17A (ContentProvider) ─────────────────────────────────────────────> 17A.14 (Wire)
17B (Client SDK) ── can start after 17A.1 (interface defined) ────> 17B.8 (Tests)
                                                                       │
17C (Pre-Read API) ── depends on 17A complete + 17B.5 ────────────> 17C.5 (Limits)
17D (Overlay + Sync) ── depends on 17B complete ──────────────────> 17D.6 (Server sync)
17E (Scope Middleware) ── depends on 17A ─────────────────────────> 17E.4 (Agent scope)
                                                                       │
17F (Integration) ── depends on ALL above ────────────────────────> 17F.6 (PactHub verification)
```

17A must start first (pipeline refactor). 17B can begin in parallel after 17A.1 defines the interface. 17C-17E depend on 17A+17B completion. 17F is the integration/verification phase.

---

## Key Design Decisions

1. **ContentProvider is async** — all methods return `Promise<>` even for filesystem implementation, ensuring the interface works for both sync fs and async network-backed providers.

2. **Local overlays are ephemeral files** — stored in `.pact/overlay.json`, not committed to git. If lost, simply re-pull from remote.

3. **Conflict resolution defaults to remote-wins** — when two instances create atoms from the same test, the first to push wins. The second gets a conflict notification.

4. **Client SDK is zero-dependency on NestJS** — uses only Node.js built-ins and `fetch`, making it embeddable in VSCode extensions and CLI tools.

5. **No schema migration needed** — the `projectId` column already exists on 5+ entities. Phase 17 activates its use through scope middleware.

6. **Pre-read content transmitted as JSON** — for repos under 50MB of relevant content. Streaming endpoint available for larger repos.
