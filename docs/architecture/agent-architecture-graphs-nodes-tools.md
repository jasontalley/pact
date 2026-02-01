# Agent Architecture: Graphs, Nodes, Edges, Utils, and Tools

This document maps the current agent architecture (graphs, nodes, edges, utils, builders, and tools) and recommends Pact-relevant additions.

---

## 1. Current Architecture Map

### 1.1 Graphs

| Graph | Pattern | Builder | Flow | Purpose |
|-------|---------|--------|------|---------|
| **chat-exploration** | ReAct | `createReactGraph` (react-builder) | START → planning → search → analyze → [decision] → search (loop) or synthesize → END | General codebase exploration and Q&A. Plan → Search ↔ Analyze → Synthesize. |
| **coverage-fast** | fast-path (linear) | Inline (no builder) | START → discover → extract → format → END | Deterministic path for coverage questions only (see overfitting analysis). |

**State types**: `ChatExplorationState` (extends `BaseExplorationState` + plan, analysisDecision, clarificationNeeded); `CoverageFastState` (input, coverageFiles, metrics, findings, output, error).

**Registration**: `GraphRegistryService.initializeGraphs()` registers both. Chat agent routes by pattern (e.g. coverage regexes) to coverage-fast or chat-exploration.

---

### 1.2 Nodes

| Node | File | Input state | Output (partial state) | Notes |
|------|------|-------------|------------------------|--------|
| **planning** | `plan.node.ts` | input | plan | LLM generates Plan (strategy, targetDirectories, filePatterns, searchTerms, actions). Zod-validated. |
| **search** | `search.node.ts` | input, plan, findings, iteration, messages | findings, toolHistory, messages, iteration, evidenceLevel, limitations | Executes tools (filesystem/code). Discovery-first: lists plan.targetDirectories on iteration 0. Classifies/extracts findings per tool (read_file, read_json, read_coverage_report, list_directory, grep). |
| **analyze** | `analyze.node.ts` | input, findings, iteration, evidenceLevel, limitations | isComplete, analysisDecision, clarificationNeeded, limitations | LLM or heuristics decide: need_more_search | ready_to_answer | request_clarification | max_iterations_reached. Evidence ladder enforced. |
| **synthesize** | `synthesize.node.ts` | input, findings, toolHistory, limitations | output, isComplete | LLM turns findings into final answer. Partitions findings (computed / parsed / raw), proof-carrying synthesis. |
| **discover** (coverage-fast) | `coverage-fast.graph.ts` | — | coverageFiles, findings, error | Lists fixed dirs, collects paths matching coverage file patterns. |
| **extract** (coverage-fast) | `coverage-fast.graph.ts` | coverageFiles | metrics, findings, error | Calls read_coverage_report per file until metrics found. |
| **format** (coverage-fast) | `coverage-fast.graph.ts` | metrics, findings, error | output | Formats metrics as markdown. |

**Node config**: All nodes receive `NodeConfig` (llmService, toolRegistry, logger). Nodes are created via factories: `createPlanNode(options)(config)`, etc.

---

### 1.3 Edges

| Edge | File | Type | Behavior |
|------|------|------|----------|
| **createDecisionEdge** | `should-continue.ts` | Conditional | From analyze: ready_to_answer / max_iterations_reached → synthesize; request_clarification → clarifyNode or synthesize; need_more_search → search (or synthesize if at maxIterations). |
| **createShouldContinueEdge** | `should-continue.ts` | Conditional | Legacy: isComplete or iteration >= max → completeNode, else continueNode. |
| **alwaysAnalyze** | `should-continue.ts` | Fixed | Always returns `'analyze'`. |
| **alwaysRouteTo(nodeName)** | `should-continue.ts` | Fixed | Always returns given node name. |
| **createQualityGateEdge** | `quality-gate.ts` | Conditional | Routes by qualityScore >= threshold → passNode, else failNode. |
| **createMultiThresholdEdge** | `quality-gate.ts` | Conditional | Routes by descending score thresholds to nodes; defaultNode if no match. |

**Usage**: ReAct graph uses `createDecisionEdge` after analyze. Plan-execute and quality-gate edges are available but not used by current graphs.

---

### 1.4 Utils

| Util | File | Purpose |
|------|------|---------|
| **getEvidenceLevelFromFinding** | `finding-compactor.ts` | Maps finding to evidence level 0–4 (directory listing → raw → parsed → computed). |
| **compactFinding** | `finding-compactor.ts` | Replaces finding content with a short summary; preserves computed facts and parse metadata. |
| **extractKeyFacts** | `finding-compactor.ts` | From parsed JSON, extracts facts (currently coverage-shaped: total.lines/statements/branches/functions, coverage, passed, failed, total, count). *Overfitted.* |
| **deduplicateFindingsBySource** | `finding-compactor.ts` | Deduplicates by source, keeping higher evidence level. |
| **formatFindingsForPrompt** | `finding-compactor.ts` | Formats findings for search/analyze prompts; after iteration 2 uses compact summaries. |
| **formatFindingsForSynthesis** | `finding-compactor.ts` | Formats findings for synthesize node with compact summaries and facts. |

