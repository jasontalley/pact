# Pact Implementation Checklist - Reconciliation Agent

**Created**: 2026-01-30
**Based on**: docs/architecture/reconcilation-agent-architecture-proposal.md
**Status**: Core Implementation Complete
**Last Updated**: 2026-02-01

---

## Implementation Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Graph and State | ✅ Complete | All 7+ nodes implemented, graph registered |
| Phase 2: Reconciliation Tools | ✅ Complete | 8 tools defined and implemented |
| Phase 3: Delta Mode & Persistence | ✅ Complete | Entities, repositories, migrations |
| Phase 4: Human-in-the-Loop | ✅ Complete | Interrupt/resume with checkpointing |
| Phase 5: Molecules & Quality | ✅ Complete | Basic clustering, quality rules |
| Phase 6: Apply Flow & API | ✅ Complete | Full API, apply service, chat commands |
| Phase 7: Polish & Docs | 🟡 Partial | Observability in progress |

**See also**: [Phase 6 Bugfix Checklist](./implementation-checklist-phase6.md) for reliability improvements

---

## Overview: Repo-Pact Reconciliation Agent

**Goal**: Build a graph-based agent that reconciles the state of the repo with the state of the Pact system—whether on first use (full-scan/brownfield) or whenever the repo has drifted.

**Core Principles**:

- **Minimize LLM use**: Delta computation is purely mechanical (git diff + test patterns + @atom link checks)
- **Deterministic outputs**: Reconciliation produces a first-class patch (createAtom, createMolecule, attachTestToAtom, etc.)
- **Two modes, one graph**: Full-scan (brownfield) and delta closure use the same graph
- **Observable-outcomes-only semantics**: Inferred atoms describe WHAT, not HOW

---

## Critical Design Invariants

These invariants MUST be enforced throughout implementation. They address identified architectural risks.

### INV-R001: Atom Immutability Enforcement

**Rule**: The reconciliation agent may NEVER modify or reinterpret an existing atom.

**Allowed operations**:

- Flag potential issues via `invariantViolationFinding`
- Propose a NEW atom
- Propose supersession (explicit, opt-in, human-approved)

**Forbidden operations**:

- Modifying atom description, category, or observable outcomes
- Reinterpreting atom meaning based on changed tests
- Auto-superseding without human approval

**Implementation constraint**: `changedAtomLinkedTests` MUST NEVER flow into `infer_atoms` node. They may only generate:

- Warnings in the patch
- Quality failure flags
- Supersession recommendations (for human review)

### INV-R002: Delta Closure Stopping Rule

**Rule**: A test is considered "closed" (excluded from delta reconciliation) if ANY of:

1. It has a valid `@atom` link to a committed atom
2. It has an **accepted** `AtomRecommendation` from a prior run
3. It was explicitly **rejected** (with reason) in a prior run

**Implementation constraint**: `discover_orphans_delta` MUST exclude tests present in `TestRecord` with terminal status (`accepted` or `rejected`) BEFORE LLM inference begins.

**Purpose**: Prevents oscillation, duplicate suggestions, and recommendation inflation in noisy repos.

### INV-R003: Patch Application Transactionality

**Rule**: Patch application MUST be atomic per apply attempt.

**Guarantee**: If ANY patch op fails during application, ALL ops in that apply attempt MUST be rolled back.

**No silent partial success**: The system must never leave the database in an intermediate state where:

- Atom created but molecule linking failed
- `@atom` written to test file but atom creation rejected
- Some ops applied, others silently skipped

**Implementation**: Use database transactions. For file modifications (optional @atom injection), implement a two-phase approach: DB first, files second with rollback capability.

### INV-R004: Molecule Lens Axiom

**Rule**: Molecules MUST NEVER be required for correctness. They are views, not truth.

**Allowed purposes**:

- Navigation and grouping
- Human-readable context
- Explanation and documentation

**Forbidden behaviors**:

- Molecule verifier output blocking atom creation
- Molecule confidence affecting atom confidence
- Molecule failures causing recommendation rejection

**Degradation behavior**: Molecule failures MUST degrade to "unnamed cluster", NOT rejection.

**Analogy**: Think of molecules like SQL views, not tables.

### INV-R005: State Lifecycle Management

**Rule**: Graph state MUST be explicitly managed across phases to prevent unbounded memory growth.

**State shedding requirements**:

- After `infer_atoms`: Drop raw context blobs; keep only normalized summaries
- After `synthesize_molecules`: Drop embeddings if computed
- Transient fields (e.g., raw test code) cleared after use

**Phase-bounded state**: Document which state fields are valid in which phases; enforce cleanup at phase transitions.

---

**Key Deliverables**:

- LangGraph-based Reconciliation Agent with 7 phases (structure → discover → context → infer → synthesize → verify → persist)
- Two discover operators: `discover_orphans_fullscan` and `discover_orphans_delta`
- Reconciliation patch format with deterministic, reviewable ops
- Persistence schema: ReconciliationRun, AtomRecommendation, MoleculeRecommendation, TestRecord
- Human-in-the-loop support with interrupts and checkpointing
- Pact-chat command surface integration

**Dependencies**: Phase 2 complete (Validators), existing services (BrownfieldAnalysisService, ContextBuilderService, TestAtomCouplingService)

---

## Phase 1: Graph and State (No New Tools)

**Goal**: Define state schema, implement graph nodes as thin wrappers around existing services, register graph with GraphRegistry.

**Timeline**: ~2 weeks

---

### 1.0 Pre-Implementation: Directory Naming

- [ ] Create directory `src/modules/agents/graphs/nodes/reconciliation/` (NOT `brownfield/`)
- [ ] Keep `BrownfieldAnalysisService` only as thin backward-compatible adapter
- [ ] All new code uses `reconciliation` naming throughout

### 1.1 State Schema Definition

