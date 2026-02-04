# The Locality Architecture

An architectural analysis of Pact's data plane separation and the Ingestion Boundary pattern that enables location-independent analysis.

---

## 1. The Problem

Pact currently makes 40+ direct `fs` module calls to read user project data (test files, source code, documentation). Every reconciliation pipeline node, the test coupling checker, the quality analyzer, the brownfield service, and the apply service all assume Pact runs on the same machine as the project it analyzes.

This assumption is correct *today* (Docker container), but it creates a hard architectural constraint that prevents Pact from evolving into:
- A VSCode plugin backed by a remote server
- A CLI tool that pushes intent data to a shared instance
- A team collaboration platform ("PactHub")
- A SaaS offering for enterprise adoption

The question isn't "should we abstract the filesystem?" -- it's "what is the correct architectural cut that makes Pact's analysis capabilities location-independent without over-engineering the current implementation?"

## 2. The Two Data Planes

Pact operates on two fundamentally different categories of data:

### Intent Plane (Pact Owns)

Data that Pact creates, stores, and is the source of truth for:

| Data | Entity | Characteristics |
|------|--------|----------------|
| Behavioral intent | `Atom` | Immutable after commitment |
| Descriptive groupings | `Molecule` | Mutable lenses, recomposable |
| Inferred recommendations | `AtomRecommendation` | Transient until accepted |
| Test analysis records | `TestRecord` | Delta closure tracking |
| Quality scores | `TestQualitySnapshot` | Computed from analysis |
| Coupling metrics | `MetricsSnapshot` | Computed from linkage |
| Evidence artifacts | `Evidence` | Immutable execution results |
| Commitments | `CommitmentArtifact` | Immutable canonical snapshots |
| Conflict records | `ConflictRecord` | Organizational diagnostics |

**Total: 23 entities, ~19 are purely Intent Plane data.**

### Project Plane (Pact Borrows)

Data that belongs to the user's project and Pact only reads:

| Data | How Accessed | Where Referenced |
|------|-------------|-----------------|
| Test file content | `fs.readFileSync()` in 6+ nodes | structure, discover, context nodes |
| Source file content | `fs.readFileSync()` in context builder | dependency analysis, import parsing |
| Documentation files | `fs.readdirSync()` + `fs.readFileSync()` | context node doc index |
| Git history | `execAsync('git diff ...')` | delta mode change detection |
| Coverage reports | Read ephemerally in coverage-fast graph | Never stored |
| Directory structure | `fs.readdirSync()` recursive walk | structure node |

**Pact does NOT currently store any Project Plane content in its database.** It stores only *references* (file paths, line numbers, code hashes) -- bookmarks back to the project, not the content itself.

### The Critical Gap

This means:
1. **Analysis requires live filesystem access.** You can't quality-score a test from a `TestRecord` because it only stores `filePath`, not the test's source code.
2. **After reconciliation, project context is lost.** The LLM inference that created an `AtomRecommendation` read the test file during the run. That content is gone. Re-analysis requires re-reading the file.
3. **Remote operation is impossible.** A Pact server without filesystem access cannot perform any analysis -- it has the results but not the inputs.

## 3. The Ingestion Boundary

The architectural solution is to define a clear **Ingestion Boundary** -- the point where Project Plane data crosses into the Intent Plane and becomes Pact-owned data:

```
PROJECT PLANE                    INGESTION BOUNDARY                    INTENT PLANE
(filesystem)                     (API / pipeline)                      (database)

test files ─────────────────┐
source files ───────────────┤
documentation ──────────────┤    ┌──────────────────┐    ┌─────────────────────┐
coverage reports ───────────┼───▶│  Pact ingests     │───▶│  Pact stores &      │
git history ────────────────┤    │  content as text  │    │  analyzes from DB   │
directory structure ────────┘    └──────────────────┘    └─────────────────────┘
```

**Design principle**: Once data crosses the Ingestion Boundary, Pact works entirely from its database. Filesystem references (paths) are bookmarks for the developer's convenience, not runtime dependencies for analysis.

### What Ingestion Means Concretely

| Operation | Today (filesystem) | After Ingestion Boundary | What Gets Stored |
|-----------|--------------------|--------------------------| -----------------|
| Reconciliation: discover tests | `fs.readFileSync(testFile)` | Pipeline reads file, stores content in `TestRecord.testSourceCode` | Test source as text |
| Quality analysis | `fs.readFileSync(testFile)` | `POST /quality/analyze-test` with body text, or analyze from stored `TestRecord.testSourceCode` | Quality scores + dimensions |
| Coverage analysis | Read lcov/istanbul from filesystem | `POST /coverage/upload` with file content | Parsed coverage data |
| @atom injection | `fs.writeFile(testFile)` | Return patch instructions to client; client applies locally | Patch recorded in DB, applied by client |

