# Implementation Checklist: Phase 13 — LangGraph Agent Testing

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 13 |
| **Focus** | Testing capabilities for key LangGraph agents (contracts, golden data, evaluation harness, rubrics) |
| **Status** | Not Started |
| **Prerequisites** | Phase 5 (Reconciliation Agent), Phase 11 (Interview Agent — optional; contracts can precede implementation) |
| **Related Docs** | [implementation-checklist-phase5.md](implementation-checklist-phase5.md), [implementation-checklist-phase11.md](implementation-checklist-phase11.md), [architecture/reconcilation-agent-architecture-proposal.md](architecture/reconcilation-agent-architecture-proposal.md), [agents.md](agents.md) |

---

## Overview

Phase 13 establishes a repeatable, contract-driven testing regime for Pact’s LangGraph agents. The goal is to separate **graph correctness** from **model judgment** so the team can iterate on prompts and nodes without vibes-based regressions.

**Guiding principle**: Each agent is treated as a product surface with (a) an explicit **contract**, (b) a **golden dataset**, and (c) a **repeatable evaluation loop**.

**In scope**:

1. **Agent contracts** — Written, non-negotiable definitions of “correct” for Intent Interview and Reconciliation.
2. **Shared evaluation harness** — Single runner for golden tests, property tests, adversarial tests, and cost/latency budgets.
3. **Golden datasets** — Versioned scenarios (Intent: 20–50; Reconciliation: 10–20 repo fixtures).
4. **Property-based tests** — Invariants that must always hold (schema, evidence citation, classification stability).
5. **Three-layer evaluation** — Deterministic (mock LLM) → LLM-in-the-loop (pinned model, snapshots) → Human calibration.
6. **Scoring rubrics** — Repeatable scores (e.g. 0–2 per dimension, /12 total) and critical-failure rules.
7. **Failure tagging** — Classify failures as prompt, tooling, routing, schema, or model.
8. **Prompt packages** — Versioned, node-local policies and few-shots for cheap refinement.
9. **Instrumentation** — Per-run metrics (tokens, tool calls, latency, citations) for quality and cost.

**Key agents** (from `src/modules/agents/`):

| Agent | Graph / Service | Purpose |
|-------|-----------------|---------|
| Reconciliation | `reconciliation.graph.ts` | Reconcile repo (tests/code/coverage) vs Pact intent graph; emit actionable deltas |
| Intent Interview | Phase 11 interview graph | Convert messy human intent → Atoms + Validators + optional Molecule + Invariant refs |
| Chat Exploration | `chat-exploration.graph.ts` | Codebase Q&A (ReAct); optional inclusion in Phase 13 scope |

Phase 13 prioritizes **Reconciliation** (already implemented) and **Intent Interview** (contract first; golden/property tests align with Phase 11 implementation). Chat Exploration can be added later using the same harness.

---

## 13.1 Agent Contracts (Non-Negotiable)

### Context

Before any evaluation, “correct” must be defined in Pact terms. Contracts become acceptance criteria and drive golden datasets, property tests, and rubrics.

### Tasks

- [ ] **13.1.1** Create agent contracts document
  - **File**: `docs/architecture/agent-contracts.md`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Single source of truth for both agents.
    - Each contract lists **goal** and **contract bullets** (acceptance criteria).
    - Referenced by evaluation harness and rubrics.

- [ ] **13.1.2** Define Intent Interview Agent contract
  - **File**: `docs/architecture/agent-contracts.md`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 13.1.1
  - **Details**:
    - **Goal**: Convert messy human intent into Atoms + Validators + (optional) Molecule membership + Invariant references, with minimal semantic drift.
    - **Contract bullets** (examples to formalize):
      - Produces valid Atom schema every time (structure + required fields).
      - Captures testable validators (not just prose).
      - Flags ambiguity explicitly (does not silently assume).
      - Produces traceable rationale: “why this validator exists,” “what invariant it references.”
      - Does not leak implementation detail unless asked (or unless contract allows).
    - Align with Phase 11 interview graph (analyze → clarify → extract → compose → confirm).

