# Analysis: Pact as Git for Intent

## Document Metadata

| Field | Value |
|-------|-------|
| **Analysis Date** | 2026-02-02 |
| **Status** | Living Document |
| **Scope** | Conceptual framework analysis |
| **Related Docs** | [ux.md](ux.md), [index.md](index.md), [schema.md](schema.md) |

---

## 0. Pact as an Epistemic System

Before exploring the Git analogy, we must establish what Pact fundamentally *is*.

**Pact is not a workflow tool.** It is an **epistemic system** — a system for knowing:

- **What has been committed** (atoms with explicit human acknowledgment)
- **With what confidence** (quality scores, evidence artifacts)
- **What remains assumed** (tests without atoms, code without tests)
- **Where uncertainty lives** (orphan tests, semantic overlaps, low-confidence inferences)

Traditional PM tools (Jira, Linear, ProductBoard) track *what people said they would do*. Pact tracks *what has been behaviorally committed and proven*.

### The Epistemic Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                    What Pact Knows                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PROVEN (Evidence Artifacts)                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ "Test X passed, proving Atom Y is realized"                │ │
│  │ Confidence: 100% (empirical)                               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  COMMITTED (Atoms)                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ "Human explicitly committed to behavioral intent Z"        │ │
│  │ Confidence: High (human-authorized, quality-gated)         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  INFERRED (Reconciliation)                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ "Test suggests intent W, pending human review"             │ │
│  │ Confidence: Variable (LLM inference, requires validation)  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  UNKNOWN (Gaps)                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ "Code exists without tests; tests exist without atoms"     │ │
│  │ Confidence: 0% (not yet examined)                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Matters

Most software organizations operate with **false certainty**. They have:
- Requirements docs that may or may not reflect reality
- Tests that may or may not encode actual intent
- Code that may or may not match what stakeholders expected

Pact makes **uncertainty explicit**. It doesn't hide gaps — it surfaces them. A system with 50% atom coverage isn't "failing" — it's *accurately reporting* that 50% of intent is uncommitted.

This is the philosophical foundation. The Git analogy that follows is a *mechanism* for achieving epistemic clarity, not the goal itself.

---

## 1. Executive Summary

The "Git for Intent" analogy provides a powerful mental model for understanding Pact's *mechanisms*. Like Git manages code through commits, branches, and merges, Pact manages intent through atoms, molecules, and reconciliation.

However, **intent is not code**. The semantic properties of behavioral commitments differ fundamentally from textual diffs. This analysis explores where the analogy strengthens understanding, where it breaks down, and what new primitives Pact needs for the unique challenges of intent management.

### The Core Thesis

> **Pact is the authoritative semantic layer for software intent.**
>
> Other tools (Jira, Linear, GitHub Issues) are *projections* of Pact's truth. If Pact and Jira disagree, Jira is wrong.

This is not arrogance — it's architectural clarity. Pact exists precisely because no other system provides:
- Immutable behavioral commitments
- Test-intent coupling as proof
- Quality gates before commitment
- Evidence of realization

### Key Design Decisions

Based on analysis and stakeholder input:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Atom forking | **Single successor only** | Linear history avoids complex merge scenarios |
| Canonical truth | **All committed atoms** | No "main branch" - molecules are purely lenses |
| PR equivalent | **Change Set Molecules** | Batch related atoms for grouped review/commit |
| PM tool relationship | **Pact is authority** | PM tools project from Pact, not vice versa |

---

## 2. The Git-Intent Mapping

### 2.1 Strong Analogies

| Git Concept | Pact Equivalent | Strength | Notes |
|-------------|-----------------|----------|-------|
| **Commit** | Atom commitment | **Strong** | Both are immutable snapshots |
| **Working directory** | `/ideas/` directory | **Strong** | Mutable exploration space |
| **Staging area** | Draft atoms (pre-commit) | **Strong** | Review before commitment |
| **History/log** | `supersededBy` chain | **Strong** | Traceable lineage |
| **Content hash** | Atom ID (`IA-XXX`) | **Moderate** | Identity, not content-based |
| **Tags** | Atom status | **Moderate** | Different purpose |
| **`.gitignore`** | Path exclusion patterns | **Strong** | Reconciliation filters |