---

### 1.5 Builders

| Builder | File | Produces | Used by |
|---------|------|----------|---------|
| **createReactGraph** | `react-builder.ts` | ReAct graph: planning → search → analyze → [decision] → search | synthesize | chat-exploration |
| **createPlanExecuteGraph** | `plan-execute-builder.ts` | Linear: plan → execute → [validate] → report | Not used currently |

**Builder options**: ReAct supports stateSchema, nodeOptions (plan/search/analyze/synthesize), customNodes, skipPlan, clarifyNode. Plan-execute supports stateSchema, nodes (plan, execute, validate?, report), edges.afterValidate.

---

### 1.6 Tools

#### Filesystem (ToolRegistryService)

| Tool | Parameters | Purpose |
|------|------------|---------|
| **read_file** | file_path, start_line?, end_line? | Read file or line range. |
| **list_directory** | directory_path?, include_hidden? | List directory; returns path, items, count. |
| **grep** | pattern, directory_path?, file_pattern?, max_results?, case_sensitive? | Search content; returns pattern, directory, results, count. |

#### Structured readers (ToolRegistryService)

| Tool | Parameters | Purpose |
|------|------------|---------|
| **read_json** | file_path, json_pointer? | Parse JSON; schema summary or pointer extraction. |
| **read_coverage_report** | file_path | Parse coverage-summary.json, Istanbul JSON, or LCOV. Returns metrics. |

#### Atom tools (AtomToolsService, registered from ATOM_TOOLS)

| Tool | Parameters | Purpose |
|------|------------|---------|
| **analyze_intent** | intent | Analyze raw intent for atomicity. |
| **count_atoms** | status?, category? | Count atoms. |
| **get_statistics** | — | Atom stats (counts by status, category, etc.). |
| **search_atoms** | query, category?, status?, limit? | Search by description/tags/category. |
| **list_atoms** | page?, limit?, status?, category?, sortBy?, sortOrder? | List atoms with filters and sort. |
| **get_atom** | atomId | Get atom by ID (e.g. IA-001). |
| **refine_atom** | atomId, feedback? | Refinement suggestions. |
| **create_atom** | description, category, tags? | Create draft atom. |
| **update_atom** | atomId, description?, category?, tags?, qualityScore? | Update draft. |
| **commit_atom** | atomId | Commit draft (quality >= 80). |
| **delete_atom** | atomId | Delete draft. |
| **get_popular_tags** | limit? | Popular tags with counts. |

**Categories** (for getToolsByCategory): `filesystem` (read_file, list_directory, grep, read_json, read_coverage_report), `atom` (atom/intent/refine tools), `code` (grep, search-like). Chat exploration uses `['filesystem', 'code']` by default (no atom tools in search node).

---

## 2. Recommendations: Graphs

**Note**: “Brownfield” has been pivoted to the **Reconciliation Agent** (see [reconciliation-agent-architecture-proposal.md](reconcilation-agent-architecture-proposal.md)). The reconciliation agent reconciles repo state with Pact state (full-scan on first use, or delta closure when the repo has drifted). Naming and APIs should use “reconciliation” (e.g. `reconciliation-agent`, `ReconciliationRun`); “brownfield” is retained only as a historical label for the first full-scan run.

| Recommendation | Rationale |
|----------------|-----------|
| **Intent / atom-creation graph** | Pact’s core flow: idea → refine → atomize → (optional) commit. A dedicated graph (e.g. Plan-Execute: plan_intent → refine → validate_quality → report) would standardize intent-to-atom workflows and reuse existing services (IntentRefinementService, AtomQualityService, AtomizationService). |
| **Reconciliation agent graph** | The **Repo–Pact Reconciliation Agent** (see [reconciliation-agent-architecture-proposal.md](reconcilation-agent-architecture-proposal.md)) reconciles repo state with Pact state—full-scan (first use, formerly “brownfield”) or delta closure (drift since last run). A single graph (structure → discover → context → infer → synthesize → verify → persist) with deterministic discover operators and patch output would replace the current BrownfieldAnalysisService sequence and let chat route to “reconcile_repo” or “apply_patch” instead of ad-hoc tool calls. |
| **Commitment flow graph** | CommitmentAgentService and commitment-flow prompts exist. A small graph (e.g. validate_commitment → confirm → commit) would enforce quality gates (e.g. quality-gate edge at 80) and clarification steps before commit. |
| **Generic “report fast-path” graph** | Replace or generalize coverage-fast with a parameterized graph: config (directories, file patterns, parser/tool name). Register coverage as one instance; add others (e.g. quality report, build report) without new graphs. |
| **Remove or narrow coverage-fast** | Per overfitting analysis: either remove coverage-fast and rely on chat-exploration + read_coverage_report, or make it one instance of the generic report fast-path above. |