- [ ] **13.1.3** Define Reconciliation Agent contract
  - **File**: `docs/architecture/agent-contracts.md`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 13.1.1
  - **Details**:
    - **Goal**: Reconcile repo reality (tests, code, coverage) against Pact’s intent graph and emit actionable deltas.
    - **Contract bullets** (examples to formalize):
      - Classifies items correctly: ghost code, decoupled code, orphan atoms, undefined tests, etc. (align with `graphs/nodes/reconciliation/README.md`).
      - Produces deterministic or near-deterministic outputs given same inputs (where applicable).
      - Emits minimal, high-leverage next actions (not a long narrative).
      - Does not hallucinate repo facts: every claim is backed by citable evidence (file paths, symbols, coverage lines, test names).
    - Reference existing reconciliation state types and pipeline (structure → discover → context → infer_atoms → synthesize_molecules → verify → persist).

- [ ] **13.1.4** Encode contracts as acceptance test stubs
  - **File**: `test/agents/contracts/contract-acceptance.spec.ts` (or per-agent files)
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 13.1.2, 13.1.3
  - **Details**:
    - Describe blocks or test outlines that map 1:1 to contract bullets.
    - Initially can be placeholders (e.g. `it('produces valid Atom schema every time', () => { /* golden/property suite covers this */ });`).
    - Ensures contracts are executable and not forgotten.

---

## 13.2 Shared Evaluation Harness

### Context

A single CLI/test runner runs golden tests, property tests, adversarial tests, and cost/latency checks. Each agent run produces a structured **Run Artifact** so regressions are obvious.

### Tasks

- [ ] **13.2.1** Define Run Artifact schema
  - **File**: `src/modules/agents/evaluation/run-artifact.types.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Structured output for every agent run:
      - **inputs**: prompt / repo snapshot ID / intent bundle ID, options.
      - **outputs**: atoms, deltas, recommendations (agent-specific).
      - **intermediate**: LangGraph node transitions (node names, order).
      - **evidence**: file paths, test names, coverage references (for reconciliation).
      - **metrics**: tokens per node (or total), latency per node (or total), tool call counts.
    - Use TypeScript interfaces; optionally export JSON Schema for snapshot storage.
    - Support both Reconciliation and Intent Interview artifact shapes (discriminated union or variant field).

- [ ] **13.2.2** Create artifact capture utility
  - **File**: `src/modules/agents/evaluation/artifact-capture.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 13.2.1
  - **Details**:
    - Wraps or instruments graph invocation to record:
      - Input state (sanitized for PII/secrets).
      - Final and intermediate state snapshots (node transitions).
      - Evidence references extracted from state.
      - Metrics (integrate with LLM callback or existing instrumentation).
    - Produces `RunArtifact` for each run.
    - Used by both deterministic tests (mock LLM) and LLM-in-the-loop runs.

- [ ] **13.2.3** Create evaluation CLI entry point
  - **File**: `scripts/evaluate-agents.ts` (or `src/modules/agents/evaluation/cli.ts`)
  - **Priority**: High | **Effort**: L
  - **Dependencies**: 13.2.2
  - **Details**:
    - Single entry that can run:
      - **Golden suite**: fixed scenarios → expected outputs (with diff/snapshot).
      - **Property suite**: invariants that must hold on every run.
      - **Adversarial suite**: trap prompts, partial repo states, malformed inputs.
      - **Cost/latency suite**: token and wall-clock budgets per run or per node.
    - Flags: `--suite=golden|property|adversarial|cost`, `--agent=reconciliation|interview`, `--update-snapshots`, `--model=<pinned-model>`.
    - Output: summary (pass/fail counts), artifact path (e.g. `test-results/agents/`), optional JSON report.

- [ ] **13.2.4** Integrate harness with CI
  - **File**: `package.json`, `.github/workflows/` (if applicable)
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Add script: `npm run test:agents` or `npm run evaluate:agents` that runs Layer 1 (deterministic) by default.
    - Optional scheduled or manual job for Layer 2 (LLM-in-the-loop) with pinned model and snapshot comparison.
    - Document in [TESTING.md](../TESTING.md) and [test-results/README.md](../test-results/README.md).

---

## 13.3 Golden Datasets

### Context

Small, “brutal,” versioned datasets. Golden tests catch known cases; updates are intentional (e.g. snapshot update or scenario change).

### 13.3.1 Intent Interview Golden Set

- [ ] **13.3.1.1** Define scenario schema for Intent Interview
  - **File**: `test/fixtures/agents/intent-interview/scenario-schema.ts` or `.json`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Each scenario: `context` (domain, constraints, persona), `userMessages` (2–8 turns), `expectedAtoms` (minimal), `expectedValidators`, `expectedOpenQuestions` (if ambiguity remains), `expectedNonGoals` (what agent must not assume).
    - Version field (e.g. `scenarioVersion: "1.0"`) for compatibility.