### 2.2 Weak or Broken Analogies

| Git Concept | Attempted Mapping | Problem |
|-------------|-------------------|---------|
| **Branches** | Molecules | Molecules are views, not divergence |
| **Merge** | (None) | Intent cannot be auto-merged |
| **Rebase** | Supersession | Creates new atom, doesn't rewrite history |
| **Conflict** | (None) | Semantic, not textual |
| **Remote** | (None) | No distributed model yet |
| **Fork** | (None) | Single successor enforced |

### 2.3 Why the Analogy Breaks Down

**Molecules Are Not Branches**

In Git, branches represent divergent development paths that can be merged. In Pact, molecules are "lenses" - descriptive groupings that help humans understand atoms.

```
Git Branch:
  main ────┬──── feature-A ────┐
           │                    │
           └──── feature-B ────┴── merge

Pact Molecule:
  Molecule "Checkout"     →  [IA-001, IA-002, IA-003]
  Molecule "Payment"      →  [IA-002, IA-003, IA-004]  ← Overlapping, not branching!
  Molecule "User Journey" →  [IA-001, IA-002, IA-003, IA-004]
```

A molecule can contain atoms A, B, C. Another molecule can contain atoms B, C, D. This is **reuse**, not **branching**. The atoms themselves do not "belong" to molecules the way commits belong to branches.

> Molecules are lenses, not containers — atoms exist independently.
> — [ux.md](ux.md), Section 4.3

**Intent Cannot Be Diffed**

Git merge works because code is text with clear diff semantics. Intent is behavioral, not textual:

```
Git Diff (works):
  - User can log in
  + User can log in with email

Intent "Diff" (doesn't work):
  Atom A1: "User can log in with email"
  Atom A2: "User can log in with SSO only"

  What is the "merge"? Neither subsumes the other.
  This is a product decision, not a diff operation.
```

**Conflict Is Semantic, Not Textual**

Git conflicts occur when the same lines are modified differently. Pact "conflicts" occur at a higher semantic level:

- Two atoms claiming the same behavioral territory
- Two tests linking to different atoms for the same behavior
- Two teams defining conflicting intent for shared functionality

### 2.4 Atoms as Files: Identity and Versioning

A deeper mapping emerges when we consider that **atoms are like files, not commits**.

In Git:
- **File path** = identity (persists across versions)
- **Commit** = version snapshot of file state
- **`git log --follow path`** = version history of that file

In Pact (refined model):
- **Intent Identity** = conceptual identity (the "what" being specified)
- **Atom** = version snapshot of that intent
- **Supersession chain** = version history of that intent

```
Git File Evolution:
  auth.ts @ commit abc123  →  auth.ts @ commit def456  →  auth.ts @ commit ghi789
  (same file identity, different content)

Pact Intent Evolution:
  IA-001 "User logs in"  →  IA-007 "User logs in with email"  →  IA-015 "User logs in with email or SSO"
  (same intent identity, refined specification)
```

**Implications of This Model**:

1. **Intent Identity as First-Class Concept**: Atoms could have an `intentIdentity` field linking versions of the same conceptual intent, separate from the `supersededBy` chain.

2. **Semantic Diffing**: While atoms can't be textually diffed, they can be **semantically diffed**:
   - Description changes (scope expansion, constraint addition)
   - Observable outcome changes (new behaviors, modified thresholds)
   - Category changes (functional → performance)
   - Quality score changes across versions

3. **Intent History Queries**: "Show me all versions of the 'user authentication' intent" becomes possible with explicit identity tracking.

4. **Rename Tracking**: Like `git log --follow`, Pact could track when intent is renamed/reframed while maintaining conceptual continuity.

**Semantic Diff Example**:

```
IA-001 → IA-007 Semantic Diff:
┌────────────────────────────────────────────────────────────────┐
│ Description                                                     │
│   - "User can log in"                                          │
│   + "User can log in with email and password"                  │
│   [SCOPE: expanded - added authentication method constraint]   │
│                                                                 │
│ Observable Outcomes                                             │
│   + "Login form accepts email format"                          │
│   + "Password must meet complexity requirements"               │
│   [BEHAVIORS: +2 new observable outcomes]                      │
│                                                                 │
│ Quality Score                                                   │
│   75 → 92 [IMPROVED: +17 points]                               │
└────────────────────────────────────────────────────────────────┘
```