- [ ] Create `src/modules/agents/graphs/types/reconciliation-state.ts`
  - [ ] Define `ReconciliationMode` enum: `'full-scan' | 'delta'`
  - [ ] Define `ReconciliationPhase` enum: `'structure' | 'discover' | 'context' | 'infer' | 'synthesize' | 'verify' | 'persist'`
  - [ ] Define `ReconciliationInput` interface:
    - [ ] `rootDirectory: string`
    - [ ] `reconciliationMode: ReconciliationMode`
    - [ ] `deltaBaseline?: { runId?: string; commitHash?: string }`
    - [ ] `options: { analyzeDocs?: boolean; maxTests?: number; autoCreateAtoms?: boolean }`
  - [ ] Define `RepoStructure` interface:
    - [ ] `files: string[]`
    - [ ] `testFiles: string[]`
    - [ ] `dependencyEdges?: { from: string; to: string }[]`
    - [ ] `topologicalOrder?: string[]`
  - [ ] Define `OrphanTestInfo` interface:
    - [ ] `filePath: string`
    - [ ] `testName: string`
    - [ ] `lineNumber: number`
    - [ ] `testCode: string`
    - [ ] `relatedSourceFiles?: string[]`
  - [ ] Define `TestAnalysis` interface (from ContextBuilder)
  - [ ] Define `InferredAtom` interface:
    - [ ] `description: string`
    - [ ] `category: string`
    - [ ] `sourceTest: { filePath: string; testName: string; lineNumber: number }`
    - [ ] `observableOutcomes: string[]`
    - [ ] `confidence: number`
    - [ ] `ambiguityReasons?: string[]`
    - [ ] `reasoning: string`
    - [ ] `relatedDocs?: string[]`
  - [ ] Define `InferredMolecule` interface:
    - [ ] `name: string`
    - [ ] `description: string`
    - [ ] `atomIds: string[]` (references to InferredAtom temp IDs)
    - [ ] `confidence: number`
    - [ ] `reasoning: string`
  - [ ] Define `Decision` type: `'need_more_context' | 'ready_to_infer' | 'quality_fail' | 'approved' | 'rejected'`
  - [ ] Define `ReconciliationGraphState` with Annotation.Root:
    - [ ] `rootDirectory: string`
    - [ ] `input: ReconciliationInput`
    - [ ] `repoStructure: RepoStructure`
    - [ ] `orphanTests: OrphanTestInfo[]`
    - [ ] `changedAtomLinkedTests?: OrphanTestInfo[]` (delta mode only)
    - [ ] `documentationIndex?: DocChunk[]`
    - [ ] `contextPerTest: Map<string, TestAnalysis>`
    - [ ] `inferredAtoms: InferredAtom[]`
    - [ ] `inferredMolecules: InferredMolecule[]`
    - [ ] `currentPhase: ReconciliationPhase`
    - [ ] `iteration: number`
    - [ ] `maxIterations: number`
    - [ ] `errors: string[]`
    - [ ] `decisions: Decision[]`
    - [ ] `pendingHumanReview: boolean`
    - [ ] `output: ReconciliationResult`
  - [ ] Add state lifecycle metadata (INV-R005):
    - [ ] `_phaseValidFields: Map<Phase, string[]>` (documents which fields are valid per phase)
    - [ ] `_transientFields: string[]` (fields to clear at phase transitions)
- [ ] Write unit tests for state schema types
- [ ] Implement state shedding helper: `cleanupPhaseState(state, fromPhase, toPhase)`
- [ ] Verify: Types compile and are importable

### 1.2 Patch Operations Schema

- [ ] Create `src/modules/agents/graphs/types/reconciliation-patch.ts`
  - [ ] Define `PatchOpType` enum: `'createAtom' | 'createMolecule' | 'attachTestToAtom' | 'markAtomSuperseded' | 'invariantViolationFinding'`
  - [ ] Define `CreateAtomOp` interface:
    - [ ] `type: 'createAtom'`
    - [ ] `tempId: string` (temporary ID for cross-references)
    - [ ] `description: string`
    - [ ] `category: string`
    - [ ] `sourceTest: { filePath: string; testName: string; lineNumber: number }`
    - [ ] `observableOutcomes: string[]`
    - [ ] `confidence: number`
    - [ ] `ambiguityReasons?: string[]`
  - [ ] Define `CreateMoleculeOp` interface:
    - [ ] `type: 'createMolecule'`
    - [ ] `tempId: string`
    - [ ] `name: string`
    - [ ] `description: string`
    - [ ] `atomTempIds: string[]`
    - [ ] `confidence: number`
  - [ ] Define `AttachTestToAtomOp` interface:
    - [ ] `type: 'attachTestToAtom'`
    - [ ] `testFilePath: string`
    - [ ] `testName: string`
    - [ ] `testLineNumber: number`
    - [ ] `atomTempId: string` (or atomId if already created)
  - [ ] Define `MarkAtomSupersededOp` interface:
    - [ ] `type: 'markAtomSuperseded'`
    - [ ] `oldAtomId: string`
    - [ ] `newAtomTempId: string`
  - [ ] Define `InvariantViolationFindingOp` interface:
    - [ ] `type: 'invariantViolationFinding'`
    - [ ] `invariantId: string`
    - [ ] `message: string`
    - [ ] `severity: 'error' | 'warning'`
    - [ ] `location?: { filePath: string; lineNumber?: number }`
  - [ ] Define `PatchOp` union type
  - [ ] Define `ReconciliationPatch` interface:
    - [ ] `ops: PatchOp[]`
    - [ ] `metadata: { runId: string; createdAt: Date; mode: ReconciliationMode; baselineCommit?: string }`
- [ ] Write unit tests for patch schema
- [ ] Verify: Patch ops are serializable to JSON

### 1.3 Result Schema

