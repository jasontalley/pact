# Pact – Canonical UX Specification

## 1. Purpose of This Document

This document defines the **canonical user experience (UX)** for Pact. It serves as the shared, authoritative reference for:

- Human users (developers, product owners, architects)
- Agent users (coding agents, audit agents, synthesis agents)
- Tooling integrations (CLI, IDE plugins, CI hooks, MCP servers)

The goal is not pixel-perfect UI design, but **interaction semantics, mental models, and invariant UX rules** that all Pact interfaces must honor.

This document is intentionally *iterative* and *collaborative*.

---

## 2. Core UX Principles (Non‑Negotiable)

### 2.1 Atoms Are Commitments

- An **Atom** represents an immutable commitment of intent.
- Users must experience atoms as:
  - Deliberate
  - Explicit
  - Hard to create accidentally
  - Harder to change retroactively

UX implication:
> Pact should make atom creation feel closer to **signing a contract** than writing a note.

---

### 2.2 Molecules Are Lenses

- **Molecules** are human-friendly projections over atoms.
- They may:
  - Change freely
  - Be created or destroyed without risk
  - Overlap arbitrarily

UX implication:
> Pact must never imply that a molecule is “realer” than an atom.

---

### 2.3 Tests Are the Coupling Mechanism

- Atoms are *realized* only through tests.
- UX must reinforce:
  - Tests without atoms = suspicious
  - Atoms without tests = unfulfilled
  - Code without tests = untrusted

UX implication:
> Pact should visually privilege **test ↔ atom linkage** over file structure or code location.

---

### 2.4 Pact Is an Authority, Not a Project Manager

- Pact does **not** replace:
  - Jira
  - Linear
  - GitHub Issues
- It **projects into them**.

UX implication:
> Pact owns *truth*, other tools own *coordination*.

---

## 3. Primary User Mental Models

### 3.1 Human Users

Humans think in:

- Problems
- Scenarios
- User stories
- Epics
- Themes

Pact must:

- Allow humans to *enter* at these levels
- But always converge toward atoms

---

### 3.2 Agent Users

Agents think in:

- Deterministic artifacts
- References
- Validation
- Closure

Pact must:

- Be fully machine-addressable
- Prefer canonical JSON representations
- Provide deterministic APIs

---

## 4. Canonical UX Surfaces

### 4.1 Pact Home / System View

Primary questions answered:

- Is the system coherent?
- What is incomplete?
- What is unvalidated?

Key affordances:

- Atom inventory
- Test coverage over atoms
- Violations of global invariants

---

### 4.2 Atom View (Canonical)

The Atom View is the **center of gravity** of Pact.

Required elements:

- Atom ID (stable, immutable)
- Intent statement
- Validators
- Linked tests
- Realization status

Prohibited:

- Editing atom intent without explicit versioning
- Silent mutation

---

### 4.3 Molecule View (Projection)

Molecules provide **lens types** for viewing atoms through different perspectives:

| Lens Type | Purpose | Example |
|-----------|---------|---------|
| `user_story` | Single user behavior | "User can reset password" |
| `feature` | Cohesive capability | "Authentication system" |
| `journey` | Multi-step user flow | "Checkout process" |
| `epic` | Large initiative | "Mobile app launch" |
| `release` | Version milestone | "v2.0 release scope" |
| `capability` | System ability | "Real-time sync" |
| `custom` | User-defined | Any grouping |

Capabilities:

- Filter atoms by any lens
- Group atoms hierarchically (molecules can have parent molecules)
- Annotate with tags and custom labels
- View same atoms through multiple lenses simultaneously

Explicit UX rules:
> Deleting a molecule must never delete atoms.
> Molecules are lenses, not containers — atoms exist independently.

---

### 4.4 Test-Centric View

A first-class UX surface showing:

- Tests → Atoms
- Atoms → Tests
- Missing or weak couplings

Used by:

- Developers
- CI systems
- Agents performing audits

---

### 4.5 Reconciliation View

The Reconciliation View surfaces **inferred intent** from existing codebases.

Primary questions answered:

- What intent exists in tests that isn't captured as atoms?
- What quality level do inferred atoms meet?
- What should be accepted, rejected, or revised?

Key affordances:

- **Run history**: List of reconciliation runs with status
- **Recommendation queue**: Inferred atoms awaiting review
- **Quality indicators**: 5-dimension scores for each recommendation
- **Source traceability**: Link from recommendation to originating test
- **Bulk actions**: Accept/reject multiple recommendations