### 2.5 Invariants as Enforcement Layer

Git has two enforcement mechanisms that don't store content but constrain what content can exist:
- **Hooks**: Code that runs at lifecycle points (pre-commit, pre-push)
- **Repository Rules**: Declarative constraints (branch protection, required reviews)

Pact's global invariants map directly to this enforcement layer:

| Git Mechanism | Pact Invariant | Enforcement Point |
|---------------|----------------|-------------------|
| Pre-commit hook | INV-003 (Quality Gate) | Before atom commitment |
| Pre-commit hook | INV-001 (Commitment Required) | Realization attempt |
| Pre-push hook | INV-002 (Test-Atom Coupling) | CI/test execution |
| Branch protection | INV-004 (Immutability) | Any mutation attempt |
| Required reviews | INV-006 (Human Authorization) | Commitment ceremony |
| Signed commits | INV-007 (Evidence Immutability) | Evidence generation |
| CODEOWNERS | (Future) Molecule ownership | Cross-team changes |
| Status checks | INV-R003 (Reconciliation Quality) | Recommendation acceptance |

**Enforcement Architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Pact Enforcement Layer                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Lifecycle Hooks (like Git hooks)                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ pre-commit:  INV-003 quality gate (score >= 80)            │ │
│  │ pre-commit:  INV-001 explicit acknowledgment required      │ │
│  │ pre-realize: INV-002 test must reference atom              │ │
│  │ pre-accept:  INV-R003 reconciliation quality threshold     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Repository Rules (like branch protection)                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ INV-004: Committed atoms cannot be modified                │ │
│  │ INV-006: Agents cannot commit without human approval       │ │
│  │ INV-007: Evidence artifacts are append-only                │ │
│  │ INV-008: Test results cannot be retroactively altered      │ │
│  │ INV-009: Clarifications allowed, but logged                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Reconciliation Rules (domain-specific)                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ INV-R001: No atoms from already-linked tests               │ │
│  │ INV-R002: Delta closure stops when no new unlinked tests   │ │
│  │ INV-R004: Molecules are lenses, never authoritative        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Insight**: Invariants are not content - they are the **rules of the game**. Just as Git hooks don't appear in your repository's history, Pact invariants don't appear as atoms. They exist at a meta-level, governing what atoms (and their relationships) can exist.

### 2.6 Reconciliation: The Compiler for Intent

The Git analogy covers atoms (commits), molecules (views), and invariants (hooks/rules). But it undersells **reconciliation** — the mechanism that makes Pact useful in the real world.

**Reconciliation is not a feature. It is the compiler for intent.**

In most codebases:
- Tests exist without atoms (orphan tests)
- Code exists without tests (orphan code)
- Requirements exist in docs nobody reads (orphan intent)

Reconciliation is how Pact **learns** from existing systems. It is the primary mechanism by which Pact becomes useful in brownfield environments — which is *most* real systems.

**The Reconciliation Loop**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Reconciliation as Compiler                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Source Code (tests)                                            │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │   PARSE      │  Discover test files, extract test cases      │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │   INFER      │  LLM generates atom candidates from tests     │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │   VALIDATE   │  Quality scoring, conflict detection          │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │   REVIEW     │  Human confirms/rejects inferences            │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  Committed Atoms (knowledge)                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why "Compiler"?**

A compiler transforms source code into executable form while:
- Detecting errors (type mismatches, syntax errors)
- Optimizing output (dead code elimination)
- Producing artifacts (binaries)

Reconciliation transforms tests into committed intent while:
- Detecting gaps (orphan tests, missing atoms)
- Scoring quality (confidence levels)
- Producing artifacts (atoms, molecules, evidence)

**Reconciliation as Continuous Process**:

Unlike a one-time migration, reconciliation is *ongoing*:
- **Full scan**: Initial analysis of entire codebase
- **Delta mode**: Incremental analysis of changed tests
- **CI integration**: Automatic detection of new orphan tests