- [ ] Create `ReconciliationResult` interface:
  - [ ] `runId: string`
  - [ ] `status: 'completed' | 'failed' | 'pending_review'`
  - [ ] `patch: ReconciliationPatch`
  - [ ] `summary: { totalOrphanTests: number; inferredAtomsCount: number; inferredMoleculesCount: number; qualityPassCount: number; qualityFailCount: number }`
  - [ ] `invariantFindings: InvariantViolationFindingOp[]`
  - [ ] `metadata: { duration: number; llmCalls: number; mode: ReconciliationMode }`
- [ ] Write unit tests for result schema
- [ ] Verify: Result can be serialized and stored

### 1.4 Structure Node

- [ ] Create `src/modules/agents/graphs/nodes/reconciliation/structure.node.ts`
- [ ] Implement `structureNode(state: ReconciliationGraphState)`:
  - [ ] Use `fs.readdir` or existing file tools to list all files
  - [ ] Filter for source and test files based on patterns (`**/*.ts`, `**/*.spec.ts`)
  - [ ] Exclude `node_modules`, `dist`, `.git`
  - [ ] Return partial state: `{ repoStructure, currentPhase: 'discover' }`
- [ ] Add basic error handling
- [ ] Write unit tests for structure node
- [ ] Verify: Structure node produces file list correctly

### 1.5 Discover Fullscan Node

- [ ] Create `src/modules/agents/graphs/nodes/reconciliation/discover-fullscan.node.ts`
- [ ] Implement `discoverFullscanNode(state: ReconciliationGraphState)`:
  - [ ] Call existing `TestAtomCouplingService.findOrphanTests()` or equivalent
  - [ ] For each orphan test, extract: filePath, testName, lineNumber, testCode
  - [ ] Optionally extract related source files
  - [ ] Return partial state: `{ orphanTests, currentPhase: 'context' }`
- [ ] Add error handling for file read failures
- [ ] Write unit tests for discover fullscan node
- [ ] Verify: Node discovers all tests without @atom annotations

### 1.6 Discover Delta Node (Stub)

- [ ] Create `src/modules/agents/graphs/nodes/reconciliation/discover-delta.node.ts`
- [ ] Implement `discoverDeltaNode(state: ReconciliationGraphState)` as stub:
  - [ ] Log warning: "Delta mode not fully implemented, falling back to fullscan"
  - [ ] Call `discoverFullscanNode` internally for now
  - [ ] Return partial state with delta-specific fields populated
- [ ] Add TODO comments for Phase 3 implementation
- [ ] Write placeholder tests
- [ ] Verify: Node compiles and can be registered

### 1.7 Context Node

- [ ] Create `src/modules/agents/graphs/nodes/reconciliation/context.node.ts`
- [ ] Implement `contextNode(state: ReconciliationGraphState)`:
  - [ ] Iterate over `state.orphanTests`
  - [ ] For each test, call `ContextBuilderService.analyzeTest()`
  - [ ] Build `contextPerTest` map with test key → TestAnalysis
  - [ ] Optionally index documentation if `options.analyzeDocs` is true
  - [ ] Return partial state: `{ contextPerTest, documentationIndex?, currentPhase: 'infer' }`
- [ ] Implement batching for large test sets
- [ ] Add progress tracking
- [ ] Write unit tests for context node
- [ ] Verify: Context node produces analysis for each test

### 1.8 Infer Atoms Node

- [ ] Create `src/modules/agents/graphs/nodes/reconciliation/infer-atoms.node.ts`
- [ ] Implement `inferAtomsNode(state: ReconciliationGraphState)`:
  - [ ] Iterate over `state.contextPerTest`
  - [ ] For each test analysis, call LLM with inference prompt
  - [ ] LLM prompt must enforce observable-outcomes-only semantics
  - [ ] Parse LLM response into `InferredAtom` structure
  - [ ] Validate confidence score and flag low-confidence results
  - [ ] Append to `inferredAtoms` array
  - [ ] **State shedding (INV-R005)**: After inference, drop raw context blobs from `contextPerTest`
  - [ ] Keep only normalized summaries needed downstream (atom descriptions, categories)
  - [ ] Return partial state: `{ inferredAtoms, currentPhase: 'synthesize' }`
- [ ] Create inference prompt in `src/modules/agents/prompts/`
  - [ ] Prompt must request: description, category, observableOutcomes[], confidence, ambiguityReasons?
  - [ ] Prompt must prohibit implementation details
- [ ] Implement batch processing (5 tests at a time like current brownfield)
- [ ] Add fallback for LLM failures
- [ ] Write unit tests for infer atoms node
- [ ] Verify: Node produces valid InferredAtom structures
- [ ] Verify: Raw context is cleared after inference (memory management)

### 1.9 Synthesize Molecules Node (Basic)

- [ ] Create `src/modules/agents/graphs/nodes/reconciliation/synthesize-molecules.node.ts`
- [ ] Implement `synthesizeMoleculesNode(state: ReconciliationGraphState)`:
  - [ ] Group `inferredAtoms` by category (deterministic first pass)
  - [ ] Group by source file path namespace (e.g., `src/modules/auth/**`)
  - [ ] Create `InferredMolecule` for each group
  - [ ] Optionally call LLM for better names/descriptions (labeling only)
  - [ ] Return partial state: `{ inferredMolecules, currentPhase: 'verify' }`
- [ ] Keep grouping deterministic and reproducible
- [ ] Write unit tests for synthesize molecules node
- [ ] Verify: Node produces molecule groupings

### 1.10 Verify Node

- [ ] Create `src/modules/agents/graphs/nodes/reconciliation/verify.node.ts`
- [ ] Implement `verifyNode(state: ReconciliationGraphState)`:
  - [ ] For each `inferredAtom`, call `AtomQualityService.validateAtom()`
  - [ ] Classify atoms as passing/failing quality threshold
  - [ ] Optionally run invariant checks
  - [ ] Set `decisions` based on results
  - [ ] Return partial state: `{ decisions, currentPhase: 'persist' }`
