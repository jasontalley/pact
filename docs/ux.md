# Pact UX -- Canonical Intent, Drift, and Local/Remote Truth

## 1. Purpose of This Document

This document defines the **canonical user experience (UX)** for Pact. It serves as the shared, authoritative reference for:

- Human users (developers, product owners, architects)
- Agent users (coding agents, audit agents, synthesis agents)
- Tooling integrations (CLI, IDE plugins, CI hooks, MCP servers)

The goal is not pixel-perfect UI design, but **interaction semantics, mental models, and invariant UX rules** that all Pact interfaces must honor.

This document is the adopted UX specification. Phases 14 through 17 implement it incrementally:

| Phase | UX Scope |
|-------|----------|
| Phase 14 | Test quality, coverage, epistemic clarity (current) |
| Phase 15 | Pact Main governance model |
| Phase 16 | Drift management |
| Phase 17 | Local/remote split |

---

## 2. Foundational Axioms

These axioms are non-negotiable. Every UX surface, API response, agent prompt, and dashboard widget must be consistent with them.

### 2.1 Atoms Are Commitments

An **Atom** is an irreducible behavioral commitment -- the atomic unit of committed intent. Atoms are not tasks, not stories, not tickets. They are **falsifiable claims about what the system must do**.

Characteristics:

- Observable and falsifiable (testable)
- Implementation-agnostic (describes behavior, not code)
- Individually replaceable without rewriting the universe
- **Immutable after commitment** (can only be superseded, never edited)
- Can be referenced by multiple molecules (reusable)

UX implications:

- Atom creation must feel closer to **signing a contract** than writing a note
- The UI must never allow silent mutation of a committed atom
- Atom status transitions must require explicit user acknowledgment
- Atom IDs are stable, permanent, and human-referenceable

### 2.2 Molecules Are Lenses

**Molecules** are human-friendly projections over atoms. They provide organizational context without asserting truth. The system IS the composition of atoms; molecules help humans understand how atoms relate.

Characteristics:

- Change freely without consequence to truth
- Can be created, destroyed, and recomposed at will
- Overlap arbitrarily (atoms can belong to many molecules)
- Support hierarchical nesting (parent/child, max depth: 10)
- Carry a `lens_type` that categorizes their purpose

| Lens Type | Purpose | Example |
|-----------|---------|---------|
| `user_story` | Single user behavior | "User can reset password" |
| `feature` | Cohesive capability | "Authentication system" |
| `journey` | Multi-step user flow | "Checkout process" |
| `epic` | Large initiative | "Mobile app launch" |
| `release` | Version milestone | "v2.0 release scope" |
| `capability` | System ability | "Real-time sync" |
| `change_set` | Governed promotion bundle | "Sprint 12 reconciliation" |
| `custom` | User-defined | Any grouping |

UX implications:

- Pact must never imply that a molecule is "realer" than an atom
- Deleting a molecule must never delete atoms
- Molecules are lenses, not containers -- atoms exist independently
- Users can view the same atoms through multiple lenses simultaneously

### 2.3 Tests Are the Only Code-Level Coupling

Tests are **the sole mechanism** by which code couples to intent. This is not a convention -- it is an architectural invariant.

The linkage chain:

```
Code --> Tests --> Atoms
```

There is no path from code to intent that bypasses tests. Pact does not read implementation source code to determine intent. It reads tests.

UX implications:

