# Chat Agent: Coverage-Question Overfitting Analysis

**Context**: The chat agent and related graph code contain logic that appears to have been optimized for a single test prompt—“tell me about the test coverage in the repo”—rather than for general codebase exploration. This document catalogs those areas and suggests generalizations.

**Scope**: `src/modules/agents/` (graphs, nodes, utils, tools, chat-agent.service).

---

## Summary Table

| Location | Severity | Type | Recommendation |
|----------|----------|------|----------------|
| `finding-compactor.ts` – `extractKeyFacts` | High | Narrow fact extraction | Generic JSON fact extraction |
| `search.node.ts` – coverage classifier & extractor | High | Coverage-specific branch | Treat like read_json (structured parse) |
| `search.node.ts` – suggestBetterTool / suggestToolForFile | High | Coverage-first suggestions | Tool-agnostic or config-driven |
| `search.node.ts` – identifyFileTypesInFindings (coverageFiles) | Medium | Coverage as first-class category | Single “structured data files” or generic |
| `search.node.ts` – prompt sections (tool suggestions, rules) | High | Coverage hardcoded in prompts | Generic “use structured readers for known formats” |
| `analyze.node.ts` – coverage patterns & early termination | High | Coverage-only fast path | Generic “computed facts answer question” or remove |
| `analyze.node.ts` – prompt “read_coverage_report” | Medium | Tool name in prompt | “structured readers (e.g. read_json)” |
| `chat-agent.service.ts` – COVERAGE_PATTERNS & routeQuery | High | Only coverage gets fast-path | Remove or make “metric report” config-driven |
| `chat-agent.service.ts` – coverage fast-path & suggestedActions | High | Coverage-only UX | Generalize or remove fast-path |
| `coverage-fast.graph.ts` | High | Entire graph for one question type | Remove or generalize to “report fast-path” |
| `graph-registry.service.ts` – coverage-fast registration | Medium | Registers coverage-only graph | Depends on coverage-fast fate |
| `tool-registry.service.ts` – read_coverage_report tool | Low | Tool exists | Keep; overfitting is in callers |
| `base-state.ts` – comment | Low | Comment mentions coverage | Cosmetic |

---

## 1. Finding Compactor (`graphs/utils/finding-compactor.ts`)

### 1.1 `extractKeyFacts` (lines 98–131)

**Issue**: The function is documented and implemented as if findings are usually “coverage metrics, counts, etc.” It only extracts:

- `parsed.total.{lines, statements, branches, functions}` (coverage-shaped)
- `parsed.coverage`, `parsed.passed`, `parsed.failed`, `parsed.total`, `parsed.count` (again coverage/test-shaped)

So any other JSON (config, API response, other reports) yields no extracted facts.

**Recommendation**:

- **Option A (generic)**: For parsed JSON, derive facts generically, e.g.:
  - Top-level numeric/scalar fields (recursively with a depth limit).
  - Or reuse existing `parseMetadata.topLevelKeys` and only add numeric/boolean/string summary by key.
- **Option B**: Rename to something like `extractKnownMetricFacts` and document that it only handles a few known shapes; add a separate generic extractor for “any JSON” and use it when the shape is unknown.

Avoid assuming “finding === coverage/metrics” in the core compactor.

---

## 2. Search Node (`graphs/nodes/search.node.ts`)

### 2.1 `read_coverage_report` as a special tool (classifier + extractor)

**Issues**:

- **classifyCoverageResult** (276–295): Only `read_coverage_report` gets its own classifier. `read_json` also has one; behaviorally both are “structured parse success/failure.”
- **extractCoverageReportFinding** (410–424) and the switch branch at 441–442: Coverage is the only tool besides `read_file` / `read_json` / `list_directory` / `grep` with a dedicated extractor.

So “coverage” is elevated to a special tool type in classification and finding extraction.

**Recommendation**:

- Treat `read_coverage_report` like `read_json`: one “structured reader” classifier that checks `parseSuccess` (and optionally format), and one generic “structured result” extractor that uses `parseMetadata` / `computedFacts` from the tool result. If the tool already returns a normalized shape (e.g. `parseSuccess`, `metrics`), the node can use that without a coverage-specific branch.