- [ ] Add threshold configuration (default: 80)
- [ ] Write unit tests for verify node
- [ ] Verify: Node produces quality assessments

### 1.11 Persist Node

- [ ] Create `src/modules/agents/graphs/nodes/reconciliation/persist.node.ts`
- [ ] Implement `persistNode(state: ReconciliationGraphState)`:
  - [ ] Build `ReconciliationPatch` from `inferredAtoms` and `inferredMolecules`
  - [ ] Create patch ops: createAtom, createMolecule, attachTestToAtom
  - [ ] Add invariantViolationFinding ops if any
  - [ ] Call existing persistence methods:
    - [ ] If `autoCreateAtoms`, call `AtomsService.create()` for each
    - [ ] Otherwise, call `BrownfieldAnalysisService.storeRecommendationsAsDrafts()`
  - [ ] Log agent action via `AgentActionLogEntity`
  - [ ] Build and return `ReconciliationResult`
  - [ ] Return partial state: `{ output }`
- [ ] Write unit tests for persist node
- [ ] Verify: Node stores results and produces valid output

### 1.12 Graph Builder

- [ ] Create `src/modules/agents/graphs/graphs/reconciliation.graph.ts`
- [ ] Implement `createReconciliationGraph()`:
  - [ ] Create StateGraph with `ReconciliationGraphState`
  - [ ] Add all 7 nodes
  - [ ] Add conditional edge after structure: branch to fullscan or delta based on mode
  - [ ] Add sequential edges: discover → context → infer → synthesize → verify → persist
  - [ ] Set START edge to structure
  - [ ] Set END edge from persist
  - [ ] Compile graph
- [ ] Register graph in `GraphRegistryService`
- [ ] Write integration test for graph flow
- [ ] Verify: Graph can be invoked and produces results

### 1.13 Service Integration

- [ ] Update `BrownfieldAnalysisService.analyzeRepository()`:
  - [ ] Add option to use graph-based analysis
  - [ ] If `USE_GRAPH_AGENT=true`, invoke reconciliation graph
  - [ ] Otherwise, use existing sequential flow
  - [ ] Maintain backward compatibility
- [ ] Create `ReconciliationService` as new entry point:
  - [ ] `analyze(dto: ReconciliationDto): Promise<ReconciliationResult>`
  - [ ] `getRunById(runId: string): Promise<ReconciliationRun>`
  - [ ] `listRuns(options: ListRunsDto): Promise<ReconciliationRun[]>`
- [ ] Write service integration tests
- [ ] Verify: Service invokes graph correctly

### Phase 1 Verification

- [ ] All 7 nodes implemented and tested individually
- [ ] Graph compiles and can be invoked
- [ ] Full-scan mode produces inferred atoms from orphan tests
- [ ] Results are stored via existing persistence mechanisms
- [ ] Backward compatibility maintained with existing BrownfieldAnalysisService
- [ ] Unit test coverage >= 80% for new code

---

## Phase 2: Reconciliation Tools

**Goal**: Expose reconciliation capabilities as discrete tools for graph nodes and potential Pact-chat use.

**Timeline**: ~1 week

---

### 2.1 Tool Definitions

- [ ] Create `src/modules/agents/tools/reconciliation-tools.definitions.ts`
- [ ] Define tool schemas for:
  - [ ] `get_repo_structure`: List source/test files with optional dependency edges
  - [ ] `discover_orphans_fullscan`: Find all tests without @atom annotation
  - [ ] `discover_orphans_delta`: Find orphan tests changed since baseline (stub for now)
  - [ ] `get_test_analysis`: Run ContextBuilder for single test
  - [ ] `search_docs_by_concepts`: Search documentation by domain concepts
  - [ ] `infer_atom_from_test`: Single test → LLM → InferredAtom
  - [ ] `cluster_atoms_for_molecules`: Deterministic grouping of atoms
  - [ ] `validate_atom_quality`: Call AtomQualityService for single atom
- [ ] Write unit tests for tool definitions
- [ ] Verify: Tool schemas are valid

### 2.2 Tool Implementations

- [ ] Create `src/modules/agents/tools/reconciliation-tools.service.ts`
- [ ] Implement `ReconciliationToolsService` implementing `ToolExecutor`:
  - [ ] `getRepoStructure(params)`: Wraps file listing logic
  - [ ] `discoverOrphansFullscan(params)`: Wraps TestAtomCouplingService
  - [ ] `discoverOrphansDelta(params)`: Placeholder for Phase 3
  - [ ] `getTestAnalysis(params)`: Wraps ContextBuilderService.analyzeTest
  - [ ] `searchDocsByConcepts(params)`: Implement doc search (glob + keyword match)
  - [ ] `inferAtomFromTest(params)`: Wraps LLM call with inference prompt
  - [ ] `clusterAtomsForMolecules(params)`: Implement deterministic clustering
  - [ ] `validateAtomQuality(params)`: Wraps AtomQualityService.validateAtom
- [ ] Register tools with `ToolRegistryService`
- [ ] Write unit tests for each tool implementation
- [ ] Verify: All tools can be invoked via registry

### 2.3 Node Refactoring

- [ ] Refactor `discover-fullscan.node.ts` to use `discover_orphans_fullscan` tool
- [ ] Refactor `context.node.ts` to use `get_test_analysis` tool
- [ ] Refactor `infer-atoms.node.ts` to use `infer_atom_from_test` tool
- [ ] Refactor `synthesize-molecules.node.ts` to use `cluster_atoms_for_molecules` tool
- [ ] Refactor `verify.node.ts` to use `validate_atom_quality` tool
- [ ] Update integration tests for refactored nodes
- [ ] Verify: Graph produces same results after refactoring

