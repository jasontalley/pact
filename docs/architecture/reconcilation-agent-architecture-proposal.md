# Reconciliation Agent: Architecture Proposal

**Status**: Proposal  
**Date**: January 2026  
**Context**: A graph-based agent that **reconciles the state of the repo with the state of the Pact system**—whether on first use (full-scan, formerly “brownfield”) or whenever the repo has drifted. Once Pact exists, agents are **operators over a constrained, factual system** (atoms + invariants + coupling); LLM reasoning is the **exception path**, not the default.

**Naming**: This document uses **Reconciliation Agent** and **reconciliation** in code and UX. “Brownfield” is retained only as a historical label for the first full-scan run; implementers should name the agent and APIs “reconciliation” (e.g. `reconciliation-agent`, `ReconciliationRun`).

---

## 1. Executive Summary

Pact “knows” facts about the project it is part of: those facts are **atoms** (atomic behavioral intents) and **project invariants**. The agent described here does not exist only for a one-time “brownfield” import. It is a **Repo–Pact Reconciliation Agent**: it rectifies the state of the repo with the state of the Pact system—**initially** (first time Pact is used in an existing repo) or **at any point** when the repo has changed and Pact’s catalog is out of date.

- **Initial use (brownfield)**: Repo has code and tests but no atoms. The agent catalogs intent by inferring atoms and molecules from tests (and optionally code/docs). After that run, the project is “in Pact”; it’s no longer “brownfield,” it’s simply a project.
- **Ongoing use (delta closure)**: Pact has full atomic coverage. A new feature is built without first creating a molecule and its atoms. The new feature shows up as a **delta** to Pact’s definition of system intent. The same agent detects that delta (new or changed tests/code not covered by existing atoms) and closes it by proposing new atoms and molecules so Pact stays in sync with the repo.

The current **BrownfieldAnalysisService** is a fixed three-step sequence with no graph and no molecule synthesis. We propose a **Reconciliation Agent** that:

- **Minimizes LLM use**: Delta computation is **purely mechanical** (git diff + test patterns + @atom link checks); **two crisp discover operators** (`discover_orphans_fullscan`, `discover_orphans_delta`); molecule grouping is **deterministic first**, LLM only for naming; atom inference schema enforces **observable-outcomes-only** semantics.
- **Outputs a first-class patch**: Reconciliation produces a **reconciliation.patch** (createAtom, createMolecule, attachTestToAtom, invariantViolationFinding, etc.)—the “diff” between repo and Pact—for auditability and deterministic apply.
- **Supports full-scan and delta modes** via the same graph; **ReconciliationRun** and recommendation schema for review/apply; **human-in-the-loop** where needed.

**Pact-chat implication**: Once atoms and invariants exist, Pact-chat has **cheap certainty** (atoms, invariants, coupling graph, delta, orphan tests). Its job is to **route user intent to a small set of operators** (reconcile_repo, apply_patch, explain_atom, find_gaps, …); ReAct is **dispatcher + fallback**, not the primary engine. Pact-chat is **context-bound** because Pact itself is the context.

This document outlines the reconciliation framing, deterministic operators, graph nodes, state schema, **patch format**, persistence schema, atom/molecule semantics, and Pact-chat command surface.

---

## 2. Current State Analysis

### 2.1 Agents Directory Overview