---

## 3. Recommendations: Nodes

| Recommendation | Rationale |
|----------------|-----------|
| **Clarify node** | ReAct builder already has `clarifyNode` option; analyze can emit request_clarification. Add a real node that turns clarificationNeeded into a structured prompt or UI step and re-enters the graph (e.g. back to plan or search) so the agent can ask “Do you mean line or branch coverage?” or “Which molecule?” without going straight to synthesize. |
| **Validate / trace node** | After search, optionally validate that findings link to atoms (e.g. test files → @atom refs). Could call TestAtomCouplingService or validators and push results into state (e.g. couplingReport, gaps) for synthesize or for a dedicated “trace” graph. |
| **Invariant-check node** | Before commit or in a commitment graph: check current state against global invariants (INV-*) and put violations into state so synthesize or format can report “Cannot commit: INV-009 not satisfied.” Requires invariants API or tool. |
| **Route / classifier node** | Optional first node that classifies user intent (explore vs create atom vs commitment vs reconciliation) and sets a “subgraph” or “mode” in state so the rest of the graph (or the registry) chooses the right graph or tool set. Reduces hardcoded routing in ChatAgentService. |
| **Plan-execute “execute” node** | Plan-execute builder exists but isn’t used. An execute node that runs a fixed sequence of tools (e.g. list_directory → read_file for config) would support deterministic report flows (coverage, quality, etc.) without an LLM in the loop. |

---

## 4. Recommendations: Edges

| Recommendation | Rationale |
|----------------|-----------|
| **Quality-gate edge for commitment** | Use createQualityGateEdge or createMultiThresholdEdge in a commitment graph: after “validate” node, route on atom qualityScore (e.g. >= 80 → confirm/commit, &lt; 80 → refine or report). Aligns with “80+ required for commitment” in CLAUDE. |
| **Clarification re-entry edge** | When clarifyNode is used, add an edge from clarify back to planning or search (e.g. “after user responds, go to planning with updated input”). Requires state for “pending clarification” and a way to inject the user’s reply. |
| **Max-cost or max-token edge** | Optional conditional edge after search or analyze: if total token usage or cost exceeds a threshold, route to synthesize early instead of looping. Would need state fields for usage/cost (or pass-through from LLM middleware). |
| **Evidence-threshold edge** | Route based on evidenceLevel (e.g. if evidenceLevel >= 4 after search, skip analyze and go straight to synthesize). Complements current evidence ladder inside analyze. |

---

## 5. Recommendations: Utils

| Recommendation | Rationale |
|----------------|-----------|
| **Generic JSON fact extractor** | Replace or supplement extractKeyFacts with a format-agnostic extractor: e.g. top-level numeric/boolean/string fields, or recursive with depth limit, so any JSON (config, API response, other reports) gets compact facts. Reduces coverage-only overfitting. |
| **Path/source normalizer** | Normalize finding.source and file paths (e.g. strip workspace root, collapse relative segments) so deduplication and “paths discovered in content” are consistent across tools and OS. |
| **Evidence summarizer** | One function that, given findings + evidenceLevel, returns a short text summary (e.g. “3 parsed, 2 raw, 1 computed”) for prompts or logs. Reusable in analyze and synthesize. |
| **Schema/topLevelKeys-based summary** | For parsed JSON, derive compact summary from parseMetadata.topLevelKeys and optional key types (e.g. “Object: name, version, scripts”) instead of only coverage-shaped keys. |
| **Limitation merger** | Deduplicate and merge limitations (e.g. “truncated”, “parse failed”) so the same limitation isn’t repeated across iterations; improves synthesize prompt quality. |

---

## 6. Recommendations: Builders

| Recommendation | Rationale |
|----------------|-----------|
| **Use plan-execute for report flows** | Instantiate createPlanExecuteGraph for “report” flows: plan (fixed dirs/patterns), execute (call read_json / read_coverage_report / custom tool), validate (optional), report (format). Enables multiple fast-paths without one-off graphs. |
| **ReAct option: inject atom tools into search** | Allow chat-exploration (or a variant) to include atom tools in the search node’s tool set when the plan or route indicates “atom/intent” mode, so the agent can search_atoms, get_atom, and read files in one graph. |
| **Subgraph / composite builder** | A builder that composes two graphs (e.g. route → chat-exploration vs intent-creation) with a single entry point and shared state schema. Would clean up ChatAgentService routing and make “which graph” a first-class choice. |