### Phase 2 Verification

- [ ] 8 reconciliation-specific tools defined and implemented
- [ ] Tools registered with ToolRegistryService
- [ ] Nodes refactored to use tools
- [ ] Graph produces identical results to Phase 1
- [ ] Tools can be invoked independently (for testing/debugging)
- [ ] Unit test coverage >= 80%

---

## Phase 3: Delta Mode and Repository Structuring

**Goal**: Implement proper delta mode with git-based change detection; enhance repository structuring with dependency graph.

**Timeline**: ~2 weeks

---

### 3.1 Delta Detection Implementation

- [ ] Implement `discover_orphans_delta` tool fully:
  - [ ] Accept baseline: `{ runId?: string; commitHash?: string }`
  - [ ] If baseline has commitHash, use `git diff --name-only <baseline>..HEAD`
  - [ ] If baseline has runId, look up commit hash from that run
  - [ ] Filter diff results for test file patterns (`**/*.spec.ts`, `**/*.test.ts`)
  - [ ] Within changed test files, identify orphan tests (no @atom annotation)
  - [ ] Identify "changed atom-linked tests" (tests with @atom that were modified)
  - [ ] Return `{ deltaOrphanTests, changedAtomLinkedTests, deltaSummary, baselineInfo }`
- [ ] Add git integration utilities
- [ ] Handle edge cases: no baseline (fall back to fullscan), invalid commit hash
- [ ] Write unit tests for delta detection
- [ ] Verify: Delta mode detects only changed/new orphan tests

### 3.2 Delta Node Implementation

- [ ] Update `discover-delta.node.ts`:
  - [ ] Call `discover_orphans_delta` tool with baseline from input
  - [ ] Populate both `orphanTests` and `changedAtomLinkedTests`
  - [ ] Set `deltaSummary` in state for reporting
  - [ ] Return partial state with delta-specific info
- [ ] **CRITICAL (INV-R002)**: Implement Delta Closure Stopping Rule:
  - [ ] Query `TestRecord` for tests with terminal status (`accepted` or `rejected`)
  - [ ] Exclude these tests from `orphanTests` BEFORE context/infer phases
  - [ ] Log excluded tests for audit trail
- [ ] **CRITICAL (INV-R001)**: Handle `changedAtomLinkedTests` correctly:
  - [ ] NEVER route to `infer_atoms` (atom immutability)
  - [ ] Generate `invariantViolationFinding` warnings only
  - [ ] Optionally flag for human review with supersession suggestions
  - [ ] Write explicit test: "changed atom-linked tests do not produce new atoms"
- [ ] Write integration tests for delta mode
- [ ] Verify: Delta mode processes only changed tests
- [ ] Verify: Closed tests are not re-processed

### 3.3 Repository Structuring Enhancement

- [ ] Enhance `get_repo_structure` tool:
  - [ ] Parse import statements to build dependency graph
  - [ ] Support TypeScript `import` and `require`
  - [ ] Build file-level dependency edges
  - [ ] Compute topological order for processing
- [ ] Create `DependencyAnalyzer` utility class:
  - [ ] `parseImports(filePath: string): string[]`
  - [ ] `buildDependencyGraph(files: string[]): DependencyGraph`
  - [ ] `topologicalSort(graph: DependencyGraph): string[]`
- [ ] Update `structure.node.ts` to use enhanced tool
- [ ] Write unit tests for dependency analysis
- [ ] Verify: Dependency graph is accurate for test repo

### 3.4 Dependency-Aware Processing

- [ ] Update `context.node.ts`:
  - [ ] Process tests in topological order (tests depending on fewer files first)
  - [ ] Use dependency info to enrich context
- [ ] Update `infer-atoms.node.ts`:
  - [ ] Consider dependency relationships when inferring atoms
  - [ ] Atoms for foundational files inferred first
- [ ] Write integration tests for ordering
- [ ] Verify: Processing follows dependency order

### 3.5 Persistence Schema Updates

- [ ] Create `ReconciliationRun` entity (`src/modules/agents/entities/reconciliation-run.entity.ts`):
  - [ ] `id: UUID`
  - [ ] `runId: string` (human-readable, e.g., "REC-001")
  - [ ] `rootDirectory: string`
  - [ ] `reconciliationMode: 'full-scan' | 'delta'`
  - [ ] `deltaBaselineRunId: UUID` (nullable, FK to self)
  - [ ] `deltaBaselineCommitHash: string` (nullable)
  - [ ] `status: 'running' | 'completed' | 'failed' | 'pending_review'`
  - [ ] `options: JSONB`
  - [ ] `summary: JSONB`
  - [ ] `patchOps: JSONB` (the reconciliation patch)
  - [ ] `projectId: UUID` (nullable, FK to Project)
  - [ ] `createdAt, completedAt: timestamp`
- [ ] Create `AtomRecommendation` entity:
  - [ ] `id: UUID`
  - [ ] `runId: UUID` (FK to ReconciliationRun)
  - [ ] `description: text`
  - [ ] `category: string`
  - [ ] `confidence: decimal`
  - [ ] `reasoning: text`
  - [ ] `sourceTestFilePath: string`
  - [ ] `sourceTestName: string`
  - [ ] `sourceTestLineNumber: int`
  - [ ] `observableOutcomes: JSONB`
  - [ ] `relatedDocs: JSONB`
  - [ ] `qualityScore: decimal` (nullable)
  - [ ] `status: 'pending' | 'accepted' | 'rejected'`
  - [ ] `atomId: UUID` (nullable, FK to Atom, set when applied)
  - [ ] `createdAt: timestamp`