The Git analogy would frame this as "initial import" followed by "ongoing commits." But that undersells it. Reconciliation is how Pact **discovers what the system already believes** — it's archaeology of intent, not just bookkeeping.

**Epistemic Contribution**:

Reconciliation directly addresses the epistemic stack from Section 0:
- Moves tests from "UNKNOWN" to "INFERRED"
- Human review moves inferences from "INFERRED" to "COMMITTED"
- Test execution moves atoms from "COMMITTED" to "PROVEN"

Without reconciliation, Pact would only work for greenfield projects. With reconciliation, Pact can absorb existing intent from any codebase.

---

## 3. Current Implementation Alignment

### 3.1 What Already Aligns with Git Principles

**Immutability (INV-004)**

```typescript
// src/modules/atoms/atom.entity.ts
@Column({ length: 20, default: 'draft' })
status: string; // draft → committed → superseded (one-way transitions)

@Column({ type: 'uuid', nullable: true })
supersededBy: string | null; // Like Git parent reference
```

**Explicit Commitment (INV-001)**

```typescript
// src/modules/atoms/atoms.service.ts
async commit(id: string): Promise<Atom> {
  if (qualityScore < 80) {
    throw new BadRequestException('Cannot commit low-quality atom');
  }
  atom.status = 'committed';
  atom.committedAt = new Date();
}
```

**Traceability (INV-005)**

Every atom has a creation trail: `createdAt`, `createdBy`, `parentIntent`, `sourceTests`. Like Git's `git log --follow`.

**Supersession Chain (History)**

```
IA-001 (committed)
    └── supersededBy: IA-007
        IA-007 (committed)
            └── supersededBy: IA-015
                IA-015 (committed)
```

This creates a linked list of intent evolution, analogous to Git's commit parent chain.

### 3.2 Gaps in Current Implementation

| Gap | Description | Priority |
|-----|-------------|----------|
| **Intent Identity** | No concept of "same intent, different version" beyond supersession chain | High |
| **Semantic Diffing** | No way to compare atom versions meaningfully | Medium |
| **Conflict detection** | No mechanism to detect when atoms overlap semantically | High |
| **Same-test conflict** | No constraint preventing multiple atoms claiming one test | High |
| **Change Set Molecules** | No lens type for batch review/commit | Medium |
| **Cross-team visibility** | No ownership boundaries on molecules | Medium |
| **Approval workflows** | Single human approval, not multi-stakeholder | Low |
| **Invariant visibility** | Invariants exist in code, not surfaced in UI | Low |

---

## 4. Intent Conflict Model

### 4.1 Types of Intent Conflicts

**Type 1: Same-Test Conflict**

Two atoms claim the same test:

```typescript
// test/auth.spec.ts
// @atom IA-001  ← Alice's atom
// @atom IA-002  ← Bob's atom (conflict!)
it('validates user credentials', () => { ... });
```

**Detection**: During reconciliation, detect multiple `@atom` annotations in one test block.

**Resolution**: Tests should be atomic. Either split the test or determine which atom is primary.

**Type 2: Semantic Overlap**

Two atoms describe overlapping behavior:

```
IA-001: "User can log in with email and password"
IA-002: "User can authenticate using credentials"
```

**Detection**: LLM-based similarity scoring during atom creation. Threshold: >80% semantic similarity triggers warning.

**Resolution**: One atom supersedes the other, or both are refined to non-overlapping territory.

**Type 3: Contradictory Intent**

Two atoms contradict each other:

```
IA-001: "User session expires after 30 minutes of inactivity"
IA-002: "User session never expires unless explicitly logged out"
```

**Detection**: LLM-based contradiction detection (requires domain understanding).

**Resolution**: Product decision required. One atom must be rejected or superseded. Create Clarification Artifact documenting the decision.

**Type 4: Cross-Team Boundary**

Team A defines atoms for "checkout," Team B defines atoms for "payment." Both touch the same code:

```
IA-A1: "Checkout completes within 3 seconds" (Team A)
IA-B1: "Payment validation occurs synchronously" (Team B)
```

**Detection**: Requires organizational context (team/molecule ownership).