### 2.2 `suggestBetterTool` and `suggestToolForFile` (371–424)

**Issues**:

- Path patterns and suggestions are coverage-centric: `coverage.*\.json`, `lcov`, `.lcov`/`.info` → always suggest `read_coverage_report`.
- Prompt and tool routing then push the model toward “use read_coverage_report for coverage” instead of “use the right structured reader for this path/format.”

**Recommendation**:

- Make suggestions format-based and tool-registry–driven (e.g. “for this extension/pattern, these tools are available”) rather than hardcoding coverage. If you keep a coverage tool, register it as one optional handler for certain patterns, not the only special case.

### 2.3 `identifyFileTypesInFindings` (462–472)

**Issue**: Returns `{ jsonFiles, coverageFiles }` and treats “coverage” as a separate first-class category from “JSON.” That forces the rest of the pipeline (e.g. prompt building) to have coverage-specific branches.

**Recommendation**:

- Prefer a single list of “structured-data files” with optional tags (e.g. `{ path, suggestedTool? }`), or derive suggestions from tool registry by extension/pattern. Drop a dedicated `coverageFiles` list unless you have a generic “report types” abstraction.

### 2.4 Default search prompt: “Tool Suggestion: Coverage Files Found” (1109–1124)

**Issue**: When `coverageFiles.length > 0`, the prompt gets a dedicated section telling the model to use `read_coverage_report` for those files. JSON gets a similar but separate block. So coverage is again the only non-generic file type called out by name.

**Recommendation**:

- One “Tool suggestions” section: “For the following paths, prefer structured readers where available: …” with tool names (or categories) coming from config/registry, not hardcoded “coverage” vs “JSON.”

### 2.5 First- and subsequent-iteration rules (1156–1162, 1167–1191)

**Issue**: Both rule sets say “Use read_json for .json files, read_coverage_report for coverage files.” That encodes one specific question type (coverage) into the generic exploration rules.

**Recommendation**:

- Phrase generically: “Use structured readers (e.g. read_json) for known structured formats when appropriate.” If you keep a coverage tool, it can be one of those “structured readers” without being named in the core rules.

---

## 3. Analyze Node (`graphs/nodes/analyze.node.ts`)

### 3.1 Coverage-only patterns and early termination (97–118, 204–211)

**Issues**:

- `COVERAGE_PATTERNS` and `isCoverageQuestion` make “coverage” the only question type with its own detection.
- `hasCompleteCoverageMetrics` looks for `computedFacts.lines`, `computedFacts.statements`, or `"pct"` in content—all coverage-specific.
- Early termination runs only for “coverage question with complete metrics,” so other questions that already have strong computed facts do not get the same shortcut.

**Recommendation**:

- **Option A**: Remove coverage-specific logic. Use a single rule: “evidence level high and computed facts (or parsed data) clearly contain what’s needed to answer” → ready_to_answer. Let the LLM decide “do I have enough?” for all question types.
- **Option B**: If you want domain-specific fast paths, make them configurable (e.g. “question patterns” + “required fact keys” per domain) and add more domains later; don’t hardwire only coverage.

### 3.2 Default analyze prompt (line 347)

**Issue**: Decision meanings say “use read_json, read_coverage_report” for need_more_search. That again names coverage as a primary tool.

**Recommendation**:

- Use “use structured readers (e.g. read_json) where appropriate” and drop the explicit `read_coverage_report` mention unless it’s coming from a generic tool list.

---

## 4. Chat Agent Service (`chat-agent.service.ts`)

### 4.1 Routing and fast-path (27–37, 160–164, 268–275, 279–319)

**Issues**:

- `COVERAGE_PATTERNS` and `routeQuery` send only “coverage” questions to the fast-path; all other questions go to the standard graph.
- `chatWithCoverageFastPath` and the suggested actions (“Ask about specific file coverage”, “Request coverage trends”) make coverage the only first-class fast-path and the only one with custom follow-ups.