- [ ] Create `MoleculeRecommendation` entity:
  - [ ] `id: UUID`
  - [ ] `runId: UUID` (FK to ReconciliationRun)
  - [ ] `name: string`
  - [ ] `description: text` (nullable)
  - [ ] `atomRecommendationIds: JSONB` (array of AtomRecommendation UUIDs)
  - [ ] `atomIds: JSONB` (nullable, after apply)
  - [ ] `confidence: decimal`
  - [ ] `status: 'pending' | 'accepted' | 'rejected'`
  - [ ] `moleculeId: UUID` (nullable, FK to Molecule)
  - [ ] `createdAt: timestamp`
- [ ] Create `TestRecord` entity (optional):
  - [ ] `id: UUID`
  - [ ] `runId: UUID` (FK to ReconciliationRun)
  - [ ] `filePath: string`
  - [ ] `testName: string`
  - [ ] `lineNumber: int`
  - [ ] `atomRecommendationId: UUID` (nullable, FK to AtomRecommendation)
  - [ ] `createdAt: timestamp`
- [ ] Create migrations for new entities
- [ ] Write repository classes for each entity
- [ ] Write unit tests for entities and repositories
- [ ] Verify: Migrations run successfully

### 3.6 Updated Persist Node

- [ ] Update `persist.node.ts` to use new entities:
  - [ ] Create `ReconciliationRun` record at start
  - [ ] Create `AtomRecommendation` for each inferred atom
  - [ ] Create `MoleculeRecommendation` for each inferred molecule
  - [ ] Optionally create `TestRecord` for each analyzed test
  - [ ] Store `patchOps` on run record
  - [ ] Update run status to 'completed' or 'failed'
- [ ] Store commit hash for next delta baseline
- [ ] Write integration tests for persistence
- [ ] Verify: Results stored in new schema correctly

### Phase 3 Verification

- [ ] Delta mode correctly identifies changed tests since baseline
- [ ] Git integration works for commit-based baselines
- [ ] Dependency graph accurately represents file relationships
- [ ] Processing follows topological order
- [ ] New persistence schema is in place
- [ ] Runs and recommendations are queryable
- [ ] Unit test coverage >= 80%

---

## Phase 4: Human-in-the-Loop and Interrupts

**Goal**: Add interrupt support for human review before applying recommendations.

**Timeline**: ~1 week

---

### 4.1 Interrupt Support

- [ ] Update `verify.node.ts`:
  - [ ] Add conditional logic: if quality threshold not met OR `requiresReview` option set
  - [ ] Set `pendingHumanReview = true`
  - [ ] Use LangGraph `interrupt()` to pause execution
- [ ] Update graph with conditional edge after verify:
  - [ ] If `pendingHumanReview === true`, route to interrupt state
  - [ ] Otherwise, continue to persist
- [ ] Write tests for interrupt behavior
- [ ] Verify: Graph pauses for human review

### 4.2 Resume Support

- [ ] Implement resume capability:
  - [ ] Accept human input: `{ approved: string[]; rejected: string[] }` (recommendation IDs)
  - [ ] Update `decisions` in state based on input
  - [ ] Continue to persist node with filtered recommendations
- [ ] Add `ReconciliationService.resume(runId, humanInput)` method
- [ ] Write tests for resume functionality
- [ ] Verify: Graph resumes correctly with human decisions

### 4.3 Checkpointing

- [ ] Implement LangGraph checkpointer for long-running analysis:
  - [ ] Use in-memory checkpointer for development
  - [ ] Optionally use PostgreSQL checkpointer for production
- [ ] Store checkpoint on interrupt
- [ ] Restore checkpoint on resume
- [ ] Write tests for checkpoint/restore
- [ ] Verify: State is preserved across interrupts

### 4.4 Review API

- [ ] Create review endpoints:
  - [ ] `GET /agents/reconciliation/runs/:runId/pending` - Get pending recommendations
  - [ ] `POST /agents/reconciliation/runs/:runId/review` - Submit review decisions
  - [ ] `POST /agents/reconciliation/runs/:runId/resume` - Resume after review
- [ ] Add Swagger documentation
- [ ] Write E2E tests for review flow
- [ ] Verify: Full review cycle works end-to-end

### Phase 4 Verification

- [ ] Graph interrupts when review is required
- [ ] Human can view pending recommendations
- [ ] Human can approve/reject recommendations
- [ ] Graph resumes with filtered recommendations
- [ ] Checkpointing preserves state across restarts
- [ ] Review API is documented and functional

---

## Phase 5: Molecules and Quality

**Goal**: Enhance molecule synthesis with semantic clustering; add verifier agent for quality feedback.

**Timeline**: ~1.5 weeks

---

### 5.1 Molecule Persistence

- [ ] Ensure `MoleculeRecommendation` entity is fully functional
- [ ] Update `persist.node.ts`:
  - [ ] Create Molecule entities when recommendations are applied
  - [ ] Set ManyToMany relationships between Molecules and Atoms
  - [ ] Update `MoleculeRecommendation.moleculeId` after creation
- [ ] Create `Molecule` entity if not exists (may be in Phase 3)
- [ ] Write integration tests for molecule creation
- [ ] Verify: Molecules are created and linked correctly

### 5.2 Enhanced Clustering

- [ ] Update `cluster_atoms_for_molecules` tool:
  - [ ] Add method parameter: `'module' | 'domain_concept' | 'semantic'`
  - [ ] For `semantic`: compute embeddings of atom descriptions
  - [ ] Use cosine similarity to cluster similar atoms
  - [ ] Fall back to domain_concept if embeddings unavailable
- [ ] Add embedding support (optional):
  - [ ] Integrate with embedding service (if LLM supports)
  - [ ] Cache embeddings for reuse
- [ ] Write unit tests for enhanced clustering
- [ ] Verify: Semantic clustering produces meaningful groups

### 5.3 Verifier Agent (Optional, with Guardrails)