**Resolution**: Domain boundaries must be explicit. Require joint approval for atoms affecting multiple teams.

### 4.2 Conflict Resolution Workflows

```
┌─────────────────────────────────────────────────────────────────┐
│                    Conflict Resolution Flow                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Conflict Detected                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐     Low Risk        ┌──────────────────┐      │
│  │ Assess Risk  │────────────────────▶│ Auto-Suggest     │      │
│  └──────┬───────┘                     │ Resolution       │      │
│         │                             └────────┬─────────┘      │
│         │ Medium/High Risk                     │                │
│         ▼                                      ▼                │
│  ┌──────────────┐                     ┌──────────────────┐      │
│  │ Human Review │◀────────────────────│ Human Confirms   │      │
│  └──────┬───────┘                     └──────────────────┘      │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐     Resolved        ┌──────────────────┐      │
│  │ Resolution   │────────────────────▶│ Apply & Log      │      │
│  │ Decision     │                     │ (Clarification)  │      │
│  └──────┬───────┘                     └──────────────────┘      │
│         │                                                        │
│         │ Unresolvable                                           │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │ Escalate to  │                                               │
│  │ Product Owner│                                               │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Proposed ConflictRecord Entity

```typescript
interface ConflictRecord {
  id: string;
  conflictType: 'same_test' | 'semantic_overlap' | 'contradiction' | 'cross_boundary';
  atomIdA: string;
  atomIdB: string;
  testRecordId?: string;  // For same-test conflicts
  similarityScore?: number;  // For semantic overlap (0-100)
  description: string;
  status: 'open' | 'resolved' | 'escalated';
  resolution?: {
    action: 'supersede_a' | 'supersede_b' | 'split_test' | 'reject_a' | 'reject_b' | 'clarify';
    resolvedBy: string;
    resolvedAt: Date;
    clarificationArtifactId?: string;
  };
  createdAt: Date;
}
```

### 4.4 Conflicts as Organizational Diagnostics

Conflicts are not just technical problems to resolve — they are **signals about organizational health**.

**The Diagnostic Reframe**:

| Conflict Pattern | Technical Interpretation | Organizational Interpretation |
|------------------|--------------------------|-------------------------------|
| High same-test conflict rate | Tests need splitting | Test granularity standards unclear |
| Recurring contradictions in same domain | Atoms need refinement | Product vision is contested |
| Cross-boundary conflicts between Team A and B | Ownership unclear | Domain boundaries misaligned |
| Semantic overlap spike after reorg | Atoms need deduplication | Knowledge transfer incomplete |
| Conflict resolution always escalates | Governance too weak | Decision authority unclear |

**Conflict Metrics as Health Indicators**:

```typescript
interface ConflictMetrics {
  // Volume metrics
  totalOpenConflicts: number;
  conflictsByType: Record<ConflictType, number>;
  conflictsCreatedThisWeek: number;
  conflictsResolvedThisWeek: number;

  // Velocity metrics
  averageResolutionTimeHours: number;
  escalationRate: number;  // % that reach product owner
  autoResolvedRate: number;  // % resolved by suggestion

  // Distribution metrics
  conflictsByMolecule: Record<string, number>;  // Which features have most conflicts?
  conflictsByTeamPair: Record<string, number>;  // Which teams conflict most?
  conflictRecurrenceRate: number;  // Same atoms conflicting repeatedly?