---

## 7. Recommendations: Tools

| Recommendation | Rationale |
|----------------|-----------|
| **list_commitments** | List commitments (with filters: atom, status, date). Enables “What’s committed?” and “Show commitments for IA-001” without only using atom tools. |
| **get_commitment** | Get one commitment by id (or atom id). Complements get_atom for commitment-centric questions. |
| **get_invariants** | Return active global invariants (INV-*) or project invariants. Supports invariant-check node and “What are the invariants?” in chat. |
| **list_molecules** | List molecules and their atom links. Supports “What molecules exist?” and “Which atoms are in M-001?”. |
| **test_atom_coupling_report** | Wrap TestAtomCouplingService: run coupling analysis and return summary (e.g. orphan tests, atoms without tests). Enables reconciliation/trace flows from the agent. |
| **run_reconciliation** | Wrap the Reconciliation Agent (or current BrownfieldAnalysisService as a stepping stone): run full-scan or delta closure and return structured result (e.g. ReconciliationRun, reconciliation.patch). Enables “Reconcile repo with Pact” as a single tool call; naming should use “reconciliation” (see [reconciliation-agent-architecture-proposal.md](reconcilation-agent-architecture-proposal.md)). |
| **read_test_results** | Similar to read_coverage_report but for test result artifacts (e.g. Jest/Vitest JSON, JUnit XML). Parse and return pass/fail/skip counts and key failures. Supports “What’s the test status?” without overfitting to coverage. |
| **read_quality_report** | If quality reports are stored (e.g. test-results/quality/), a structured reader would support “What’s the test quality report?” in a generic way. |
| **Atom tool usage in exploration** | Ensure getToolsByCategory('atom') is available to the search node when the task is atom-related (e.g. via plan or route). Today chat-exploration uses only filesystem + code; adding atom tools for “list atoms”, “get atom IA-001” would make exploration graphs Pact-aware. |

---

## 8. Summary Table: Current vs Recommended

| Layer | Current | Recommended additions |
|-------|---------|------------------------|
| **Graphs** | chat-exploration, coverage-fast | Intent/atom-creation, **reconciliation agent**, commitment flow; generic report fast-path (replace coverage-fast). |
| **Nodes** | plan, search, analyze, synthesize; discover, extract, format (coverage) | Clarify, validate/trace, invariant-check, route/classifier; execute (plan-execute). |
| **Edges** | Decision (analyze → search/synthesize), quality-gate (unused) | Quality-gate in commitment; clarification re-entry; optional max-cost, evidence-threshold. |
| **Utils** | finding-compactor (evidence, compact, format; extractKeyFacts overfitted) | Generic JSON fact extractor; path normalizer; evidence summarizer; limitation merger. |
| **Builders** | ReAct, Plan-Execute (unused) | Use Plan-Execute for report flows; optional subgraph/route builder; ReAct + atom tools option. |
| **Tools** | read_file, list_directory, grep, read_json, read_coverage_report; full atom CRUD + analyze_intent, refine, get_statistics, get_popular_tags | list_commitments, get_commitment, get_invariants, list_molecules, test_atom_coupling_report, **run_reconciliation**, read_test_results, read_quality_report; expose atom tools in exploration when appropriate. |

---

## 9. Suggested Implementation Order

1. **Utils**: Generic JSON fact extractor and path normalizer (low risk, unblocks de-overfitting).
2. **Tools**: list_commitments, get_commitment, get_invariants, list_molecules (if APIs exist); test_atom_coupling_report and run_reconciliation (wrap Reconciliation Agent or BrownfieldAnalysisService as stepping stone).
3. **Edges**: Use quality-gate in a commitment micro-graph or in a new commitment flow graph.
4. **Nodes**: Clarify node and wire it in ReAct; then validate/trace node that calls test-atom coupling.
5. **Graphs**: Commitment flow graph (plan-execute or small custom); then intent/atom-creation graph; then **reconciliation agent graph** (per [reconciliation-agent-architecture-proposal.md](reconcilation-agent-architecture-proposal.md)).
6. **Builders**: Parameterized “report fast-path” using plan-execute; optional route/subgraph builder for chat-agent routing.

This order keeps existing chat-exploration stable while adding Pact-specific value (atoms, commitments, invariants, **reconciliation**, test-atom coupling) through new tools and graphs, then refines routing and reuse via builders and edges.