**CRITICAL (INV-R004)**: Molecule Lens Axiom must be enforced throughout this section.

- [ ] Create `VerifierService` for molecule quality:
  - [ ] Evaluate molecule completeness: "Does this molecule cover a coherent feature?"
  - [ ] Evaluate atom-molecule fit: "Does each atom belong in this molecule?"
  - [ ] Provide feedback for refinement
- [ ] **Implement Molecule Guardrails (INV-R004)**:
  - [ ] Verifier output MUST NOT block atom creation
  - [ ] Molecule confidence MUST NOT affect atom confidence
  - [ ] Molecule failures MUST degrade to "unnamed cluster", NOT rejection
  - [ ] Add explicit check: `if (moleculeVerificationFails) { molecule.name = 'Unnamed Cluster'; }`
  - [ ] Write explicit test: "molecule failure does not prevent atom creation"
  - [ ] Write explicit test: "molecule confidence independent of atom confidence"
- [ ] Create verification prompt for LLM (labeling only, no rejection authority)
- [ ] Integrate verifier into graph (optional node after synthesize)
- [ ] Add iterative refinement loop for LABELING only (not grouping)
- [ ] Write unit tests for verifier
- [ ] Verify: Verifier improves molecule quality without blocking atoms

### 5.4 Quality Metrics Dashboard

- [ ] Add reconciliation quality metrics:
  - [ ] Average atom confidence score
  - [ ] Average molecule completeness score
  - [ ] Number of atoms passing quality threshold
  - [ ] Distribution of categories
- [ ] Add endpoint: `GET /agents/reconciliation/runs/:runId/metrics`
- [ ] Write tests for metrics calculation
- [ ] Verify: Metrics are accurate and useful

### Phase 5 Verification

- [ ] Molecules are persisted as first-class entities
- [ ] Semantic clustering produces better groupings than basic clustering
- [ ] Verifier agent (if implemented) improves molecule quality
- [ ] Quality metrics are available for runs
- [ ] Overall reconciliation quality is measurable

---

## Phase 6: Pact-Chat Integration and Apply Flow

**Goal**: Integrate reconciliation with Pact-chat command surface; implement full apply flow.

**Timeline**: ~1 week

---

### 6.1 Pact-Chat Commands

- [ ] Add `reconcile_repo` command to ChatAgentService:
  - [ ] Accept mode parameter: `'delta' | 'full-scan'`
  - [ ] Invoke ReconciliationService.analyze()
  - [ ] Return summary and patch reference
- [ ] Add `apply_patch` command:
  - [ ] Accept patch_id and selections (which ops to apply)
  - [ ] Create Atoms and Molecules from selected ops
  - [ ] Update @atom annotations in test files (optional)
  - [ ] Return summary of applied changes
- [ ] Add `find_gaps` command:
  - [ ] Return orphan tests, uncovered code, invariant violations
  - [ ] Suggest reconciliation if gaps found
- [ ] Add `explain_atom` command (if not exists):
  - [ ] Show atom details, validators, coupled tests, drift status
- [ ] Write unit tests for chat commands
- [ ] Verify: Commands work via chat interface

### 6.2 Apply Flow Implementation

- [ ] Create `ApplyService` for applying reconciliation patches:
  - [ ] `applyPatch(runId: string, selections: string[])`: Apply selected ops
  - [ ] For `createAtom`: Create Atom entity, update recommendation.atomId
  - [ ] For `createMolecule`: Create Molecule entity, link atoms, update recommendation.moleculeId
  - [ ] For `attachTestToAtom`: Optionally write @atom annotation to test file
- [ ] **CRITICAL (INV-R003)**: Implement Transactional Application:
  - [ ] Wrap all DB operations in a single transaction
  - [ ] If ANY op fails, rollback ALL ops in that apply attempt
  - [ ] For file modifications (@atom injection), use two-phase approach:
    1. Phase 1: Complete all DB operations within transaction
    2. Phase 2: Apply file modifications only after DB commit
    3. On file modification failure: Log error but DO NOT rollback DB (files are optional)
  - [ ] Return clear success/partial-success/failure status
  - [ ] Write explicit test: "partial DB failure rolls back all changes"
  - [ ] Write explicit test: "no silent partial success"
- [ ] Add file modification utilities for @atom annotation injection
- [ ] Write integration tests for apply flow
- [ ] Verify: Apply creates correct entities and updates files
- [ ] Verify: Transaction rollback works correctly

### 6.3 API Endpoints

- [ ] Create `ReconciliationController`:
  - [ ] `POST /agents/reconciliation/analyze` - Start reconciliation
  - [ ] `GET /agents/reconciliation/runs` - List runs
  - [ ] `GET /agents/reconciliation/runs/:id` - Get run details
  - [ ] `GET /agents/reconciliation/runs/:id/recommendations` - Get recommendations
  - [ ] `POST /agents/reconciliation/runs/:id/apply` - Apply selected recommendations
  - [ ] `GET /agents/reconciliation/runs/:id/patch` - Get raw patch
- [ ] Add Swagger documentation
- [ ] Write E2E tests for all endpoints
- [ ] Verify: Full API is functional

### Phase 6 Verification

- [ ] Pact-chat commands work for reconciliation
- [ ] Apply flow creates Atoms and Molecules correctly
- [ ] @atom annotations can be injected into test files
- [ ] API endpoints are complete and documented
- [ ] Full reconciliation workflow is testable end-to-end

---

## Phase 7: Polish, Observability, and Documentation

**Goal**: Production-ready reconciliation with full observability and documentation.

**Timeline**: ~1 week

---

### 7.1 Observability

- [ ] Add LangSmith tracing for all LLM calls:
  - [ ] Tag with `agent=reconciliation-agent`
  - [ ] Include run_id in metadata
- [ ] Add structured logging for graph steps:
  - [ ] Log phase transitions
  - [ ] Log tool invocations
  - [ ] Log error details