- [ ] **13.3.1.2** Create 20–50 Intent Interview golden scenarios
  - **Directory**: `test/fixtures/agents/intent-interview/scenarios/`
  - **Priority**: High | **Effort**: L
  - **Dependencies**: 13.3.1.1, 13.1.2
  - **Details**:
    - Cover: vague request → must ask clarifying questions; conflicting constraints → surface conflict; user pushes implementation detail → redirect to intent; domain rules that map to project invariants.
    - Store as JSON or YAML per scenario; index file listing scenario IDs and tags.
    - Scoring in harness: structural (schema), validator quality, ambiguity handling.

- [ ] **13.3.1.3** Add Intent Interview golden runner
  - **File**: `src/modules/agents/evaluation/intent-interview-golden.runner.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 13.2.2, 13.2.3, 13.3.1.2
  - **Details**:
    - Load scenarios; run interview graph (or stub until Phase 11); produce Run Artifact; compare to expected (structural + key fields); optional snapshot diff for full output.
    - Support `--update-snapshots` to refresh expected outputs after intentional changes.

### 13.3.2 Reconciliation Golden Set

- [ ] **13.3.2.1** Define repo fixture schema for Reconciliation
  - **File**: `test/fixtures/agents/reconciliation/fixture-schema.ts` or README
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Fixture = minimal codebase (files), tests (with/without `@atom`), coverage artifact (or mock), Pact registry (atoms/molecules/invariants as JSON).
    - Expected: reconciliation report + next tasks (e.g. “create atom for orphan test X,” “link test Y to IA-001”).

- [ ] **13.3.2.2** Create 10–20 Reconciliation repo fixtures
  - **Directory**: `test/fixtures/agents/reconciliation/fixtures/`
  - **Priority**: High | **Effort**: L
  - **Dependencies**: 13.3.2.1, 13.1.3
  - **Details**:
    - Canonical states: perfect (every atom ↔ test ↔ code); ghost code; atom exists but no tests (decoupled); tests exist but no atom (undefined); atom mapped but zero coverage (orphan-ish); flaky/brittle tests if analyzer supports.
    - Each fixture: minimal files, test list, optional coverage JSON, expected classification and actions.
    - Version fixtures (e.g. `fixture-v1`) like product test data.

- [ ] **13.3.2.3** Add Reconciliation golden runner
  - **File**: `src/modules/agents/evaluation/reconciliation-golden.runner.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 13.2.2, 13.2.3, 13.3.2.2
  - **Details**:
    - Load fixture; run reconciliation graph against fixture root; capture Run Artifact; compare classifications and next actions to expected; optional snapshot of full report.
    - Support `--update-snapshots` for expected outputs.

---

## 13.4 Property-Based Tests

### Context

Golden tests cover known cases; property tests enforce “always true” Pact rules and prevent whole classes of failure.

### Tasks

- [ ] **13.4.1** Intent Interview property tests
  - **File**: `test/agents/intent-interview/properties.spec.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 13.2.1, 13.2.2
  - **Details**:
    - **Schema**: Output always conforms to Atom JSON schema (and validator schema if defined).
    - **Validators**: Every validator is either executable (or references an executable template) or explicitly marked “manual/semantic” with a reason.
    - **Invariants**: No validator contradicts a declared invariant when invariants are provided.
    - Use generated or hand-crafted diverse inputs; run through interview path (or stub); assert properties on Run Artifact.

- [ ] **13.4.2** Reconciliation property tests
  - **File**: `test/agents/reconciliation/properties.spec.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 13.2.1, 13.2.2
  - **Details**:
    - **Evidence**: Every claim about repo state cites evidence (test name + file path, code symbol + file path, coverage line ranges, etc.).
    - **Stability**: Classification stable under irrelevant noise (e.g. adding comments, renaming locals should not flip “ghost” → “coupled”).
    - **Bounded actions**: Next actions list bounded (e.g. max N tasks), each with a clear success condition.
    - **No hallucination**: No repo fact without evidence in artifact (enforce in assertion).
    - Run reconciliation on synthetic or fixture repos; assert on Run Artifact.

- [ ] **13.4.3** Wire property suites into evaluation CLI
  - **File**: `scripts/evaluate-agents.ts` (or harness entry)
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 13.2.3, 13.4.1, 13.4.2
  - **Details**:
    - `--suite=property` runs both Intent and Reconciliation property tests; report pass/fail and any counterexamples.

