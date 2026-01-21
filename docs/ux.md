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

Examples:

- Feature view
- User journey
- Epic
- Release

Capabilities:

- Filter atoms
- Group atoms
- Annotate atoms

Explicit UX rule:
> Deleting a molecule must never delete atoms.

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
- **Implementation Checklist**: See [implementation-checklist-phase1.md](implementation-checklist-phase1.md) for Phase 1 UI tasks

---

*This document is living. Changes must respect the principles above or explicitly amend them.*