| Component | Purpose | Notes |
|-----------|---------|--------|
| **chat-agent.service.ts** | Conversational interface; routes to graph or direct tools | Most advanced agent: uses GraphRegistry, ReAct graph when `USE_GRAPH_AGENT=true` |
| **brownfield-analysis.service.ts** | Infer intent atoms from orphan tests | Sequential only; no graph; uses ContextBuilder, TestAtomCouplingService |
| **context-builder.service.ts** | Focused context for test→atom inference | Parse structure, semantic concepts, dependency graph, doc snippets |
| **test-atom-coupling.service.ts** | Orphan test discovery, coupling metrics | Used by brownfield; no AST, regex/line-based |
| **graphs/** | ReAct builder, chat-exploration graph, nodes (plan, search, analyze, synthesize) | Only `chat-exploration` registered; no brownfield graph |
| **tools/** | ToolRegistryService, atom tools, file/list/grep/read_json/read_coverage_report | No brownfield-specific tools (e.g., repo structure, test AST) |

### 2.2 Current Brownfield Flow (No Graph)

```
analyzeRepository(dto)
  → discoverOrphanTests(state)     // TestAtomCouplingService + extract test code, related source
  → analyzeDocumentation(dto, state)  // Optional; glob docs, read up to 50 files
  → inferAtomsFromTests(dto, state)    // Batch of 5 tests; ContextBuilder.analyzeTest + LLM per test
  → createAtomsFromInferred / storeRecommendationsAsDrafts
  → logAgentAction
```

**Gaps**:

- No **repository structuring** (e.g., file/component dependency graph, topological order) before inference.
- No **graph**; no branching, retries, or quality gates inside the workflow.
- No **molecule** synthesis (grouping atoms into molecules).
- No **dedicated tools** for brownfield (e.g., “get repo structure”, “get test parse”, “find docs by concept”); logic is buried in services.
- No **human-in-the-loop** (e.g., interrupt for review, approve/reject).
- **Context**: Documentation is loaded in bulk; no semantic search or relevance ranking per test.

---

## 3. Pact’s Model: Facts and Repo–Pact Reconciliation

### 3.1 What Pact “Knows”

Pact’s representation of the project consists of:

- **Atoms**: Atomic, testable behavioral intents (WHAT the system does). They are the irreducible facts about intended behavior; tests couple to them via `@atom` (or equivalent).
- **Project invariants**: Global rules that apply to all atoms (e.g., commitment required, immutability, traceability). They codify how the system is governed.

Together, atoms and invariants are the **Pact definition of system intent**. When the repo and this definition are in sync, every relevant behavior in the repo is reflected by atoms (and molecules), and the project is “fully in Pact.”

### 3.2 Brownfield Is Once; Then It’s Just a Project

“Brownfield” is not a permanent state of the repo. It is the **first time** Pact is applied to a repo that already has code and tests:

1. Run the reconciliation agent in **full-scan mode**: discover all tests (and optionally code), infer atoms and molecules, propose them.
2. User reviews and applies; Pact now has an initial catalog.
3. From that point on, the repo is **a Pact project**. It is no longer “brownfield”; it is simply a project whose intent is cataloged in Pact.

Subsequent runs of the same agent are not “brownfield again”—they are **reconciliation** to bring Pact back in sync when the repo has changed.

### 3.3 The Delta: Drift Between Repo and Pact

Drift occurs whenever the repo changes without updating Pact:

- **New feature built without Pact-first workflow**: Developers add code and tests but do not create a molecule and constituent atoms first. The new behavior exists in the repo but not in Pact’s catalog → **delta**.
- **New tests added** (e.g., regression tests) without `@atom` annotations → orphan tests, delta.
- **Refactors or behavior changes** that invalidate or extend existing atoms → potential delta (atoms may need supersession or new atoms).

The agent should **detect the delta** (what is new or uncataloged relative to the last known Pact state) and **close it** by proposing new atoms (and molecules) and, where relevant, flagging invariant implications (e.g., new patterns that might warrant a new invariant, or code that violates an existing invariant).

### 3.4 One Agent, Two Modes

| Mode | When | What the agent does |
|------|------|----------------------|
| **Full scan (brownfield)** | First use in an existing repo; or “resync everything” | Discover all orphan tests (and optionally code); infer atoms and molecules for all of them; propose full catalog. |
| **Delta closure** | Anytime after Pact has a catalog; e.g., after new feature or periodic sync | Compute delta: tests/code added or changed since last reconciliation (or since last commit / baseline). Infer atoms and molecules only for the **delta**; propose so Pact definition matches repo again. |

Same graph, same nodes (structure, discover, context, infer, synthesize, verify, persist). The **discover** (or a dedicated **delta**) step is what differs:

- **Full scan**: “Orphan tests” = all tests without `@atom` (and optionally all code units to summarize).
- **Delta**: “Orphan tests” = tests that are new/changed since baseline **and** not yet covered by an atom (e.g., not in last run’s TestRecord, or not linked to any committed atom). Optionally restrict to a path or commit range.

Baseline for delta can be: last **BrownfieldAnalysisRun** (or ReconciliationRun), last **commit** hash stored per run, or a tag. Storing “last reconciled at” state (e.g., in Run or project settings) makes “close the delta” a lightweight, repeatable operation.

### 3.5 Invariants in Reconciliation

Facts Pact knows include **project invariants**. The reconciliation agent can:

- **Check consistency**: New or changed code/tests might violate an existing invariant (e.g., “every atom must have a linked test”); the agent can surface violations as part of the run.
- **Propose new invariants** (future): If the agent infers recurring patterns (e.g., “all new auth tests follow pattern X”), it could suggest a new project invariant for human approval. This is a natural extension; the first priority remains atoms and molecules.

---

## 4. Research Summary: Best Practices (2025–2026)

### 4.1 LangGraph and State Machine Agents

- **State**: Minimal, explicit, typed (e.g., TypedDict/Pydantic/dataclasses). Use reducers only where accumulation is needed; avoid storing transient values in state—prefer function scope.
- **Nodes**: Treat as pure functions: receive state, return **partial state updates**; no mutation of input. Validate at node boundaries.
- **Edges**: Prefer simple sequential edges for linear steps; use **conditional edges** only for real behavioral branches (e.g., “need more context” vs “ready to synthesize”).
- **Cycles**: Control with **hard stops**: `max_steps` counter, exponential backoff on repeated failures, explicit “no progress” exit.
- **Production**: Durable memory, predictable streaming, strong error boundaries, observability (e.g., LangSmith). Use **persistence**, **interrupts**, **time travel**, **subgraphs** where appropriate.

### 4.2 Multi-Agent and Repository-Level Analysis

- **UserTrace** (Jin et al., 2025): Multi-agent system for **user-level requirements (URs)** and **traceability** from code. Four agents (Code Reviewer, Searcher, Writer, Verifier), three phases:
  1. **Repository structuring**: Dual-level dependency graph (component + file), topological order for processing.
  2. **IR derivation**: Code Reviewer produces implementation-level requirements per component/file in dependency order.
  3. **UR generation**: Writer clusters files (e.g., Leiden), abstracts IRs to URs; Searcher retrieves domain knowledge; Verifier evaluates and feeds back.
- **Insights**: (1) Structure repo first; (2) process in dependency order; (3) separate “implementation-level” vs “user/intent-level” abstraction; (4) verification loop improves quality.

### 4.3 Inferring Intent from Tests and Code

- **Specification extraction**: LLM-based agents can reverse-engineer specs from code and tests; combining **code search** with **intent extraction** improves issue resolution (e.g., SpecRover).
- **Pact mapping**: Our “atoms” are atomic behavioral intents (WHAT, not HOW); “molecules” are groupings of atoms. Brownfield infers atoms from tests (and optionally from code/specs), then should **synthesize molecules** from related atoms.

---

## 5. Proposed Agent Architecture

### 5.1 High-Level Design

The **Repo–Pact Reconciliation Agent** (the same graph used for “brownfield” and “delta closure”) is a **single graph** with multiple phases. It uses one shared state and dedicated nodes for each phase. Flow is roughly:

1. **Structure** repository (dependency/structure discovery).
2. **Discover** what needs cataloging: in **full-scan** mode, all orphan tests (and optionally code units); in **delta** mode, only tests/code that are new or changed since baseline and not yet covered by an atom.
3. **Build context** per test (and optionally per code unit) using structured extraction and semantic doc search.
4. **Infer atoms** from tests (and optionally from code/specs).
5. **Synthesize molecules** by clustering related atoms and naming/describing groups.
6. **Verify** (quality gate, optional invariant checks, optional human-in-the-loop).
7. **Persist** (store run and recommendations; optionally create atoms/molecules; log).

The **discover** step is the only one that differs by mode: it invokes one of **two operators** (see §5.3). Conditional edges allow retries, quality gates, and optional **interrupt** for human review.

### 5.2 Design Principles

- **Reuse**: Integrate existing **ContextBuilderService**, **TestAtomCouplingService**, **AtomQualityService**, and **LLMService** inside nodes/tools; avoid duplicating logic.
- **Tools over inline logic**: Expose brownfield capabilities as **tools** (e.g., `get_repo_structure`, `get_test_analysis`, `search_docs_by_concepts`) so the graph can call them in a tool-using node or dedicated “discovery” nodes.
- **Typed state**: Single state schema (Annotation.Root) with clear reducers; nodes return partial updates only.
- **Observability**: All LLM and tool calls tagged (e.g., `reconciliation-agent`) and traced (LangSmith); graph steps logged.

### 5.3 Deterministic Boundaries: Delta and Discover

**Delta computation must be purely mechanical.** No model judgment for “what changed”:

- **Baseline**: `{ lastReconciliationCommitHash, lastReconciliationRunId }` (from last ReconciliationRun or project settings).
- **Algorithm**: (1) Compute changed files via **git diff** (e.g. `git diff --name-only baseline..HEAD` or equivalent). (2) Intersect with **test file patterns** (e.g. `**/*.spec.ts`, `**/*.test.ts`). (3) Within those test files, detect **missing or invalid @atom links** (orphan tests, or tests whose @atom points to a superseded/deleted atom). (4) Output: **DeltaOrphanTests[]** (tests that need intent inferred) plus a separate bucket **changed_atom_linked_tests** (tests that already have @atom but file changed—for optional re-validation or supersession).
- **LLM involvement begins only after** you have a stable, enumerable set of “things that need intent.”

**Split discover into two operators** so graph branching is trivial and contracts are clear:

| Operator | When | Inputs | Outputs |
|----------|------|--------|---------|
| **discover_orphans_fullscan** | Mode = full-scan | rootDirectory, includePatterns?, excludePatterns? | { orphanTests, summary } (all tests without valid @atom) |
| **discover_orphans_delta** | Mode = delta | rootDirectory, baseline: { runId? \| commitHash? }, includePatterns?, excludePatterns? | { deltaOrphanTests, changedAtomLinkedTests?, deltaSummary, baselineInfo } (mechanical: git diff + test patterns + @atom checks) |

The graph branches at entry: **structure** → (if full-scan) **discover_fullscan** else **discover_delta** → then same pipeline (context → infer → synthesize → verify → persist).

### 5.4 Reconciliation Output as a First-Class Patch

Reconciliation output should be a **deterministic artifact** that can be reviewed and applied, not only “recommendations in a DB”:

- **reconciliation.patch** (e.g. `reconciliation.patch.json` or a list of **patch ops**):
  - **createAtom** – inferred atom (description, category, source test, observable outcomes, …)
  - **createMolecule** – inferred molecule (name, description, atom recommendation IDs)
  - **attachTestToAtom** – link test (file, name, line) to atom (e.g. after applying createAtom)
  - **markAtomSuperseded** – (if supported) old atom → new atom
  - **invariantViolationFinding** – finding only; **no auto-fix unless explicitly permitted**

This patch is the **“diff” between repo and Pact**: auditability, tooling integration, and a clear contract for “apply.” Persist the patch on the run (e.g. Run.patchOps or Run.patchSnapshot) so `apply_patch(patch_id, selections)` can apply only accepted ops.

### 5.5 Atom Inference: Observable-Outcomes-Only Semantics

Atoms inferred from tests must encode **WHAT** (observable behavior), not implementation. The inference prompt and **output schema** should enforce:

- **Observable outcomes only**: inputs/outputs, state transitions, externally visible side effects. No internal language (class names, helper functions) unless it’s a domain term.
- **Confidence + ambiguity reasons**: e.g. “test asserts internal method call count” → lower confidence and an `ambiguityReasons` field so quality gates and humans can triage.
- **Schema and AtomQualityService** do most of the work; the LLM is constrained to a structured output (description, category, observableOutcomes[], confidence, ambiguityReasons?).

### 5.6 Molecule Synthesis: Lens-Only and Cheap

Molecules are **not truth; they’re grouping**. Clustering should be **deterministic first**:

- Group by **module/path namespace** (e.g. `src/modules/auth/**`).
- Group by **top-level domain concept** extracted from test names/descriptions (e.g. regex or simple heuristics).
- **Then** optionally ask an LLM only to **propose better names/descriptions** for these clusters. LLM for **labeling**, not for **grouping**.

This keeps molecule synthesis cheap and reproducible; the “lens” (how atoms are grouped) is stable and reviewable.

---

## 6. State Schema

Proposed **ReconciliationGraphState** (extends a minimal base or is standalone):

| Field | Type | Reducer | Purpose |
|-------|------|---------|---------|
| `rootDirectory` | string | replace | Repo root |
| `input` | object | replace | Request: rootDirectory, **reconciliationMode** ('full-scan' \| 'delta'), **deltaBaseline**? (runId, commitHash, or lastReconciledAt), options (analyzeDocs, maxTests, autoCreateAtoms, etc.) |
| `repoStructure` | RepoStructure | replace | File/component graph, topological order (from structure phase) |
| `orphanTests` | OrphanTestInfo[] | replace | From TestAtomCouplingService + enrichment |
| `codeUnits` | CodeUnitInfo[] | replace | Optional: methods/classes to derive IRs from (future) |
| `documentationIndex` | DocChunk[] | replace | Optional: doc chunks with embeddings or keywords for search |
| `contextPerTest` | Map<testKey, TestAnalysis> | replace | ContextBuilder output per test |
| `inferredAtoms` | InferredAtom[] | append/dedup | Atoms inferred so far (with source test, confidence) |
| `inferredMolecules` | InferredMolecule[] | replace | Molecules synthesized from atoms |
| `currentPhase` | Phase | replace | structure \| discover \| context \| infer \| synthesize \| verify \| persist |
| `iteration` | number | replace | Step/iteration count (for max_steps) |
| `maxIterations` | number | replace | Hard cap (e.g., 20) |
| `errors` | string[] | append | Errors encountered |
| `decisions` | Decision[] | append | e.g., need_more_context, ready_to_infer, quality_fail, approved |
| `pendingHumanReview` | boolean | replace | True when interrupted for review |
| `output` | ReconciliationResult | replace | Final result: **patch** (patch ops) + summary, atoms, molecules, invariantFindings, metadata |

**RepoStructure** (simplified): list of files with optional component-level nodes; dependency edges; topological order.  
**InferredMolecule**: { name, description, atomIds: string[], confidence, reasoning }.

---

## 7. Graph Nodes

### 7.1 Node List

| Node | Responsibility | Inputs (from state) | Outputs (partial state) |
|------|----------------|--------------------|--------------------------|
| **structure** | Build repo structure (file list, optional component graph, topological order) | rootDirectory, input | repoStructure, currentPhase, errors? |
| **discover_fullscan** | Call **discover_orphans_fullscan**; return all orphan tests; enrich with file paths, line numbers | repoStructure, rootDirectory, input | orphanTests, codeUnits?, currentPhase, errors? |
| **discover_delta** | Call **discover_orphans_delta(baseline)**; return only delta orphan tests (+ optional changedAtomLinkedTests bucket); enrich | repoStructure, rootDirectory, input (deltaBaseline) | orphanTests, changedAtomLinkedTests?, currentPhase, errors? |
| **context** | For each test (batch): run ContextBuilder.analyzeTest, build focused context; optionally index docs | orphanTests, rootDirectory, documentationIndex? | contextPerTest, documentationIndex?, currentPhase, errors? |
| **infer_atoms** | For each test (or batch): call LLM with focused context → InferredAtom; append to inferredAtoms | contextPerTest, orphanTests, input | inferredAtoms, currentPhase, decisions?, errors? |
| **synthesize_molecules** | **Deterministic** cluster by module/path and domain concept from test names; **then** optional LLM for names/descriptions only; link atom IDs | inferredAtoms, repoStructure? | inferredMolecules, currentPhase, errors? |
| **verify** | Quality gate: AtomQualityService per atom; optional Verifier LLM for molecules; set decisions | inferredAtoms, inferredMolecules, input | decisions, currentPhase, pendingHumanReview? |
| **persist** | Build **reconciliation.patch** (createAtom, createMolecule, attachTestToAtom, invariantViolationFinding); store Run + recommendations; optionally apply; set output | inferredAtoms, inferredMolecules, decisions, invariantFindings?, input | output (patch + summary), currentPhase |

### 7.2 Optional: Human-in-the-Loop

- After **verify**, conditional edge: if `pendingHumanReview === true`, **interrupt** (LangGraph interrupt); state is checkpointed.
- Resume with human input (e.g., “approved” / “rejected” list); **persist** node then runs with that input (e.g., only persist approved atoms).

### 7.3 Edge Design

- **Branch at discover**: START → structure → **(if reconciliationMode === 'full-scan') discover_fullscan else discover_delta** → context → infer_atoms → synthesize_molecules → verify → persist → END.
- **Conditional** (optional):
  - **context → infer_atoms**: If any test failed context building, could loop back to context with different batch or skip.
  - **verify → persist**: If quality_fail, could route to “infer_atoms” with refined prompt or to “persist” with flags (e.g., store as low-confidence drafts only).
- **Hard stop**: If `iteration >= maxIterations`, go to **persist** (or END) with current results.

---

## 8. Tools

### 8.1 Existing Tools (Reuse)

- **read_file**, **list_directory**, **grep**: Already in ToolRegistryService; useful for structure and ad-hoc discovery.
- **read_json**, **read_coverage_report**: For configs, coverage, and structured reports.

### 8.2 New Reconciliation-Specific Tools

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| **get_repo_structure** | List source/test files, optional simple dependency (imports); exclude node_modules, dist | rootDirectory, includeTests, excludePatterns? | { files, testFiles, optionalDependencyEdges, topologicalOrder? } |
| **discover_orphans_fullscan** | Call TestAtomCouplingService.analyzeCoupling; return **all** orphan tests (file, name, line) | rootDirectory, includePatterns?, excludePatterns? | { orphanTests, summary } |
| **discover_orphans_delta** | **Purely mechanical.** Baseline = { runId? \| commitHash? }. (1) git diff → changed files. (2) Intersect with test file patterns. (3) Within those tests, detect missing/invalid @atom links. Output: delta orphan tests + “changed atom-linked tests” bucket | rootDirectory, baseline: { runId? \| commitHash? }, includePatterns?, excludePatterns? | { deltaOrphanTests, changedAtomLinkedTests?, deltaSummary, baselineInfo } |
| **get_test_analysis** | Call ContextBuilder.analyzeTest for one test; return TestAnalysis (assertions, imports, domain concepts, related files, doc snippets) | testFilePath, testName, testLineNumber, rootDirectory | TestAnalysis |
| **search_docs_by_concepts** | Search docs (e.g., docs/, README) by domain/technical concepts; return relevant snippets | rootDirectory, concepts: string[], maxChunks? | { chunks: { path, snippet, relevance? }[] } |
| **infer_atom_from_test** | Single test → LLM → InferredAtom (description, category, confidence, reasoning, **observableOutcomes** only, **ambiguityReasons?**; schema enforces WHAT not HOW) | testAnalysisSummary (focused context string), testId | InferredAtom \| null |
| **cluster_atoms_for_molecules** | **Deterministic first**: group by module/path namespace and by top-level domain concept from test names/descriptions. Return clusters; **optional** LLM only for name/description per cluster | inferredAtoms[], method: 'module' \| 'domain_concept' (semantic optional later) | { clusters: { name?, description?, atomIds[] }[] } (name/description filled by optional LLM pass) |
| **validate_atom_quality** | Call AtomQualityService.validateAtom for one atom | description, category, atomId? | { totalScore, breakdown?, passes } |

Implementations can wrap existing services (TestAtomCouplingService, ContextBuilderService, LLMService, AtomQualityService) behind these tool interfaces so the graph (or a “tool-calling” node) uses them consistently.

---

## 9. Phased Implementation

### Phase 1: Graph and State (No New Tools)

- Define **ReconciliationGraphState** and **ReconciliationResult** (including **patch** ops) in `graphs/types/`.
- Implement nodes as thin wrappers around current logic:
  - **structure**: Simple file/list_directory-based “structure” (no full AST).
  - **discover_fullscan** / **discover_delta**: Call **discover_orphans_fullscan** or **discover_orphans_delta**(baseline); enrich.
  - **context**: Loop orphan tests, call ContextBuilder.analyzeTest, fill contextPerTest.
  - **infer_atoms**: Same batch LLM loop as today, writing to state.inferredAtoms.
  - **synthesize_molecules**: First version: group by category or by source file; simple name/description from LLM.
  - **verify**: Call AtomQualityService for each atom; set decisions.
  - **persist**: Call existing createAtomsFromInferred / storeRecommendationsAsDrafts; add molecule persistence (new table or metadata); log agent action.
- Register **brownfield-analysis** graph in GraphRegistryService; **BrownfieldAnalysisService.analyzeRepository** invokes graph instead of inline sequence.

### Phase 2: Brownfield Tools

- Add **get_repo_structure**, **discover_orphans_fullscan**, **discover_orphans_delta**, **get_test_analysis**, **search_docs_by_concepts**, **infer_atom_from_test**, **cluster_atoms_for_molecules**, **validate_atom_quality** to ToolRegistryService (or a BrownfieldToolsService that implements ToolExecutor).
- Refactor nodes to use tools (discover_fullscan calls discover_orphans_fullscan; discover_delta calls discover_orphans_delta; context calls get_test_analysis and search_docs_by_concepts). This improves testability and reuse.

### Phase 3: Delta Mode and Repository Structuring

- **Delta mode**: Add **reconciliationMode** and **deltaBaseline** to input; graph branches to **discover_delta**, which calls **discover_orphans_delta(baseline)** (purely mechanical: git diff + test patterns + @atom checks). Persist run with `reconciliationMode` and `deltaBaselineRunId` so the next delta run has a baseline.
- **Repository structuring**: Enhance **structure** (or **get_repo_structure**) to produce a real file-level dependency graph (e.g., from import statements) and topological order.
- Use dependency order in **context** / **infer_atoms** (e.g., process tests in files that depend on fewer others first) to align with UserTrace-style “dependency-aware” processing.

### Phase 4: Human-in-the-Loop and Interrupts

- Add conditional edge after **verify**: if “needs_review”, set `pendingHumanReview = true` and **interrupt**.
- Support resume with approval/rejection payload; **persist** respects it.
- Optional: checkpointing (e.g., LangGraph checkpointer) for long-running analyses and recovery.

### Phase 5: Molecules and Quality

- **Molecule persistence**: Store InferredMolecule as first-class entities (e.g., molecules table or atoms.metadata grouping).
- **Verifier agent**: Optional LLM step to evaluate molecule completeness/correctness and feed back to **synthesize_molecules** (iterative refinement).
- **Clustering**: Improve **cluster_atoms_for_molecules** with semantic similarity (embeddings) if available.

---

## 10. Reconciliation Results Schema (Persistence)

To make **application of Pact concepts after analysis seamless**, reconciliation results should be stored in a first-class schema rather than only in `atoms.metadata` and `agent_actions.output`. A dedicated schema supports:

- **Run identity**: List runs, resume, diff “what changed since last run,” and attach recommendations to a specific run.
- **Recommendation lifecycle**: Track each atom/molecule recommendation (pending / accepted / rejected) and link it to the created Atom or Molecule once applied.
- **Test-level traceability**: Know which tests were analyzed, which produced recommendations, and whether a test’s recommendation was already applied (for incremental analysis and avoiding duplicate suggestions).
- **Review and apply UX**: One place to see “Run R: 12 atom recommendations, 3 molecule recommendations; 5 accepted, 7 pending”; one action to “apply” accepted recommendations into real Atoms and Molecules with correct linkage.

### 10.1 Current State (No Dedicated Schema)

Today:

- **Atoms**: Reconciliation (or legacy brownfield) stores recommendations as draft Atoms with `metadata.source = 'reconciliation-agent'`, `metadata.pendingReview`, `metadata.sourceTest`. There is no link to an “analysis run” or to a canonical recommendation record.
- **AgentAction**: One row per run with `output.recommendations` (full JSON). Good for audit, but not queryable by recommendation status or test; no FK to atoms/molecules once created.
- **Molecules**: No storage for inferred molecules; no “molecule recommendation” entity.

Consequences: listing “all pending reconciliation recommendations” requires querying atoms by metadata; “which run produced this atom?” is only in metadata or AgentAction JSON; “has this test already been analyzed?” is harder; applying a recommendation means creating an Atom and then manually clearing `pendingReview` with no formal link from recommendation → atom.

### 10.2 Proposed Entities

| Entity | Purpose |
|--------|---------|
| **BrownfieldAnalysisRun** (or **ReconciliationRun**) | One row per reconciliation execution (full-scan or delta). Holds run-scoped options (rootDirectory, **reconciliationMode**, **deltaBaseline?**), status (running / completed / failed), summary counts, optional link to project. Serves as baseline for the next delta run. |
| **BrownfieldAtomRecommendation** | One row per inferred atom. Holds description, category, confidence, reasoning, source test (filePath, testName, lineNumber), observable outcomes, related docs; status (pending / accepted / rejected); optional FK to `atoms.id` once applied. |
| **BrownfieldMoleculeRecommendation** | One row per inferred molecule. Holds name, description, list of atom recommendation IDs (or atom IDs after apply), confidence; status (pending / accepted / rejected); optional FK to `molecules.id` once applied. |
| **BrownfieldTestRecord** (optional) | One row per test analyzed in a run. Holds test key (filePath, testName, lineNumber), run ID, and whether it produced an atom recommendation (and which one). Enables “already analyzed” checks and incremental runs. |

Relationships:

- **Run** 1 → N **AtomRecommendation**, **Run** 1 → N **MoleculeRecommendation**, **Run** 1 → N **TestRecord** (if used).
- **AtomRecommendation** N → 1 **Atom** (nullable; set when “apply” creates or links an Atom).
- **MoleculeRecommendation** N → 1 **Molecule** (nullable; set when “apply” creates or links a Molecule); molecule recommendation also references atom recommendation IDs (or atom IDs after apply).
- **Atom** (existing): Keep `metadata.source = 'reconciliation-agent'` and `metadata.sourceRecommendationId = <uuid>` so traceability and UI can resolve “this atom came from this recommendation.”

### 10.3 Seamless Application of Pact Concepts

With this schema:

1. **List runs**: `GET /agents/reconciliation/runs` (or equivalent) returns runs with summary counts (total / pending / accepted / rejected recommendations) and **patch** (patch ops).
2. **List recommendations**: `GET /agents/reconciliation/runs/:runId/recommendations` returns atom and molecule recommendations with status; filter by `status=pending` for review UI.
3. **Accept / reject**: API to set recommendation status to `accepted` or `rejected` (and optionally batch by run).
4. **Apply**: “Apply accepted recommendations” creates Atoms (and optionally Molecules) from accepted records, sets `BrownfieldAtomRecommendation.atomId` (and molecule FK), and copies source test and inference metadata into `Atom.metadata` (including `sourceRecommendationId`). Molecules are created with ManyToMany to the newly created or existing Atoms.
5. **Traceability**: From an Atom, `metadata.sourceRecommendationId` → BrownfieldAtomRecommendation → Run and source test. From a Molecule, same via BrownfieldMoleculeRecommendation.
6. **Incremental analysis**: When starting a new run, optionally exclude tests that already have a TestRecord (or an accepted AtomRecommendation) in a previous run for the same repo root, so the agent does not re-suggest the same intent.

### 10.4 Reconciliation Patch (First-Class Artifact)

Each run produces a **reconciliation.patch** (or equivalent) stored on the run (e.g. Run.patchOps JSONB). Patch ops are **deterministic** and **reviewable**:

| Op type | Payload | Purpose |
|---------|---------|---------|
| **createAtom** | description, category, sourceTest, observableOutcomes, confidence, ambiguityReasons? | Inferred atom to create |
| **createMolecule** | name, description, atomRecommendationIds | Inferred molecule to create |
| **attachTestToAtom** | testFilePath, testName, testLineNumber, atomId | Link test to atom (e.g. after apply) |
| **markAtomSuperseded** | oldAtomId, newAtomId | (If supported) supersession |
| **invariantViolationFinding** | invariantId, message, severity, location? | **No auto-fix** unless explicitly permitted |

Apply flow: `apply_patch(patch_id, selections)` applies only the selected ops (e.g. user accepted createAtom A and B; createMolecule M); creates Atoms/Molecules and sets recommendation.atomId / moleculeId; optionally writes @atom back into test files. This patch is the **“diff” between repo and Pact**—auditability and tooling integration.

### 10.5 Migration and Coexistence

- **Phase 1**: Introduce **ReconciliationRun** (or BrownfieldAnalysisRun) and **AtomRecommendation**; persist node writes one Run, N AtomRecommendations, and **patch ops**; “apply” executes selected patch ops. Keep writing AgentAction for audit; optional: backfill Run + Recommendation from existing draft atoms with reconciliation metadata.
- **Phase 2**: Add **MoleculeRecommendation** and **TestRecord** if needed; persist node and apply flow extended accordingly.
- **Backward compatibility**: If “apply” is not used, existing flow can still create draft Atoms directly (as today) and optionally also create Recommendation rows + patch ops so that future runs can use the schema consistently.

---

## 11. Pact-Chat as Command Surface

Once atoms and invariants exist, Pact-chat has **cheap certainty**: what behaviors exist (atoms), what rules govern everything (invariants), which tests prove which atoms (coupling graph), what changed since baseline (delta), what’s uncovered/drifting (orphan tests, uncoupled code paths, superseded invariants). Pact-chat’s job is **mostly**: route the user’s intent to a **small set of operators** that transform or report on this state. The ReAct loop is still useful as **dispatcher + fallback**, not the primary engine.

**Core actions (high leverage, low ambiguity)**:

| Action | Description |
|--------|-------------|
| **reconcile_repo**(mode=delta \| full) | Run reconciliation agent; returns **patch + findings** (and run id) |
| **apply_patch**(patch_id, selections) | Apply accepted ops from a reconciliation patch |
| **explain_atom**(atom_id) | Show intent + validators + coupled tests + drift status |
| **find_gaps**() | Orphan tests, uncovered code, invariant violations |
| **supersede_invariant**(invariant_id, new_version) | (If supported) creates refactor set / tags impacted atoms/tests |

**Less common / fallback**:

- “User asked something unexpected” → ReAct (search, read, synthesize).
- “Interpret docs” → targeted doc search and summarization.

Pact-chat is **context-bound** because Pact itself is the context. It should **not** be repo-agnostic: it operates over the constrained, factual system (atoms + invariants + coupling + delta).

---

## 12. Reconciliation Backlog (“Next Task”)

Once reconciliation produces a **patch**, that patch defines the **backlog** for humans and coding agents. A deterministic priority queue:

| Priority | Item | Meaning |
|----------|------|---------|
| 1 | **Invariant violations** | System unsafe; must be addressed |
| 2 | **Orphan tests / uncataloged behavior** | Repo ahead of Pact; create atoms (and optionally molecules) or attach tests |
| 3 | **Low-confidence inferred atoms** | Needs human or agent refinement |
| 4 | **Molecule grooming** | Nice-to-have; naming, grouping |

A **coding agent** doesn’t need to invent tasks—it **executes patch ops** (or implements missing coupling/tests) in this order. The reconciler produces the backlog.

---

## 13. Success Criteria

- **Functional**: Running the reconciliation graph produces inferred atoms and molecules; results are stored as a **patch** and recommendations; patch can be applied via API.
- **Observability**: Every LLM and tool call is traced (LangSmith) and tagged with agent/graph name.
- **Quality**: Inferred atoms pass AtomQualityService at a configurable threshold; molecules have clear names and atom links.
- **Maintainability**: State schema and node list are documented; new nodes or tools can be added without rewriting the flow.
- **Persistence (when schema adopted)**: Runs and recommendations are first-class; apply flow creates Atoms/Molecules with correct linkage and traceability.

---

## 14. References

- **LangGraph**: [Concepts](https://langchain-ai.github.io/langgraph/concepts/), [Multi-Agent](https://langchain-ai.github.io/langgraph/concepts/multi_agent/), [Human-in-the-Loop](https://langchain-ai.github.io/langgraph/concepts/v0-human-in-the-loop/), [Persistence](https://langchain-ai.github.io/langgraph/how-tos/persistence/).
- **UserTrace**: Jin et al., “UserTrace: User-Level Requirements Generation and Traceability Recovery from Software Project Repositories,” arXiv:2509.11238, 2025.
- **Pact**: CLAUDE.md (atoms, molecules, tests as coupling mechanism); BROWNFIELD_ANALYSIS.md; CONTEXT_BUILDER_DESIGN.md.
- **Current code**: `src/modules/agents/brownfield-analysis.service.ts`, `context-builder.service.ts`, `test-atom-coupling.service.ts`, `graphs/builders/react-builder.ts`, `graphs/graph-registry.service.ts`.

---

## Appendix A: Diagram (Text)

```
START
  │
  ▼
┌─────────────┐
│  structure  │  repo structure (files, deps, order)
└──────┬──────┘
       ▼
  reconciliationMode?
  ├─ full-scan ──► discover_fullscan  (discover_orphans_fullscan)
  └─ delta ──────► discover_delta     (discover_orphans_delta; mechanical: git diff + @atom)
       │
       ▼
┌─────────────┐
│  context    │  per-test context (ContextBuilder + doc search)
└──────┬──────┘
       ▼
┌─────────────┐
│ infer_atoms │  LLM per test → InferredAtom[] (observable-outcomes-only schema; ambiguityReasons?)
└──────┬──────┘
       ▼
┌─────────────────────┐
│ synthesize_molecules│  deterministic cluster (module/domain); optional LLM for names only
└──────┬──────────────┘
       ▼
┌─────────────┐
│   verify    │  quality gate; invariant checks; optional interrupt for human
└──────┬──────┘
       ▼
┌─────────────┐
│   persist   │  build reconciliation.patch (createAtom, createMolecule, …); store Run + recommendations; optional apply
└──────┬──────┘
       ▼
      END
```

---

## Appendix B: File Layout (Proposed)

```
src/modules/agents/
  graphs/
    graphs/
      reconciliation.graph.ts        # createReconciliationGraph()
    nodes/
      brownfield/
        structure.node.ts
        discover.node.ts
        context.node.ts
        infer-atoms.node.ts
        synthesize-molecules.node.ts
        verify.node.ts
        persist.node.ts
    types/
      reconciliation-state.ts        # ReconciliationGraphState, RepoStructure, InferredMolecule, patch ops, etc.
  tools/
    reconciliation-tools.definitions.ts  # discover_orphans_fullscan, discover_orphans_delta, get_test_analysis, ...
    reconciliation-tools.service.ts      # Implements ToolExecutor (uses TestAtomCouplingService, git, ContextBuilder, etc.)
  reconciliation.service.ts    # Invokes graph via GraphRegistry; keeps DTO and API contract (brownfield-analysis.service can delegate for backward compat)
```

---

## Appendix C: Brownfield Results Schema (Entity Sketches)

Concrete TypeORM-style entity definitions for the persistence schema in §10. These live in a reconciliation (or agents) module and are migrated separately. **Naming**: Prefer **ReconciliationRun** in code; BrownfieldAnalysisRun retained as alias where backward compatibility is needed.

### BrownfieldAnalysisRun / ReconciliationRun

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| runId | string unique (e.g. BRA-001 or uuid) | Human-readable run identifier |
| rootDirectory | string | Repo root analyzed |
| reconciliationMode | enum: full-scan, delta | Full catalog vs delta-only |
| deltaBaselineRunId | uuid FK nullable | If delta: which run (or commit) was the baseline |
| deltaBaselineCommitHash | string nullable | If delta: optional commit hash at last reconciliation |
| status | enum: running, completed, failed | Run lifecycle |
| options | jsonb | maxTests, analyzeDocumentation, autoCreateAtoms, etc. |
| summary | jsonb | totalOrphanTests, inferredAtomsCount, inferredMoleculesCount, createdAtomsCount, etc. |
| **patchOps** | jsonb | **Reconciliation patch** (createAtom, createMolecule, attachTestToAtom, invariantViolationFinding, …); the “diff” between repo and Pact; used by apply_patch |
| projectId | uuid FK nullable | Optional link to Project |
| createdAt, completedAt | timestamp | |

Storing `deltaBaselineRunId` (or `deltaBaselineCommitHash`) on each run makes the next “close the delta” run use this run as baseline.

### BrownfieldAtomRecommendation

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| runId | uuid FK → BrownfieldAnalysisRun | Which run produced this |
| description | text | Inferred atom description |
| category | string | functional, performance, security, … |
| confidence | decimal(3,2) | 0–1 |
| reasoning | text | LLM reasoning |
| sourceTestFilePath | string | |
| sourceTestName | string | |
| sourceTestLineNumber | int | |
| observableOutcomes | jsonb | string[] |
| relatedDocs | jsonb | string[] |
| qualityScore | decimal nullable | From AtomQualityService if run |
| status | enum: pending, accepted, rejected | Review status |
| atomId | uuid FK nullable → Atom | Set when applied |
| createdAt | timestamp | |

### BrownfieldMoleculeRecommendation

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| runId | uuid FK → BrownfieldAnalysisRun | |
| name | string | Inferred molecule name |
| description | text nullable | |
| atomRecommendationIds | jsonb | uuid[] of BrownfieldAtomRecommendation.id (before apply) |
| atomIds | jsonb nullable | uuid[] of Atom.id (after apply; denormalized for convenience) |
| confidence | decimal(3,2) | |
| status | enum: pending, accepted, rejected | |
| moleculeId | uuid FK nullable → Molecule | Set when applied |
| createdAt | timestamp | |

### BrownfieldTestRecord (optional)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| runId | uuid FK → BrownfieldAnalysisRun | |
| filePath | string | |
| testName | string | |
| lineNumber | int | |
| atomRecommendationId | uuid FK nullable → BrownfieldAtomRecommendation | If this test produced one |
| createdAt | timestamp | |

**Indexes**: Run (status, projectId, createdAt); AtomRecommendation (runId, status); MoleculeRecommendation (runId, status); TestRecord (runId, filePath, testName, lineNumber) for “already analyzed” lookups.