- [ ] Add metrics collection:
  - [ ] Reconciliation duration
  - [ ] LLM call count and latency
  - [ ] Success/failure rates
- [ ] Write observability integration tests
- [ ] Verify: Traces appear in LangSmith (if configured)

### 7.2 Error Handling

- [ ] Add comprehensive error handling:
  - [ ] Handle LLM failures gracefully (retry, fallback)
  - [ ] Handle file system errors
  - [ ] Handle git command failures
  - [ ] Handle database errors
- [ ] Add error classification for actionable feedback
- [ ] Write tests for error scenarios
- [ ] Verify: Errors are handled gracefully

### 7.3 Performance Optimization

- [ ] Add batching for LLM calls (configurable batch size)
- [ ] Add parallel processing for independent tests
- [ ] Add caching for repeated context lookups
- [ ] Add streaming support for long-running analyses
- [ ] Profile and optimize hot paths
- [ ] Write performance tests
- [ ] Verify: Large repos process in reasonable time

### 7.4 Documentation

- [ ] Update `CLAUDE.md` with reconciliation workflow
- [ ] Create `docs/reconciliation-agent.md`:
  - [ ] Overview and concepts
  - [ ] Full-scan vs delta mode
  - [ ] Patch format and apply flow
  - [ ] Human-in-the-loop review
- [ ] Create `docs/api/reconciliation.md`:
  - [ ] All endpoints with examples
  - [ ] Request/response schemas
  - [ ] Error codes
- [ ] Add inline code documentation
- [ ] Verify: Documentation is complete and accurate

### 7.5 Frontend Integration (Optional)

- [ ] Create `ReconciliationRunList.tsx` component
- [ ] Create `RecommendationReview.tsx` component
- [ ] Create `PatchPreview.tsx` component
- [ ] Add reconciliation page to frontend navigation
- [ ] Write frontend tests
- [ ] Verify: Frontend can trigger and review reconciliations

### Phase 7 Verification

- [ ] LangSmith traces reconciliation runs
- [ ] Errors are handled gracefully with clear messages
- [ ] Performance is acceptable for repos with 1000+ tests
- [ ] Documentation covers all features
- [ ] Optional: Frontend integration working

---

## Success Criteria

### Functional Requirements

- [ ] Running the reconciliation graph produces inferred atoms and molecules
- [ ] Full-scan mode catalogs all orphan tests
- [ ] Delta mode detects only changed/new tests since baseline
- [ ] Results are stored as a reconciliation patch
- [ ] Patch can be applied via API to create Atoms/Molecules
- [ ] Human-in-the-loop review works with interrupts
- [ ] Pact-chat commands invoke reconciliation

### Invariant Enforcement Requirements

- [ ] **INV-R001**: Changed atom-linked tests NEVER produce new atoms (only warnings/supersession recommendations)
- [ ] **INV-R002**: Closed tests (accepted/rejected in prior runs) are excluded from delta processing
- [ ] **INV-R003**: Patch application is atomic; partial failure rolls back all ops
- [ ] **INV-R004**: Molecule failures degrade to "unnamed cluster", never block atoms
- [ ] **INV-R005**: State is shed between phases; large repos don't exhaust memory

### Quality Requirements

- [ ] Inferred atoms pass AtomQualityService at configurable threshold
- [ ] Molecules have clear names and correct atom links
- [ ] Observable-outcomes-only semantics enforced in inference
- [ ] Test coverage >= 80% for all new code

### Observability Requirements

- [ ] Every LLM call is traced (LangSmith)
- [ ] Graph steps are logged with structured data
- [ ] Metrics are available for monitoring

### Maintainability Requirements

- [ ] State schema and node list are documented
- [ ] New nodes or tools can be added without rewriting the flow
- [ ] Backward compatibility with existing BrownfieldAnalysisService
- [ ] Directory structure uses `reconciliation/` naming (not `brownfield/`)

---

## Current Status Summary

**Infrastructure Complete**:

- Docker infrastructure operational
- PostgreSQL database with 20+ tables including reconciliation entities
- Intent Atom CRUD with Canvas UI
- Validators with format translation
- Template library with 21 built-in templates

**Reconciliation Agent Status**: Core Implementation Complete

**Implemented Components**:

- `ReconciliationGraphState` with all required fields
- `ReconciliationPatch` format with 5 operation types
- All 8 graph nodes: structure, discover-fullscan, discover-delta, context, infer-atoms, synthesize-molecules, interim-persist, verify, persist
- 8 reconciliation tools registered with ToolRegistryService
- `ReconciliationRun`, `AtomRecommendation`, `MoleculeRecommendation`, `TestRecord` entities
- Human-in-the-loop with NodeInterrupt and checkpointing
- Full REST API via `ReconciliationController`
- `ApplyService` for transactional patch application
- WebSocket gateway for real-time progress (Phase 6)
- Path/file filtering for test selection (Phase 6)
- Interim persistence before verification (Phase 6)
- Recovery endpoints for failed runs (Phase 6)

**Remaining Work**:

1. LangSmith tracing integration
2. Performance optimization for large repos
3. Frontend reconciliation pages (runs list, details, review)
4. Additional unit test coverage

---

## References

- [Architecture Proposal](./architecture/reconcilation-agent-architecture-proposal.md)
- [LangGraph Concepts](https://langchain-ai.github.io/langgraph/concepts/)
- [CLAUDE.md](../CLAUDE.md) - Project context
- [BROWNFIELD_ANALYSIS.md](../src/modules/agents/BROWNFIELD_ANALYSIS.md)
- [CONTEXT_BUILDER_DESIGN.md](../src/modules/agents/CONTEXT_BUILDER_DESIGN.md)

---

**Last Updated**: 2026-02-01 (Updated status to reflect core implementation complete)