### What This Does NOT Mean

- **Not a full filesystem abstraction layer.** We don't need `IFileSystemProvider` with pluggable backends. That's over-engineering for the current stage.
- **Not immediate refactoring of reconciliation.** The pipeline can continue reading from `fs` when running locally. The change is: *also* store what it reads.
- **Not breaking existing functionality.** Everything that works today continues to work. The Ingestion Boundary is additive.

## 4. Deployment Architectures

The Ingestion Boundary enables three deployment models without requiring architectural changes between them:

### Model A: Co-Located (Current)

Pact runs as a Docker container alongside the project. Full filesystem access. Ingestion happens internally during reconciliation.

```
┌─────────────────────────────────┐
│ Developer Machine               │
│                                 │
│  Project Files ←──── fs ────→ Pact Container    │
│  (tests, src)                 (NestJS + DB)     │
│                                                  │
│  Ingestion = internal (pipeline reads files)     │
└──────────────────────────────────────────────────┘
```

**No changes needed.** This is today's model. The only addition is that the pipeline *stores* what it reads, not just analyzes it.

### Model B: Local Client + Remote Server

A thin local client reads project files and sends content to a remote Pact server via API. The server never touches the filesystem.

```
Developer Machine                    Pact Server (Remote)
┌──────────────────────┐            ┌──────────────────────┐
│ Project Files        │            │                      │
│   tests/ src/ docs/  │            │  Analysis Engine     │
│         ↓            │  API calls │  LLM Integration     │
│ Pact Client          │ ─────────→│  Database (primary)  │
│   reads files        │            │  Quality Scoring     │
│   uploads content    │ ←─────────│  Epistemic Metrics   │
│   applies patches    │  patches   │  Dashboard           │
│                      │            │                      │
└──────────────────────┘            └──────────────────────┘
```

**Client responsibilities**: File reading, git operations, patch application, coverage collection.
**Server responsibilities**: LLM inference, quality scoring, epistemic analysis, persistence.

The client could be: VSCode extension, CLI tool, CI/CD action, or IDE plugin.

### Model C: PactHub (Team Collaboration)

Multiple developers push Intent Plane data to a shared Pact instance. Like GitHub for intent.

```
Dev A (local Pact) ──push──→ ┌────────────┐ ←──push── Dev B (local Pact)
                              │  PactHub   │
                              │  (shared)  │
Dev C (local Pact) ──push──→ │            │ ←──push── CI/CD
                              └────────────┘
```

**What syncs**: Atoms, molecules, commitments, evidence, quality scores, metrics, coverage data, conflict records.
**What stays local**: Project source code, test file content (optionally synced), git history.

### The Key Insight

All three models use the **same Pact server code**. The difference is only in *how data arrives*:
- Model A: Internal pipeline reads files and stores content
- Model B: External client sends content via API
- Model C: Multiple instances sync Intent Plane data

The Ingestion Boundary design means the Pact server doesn't know or care which model is active. It receives text, analyzes it, stores results.

## 5. Data That Crosses the Boundary

### Must Cross (Required for Analysis)

| Data | Ingestion Method | Storage Target | Privacy Risk |
|------|-----------------|----------------|--------------|
| Test source code | Stored during reconciliation, or uploaded via API | `TestRecord.testSourceCode` | Low (tests are not secrets) |
| Coverage summary | Uploaded via API | `CoverageReport.summary` | None |
| Per-file coverage | Uploaded via API | `CoverageReport.fileDetails` | Low (paths only) |
| Directory structure | Provided as file list | Transient (used during reconciliation) | None |
| Git diff (delta mode) | Provided as changed file list | Transient | None |

### Should Not Cross (Stay Local)

| Data | Reason | Alternative |
|------|--------|-------------|
| Implementation source code | IP/security risk; not needed for intent analysis | Only test code crosses |
| Secrets / .env files | Obvious | Never read |
| Full git history | Too large, not needed | Only diff/changed files |
| Build artifacts | Not relevant | Coverage reports instead |

### Optional (Configurable)