  // Trend metrics
  conflictRateTrend: 'increasing' | 'stable' | 'decreasing';
  resolutionTimeTrend: 'increasing' | 'stable' | 'decreasing';
}
```

**Dashboard Questions Conflicts Answer**:

1. **"Is our product vision clear?"**
   - Low contradiction rate → Yes
   - High contradiction rate → No, teams disagree on fundamentals

2. **"Are our domain boundaries well-defined?"**
   - Low cross-boundary rate → Yes
   - High cross-boundary rate → No, ownership is ambiguous

3. **"Is our team scaling healthily?"**
   - Stable conflict rate as team grows → Yes
   - Conflict rate increasing faster than team size → No, coordination is breaking down

4. **"Are we learning from conflicts?"**
   - Low recurrence rate → Yes, we fix root causes
   - High recurrence rate → No, we're treating symptoms

**Key Insight**: In traditional PM tools, conflicts are invisible — they live in Slack threads and meeting notes. In Pact, conflicts are **first-class data**. This transforms conflict from an annoyance into an organizational learning signal.

---

## 5. Change Set Molecules (PR Equivalent)

### 5.1 Concept

A **Change Set Molecule** is a special-purpose molecule that groups related draft atoms for batch review and commit. This is Pact's equivalent of a Git Pull Request.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Change Set Molecule                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Lens Type: change_set                                          │
│  Name: "Add user notification preferences"                       │
│  Status: pending_review                                          │
│                                                                  │
│  Atoms:                                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ IA-050 (draft) User can enable email notifications         │ │
│  │ IA-051 (draft) User can set notification frequency         │ │
│  │ IA-052 (draft) User can mute notifications temporarily     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Reviewers: [@alice, @bob]                                       │
│  Approvals: [✓ @alice]                                           │
│  Quality Gate: All atoms >= 80 ✓                                 │
│                                                                  │
│  Actions: [Review] [Approve] [Request Changes] [Merge & Commit]  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Workflow

```
1. Create Change Set Molecule
   └── Lens type: change_set
   └── Add draft atoms to molecule
   └── Assign reviewers (optional)

2. Review Phase
   └── Reviewers examine atoms individually
   └── Quality scores computed
   └── Conflicts detected and flagged
   └── Comments/feedback on individual atoms

3. Approval Phase
   └── Required approvals collected
   └── All atoms pass quality gate
   └── No unresolved conflicts

4. Batch Commit
   └── All atoms transition draft → committed simultaneously
   └── Change set molecule transitions to completed
   └── Audit log captures batch operation
```

### 5.3 Schema Extensions

```typescript
// Molecule lens type additions
type MoleculeLensType =
  | 'user_story' | 'feature' | 'journey'
  | 'epic' | 'release' | 'capability' | 'custom'
  | 'change_set';  // NEW