**Recommendation**:

- **Option A**: Remove the coverage fast-path and route everything through the standard exploration graph; the generic graph can still use `read_coverage_report` when the model chooses it.
- **Option B**: Replace “coverage fast-path” with a generic “report/metric fast-path” (e.g. config: directories, file patterns, parser), and register coverage as one instance of that. Then routing uses “matches a known report type” instead of “matches coverage regexes.”

### 4.2 System prompt (80–81)

**Issue**: “When asked about metrics (coverage, quality, etc.), find and read the actual report files” and “Common data locations: test-results/, coverage/” again single out coverage and test-results.

**Recommendation**:

- Keep the idea: “When asked about metrics or reports, look for relevant report/output directories and read the actual files.” Remove the explicit “coverage” and “test-results/, coverage/” or make them one example among others (e.g. “e.g. test-results, coverage, build/reports”).

---

## 5. Coverage Fast-Path Graph (`graphs/graphs/coverage-fast.graph.ts`)

**Issue**: The entire graph exists to answer one kind of question (“coverage”) via a fixed flow: discover coverage dirs → read coverage files → format coverage metrics. No other question type has a dedicated graph.

**Recommendation**:

- **Option A**: Remove it and rely on the standard exploration graph plus the `read_coverage_report` tool. Simplest and removes the most overfitting.
- **Option B**: Generalize to a “report fast-path” graph parameterized by: directory list, file patterns, and a “read report” tool (or adapter). Register “coverage” as one configuration of that graph. Then adding “quality report” or “build report” fast-paths doesn’t require new graphs, just new config.

---

## 6. Graph Registry (`graphs/graph-registry.service.ts`)

**Issue**: Registers the coverage-fast graph by default, so the only domain-specific fast-path in the product is coverage.

**Recommendation**: If the coverage-fast graph is removed or generalized (see §5), update registration accordingly (remove or register the generic “report” graph with coverage config).

---

## 7. Tool Registry (`tools/tool-registry.service.ts`)

**Observation**: The `read_coverage_report` tool and its parsers (e.g. coverage-summary, Istanbul, lcov) are appropriate domain tools. The overfitting is not here but in:

- Giving coverage a dedicated classifier/extractor in the search node,
- Suggesting it by name in prompts and rules,
- And building a whole graph and route for “coverage” only.

**Recommendation**: Keep the tool. Reduce or remove the special-casing of “coverage” in nodes, prompts, and routing (as above).

---

## 8. Base State (`graphs/types/base-state.ts`)

**Issue**: Comment on `ParseMetadata.format`: “json, yaml, coverage, etc.”—minor and only reinforces coverage as a built-in format.

**Recommendation**: Change to “json, yaml, or other structured format” if you want to avoid implying coverage is a core format.

---

## 9. Tests

Tests that use “What is the test coverage?” (or similar) as input are fine; the problem is production code that behaves as if that were the main or only use case. No change needed to tests except to add cases for other question types once the agent is generalized.

---

## Recommended Order of Changes

1. **High impact, low risk**: Generalize `extractKeyFacts` in finding-compactor to be format-agnostic (or clearly limited and named).
2. **High impact**: In search node, treat `read_coverage_report` like `read_json` (one “structured” classifier/extractor) and make tool suggestions and prompt sections generic or config-driven.
3. **High impact**: In analyze node, remove coverage-only patterns and early termination, or replace with a single “sufficient computed/parsed facts” rule (or configurable domains).
4. **High impact**: In chat-agent.service, remove coverage-only routing and fast-path, or replace with a generic “report fast-path” and register coverage as one config.
5. **Structural**: Remove or generalize `coverage-fast.graph.ts` and its registration.
6. **Cleanup**: Adjust system/analyze prompts and base-state comment so “coverage” is not the only named example.

After these changes, the agent should behave well for “test coverage” questions via the standard exploration graph and the existing `read_coverage_report` tool, without encoding that one prompt type into compactor, search, analyze, routing, and a dedicated graph.