---

## 13.5 Three-Layer Evaluation

### Context

Decompose evaluation so the team can iterate without being blocked by model variability: deterministic first, then LLM-in-the-loop, then human calibration.

### Tasks

- [ ] **13.5.1** Layer 1 — Deterministic graph/unit tests (fast, no model)
  - **Scope**: Existing + extended unit tests in `src/modules/agents/graphs/`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - **State transitions**: Given fixed state in, expect state out (or next node); mock LLM and tools.
    - **Routing**: discoverRouter (full-scan vs delta), quality gate edges, should-continue edges.
    - **Tool contracts**: Tool invocation inputs/outputs and error paths.
    - **Schema validation**: All structured LLM outputs (e.g. infer-atoms, synthesize-molecules) validated via Zod (or existing schemas) with mock LLM returning valid/invalid payloads.
    - **Error recovery**: Node throws, interrupt propagation (e.g. `reconciliation.graph.spec.ts`).
    - Run in CI with zero real model calls; fast feedback.

- [ ] **13.5.2** Layer 2 — LLM-in-the-loop regression tests (medium)
  - **File**: `test/agents/llm-regression/` (or under `evaluation/`)
  - **Priority**: High | **Effort**: L
  - **Dependencies**: 13.2.2, 13.2.3, 13.3.*
  - **Details**:
    - Run golden datasets against a **pinned model + settings** (e.g. env `AGENT_EVAL_MODEL`, temperature 0).
    - Save outputs as snapshots (Run Artifact JSON or key fields); diff against baseline.
    - Only update snapshots intentionally (e.g. `--update-snapshots` or separate approval).
    - Optional: run on schedule or on release branch; fail on unexpected diff.

- [ ] **13.5.3** Layer 3 — Human review calibration (slow, essential)
  - **File**: `docs/architecture/agent-evaluation-rubrics.md` and process doc
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - For dimensions that are hard to auto-score (e.g. “is this a good validator?”): use rubrics (see 13.6).
    - Sample ~5–10 runs per week (or per release); label pass/weak/fail + reason.
    - Feed labels back into prompts, few-shot examples, and tool policies.
    - Document process: who labels, where labels are stored, how they drive updates.

---

## 13.6 Scoring Rubrics and Critical Failures

### Context

Rubrics give repeatable scores (e.g. 0–2 per dimension); critical failures (e.g. hallucinated repo fact) auto-fail regardless of score.

### Tasks

- [ ] **13.6.1** Document Intent Interview rubric
  - **File**: `docs/architecture/agent-evaluation-rubrics.md`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Dimensions (0–2 each): Atom clarity (falsifiable?), Validator testability, Edge-case coverage (negative/boundary prompts), Ambiguity discipline (asks when needed), Invariant alignment, Compression (minimal atoms vs atom spam). Total /12.
    - Trend over time; use in Layer 3 calibration.

- [ ] **13.6.2** Document Reconciliation rubric
  - **File**: `docs/architecture/agent-evaluation-rubrics.md`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Dimensions (0–2 each): Classification correctness, Evidence grounding, Actionability of next tasks, Minimality (no noise), Stability (small changes don’t thrash output), Safety (no destructive suggestions without caution). Total /12.
    - **Critical failure**: Any hallucinated repo claim (no evidence) = auto fail. Enforce in property tests and in review.

- [ ] **13.6.3** Implement rubric scoring in harness (optional)
  - **File**: `src/modules/agents/evaluation/rubric-scorer.ts`
  - **Priority**: Low | **Effort**: M
  - **Dependencies**: 13.6.1, 13.6.2
  - **Details**:
    - Given Run Artifact + (optional) human labels, compute dimension scores and total; output in report.
    - Enables tracking averages and critical-failure rate over time.

---

## 13.7 Failure Tagging and Feedback Loops

### Context

When a run fails, tag the failure so the team can fix the right thing (prompt vs tooling vs model).

### Tasks

- [ ] **13.7.1** Define failure taxonomy
  - **File**: `docs/architecture/agent-contracts.md` or `agent-evaluation-rubrics.md`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Tags: **Prompt/spec failure** (agent didn’t have the rule), **Tooling/evidence failure** (coverage parser, file mapping wrong), **Routing failure** (wrong node chosen), **Schema failure** (invalid output), **Model judgment failure** (knew rule but ignored).
    - Short guidance on how to assign (e.g. “no evidence in output → tooling or model”).