// Change Set specific fields (in molecule metadata or separate entity)
interface ChangeSetMetadata {
  status: 'draft' | 'pending_review' | 'approved' | 'committed' | 'abandoned';
  reviewers: string[];  // User IDs
  approvals: Array<{
    userId: string;
    approvedAt: Date;
    comment?: string;
  }>;
  requestedChanges: Array<{
    userId: string;
    atomId: string;
    comment: string;
    resolvedAt?: Date;
  }>;
  committedAt?: Date;
  abandonedAt?: Date;
  abandonReason?: string;
}
```

### 5.4 UX Implications

From [ux.md](ux.md) principles:

> Pact should make atom creation feel closer to **signing a contract** than writing a note.

Change Set Molecules extend this:

- **Batch commitment** feels like signing a multi-clause contract
- **Review workflow** adds ceremony appropriate to the commitment
- **Explicit approval** makes the commitment social, not solitary
- **Conflict detection** prevents contradictory commitments from coexisting

---

## 6. Product Management Alignment

### 6.1 Startup vs Enterprise Needs

| Dimension | Startup Need | Enterprise Need | Pact Approach |
|-----------|--------------|-----------------|---------------|
| **Speed** | Fast iteration | Controlled change | Change Set batching (adjustable friction) |
| **Process** | Minimal | Audit trails | Configurable approval requirements |
| **Teams** | Single team | Multiple teams | Molecule ownership boundaries |
| **Governance** | Optional | Required | Quality gates, RBAC (future) |
| **Integration** | Nice to have | Critical | PM tools project from Pact (not peer) |

### 6.2 Pact as Authority (Not Complement)

**The Architectural Claim**: Pact is the authoritative semantic layer. Other tools are projections.

This is not diplomatic language — it's a deliberate architectural decision:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Authority Hierarchy                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AUTHORITATIVE LAYER (Pact)                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Committed behavioral intent (atoms)                      │ │
│  │ • Test-intent coupling (proof)                             │ │
│  │ • Quality scores (confidence)                              │ │
│  │ • Evidence artifacts (realization)                         │ │
│  │ • Conflict records (organizational diagnostics)            │ │
│  │                                                            │ │
│  │ THIS IS TRUTH. Everything below derives from this.         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                      │
│                           │ Projects to                          │
│                           ▼                                      │
│  PROJECTION LAYER (PM Tools)                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Jira      → Tickets derived from atoms/molecules           │ │
│  │ Linear    → Issues synced from Pact                        │ │
│  │ GitHub    → Issues/PRs linked to change sets               │ │
│  │ Roadmaps  → Visualizations of molecule timelines           │ │
│  │                                                            │ │
│  │ These are VIEWS. If they disagree with Pact, they're wrong.│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why This Matters**:

1. **No more "source of truth" debates**: The Jira ticket says one thing, the spec says another, the test does a third. With Pact as authority, the atom is truth — everything else is commentary.

2. **PM tools become coordination layers**: Jira is great for sprint planning, assignment, stakeholder communication. It's terrible for semantic truth. Let each tool do what it's good at.

3. **Integration becomes one-way**: Pact → Jira (push atom status to custom fields), not Jira → Pact (requirements don't flow from tickets).

4. **Conflicts are resolved by Pact**: If a Jira ticket claims "feature X is complete" but Pact shows the atom is unrealized, the ticket is wrong.

**What PM Tools Do (and Don't Do)**:

| Responsibility | PM Tools | Pact |
|----------------|----------|------|
| Task assignment | ✓ | ✗ |
| Sprint velocity | ✓ | ✗ |
| Stakeholder updates | ✓ | ✗ |
| **Behavioral truth** | ✗ | ✓ |
| **Test-intent proof** | ✗ | ✓ |
| **Quality scoring** | ✗ | ✓ |
| **Semantic conflicts** | ✗ | ✓ |

**Integration Architecture** (future):

- **Pact → Jira**: Atom commitment creates/updates linked ticket
- **Pact → Jira**: Evidence generation marks ticket as "proven"
- **Pact → Linear**: Molecule progress syncs to project status
- **Jira → Pact**: ✗ (Tickets don't create atoms — humans do, via Pact)

### 6.3 Comparison with PM Tool Intent Models

| Tool | Intent Representation | Versioning | Coupling to Code |
|------|----------------------|------------|------------------|
| **Jira** | Tickets (mutable text) | Change history | Manual links |
| **Linear** | Issues (mutable) | Timeline | GitHub integration |
| **ProductBoard** | Features (mutable) | Roadmap versions | None |
| **Aha!** | Requirements (mutable) | Releases | None |
| **Pact** | Atoms (immutable behavior) | Supersession chain | Test annotations |

**Pact's Differentiators**:

1. **Immutability**: PM tools allow editing requirements; Pact does not
2. **Testability**: PM tools don't enforce behavioral specificity; Pact requires it
3. **Coupling**: PM tools have no code→intent binding; Pact has `@atom` annotations
4. **Evidence**: PM tools track status changes; Pact tracks proof of realization

---

## 7. Open Questions

### 7.1 Conceptual

1. **Revert semantics**: In Git, you can revert a commit. Can you "revert" a supersession? (Probably not - create new atom instead)

2. **Molecule merging**: If two teams have separate change set molecules, can they be "merged"? (Probably just combine atom lists)

3. **Offline intent**: Can intent be captured without connectivity and synced later? (Git-like distributed model - future consideration)

4. **Intent identity assignment**: Should intent identity be auto-assigned (UUID) or human-named (path-like)? Trade-off: discoverability vs. stability.

5. **Intent splitting**: What happens when one intent should become two? (Like extracting a file into multiple files in Git)

6. **Invariant customization**: Should projects be able to define custom invariants beyond the built-in set? (Like custom Git hooks)

### 7.2 Implementation

1. **Conflict detection performance**: LLM similarity detection is expensive. Use embeddings for fast approximate matching?

2. **Real-time concurrency**: Two users commit atoms simultaneously - how to detect conflicts in real-time?

3. **Cross-repository**: Can atoms be shared across Pact instances? (Like Git submodules)

### 7.3 Product

1. **Friction calibration**: How much ceremony before users abandon the system?

2. **Auto-commit**: Should high-confidence reconciliation (>95%) ever auto-commit? (Currently: no, per INV-R003)

3. **Change set size limits**: Should we limit atoms per change set to encourage small batches?

---

## 8. Recommendations

### 8.1 Short-Term (Phase 6-7)

| Priority | Recommendation | Rationale |
|----------|----------------|-----------|
| **High** | Implement same-test conflict detection in reconciliation | Prevent data integrity issues |
| **High** | Add `change_set` lens type to molecules | Enable PR-like workflow |
| **Medium** | Extend AtomRecommendation with `conflictingAtomIds` | Surface conflicts during review |
| **Medium** | Surface invariants in UI (enforcement rules panel) | Transparency about system rules |

### 8.2 Medium-Term (Phase 8+)

| Priority | Recommendation | Rationale |
|----------|----------------|-----------|
| **High** | Add `intentIdentity` field to atoms | Enable "same intent, different version" queries |
| **High** | Design molecule ownership model | Cross-team coordination |
| **Medium** | Implement semantic similarity indexing (embeddings) | Fast conflict detection |
| **Medium** | Add multi-stakeholder approval to change sets | Enterprise governance |
| **Medium** | Build semantic diff viewer for atom versions | Human-friendly version comparison |

### 8.3 Long-Term (Post Self-Hosting)

| Priority | Recommendation | Rationale |
|----------|----------------|-----------|
| **High** | Design intent history queries (`git log --follow` equivalent) | "Show all versions of this intent" |
| **Medium** | Explore distributed/federated Pact | Multi-org collaboration |
| **Medium** | Build PM tool integrations | Bidirectional sync for adoption |
| **Low** | Implement rename/reframe tracking for intent identity | Maintain continuity through refactoring |

### 8.4 Schema Evolution for Intent Identity

```typescript
// Proposed addition to Atom entity
interface Atom {
  // ... existing fields ...