UX requirement:
> Human review is **mandatory** for all inferred atoms. The system proposes; humans dispose.

---

## 5. Creation Flows

### 5.1 Pre‑Intent (Exploration)

Status:

- Ephemeral
- Non-binding

UX characteristics:

- Free-form
- Conversational
- Disposable

Outcome:

- Either discarded
- Or promoted to an atom

---

### 5.2 Atom Creation Flow

Steps (conceptual):

1. Clarify intent
2. Declare constraints
3. Define validators
4. Acknowledge immutability

UX requirement:
> Pact must require **explicit user acknowledgement** when an atom is finalized.

---

### 5.3 Atom Realization Flow

Triggered by:

- Test creation
- Test linkage

UX signals:

- Pending
- Partially realized
- Fully realized

---

### 5.4 Reconciliation Flow (Brownfield)

For existing codebases with tests but no atoms, reconciliation **infers intent** from test behavior.

**Step 1: Configuration**

User provides:

- Root directory to analyze
- Mode: `full` (all tests) or `delta` (only changed since last run)
- Path exclusion patterns (e.g., `**/node_modules/**`)
- Quality threshold (default: 80)

UX requirement:
> Configuration must clearly communicate scope and expected duration.

**Step 2: Analysis (Agent-Driven)**

System performs:

1. **Structure**: Discover test files
2. **Discover**: Parse test cases
3. **Context**: Gather supporting code
4. **Infer**: LLM generates atom candidates
5. **Synthesize**: Group atoms into molecules
6. **Verify**: Quality scoring

UX signals:

- Progress percentage per phase
- Current phase name
- Tests discovered / processed
- Estimated remaining time (optional)

**Step 3: Human Review (Mandatory)**

For each inferred atom:

- Description and category
- Quality score (5 dimensions)
- Source test file and line
- LLM reasoning (collapsible)
- Observable outcomes

Actions:

- **Accept**: Promote to real atom
- **Reject**: Discard with optional reason
- **Edit**: Modify before accepting (future)

UX requirements:
> Review cannot be skipped. Every inferred atom requires explicit human decision.
> Quality score < 80 should trigger warning before acceptance.

**Step 4: Completion**

Summary shows:

- Atoms accepted / rejected / pending
- Molecules created
- Coverage improvement
- Next recommended actions

---

### 5.5 Delta Reconciliation (Incremental)

After initial reconciliation, subsequent runs use **delta mode**:

- Only analyze tests modified since baseline run
- Skip tests with existing atom annotations
- Stop when no new unlinked tests found (INV-R002: Delta Closure)

UX implication:
> Delta mode should feel lightweight — a quick sync, not a full audit.

---

## 6. Validation & Feedback

### 6.1 Continuous Feedback

Users should always know:

- What Pact believes
- Why it believes it
- What evidence supports it

---

### 6.2 Failure Is Informative

UX rule:
> Pact never says only *no* — it explains *why*.

Failures include:

- Vacuous tests
- Brittle tests
- Orphaned code
- Orphaned atoms

---

## 7. Agent UX (Non-Visual)

Agents interact via:

- CLI
- MCP
- CI hooks

UX principles still apply:

- Determinism
- Explicit acknowledgment
- Clear failure semantics

---

## 8. Global Invariants (UX-Relevant)

- An atom cannot be silently changed
- A test cannot claim intent implicitly
- Molecules cannot assert truth
- Pact is append‑heavy, mutate‑light

---

## 9. Open Questions (Deliberate)

- How visible should atom versioning be to humans?
- Should atom promotion ever be automated?
- How much friction is *too much* friction?
- Should reconciliation allow "auto-accept" for high-confidence (>95%) atoms?
- How should molecule hierarchy depth be visualized (max depth: 10)?
- When should delta reconciliation run automatically (CI hook vs manual trigger)?

These are **design tensions**, not bugs.

---

## 10. Next Iteration Targets

- Concrete wireframes
- CLI interaction spec
- MCP schema alignment
- CI failure UX examples

---

## 11. Related Documents

- **UI Architecture**: See [ui.md](ui.md) for technical implementation decisions (technology stack, state management, component patterns)
- **Schema Documentation**: See [schema.md](schema.md) for database tables including molecules and reconciliation entities
- **System Overview**: See [index.md](index.md) for agent architecture and current implementation status
- **Implementation Checklist**: See [implementation-checklist-phase1.md](implementation-checklist-phase1.md) for Phase 1 UI tasks

---

*This document is living. Changes must respect the principles above or explicitly amend them.*