- Pact must visually privilege **test-atom linkage** over file structure or code location
- Tests without atoms = suspicious (orphan tests)
- Atoms without tests = unfulfilled commitments
- Code without tests = invisible to Pact (not untrusted -- simply outside Pact's epistemic domain)
- The `@atom` annotation in a test file is the canonical coupling declaration

### 2.4 Pact Is an External System of Record

Pact maintains its own data model, its own ref system, and its own truth. It is not a wrapper around Git, not a project manager, and not a test runner.

- Pact does not replace Jira, Linear, or GitHub Issues -- it **projects into them**
- Pact owns *intent truth*; other tools own *coordination*
- Pact's database is the source of truth for atoms, molecules, epistemic status, quality scores, and coupling metrics
- Git is a transport mechanism, not a governance layer

### 2.5 Drift Is Not Failure

Code changes that are not yet coupled to atoms are **drift** -- expected, visible, and recoverable. Drift is a natural consequence of development velocity. The UX must never treat drift as an error state.

UX implications:

- Drift is shown as a **status signal**, not a **warning**
- Uncoupled code generates drift debt that is tracked and time-bounded
- Exception lanes (hotfix, spike) provide legitimate paths for temporary decoupling
- The goal is **convergence over time**, not zero-drift at every commit

---

## 3. The Epistemic Stack

Pact's certainty model is the core UX signal. Every atom exists at exactly one level in the epistemic stack. The stack is ordered by evidence strength, not by workflow stage.

### 3.1 Epistemic Levels

| Level | Meaning | Evidence Required |
|-------|---------|-------------------|
| **Proven** | Intent is validated by passing tests | Test with `@atom` annotation passes |
| **Committed** | Intent is declared but not yet validated | Atom exists, no linked passing test |
| **Inferred** | Intent is suggested by analysis | Reconciliation recommendation, not yet accepted |
| **Unknown** | Intent has not been articulated | No atom, test exists without coupling |

### 3.2 Quality-Weighted Certainty

Not all proof is equal. An atom linked to a vacuous test and an atom linked to a thorough, well-structured test are both "proven" -- but their epistemic strength differs.

**Quality-weighted certainty** adjusts the binary proven/not-proven signal by the quality of the evidence:

```
For each proven atom:
  avgTestQuality  = mean(linked test quality scores) || 50 (default)
  coverageDepth   = coverage for test's source files  || 50 (default)
  atomCertainty   = (avgTestQuality * 0.7 + coverageDepth * 0.3) / 100

qualityWeightedCertainty = sum(atomCertainty) / totalKnownAtoms
```

UX implications:

- Dashboard shows both **raw certainty** (binary) and **quality-weighted certainty** (nuanced)
- Proven atoms are sub-segmented by confidence: high (quality >= 80), medium (50-79), low (< 50)
- When quality-weighted certainty is significantly lower than raw certainty, the system signals that proof quality needs attention
- Graceful degradation: without quality or coverage data, quality-weighted certainty defaults to match raw certainty

### 3.3 Coupling Health Is Orthogonal to Truth

Coupling health measures **how well** tests link to atoms, independent of **whether** they do. Two atoms can both be proven, but one might have strong coupling (explicit annotation, high-quality test, good coverage) while the other has weak coupling (inferred link, low-quality test, no coverage).

**Coupling strength** per atom:

```
strength = (testQuality * 0.5 + coverageDepth * 0.3 + annotationAccuracy * 0.2) / 100

annotationAccuracy:
  100 = explicit @atom annotation
   70 = accepted recommendation, confidence >= 80
   50 = accepted recommendation, confidence < 80
```

UX implications:

- Coupling health is displayed alongside epistemic status, never merged with it
- Color-coded strength: green (strong >= 0.8), yellow (moderate 0.5-0.79), red (weak < 0.5)
- Weak coupling is not an error -- it is a signal that the link could be improved
- Average coupling strength is a system-level health metric

---

## 4. Pact Main (Phase 15)

> **Note**: Pact Main governance is target architecture for Phase 15. This section establishes the UX vocabulary and mental model. Implementation details are in `docs/implementation-checklist-phase15.md`.

### 4.1 Pact Main Is Canonical Intent Truth

Pact Main is the authoritative surface of committed intent -- analogous to `main` in Git, but for intent rather than code. It is:

- The single source of truth for "what the system is supposed to do"
- Independent of any Git branch or deployment environment
- Updated only through governed change sets
- The default scope for all agent queries

### 4.2 Atom Lifecycle on Pact Main

```
draft --> proposed --> committed (on Main) --> superseded
```

| State | Meaning |
|-------|---------|
| `draft` | Work in progress, not visible to Main |
| `proposed` | In a change set molecule under review |
| `committed` | Promoted to Pact Main (canonical) |
| `superseded` | Replaced by a newer atom |

UX implications:

- Agents see only Pact Main by default (`?scope=main`)
- Local/draft atoms are advisory until promoted
- Change set review is the governance gate for Main promotion
- Reconciliation recommendations flow through change sets before reaching Main

### 4.3 Scope Filtering

All Pact surfaces support scope filtering:

| Scope | Shows | Default For |
|-------|-------|-------------|
| `main` | Only committed atoms on Pact Main | Agents, CI, dashboards |
| `all` | All atoms including drafts and proposals | Human users in editor |
| `local` | Local overlay (Phase 17) | IDE extensions |

---

## 5. Drift Management (Phase 16)

> **Note**: Drift management is target architecture for Phase 16. This section establishes the UX model. Implementation details are in `docs/implementation-checklist-phase16.md`.

### 5.1 Drift Debt

Drift debt accumulates when code changes without corresponding intent updates. Four types of drift:

| Drift Type | Meaning | Signal |
|------------|---------|--------|
| `orphan_test` | Test exists without atom coupling | Test needs `@atom` annotation |
| `commitment_backlog` | Atom on Main has no passing test | Commitment unfulfilled |
| `stale_coupling` | Test-atom link hasn't been verified recently | Evidence aging |
| `uncovered_code` | Implementation has no test coverage | Outside Pact's epistemic reach |

### 5.2 Exception Lanes

Not all development follows the ideal coupling workflow. Exception lanes provide legitimate paths for temporary decoupling:

| Lane | Use Case | Time-Bounded |
|------|----------|-------------|
| `normal` | Standard development | Policy-defined window |
| `hotfix-exception` | Production emergency | Short convergence deadline |
| `spike-exception` | Research/exploration | Longer convergence window |

UX implications:

- Exception lanes are visible, not hidden -- the system knows a hotfix is a hotfix
- Each exception carries a justification string and a convergence deadline
- Expired exceptions escalate to drift debt
- CI attestation distinguishes local runs from CI-attested canonical runs

### 5.3 Convergence, Not Perfection

The drift model targets **convergence over time**, not zero-drift at every commit. The dashboard shows:

- **Commitment Backlog**: Atoms on Main not yet proven
- **Drift Debt**: Uncoupled changes aging toward deadline
- **Epistemic Trend**: Is certainty improving or eroding over the last 7/30/90 days?

---

## 6. Local vs Canonical Truth (Phase 17)

> **Note**: The local/remote split is target architecture for Phase 17. This section establishes vocabulary. Implementation details are in `docs/implementation-checklist-phase17.md`.

### 6.1 Two Truth Layers

| Layer | Source | Authority |
|-------|--------|-----------|
| **Canonical** | Pact Main on remote server | Authoritative; updated via governed change sets |
| **Local** | Developer's machine (IDE, CLI) | Advisory; a cached view of Main + local overlay |

### 6.2 Local Overlay

A local Pact instance maintains:

- A cached snapshot of Pact Main (pulled from remote)
- Locally discovered test-atom links (not yet pushed)
- Local test execution results (local evidence)
- Draft atoms and proposed changes

UX implications:

- Local state is **never confused with canonical state**
- UI clearly labels data as "local" vs "canonical"
- Sync status is always visible (last pull time, pending pushes)
- Conflicts between local and canonical are surfaced, not silently resolved

### 6.3 Deployment Models

The same Pact server code supports three deployment models:

| Model | Description | Data Flow |
|-------|-------------|-----------|
| **Co-located** | Pact runs alongside the project (current) | Internal pipeline reads files |
| **Client-Server** | Local client sends content to remote Pact | API-based ingestion |
| **PactHub** | Multiple developers push to shared instance | Multi-instance sync |

UX is identical across models. The difference is only in how data arrives.

---

## 7. Primary User Mental Models

### 7.1 Human Users

Humans think in problems, scenarios, user stories, epics, and themes. Pact must:

- Allow humans to *enter* at these levels (molecules)
- But always converge toward atoms (truth)
- Show drift as a natural signal, not a failure state
- Make the epistemic stack legible without requiring deep understanding of the model

### 7.2 Agent Users

Agents think in deterministic artifacts, references, validation, and closure. Pact must:

- Be fully machine-addressable via REST API
- Prefer canonical JSON representations
- Provide deterministic, idempotent APIs
- Default to Pact Main scope for all queries
- Never require agents to understand molecules (lenses are for humans)

---

## 8. Canonical UX Surfaces

### 8.1 Dashboard (System View)

Primary questions answered:

- Is the system coherent? (epistemic certainty)
- How strong is the evidence? (quality-weighted certainty)
- What is uncoupled? (coupling health)
- What is the quality of our tests? (test quality grades)
- What is our code coverage? (coverage dimensions)
- Is certainty improving or eroding? (trend chart)

Dashboard layout:

```
Row 1: Epistemic Stack Card  |  Coupling Health Card
Row 2: Test Quality Card      |  Coverage Card
Row 3: Epistemic Certainty Trend Chart (multi-line)
Row 4: Dashboard Stats (atom counts, test counts, etc.)
Row 5: Recent Atoms (2 cols)  |  Quick Actions (1 col)
```

### 8.2 Atom View (Canonical)

The Atom View is the **center of gravity** of Pact.

Required elements:

- Atom ID (stable, immutable)
- Intent statement
- Epistemic status (proven / committed / inferred / unknown)
- Quality-weighted confidence (when proven)
- Linked tests with quality scores
- Coupling strength indicator
- Realization status
- Validators / observable outcomes

Prohibited:

- Editing atom intent without explicit versioning
- Silent mutation of any field

### 8.3 Molecule View (Projection)

Capabilities:

- Filter atoms by any lens type
- Group atoms hierarchically (molecules can have parent molecules)
- Annotate with tags and custom labels
- View same atoms through multiple lenses simultaneously
- Create change set molecules for governed promotion (Phase 15)

Explicit UX rules:

> Deleting a molecule must never delete atoms.
> Molecules are lenses, not containers -- atoms exist independently.

### 8.4 Test-Centric View

A first-class UX surface showing:

- Tests --> Atoms (which intent does this test prove?)
- Atoms --> Tests (what tests back this commitment?)
- Missing or weak couplings
- Test quality grades (A through F)
- Quality dimension breakdowns

Used by developers, CI systems, and agents performing audits.

### 8.5 Reconciliation View

The Reconciliation View surfaces **inferred intent** from existing codebases.

Primary questions answered:

- What intent exists in tests that is not captured as atoms?
- What quality level do inferred atoms meet?
- What should be accepted, rejected, or revised?

Key affordances:

- **Run history**: List of reconciliation runs with status
- **Recommendation queue**: Inferred atoms awaiting review
- **Quality indicators**: Multi-dimension scores for each recommendation
- **Source traceability**: Link from recommendation to originating test
- **Bulk actions**: Accept/reject multiple recommendations

UX requirement:

> Human review is **mandatory** for all inferred atoms. The system proposes; humans dispose.

### 8.6 Coverage View

Displays ingested coverage data:

- Four dimensions: statements, branches, functions, lines
- Per-file breakdown with uncovered line indicators
- Color-coded thresholds: green (>= 80%), yellow (>= 60%), red (< 60%)
- History over time with trend visualization
- Link to coverage upload for CI integration

---

## 9. Creation Flows

### 9.1 Pre-Intent (Exploration)

Status: ephemeral, non-binding.

UX characteristics:

- Free-form, conversational, disposable
- Ideas directory (`/ideas/`) in bootstrap; future: exploration mode in UI

Outcome: either discarded or promoted to an atom.

### 9.2 Atom Creation Flow

Steps (conceptual):

1. Clarify intent (what behavior is being committed?)
2. Declare constraints (boundaries, edge cases)
3. Define validators (observable outcomes)
4. Acknowledge immutability (explicit confirmation)

UX requirement:

> Pact must require **explicit user acknowledgment** when an atom is finalized.

### 9.3 Atom Realization Flow

Triggered by test creation and test-atom linkage.

UX signals:

- Pending (committed, no test)
- Partially realized (test exists, quality < threshold)
- Fully realized (test passes, quality >= threshold)

### 9.4 Reconciliation Flow (Brownfield)

For existing codebases with tests but no atoms, reconciliation **infers intent** from test behavior.

**Step 1: Configuration**

User provides:

- Root directory to analyze
- Mode: `full` (all tests) or `delta` (only changed since last run)
- Path filtering patterns (include/exclude with glob support)
- Quality threshold (default: 80)

UX requirement:

> Configuration must clearly communicate scope.

**Step 2: Analysis (Agent-Driven)**

System performs:

1. **Structure**: Discover test files
2. **Discover**: Parse test cases, store test source code
3. **Context**: Gather supporting code context
4. **Infer**: LLM generates atom candidates
5. **Synthesize**: Group atoms into molecules
6. **Verify**: Quality scoring with multi-dimension analysis

UX signals:

- Progress percentage per phase
- Current phase name
- Tests discovered / processed

**Step 3: Human Review (Mandatory)**

For each inferred atom:

- Description and category
- Quality score (multi-dimension)
- Source test file and line
- LLM reasoning (collapsible)
- Observable outcomes

Actions:

- **Accept**: Promote to real atom (draft in Phase 15+, direct commit pre-Phase 15)
- **Reject**: Discard with optional reason
- **Edit**: Modify before accepting (future)

UX requirements:

> Review cannot be skipped. Every inferred atom requires explicit human decision.
> Quality score below threshold should trigger warning before acceptance.

**Step 4: Completion**

Summary shows:

- Atoms accepted / rejected / pending
- Molecules created
- Epistemic certainty improvement
- Coverage and quality metrics
- Next recommended actions

### 9.5 Delta Reconciliation (Incremental)

After initial reconciliation, subsequent runs use **delta mode**:

- Only analyze tests modified since baseline run
- Skip tests with existing atom annotations
- Stop when no new unlinked tests found (INV-R002: Delta Closure)

UX implication:

> Delta mode should feel lightweight -- a quick sync, not a full audit.

---

## 10. Validation and Feedback

### 10.1 Continuous Feedback

Users should always know:

- What Pact believes (epistemic stack)
- Why it believes it (evidence: tests, quality scores, coverage)
- What evidence supports it (linked artifacts)
- How confident it is (quality-weighted certainty)

### 10.2 Failure Is Informative

UX rule:

> Pact never says only *no* -- it explains *why* and suggests *what next*.

Diagnostic signals include:

- Vacuous tests (always pass, weak assertions)
- Brittle tests (coupled to implementation, not behavior)
- Orphan tests (no atom linkage)
- Orphan atoms (no test linkage)
- Weak coupling (inferred link, low quality)
- Drift debt (uncoupled changes aging toward deadline)

---

## 11. Agent UX Alignment

Coding agents (Copilot, Claude, Cursor, etc.) interact with Pact as an **external system of record for intent**. This section defines the rules agents must follow.

### 11.1 Agent Scope Rules

| Rule | Description |
|------|-------------|
| **Query Main** | Agents query Pact Main for current intent truth (`?scope=main`) |
| **Respect Atoms** | Agents must not generate code that contradicts committed atoms |
| **Propose, Don't Commit** | Agent-generated atoms go through human review, never auto-commit |
| **Cite Evidence** | Agent actions should reference atom IDs when modifying intent-coupled code |
| **Honor Tests** | When modifying test files, agents must preserve `@atom` annotations |

### 11.2 Agent Interaction Patterns

**Before coding**: Agent queries Pact for relevant atoms in the affected domain.

**During coding**: Agent preserves test-atom linkages and generates tests that reference atoms.

**After coding**: Agent can trigger delta reconciliation to detect new unlinked tests.

**Never**: Agent auto-accepts reconciliation recommendations. Human review is mandatory.

### 11.3 MCP and CLI Integration

Agents interact via:

- **REST API**: Full CRUD for atoms, molecules, metrics, coverage, quality
- **MCP (Model Context Protocol)**: Structured context sharing with LLM agents
- **CLI**: Command-line interface for CI/CD and local development

UX principles still apply in non-visual contexts:

- Determinism (same input, same output)
- Explicit acknowledgment (no silent state changes)
- Clear failure semantics (structured error responses)
- Scope awareness (default to Main)

---

## 12. Global Invariants (UX-Relevant)

These invariants constrain all UX surfaces:

- An atom cannot be silently changed after commitment
- A test cannot claim intent implicitly (explicit `@atom` annotation required)
- Molecules cannot assert truth (they are views, not commitments)
- Pact is append-heavy, mutate-light
- Human review is required for all atom promotions
- Quality scores are transparent (dimensions visible, not just aggregate)
- Drift is a signal, not an error

---

## 13. Design Tensions (Deliberate)

These are acknowledged tensions in the UX model, not bugs:

- **Friction vs velocity**: Atom creation is deliberately high-friction. How much is too much?
- **Automation vs governance**: Should reconciliation ever auto-accept high-confidence (> 95%) atoms?
- **Local vs canonical**: How much local divergence is acceptable before sync is required?
- **Agent autonomy vs human control**: What actions should agents perform without human approval?
- **Completeness vs pragmatism**: Should Pact require 100% atom coverage, or accept partial coverage with drift tracking?
- **Depth vs breadth**: Should molecule hierarchy depth (max 10) be visualized or hidden?

These tensions will be resolved iteratively through usage and feedback.

---

## 14. Related Documents

- **UI Architecture**: See [ui.md](ui.md) for technical implementation (technology stack, state management, component patterns)
- **Database Schema**: See [schema.md](schema.md) for entity definitions including molecules, reconciliation, coverage, and quality tables
- **System Overview**: See [index.md](index.md) for agent architecture and current implementation status
- **Locality Architecture**: See [analysis-locality-architecture.md](analysis-locality-architecture.md) for the ingestion boundary pattern and deployment model analysis
- **Phase 15 Checklist**: See [implementation-checklist-phase15.md](implementation-checklist-phase15.md) for Pact Main governance implementation
- **Phase 16 Checklist**: See [implementation-checklist-phase16.md](implementation-checklist-phase16.md) for drift management implementation
- **Phase 17 Checklist**: See [implementation-checklist-phase17.md](implementation-checklist-phase17.md) for local/remote split implementation

---

*This document is the canonical UX specification. Changes must respect the axioms in Section 2 or explicitly amend them.*