- [ ] **13.7.2** Add failure tagging to Run Artifact and reports
  - **File**: `src/modules/agents/evaluation/run-artifact.types.ts`, evaluation report format
  - **Priority**: Low | **Effort**: S
  - **Dependencies**: 13.2.1, 13.7.1
  - **Details**:
    - Optional field on artifact or report: `failureTag?: FailureTag` (and optional reason).
    - Enables filtering and analytics (e.g. “most failures are routing + missing evidence”).

---

## 13.8 Prompt Packages and Node-Local Few-Shots

### Context

Refinement should be cheap: small, versioned policy updates and node-local few-shots instead of one giant system prompt.

### Tasks

- [ ] **13.8.1** Create versioned prompt policy layout
  - **Directory**: `src/modules/agents/prompts/policies/` (or `docs/agents/policies/` if read at runtime)
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - **Intent Interview**: e.g. `intent_interview/policies.md`, `validator_templates/*.md`, `classification_rules/*.md` (if any).
    - **Reconciliation**: e.g. `reconciliation/policies.md`, classification rules.
    - Version in file name or frontmatter (e.g. `policies-v1.md`); document in agent README how nodes load them.

- [ ] **13.8.2** Node-local instructions and few-shots
  - **Scope**: `src/modules/agents/graphs/nodes/reconciliation/*.ts`, interview nodes (Phase 11)
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Prefer node-local instructions per LangGraph node (not one monolith).
    - Keep a small library of few-shot examples (e.g. for infer-atoms, extract-atoms) and reference from prompts.
    - When a golden test fails, update the smallest policy or few-shot that fixes it; document in changelog or commit.

- [ ] **13.8.3** Document prompt package process
  - **File**: `src/modules/agents/README.md` or `docs/architecture/agent-contracts.md`
  - **Priority**: Low | **Effort**: S
  - **Details**:
    - How to add/change a policy; how to add a few-shot; how to run golden tests after change and when to update snapshots.

---

## 13.9 Instrumentation and Metrics

### Context

Per-run metrics improve quality and cost; they also detect failure modes (endless questions, 40-item task lists, token spikes).

### Tasks

- [ ] **13.9.1** Define metrics schema and capture points
  - **File**: `src/modules/agents/evaluation/run-artifact.types.ts` (extend), instrumentation in graph nodes or wrapper
  - **Priority**: High | **Effort**: M
  - **Details**:
    - **Per run**: tokens per node (or total), tool call counts, time per node (or total), number of atoms produced, number of tasks produced (reconciliation), number of clarifying questions asked (interview), evidence citation count, “assumption count” (explicitly declared).
    - Capture via LLM callback (tokens), graph middleware or wrapper (timing, node names), and state inspection (counts).
    - Store in Run Artifact so cost/latency suite and dashboards can use it.