| Data | When Useful | Privacy Consideration |
|------|-------------|----------------------|
| Documentation content | Context for LLM inference | May contain sensitive architecture info |
| Import dependency graph | Better atom inference | Reveals codebase structure |
| Test output/logs | Evidence quality | May contain PII from test data |

## 6. The @atom Annotation Problem

The `@atom` annotation injection (`apply.service.ts`) is the only place Pact *writes* to the Project Plane. This creates a unique locality challenge:

**Current**: `fs.writeFile()` directly modifies the test file.

**With Ingestion Boundary**: Pact generates a patch (file path + line number + annotation text) and returns it to the client. The client applies the patch locally.

```typescript
// Current (co-located)
await fs.writeFile(filePath, modifiedContent);

// Future (any deployment model)
return {
  patches: [
    { filePath: 'test/auth.spec.ts', lineNumber: 42, insert: '// @atom IA-001' }
  ]
};
// Client applies patches to local filesystem
```

This is already partially supported -- the `patchOps` field on `ReconciliationRun` stores the operations that were performed. The change is to make this the *primary* mechanism rather than direct file writes.

**No immediate refactoring needed.** In Model A (co-located), the current `fs.writeFile` approach works. The patch-return approach becomes necessary only when implementing Model B.

## 7. Implications for the Reconciliation Pipeline

The reconciliation pipeline currently flows: `structure → discover → context → infer → synthesize → verify → persist`

With the Ingestion Boundary pattern, the pipeline gains one responsibility: **store what you read.**

### Changes to Existing Nodes

| Node | Current | With Ingestion Pattern | Priority |
|------|---------|----------------------|----------|
| `discover` | Reads test files, extracts metadata | **Also stores test source in `TestRecord.testSourceCode`** | Phase 14 |
| `context` | Reads source files, docs | No change needed (context is transient LLM input) | Future |
| `structure` | Walks filesystem | No change (file list is transient) | Future |
| `persist` | Writes to DB | No change | N/A |

The critical change is in `discover`: when it reads a test file to find `@atom` annotations and extract test cases, it should also store the test source code in the `TestRecord` entity. This is a small change with large architectural impact -- it means quality analysis can be performed from the database without re-reading files.

### Future Pipeline Evolution (Not Phase 14)

Eventually, the pipeline could accept pre-read content instead of file paths:

```typescript
// Today: pipeline reads from filesystem
const state = { rootDirectory: '/path/to/project' };

// Future: client pre-reads and sends content
const state = {
  testFiles: [
    { path: 'test/auth.spec.ts', content: '...', lineCount: 150 },
    { path: 'test/payment.spec.ts', content: '...', lineCount: 200 },
  ],
  changedFiles: ['test/auth.spec.ts'],  // delta mode
};
```

This refactoring is a separate effort (possibly Phase 16+) and should not block Phase 14.

## 8. Privacy and Trust Boundaries

Enterprise adoption requires clear privacy guarantees:

| Deployment Model | Source Code Leaves Machine? | Test Code Leaves Machine? | Intent Data Shared? |
|-----------------|---------------------------|--------------------------|-------------------|
| Model A (co-located) | No | No | No |
| Model B (remote server) | No | Yes (for quality analysis) | Yes |
| Model C (PactHub) | No | Configurable | Yes |

**Critical enterprise requirement**: Test source code should be configurable for storage. Some organizations may not want test code stored in the database or sent to a remote server. The `testSourceCode` field should be optional, and quality analysis should degrade gracefully (use heuristic-only, not LLM) when test source is not available.

**LLM privacy**: When test source code is sent to LLM providers for quality analysis, this raises the same concerns as any LLM-based code analysis. Pact's existing LLM abstraction (supporting Ollama for local inference) already addresses this -- local LLM = no data leaves the machine.

## 9. Migration Path

### Phase 14 (Now): Establish the Pattern

- New capabilities (coverage, quality) use API-first ingestion from day one
- Reconciliation pipeline stores test source code during discovery
- All analysis works from database content, not filesystem re-reads
- No breaking changes to existing code

### Phase 16+ (Future): Client-Server Split

- Introduce thin client SDK (TypeScript library)
- Client handles: file reading, git operations, patch application
- Server handles: analysis, LLM, persistence, metrics
- Reconciliation pipeline accepts pre-read content OR file paths

### Phase 18+ (Future): PactHub

- Multi-instance sync protocol for Intent Plane data
- Team collaboration features (shared atoms, molecules, conflict resolution)
- Org-level metrics and dashboards
- RBAC and molecule ownership boundaries
