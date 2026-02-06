# Agent Contracts

Non-negotiable definitions of "correct" for Pact's LangGraph agents. These contracts are acceptance criteria — they drive golden datasets, property tests, rubrics, and the evaluation harness.

---

## 1. Reconciliation Agent

### Goal

Reconcile repository reality (tests, code, coverage) against Pact's intent graph and emit actionable deltas. Given a codebase snapshot, produce a minimal set of atom recommendations, molecule groupings, and next actions that move the project closer to full intent coverage.

### Pipeline

```
structure -> discover -> context -> infer_atoms -> synthesize_molecules -> verify -> persist
```

### Contract Bullets

#### C-REC-01: Classification Correctness

Every test and code artifact must be classified into one of the defined categories:

- **Orphan test**: Test without `@atom` annotation (candidate for atom inference)
- **Linked test**: Test with valid `@atom` reference (already coupled)
- **Changed linked test**: Test with `@atom` that was modified in delta mode

Misclassification is a contract violation. A test with `@atom` must never flow to `infer_atoms` (INV-R001).

#### C-REC-02: Evidence Grounding

Every claim about repository state must cite evidence:

- Atom recommendations must reference: test file path, test name, line number, and the test code that supports the inference.
- Molecule recommendations must reference the atom `tempId`s they contain.
- No recommendation may reference a file, symbol, test name, or coverage line that does not exist in the repository snapshot.

**Critical failure**: Any hallucinated repository fact (evidence not in the input) is an automatic contract violation regardless of other quality.

#### C-REC-03: Deterministic Structure

Given the same repository snapshot and LLM responses, the pipeline must produce structurally equivalent output:

- Same set of orphan tests discovered (order may vary).
- Same routing decisions (full-scan vs delta, quality gate pass/fail).
- Same node traversal order.

Non-determinism from LLM content is expected; structural non-determinism from graph logic is a bug.

#### C-REC-04: Minimal, High-Leverage Actions

Recommendations must be minimal and actionable:

- Each inferred atom must describe a single behavioral intent (not a bundle).
- Each atom must have at least one observable outcome.
- Molecule groupings must contain 2+ atoms (a single-atom molecule is redundant).
- The total number of recommendations per run is bounded (configured via `maxTests`).

#### C-REC-05: Quality Gate Enforcement

The verify node must enforce quality thresholds:

- Atoms with `qualityScore < qualityThreshold` (default 80) must be flagged.
- When `requireReview` is true, the graph must interrupt for human review.
- Quality failures must include specific reasons (not just "low score").

#### C-REC-06: Delta Closure (INV-R002)

In delta mode, the pipeline must reach closure:

- Only tests in the delta (changed files) are processed.
- Tests with existing `@atom` annotations that changed generate warnings, not new atoms (INV-R001).
- The pipeline stops when no new unlinked tests remain.

#### C-REC-07: State Lifecycle (INV-R005)

State must be managed across phases:

- Transient data (raw context blobs) must be cleaned up after their consuming phase.
- No phase may depend on state from a non-adjacent phase without explicit carry-forward.
- Error state accumulates (does not overwrite).

#### C-REC-08: Graceful Degradation

When non-critical nodes fail:

- The pipeline must continue to persist (skip failed non-critical nodes).
- Critical node failures (structure, discover) halt the pipeline with a clear error.
- All errors are accumulated in `state.errors[]` and included in the final output.

---

## 2. Intent Interview Agent

### Goal

Convert messy human intent into Atoms + Validators + (optional) Molecule membership + Invariant references, with minimal semantic drift. The agent conducts a multi-turn conversation to clarify ambiguity before extraction.

### Pipeline

```
analyze_intent -> generate_questions -> [interrupt/resume] -> extract_atoms -> compose_molecule
```

### Contract Bullets

#### C-INT-01: Valid Atom Schema

Every extracted atom must conform to the `AtomCandidate` schema:

- `description`: Non-empty, behavioral (not implementation-specific).
- `category`: One of `functional`, `performance`, `security`, `ux`, `operational`.
- `observableOutcomes`: At least one falsifiable outcome.
- `confidence`: 0-100, reflecting extraction certainty.
- `sourceEvidence`: At least one conversation excerpt supporting the atom.