  /**
   * Stable identifier for the conceptual intent across versions.
   * Like a file path in Git - persists even as content changes.
   * Auto-generated on first atom, inherited on supersession.
   */
  intentIdentity: string;  // e.g., "auth/user-login" or UUID

  /**
   * Human-readable name for the intent (can change across versions)
   */
  intentName?: string;  // e.g., "User Authentication"

  /**
   * Version number within this intent identity
   */
  intentVersion: number;  // 1, 2, 3, ...
}

// Query: "Show all versions of user-login intent"
const versions = await atomRepository.find({
  where: { intentIdentity: 'auth/user-login' },
  order: { intentVersion: 'ASC' }
});
```

---

## 9. Conclusion

The "Git for Intent" analogy is **valuable but imperfect**. It provides developers with a familiar mental model (commits, immutability, history) while obscuring the fundamentally different nature of intent (behavioral semantics vs. text diffs).

### What Pact Borrows from Git

- **Immutability** - Commits/atoms cannot be changed
- **Explicit commitment** - Staging requires deliberate action
- **Traceability** - Full history is preserved
- **Branching (reinterpreted)** - Molecules as organizational lenses

### What Pact Invents

- **Semantic conflict detection** - Beyond textual diff
- **Quality gates** - Behavioral testability requirements
- **Test-intent coupling** - `@atom` annotations as binding contract
- **Change Set Molecules** - PR equivalent for intent batching
- **Clarification Artifacts** - Post-commitment disambiguation

### The Core Insight

> Pact is not Git for Intent. It is **Pact** — a new paradigm that borrows Git's principles while inventing new mechanisms for the unique challenges of behavioral commitment.

The path forward:
1. Recognize where the analogy helps (immutability, explicit commitment)
2. Acknowledge where it misleads (molecules are not branches, merging intent is not diffing text)
3. Design new primitives for intent-specific operations (conflict detection, change sets, semantic overlap)

---

## 10. Related Documents

- [ux.md](ux.md) - UX principles and interaction flows
- [index.md](index.md) - System architecture overview
- [schema.md](schema.md) - Database schema including reconciliation entities
- [ui.md](ui.md) - UI architecture and component patterns
- [CLAUDE.md](../CLAUDE.md) - Development context and conventions

---

*This document is living. Updates should reflect evolving understanding of the Git-Intent relationship.*