- [ ] **13.9.2** Implement token and timing capture
  - **Scope**: LLM service callback or LangGraph instrumentation, `artifact-capture.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 13.2.2, 13.9.1
  - **Details**:
    - Hook into existing LLM invocation path to record input/output token counts (and model name).
    - Record node entry/exit timestamps; compute per-node and total latency.
    - Write into Run Artifact; no PII in artifact.

- [ ] **13.9.3** Add cost/latency budget suite
  - **File**: `test/agents/cost-latency.budget.spec.ts` or under `evaluation/`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 13.2.3, 13.9.2
  - **Details**:
    - Thresholds: e.g. max tokens per run, max wall-clock per run (or per node for critical nodes).
    - Run golden or synthetic inputs; assert metrics in Run Artifact are within budget; fail CI if exceeded (or warn in report).

---

## Phase 13 Completion Criteria

| Criterion | Validation |
|-----------|------------|
| Agent contracts documented | Intent Interview and Reconciliation contracts in `docs/architecture/agent-contracts.md` |
| Run Artifact produced for both agents | Harness captures inputs, outputs, evidence, metrics for sample runs |
| Evaluation CLI runs all suites | `--suite=golden|property|adversarial|cost` (or equivalent) runs without error |
| Golden Intent scenarios (20–50) | Scenarios in `test/fixtures/agents/intent-interview/`; runner compares to expected or snapshot |
| Golden Reconciliation fixtures (10–20) | Fixtures in `test/fixtures/agents/reconciliation/fixtures/`; runner compares to expected |
| Property tests enforce schema and evidence | Intent + Reconciliation property specs pass; no hallucination in reconciliation |
| Layer 1 tests run in CI with no model | All deterministic graph/unit tests pass with mocked LLM |
| Layer 2 snapshot flow works | Pinned model run produces snapshot; diff or update-snapshots works |
| Rubrics documented | Intent and Reconciliation rubrics in `agent-evaluation-rubrics.md`; critical failure rule clear |
| Failure taxonomy documented | Tags (prompt/tooling/routing/schema/model) defined and used in reports or artifacts |
| Prompt policy layout exists | Versioned policies and node-local usage documented |
| Instrumentation in place | Tokens, timing, and key counts in Run Artifact; cost/latency suite runs |

---

## File Inventory

### New Files

| File | Task | Purpose |
|------|------|---------|
| `docs/architecture/agent-contracts.md` | 13.1.1–13.1.3, 13.7.1 | Contract and failure taxonomy |
| `docs/architecture/agent-evaluation-rubrics.md` | 13.6.1, 13.6.2 | Rubrics and critical failures |
| `src/modules/agents/evaluation/run-artifact.types.ts` | 13.2.1, 13.7.2, 13.9.1 | Artifact and metrics schema |
| `src/modules/agents/evaluation/artifact-capture.service.ts` | 13.2.2, 13.9.2 | Capture Run Artifact from runs |
| `scripts/evaluate-agents.ts` or `src/.../evaluation/cli.ts` | 13.2.3, 13.2.4, 13.4.3 | Evaluation CLI |
| `test/agents/contracts/contract-acceptance.spec.ts` | 13.1.4 | Contract acceptance stubs |
| `test/fixtures/agents/intent-interview/scenario-schema.ts` | 13.3.1.1 | Intent scenario schema |
| `test/fixtures/agents/intent-interview/scenarios/*` | 13.3.1.2 | Golden scenarios |
| `src/modules/agents/evaluation/intent-interview-golden.runner.ts` | 13.3.1.3 | Intent golden runner |
| `test/fixtures/agents/reconciliation/fixture-schema` / README | 13.3.2.1 | Fixture schema |
| `test/fixtures/agents/reconciliation/fixtures/*` | 13.3.2.2 | Repo fixtures |
| `src/modules/agents/evaluation/reconciliation-golden.runner.ts` | 13.3.2.3 | Reconciliation golden runner |
| `test/agents/intent-interview/properties.spec.ts` | 13.4.1 | Intent property tests |
| `test/agents/reconciliation/properties.spec.ts` | 13.4.2 | Reconciliation property tests |
| `test/agents/llm-regression/` (or under evaluation) | 13.5.2 | LLM-in-the-loop snapshots |
| `src/modules/agents/evaluation/rubric-scorer.ts` | 13.6.3 | Optional rubric scoring |
| `src/modules/agents/prompts/policies/` (layout) | 13.8.1 | Versioned prompt policies |
| `test/agents/cost-latency.budget.spec.ts` or equivalent | 13.9.3 | Cost/latency suite |

### Modified Files

| File | Task | Changes |
|------|------|---------|
| `package.json` | 13.2.4 | Add `test:agents` or `evaluate:agents` script |
| `TESTING.md` / `test-results/README.md` | 13.2.4 | Document agent evaluation and results location |
| `src/modules/agents/README.md` | 13.8.3 | Prompt package and evaluation process |
| Graph nodes / LLM path | 13.9.2 | Instrumentation hooks for tokens and timing |
| `src/modules/agents/agents.module.ts` | 13.2.2 (if service) | Register ArtifactCaptureService if needed |

---

## Dependencies and Ordering

- **13.1** (Contracts) should be done first; they drive 13.3, 13.4, 13.6.
- **13.2** (Harness + Artifact) is needed for 13.3, 13.4, 13.5, 13.9.
- **13.3** (Golden) and **13.4** (Property) can proceed in parallel after 13.1 and 13.2.
- **13.5** Layer 1 builds on existing unit tests; Layer 2 depends on 13.2 and 13.3; Layer 3 is process + 13.6.
- **13.8** (Prompt packages) can start once node structure is stable; **13.9** (Instrumentation) fits with 13.2.2 and 13.2.3.

---

*Phase 13 establishes testing capabilities for key LangGraph agents so the team can iterate on prompts and graph logic with contract-driven, repeatable evaluation and minimal vibes-based regressions.*