**Critical failure**: An atom without observable outcomes is vacuous and violates the schema contract.

#### C-INT-02: Testable Validators

Every observable outcome must be:

- **Falsifiable**: It must be possible to write a test that could fail.
- **Behavioral**: Describes what the system does, not how it's implemented.
- **Scoped**: Each outcome validates one aspect (not a compound condition).

Outcomes like "the system works correctly" or "users are happy" are contract violations.

#### C-INT-03: Ambiguity Discipline

The agent must explicitly surface ambiguity rather than silently assume:

- When the user's intent contains undefined terms, the agent must ask.
- When multiple interpretations are plausible, the agent must present options.
- The agent must not invent constraints the user didn't state.
- Questions must be categorized: `scope`, `behavior`, `constraint`, `acceptance`, `edge_case`.

**Metric**: Number of assumptions made without asking vs. number of clarifying questions asked.

#### C-INT-04: Traceable Rationale

Every extraction must be traceable:

- Each atom must cite which conversation turn(s) support it.
- Each question must include a `rationale` explaining why it matters.
- The agent must not produce atoms that have no conversational grounding.

#### C-INT-05: No Implementation Leakage

Unless the user explicitly requests implementation details:

- Atoms must describe behavior, not technology choices.
- "User can log in" is valid. "System uses JWT with RS256" is a leakage (unless the user specified JWT).
- Database schemas, API endpoints, and framework choices are implementation details.

#### C-INT-06: Conversation Bounds

The interview must be bounded:

- Maximum `maxRounds` question rounds (default 5) before auto-extracting.
- Each round should produce 3-7 questions (not 1, not 20).
- The agent must respect `userDone` signal and proceed to extraction.
- Total LLM calls must be bounded (tracked via `llmCallCount`).

#### C-INT-07: Molecule Coherence

When composing molecules from extracted atoms:

- Each molecule must contain 2+ atoms (single-atom molecules are redundant).
- Molecule descriptions must explain the grouping rationale.
- Atoms may appear in multiple molecules (reuse is expected).
- `lensType` must be one of the valid lens types.

#### C-INT-08: Invariant Alignment

When project invariants are provided:

- No extracted validator may contradict a declared invariant.
- The agent should reference relevant invariants when they apply.
- Invariant violations must be surfaced as explicit conflicts, not silently resolved.

---

## 3. Failure Taxonomy

When a run fails contract validation, tag the failure to direct remediation:

| Tag | Description | Fix Target |
|-----|-------------|------------|
| `prompt` | Agent didn't have the rule; prompt/policy needs updating | Prompt package or few-shot examples |
| `tooling` | Coverage parser, file mapping, or tool execution wrong | Tool implementation or data pipeline |
| `routing` | Wrong node chosen, incorrect graph traversal | Graph edges, conditional routing logic |
| `schema` | Invalid output structure (missing fields, wrong types) | Output parsing, validation, or schema definition |
| `model` | Agent knew the rule but ignored it (judgment failure) | Model selection, temperature, or fundamental limitation |

### Assignment Heuristic

- Output has wrong structure -> `schema`
- Output references nonexistent file/symbol -> `tooling` or `model`
- Wrong node was executed -> `routing`
- Output is valid but misses a contract rule -> `prompt` (rule not in instructions)
- Output is valid, rule was in prompt, but agent ignored it -> `model`

---

## 4. Cross-Agent Invariants

These apply to all agents:

| Invariant | Description |
|-----------|-------------|
| **INV-EVAL-01** | Every Run Artifact must include input hash, output, evidence references, and metrics. |
| **INV-EVAL-02** | No agent may produce output that references entities not in its input (no hallucination). |
| **INV-EVAL-03** | Error state accumulates; no agent silently swallows errors. |
| **INV-EVAL-04** | LLM call count and token usage must be tracked for every run. |
| **INV-EVAL-05** | NodeInterrupt must be re-thrown (never caught and swallowed). |
