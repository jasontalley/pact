# Pact - Requirements Synthesis

**Generated**: 2026-01-12
**Sources**: ingest/manifesto.md, ingest/taxonomy.md, ingest/chat-transcript-2026-01-11-2130.md, ingest/invariants.md
**Status**: Draft - Evolving Understanding

**Important Context**: This synthesis captures evolving understanding through dialog and conversation. These are not fixed requirements or global invariants, but rather context for understanding the system vision as it has developed through exploration.

---

## Executive Summary

Pact represents a fundamental rethinking of software development for the era of AI-assisted engineering. The core insight: **software is realized intent, not code**. In a world where agents handle execution, human intent becomes the scarce resource requiring explicit structure, validation, and traceability.

The system centers on two irreducible primitives:

- **Intent Atoms**: The smallest unit of behavioral commitment before implementation
- **Executable Units (Code)**: The smallest unit of realized behavior after commitment

Between these lies the **Commitment Boundary** - the explicit, human-authorized phase transition where ambiguity collapses and obligation begins. Everything else (specs, plans, tickets, stories) is recognized as cognitive scaffolding, not semantic truth.

This represents a **phase shift** in software ontology, moving from human-execution-driven development to agent-execution-driven development, with validation (not documentation) as the substrate.

---

## Stakeholders & Personas

### Product Builder (Primary)

- **Role**: Software creators working with AI agents
- **Goals**: Capture product intent explicitly, maintain traceability from idea to code, leverage agents effectively while maintaining control
- **Pain Points**: Current tools treat intent informally; specs become stale; agents can't reliably understand ambiguous requirements; traceability is lost across artifact types
- **Needs**: A system that makes intent first-class, enforces explicit boundaries, and maintains auditable lineage

### AI Agent (Actor, Not Authority)

- **Role**: Prime mover of realization (execution)
- **Goals**: Understand intent precisely, execute deterministically, surface evidence transparently
- **Constraints**: Cannot commit intent, cannot resolve ambiguity independently, must operate under validator discipline
- **Needs**: Explicit, testable intent atoms; clear phase boundaries; validators as constraints

### Future User Personas

- Compliance teams needing audit trails
- Policy writers translating rules to enforceable systems
- Research teams moving from hypothesis to validated implementation
- Operations teams defining infrastructure intent

---

## Core Philosophical Principles

### The Phase Shift

**Historical Context:**

- Last 50 years: human execution was scarce → code was primary
- Intent was compressed, informal, lossy
- Tests were optional overhead
- Specs were aspirational documents

**Current Reality:**

- Execution is abundant (agents generate code instantly)
- Intent is now the scarce resource
- Validation is the bottleneck
- Meaning must be explicit

**Implication**: Software ontology must fundamentally change to treat intent with the same rigor previously reserved for code.

### Software as Realized Intent

**Core Assertion**: A system is defined not by its implementation artifacts, but by the accumulated intent that has been made true.

**Corollaries**:

- Code is a realization of intent (not the primary artifact)
- Tests are evidence of intent (not documentation)
- Architecture is emergent (not designed upfront)
- When execution is cheap, meaning becomes primary

### The Atomic Model

**Intent Atom** (irreducible primitive before commitment):

- Behaviorally precise (describes observable system effects)
- Test-derivable (can be validated mechanically)
- Implementation-agnostic (doesn't specify "how")
- Observable and falsifiable
- Last human-authored truth before mechanization

**Code Atom** (irreducible primitive after commitment):

- Defined by its validators, not its structure
- Tests are proof, not documentation
- Individually replaceable without rewriting the universe

**Key Insight**: Both sides of the phase shift have atomic units validated by constraints. Higher-order constructs (epics, modules, services) are **emergent properties**, not semantic primitives.

**Important Limitation**: Testability is necessary but not sufficient for semantic completeness. An Intent Atom can be observable and falsifiable yet still underspecified (e.g., unclear edge tolerances, priority conflicts, implicit assumptions). Pact enforces a **floor** of precision (behavioral testability) but does not guarantee exhaustive semantic completeness. This is why emergent validators (gap detection, coverage analysis, contradiction checking) exist as advisory checks—they help surface incompleteness that testability alone cannot catch.

### Validators as Substrate

**Central Thesis**: Intent without validation is aspiration. Code without validation is folklore.

**Structure**:

- Intent Atoms have Intent Validators (enforce meaning)
- Code Atoms have Execution Validators (enforce correctness)
- Higher-order constructs can have emergent validators (completeness, consistency, integration)

**Result**: The system is validator-constrained intent → validator-constrained execution (not "spec → code")

---

## System Requirements

### Foundational Requirements

#### FR-001: Explicit Intent Representation

**Description**: The system must provide first-class representation of Intent Atoms as behaviorally precise, testable statements
**Priority**: Must Have
**Rationale**: Intent atoms are the irreducible primitive of the entire system

#### FR-002: Commitment Boundary Enforcement

**Description**: The system must enforce an explicit, human-authorized phase transition where intent becomes enforceable
**Priority**: Must Have
**Rationale**: This is the only semantic phase shift; it's where ambiguity collapses

#### FR-003: Dual Validation Model

**Description**: System must support validators for both intent (meaning) and execution (correctness)
**Priority**: Must Have
**Rationale**: Validators give atoms force; they are the substrate, not artifacts

#### FR-004: Immutable Audit Trail

**Description**: All committed intent, realizations, and evidence must be immutable and traceable
**Priority**: Must Have
**Rationale**: Supports accountability, retrospection, and learning

#### FR-005: Agent-Human Role Separation

**Description**: Agents propose/execute; humans decide/commit/accept - enforced structurally
**Priority**: Must Have
**Rationale**: Clarifies agency without reducing human authority

### Phase-Specific Requirements

#### FR-010: Exploration Phase Support

**Description**: Pre-commitment space where ambiguity is allowed, exploration is safe, nothing is enforceable
**Priority**: Must Have
**Design Note**: System must NOT constrain or validate in this phase (beyond basic structural integrity)

#### FR-011: Articulation Phase Support

**Description**: Space where intent is being shaped into atoms, still non-binding
**Priority**: Must Have
**Design Note**: Advisory validators okay; blocking validators forbidden

#### FR-012: Commitment Phase Gating

**Description**: Invariant checking at commitment boundary with explicit pass/fail and violation reasons
**Priority**: Must Have
**Design Note**: Only place system can say "no"; only for invariant violations

#### FR-013: Observation Phase Transparency

**Description**: Full visibility into realization artifacts and evidence as they accumulate
**Priority**: Must Have
**Design Note**: Evidence may contradict expectations and must never be suppressed

### Intent Management Requirements

#### FR-020: Intent Atom Creation

**Description**: Users can create Intent Atoms with behavioral descriptions independent of implementation
**Priority**: Must Have
**Acceptance Criteria**:

- Atom describes "what must be true" not "how to achieve it"
- Observable outcomes specified
- Falsifiable conditions defined

#### FR-021: Intent Validation Definition

**Description**: Intent Atoms can have associated validators that constrain meaning
**Priority**: Must Have
**Acceptance Criteria**:

- Validators check behavioral precision
- Validators ensure testability
- Validators do not specify implementation

#### FR-022: Intent Grouping (Non-Semantic)

**Description**: Support human cognitive scaffolding through grouping of related Intent Atoms
**Priority**: Should Have
**Critical Note**: Groupings must NOT introduce new semantic rules or boundaries
**Rationale**: Humans need chunking; agents don't; groups are views/workspaces, not ontological entities

#### FR-023: Intent Evolution Pre-Commitment

**Description**: Intent Atoms can be freely created, modified, deleted before commitment
**Priority**: Must Have
**Acceptance Criteria**:

- No system rejection during exploration
- Changes are non-binding
- History retained for context but not authority

### Commitment & Boundary Requirements

#### FR-030: Human-Authorized Commitment

**Description**: Commitment action must be explicit, human-initiated, and auditable
**Priority**: Must Have
**Acceptance Criteria**:

- No auto-commit
- Clear ceremony/action in UX
- Timestamp and human identity captured

#### FR-031: Invariant Enforcement

**Description**: System evaluates global invariants at commitment boundary and blocks invalid commitments
**Priority**: Must Have
**Acceptance Criteria**:

- Deterministic checks
- Explicit violation reasons
- Reference to violated invariant
- No heuristics or advisory warnings

#### FR-032: Immutable Commitment Artifacts

**Description**: Once committed, intent cannot be edited (only superseded)
**Priority**: Must Have
**Rationale**: Preserves accountability and traceability

#### FR-033: Commitment Artifact Generation

**Description**: System generates canonical, structured representation of committed intent
**Priority**: Must Have
**Acceptance Criteria**:

- Globally referenceable (unique ID)
- Fully constrained (no ambiguity)
- Machine-parseable
- Human-readable

### Realization Requirements

#### FR-040: Realization Artifact Traceability

**Description**: All code, tests, plans, infrastructure must reference the Commitment Artifact they satisfy
**Priority**: Must Have
**Rationale**: Maintains intent→reality lineage

#### FR-041: Agent-Driven Execution

**Description**: Agents generate realization artifacts (code, tests, plans) constrained by committed intent
**Priority**: Must Have
**Acceptance Criteria**:

- Agents cannot reinterpret intent
- Agents surface failures as evidence, not roadblocks
- Agents work under validator discipline

#### FR-042: Evidence Collection

**Description**: System captures all execution evidence (test results, coverage, metrics, audits)
**Priority**: Must Have
**Acceptance Criteria**:

- Machine-generated
- Immutable
- Time-bound
- Comparable across iterations

#### FR-043: Failure as First-Class Evidence

**Description**: Failed realizations produce evidence, not errors; failures are data, not rejection
**Priority**: Must Have
**Rationale**: Post-commitment, the system validates but doesn't reject; failures inform iteration

---

## Non-Functional Requirements

### NFR-001: Ambiguity Gradient Enforcement

**Description**: System behavior changes across phases: ambiguity tolerated → progressively constrained → eliminated
**Measurement**: Phase-appropriate validation strength
**Target**: No blocking validation pre-commitment; deterministic validation at commitment; continuous validation post-commitment

### NFR-002: Cognitive Scalability

**Description**: System must support human reasoning at scale without forcing false ontological structures
**Measurement**: Users can navigate large intent sets without artificial hierarchy imposing semantic constraints
**Target**: Flat atom model with emergent views

### NFR-003: Agent Compatibility

**Description**: All artifacts must be machine-parseable and semantically unambiguous for agent consumption
**Measurement**: Agents can reason over committed intent without human clarification
**Target**: 100% of committed intent is agent-interpretable

### NFR-004: Audit Trail Permanence

**Description**: All phase transitions, commitments, realizations, and evidence retained indefinitely
**Measurement**: Query-ability of historical decisions five years later
**Target**: Zero data loss; complete causal chain reconstruction

### NFR-005: JSON-Native Accountability

**Description**: All authoritative artifacts must be validated JSON (not markdown prose)
**Measurement**: Percentage of authoritative data in structured format
**Target**: 100% for committed artifacts; markdown only for human convenience layers

---

## Technical Requirements

### TR-001: Ontological Simplicity

**Description**: System must recognize exactly five first-class categories: Intent, Boundary, Commitment, Realization, Evidence
**Justification**: Prevents ontological sprawl; maintains conceptual clarity
**Impact**: Implementation must map all features to these primitives

### TR-002: Phase-Scoped Truth Model

**Description**: Different artifacts are authoritative in different phases
**Justification**: Prevents single artifact type from becoming overloaded
**Implementation Notes**:

- Exploration: No canonical artifact (conversational)
- Articulation: Intent atoms (mutable)
- Commitment: Commitment artifact (immutable)
- Observation: Evidence artifacts (accumulating)

### TR-003: Validator Infrastructure

**Description**: First-class support for defining, executing, and reporting validators
**Justification**: Validators are the substrate; must be first-class
**Impact**: Validation framework needed for intent, execution, and emergent properties

### TR-004: Human-Agent Interface Layer

**Description**: Clear API boundary distinguishing human-only actions from agent-permissible actions
**Justification**: Role separation must be structurally enforced
**Impact**: Authentication, authorization, and action gating based on actor type

---

## Data Requirements

### Entity: Intent Atom

**Attributes**:

- `id` (UUID): Unique identifier
- `description` (string): Behavioral statement of what must be true
- `created_by` (User ID): Human author
- `created_at` (timestamp): Creation time
- `state` (enum): uncommitted | committed | superseded
- `validators` (array): Associated intent validators
- `observable_outcomes` (array): Specific observable effects
- `falsifiability_criteria` (array): Conditions that would disprove this intent

**Relationships**:

- Belongs to zero or one Commitment Artifact (once committed)
- May reference other Intent Atoms (dependencies, related context)
- Has many Intent Validators
- Has many Realization Artifacts (post-commitment)
- Has many Evidence Artifacts (post-realization)

**Validation Rules**:

- Must be behaviorally precise (validator checks)
- Must be implementation-agnostic (no "how" statements)
- Cannot be deleted if committed (only superseded)
- Cannot be modified after commitment

### Entity: Commitment Artifact

**Attributes**:

- `id` (UUID): Globally unique identifier
- `intent_atoms` (array of Intent Atom IDs): Atoms being committed
- `committed_by` (User ID): Human who authorized commitment
- `committed_at` (timestamp): Moment of commitment
- `invariant_checks` (array): Results of invariant validation
- `canonical_representation` (JSON): Structured, immutable record
- `supersedes` (Commitment Artifact ID, optional): If this replaces a previous commitment

**Relationships**:

- Contains many Intent Atoms
- Has many Realization Artifacts (implementations)
- Has many Evidence Artifacts (validation results)
- May supersede another Commitment Artifact

**Validation Rules**:

- Immutable after creation
- Must pass all global invariants
- Must have human authorization
- Must contain at least one Intent Atom
- All referenced Intent Atoms must exist and be valid

### Entity: Realization Artifact

**Attributes**:

- `id` (UUID): Unique identifier
- `type` (enum): code | test | plan | infrastructure | configuration
- `commitment_ref` (Commitment Artifact ID): What intent this realizes
- `created_by` (Actor ID): Agent or human who created it
- `created_at` (timestamp): Creation time
- `content` (varies): The actual artifact (code, config, etc.)
- `status` (enum): pending | executed | validated | failed

**Relationships**:

- References exactly one Commitment Artifact
- Has many Evidence Artifacts (results of execution/validation)

**Validation Rules**:

- Must reference a valid Commitment Artifact
- Cannot reinterpret intent (constrained by commitment)
- Replaceable (new realization can supersede without changing commitment)

### Entity: Evidence Artifact

**Attributes**:

- `id` (UUID): Unique identifier
- `type` (enum): test_result | coverage_report | audit | metric | validation
- `realization_ref` (Realization Artifact ID): What was being validated
- `commitment_ref` (Commitment Artifact ID): Ultimate intent being satisfied
- `timestamp` (timestamp): When evidence was generated
- `outcome` (enum): pass | fail | partial | inconclusive
- `data` (JSON): Structured evidence data
- `immutable_hash` (string): Cryptographic proof of immutability

**Relationships**:

- References exactly one Realization Artifact
- Transitively references a Commitment Artifact

**Validation Rules**:

- Immutable after creation
- Machine-generated (no human editing)
- Must never be suppressed or deleted
- Comparable across time (same schema for same evidence type)

### Entity: Clarification Artifact

**Attributes**:

- `id` (UUID): Unique identifier
- `commitment_ref` (Commitment Artifact ID): Commitment being clarified
- `intent_atom_ref` (Intent Atom ID, optional): Specific atom being clarified
- `question` (string): The ambiguity or question being addressed
- `clarification` (string): Human-provided answer
- `created_by` (User ID): Human who provided clarification
- `created_at` (timestamp): When clarification was created
- `immutable_hash` (string): Cryptographic proof of immutability

**Relationships**:

- References exactly one Commitment Artifact
- Optionally references one Intent Atom
- May be referenced by Realization Artifacts (guidance for implementation)

**Validation Rules**:

- Immutable after creation
- Must be human-authored (not agent-generated)
- Does NOT mutate the original Commitment Artifact
- Cannot contradict committed intent (only adds precision)
- Must include both question and answer
- Links to specific committed intent being clarified

**Purpose**:
Clarification Artifacts allow post-commitment ambiguity to be resolved explicitly without silently reinterpreting intent. They serve as immutable, auditable answers to specific questions that arose during realization, without requiring a full superseding commitment for minor clarifications.

### Entity: Global Invariant

**Attributes**:

- `id` (UUID): Unique identifier
- `statement` (string): What must be true
- `rationale` (string): Why this is a global truth
- `enforced_at` (enum): commitment_boundary (primary), runtime (secondary)
- `violation_message` (string): What users see when violated
- `automatable` (boolean): Can this be checked by machine?
- `check_function` (code reference): If automatable, how to check

**Validation Rules**:

- Context-independent (applies to all commitments)
- Timeless (doesn't depend on iteration or scale)
- Protects system coherence (not taste or preference)

---

## Integration Points

### LangChain/LangGraph Agent Framework

**Purpose**: Agents reason over intent, generate realizations, execute validators
**Type**: Internal integration
**Data Flow**:

- Agents read Intent Atoms and Commitment Artifacts
- Agents write Realization Artifacts
- Agents execute validators and generate Evidence Artifacts
**Dependencies**: Agents must be constrained by phase semantics and role boundaries

### MCP (Model Context Protocol)

**Purpose**: Provide structured context to AI models about system state
**Type**: Internal protocol
**Data Flow**: System state (intent, commitments, evidence) exposed as MCP contexts
**Dependencies**: Context must respect phase boundaries (don't expose uncommitted intent as binding)

### Version Control System (Git)

**Purpose**: Store realization artifacts (code, tests, configs) with history
**Type**: External system
**Data Flow**: Realization Artifacts committed to Git with traceability metadata
**Dependencies**: Commit messages must reference Commitment Artifact IDs

### Testing Framework (Jest, Cucumber, etc.)

**Purpose**: Execute tests as validators, generate Evidence Artifacts
**Type**: External system
**Data Flow**: Tests derived from Intent Atoms execute and produce Evidence
**Dependencies**: Test results must be captured as immutable Evidence Artifacts

---

## Gaps & Ambiguities

### Clarifications Needed

1. **Topic**: Intent Grouping UX
   - **Question**: What UI metaphors support human cognitive grouping without implying semantic containers? (Canvas, Workspace, View, Folder?)
   - **Impact**: User mental model and navigation patterns

2. **Topic**: Validator Definition Language
   - **Question**: How do humans specify Intent Validators? Natural language? Formal logic? Gherkin scenarios?
   - **Impact**: Usability vs. precision tradeoff

3. **Topic**: Emergent Property Validation
   - **Question**: What emergent properties should have system-level validators? (Completeness, consistency, coverage, coherence?)
   - **Impact**: Guidance quality without over-constraining

4. **Topic**: Commitment Ceremony UX
   - **Question**: What does the explicit commitment action look/feel like? Button click? Dialog? Review flow?
   - **Impact**: Weight of decision and user confidence

5. **Topic**: Evidence Presentation
   - **Question**: How is evidence surfaced to users? Dashboard? Timeline? Queryable database?
   - **Impact**: Observability and learning loop effectiveness

6. **Topic**: Supersession Semantics
   - **Question**: When a Commitment Artifact is superseded, what happens to its Realization and Evidence Artifacts? Archived? Tombstoned?
   - **Impact**: Historical accuracy and audit trail complexity

7. **Topic**: Cross-Commit Dependencies
   - **Question**: Can one Commitment Artifact depend on another? How are dependencies validated?
   - **Impact**: System composition and modularity

8. **Topic**: Rollback/Undo
   - **Question**: Can commitments be "undone"? Or only superseded forward? What about evidence?
   - **Impact**: Error recovery and user confidence

### Missing Information

- **Concrete Validator Examples**: Need sample Intent Validators and Execution Validators to validate the model
- **Phase Transition UX Details**: What does crossing the Commitment Boundary actually look like in the interface?
- **Agent Policy Specification**: How do we define agent behavior rules (separate from invariants)?
- **Retrospective/Learning Loop**: How does the system capture learnings from evidence and feed them forward?
- **Multi-User Scenarios**: How do teams collaborate on intent definition? Commit authority distribution?
- **Scaling Characteristics**: At what point do flat atom models need indexing/search beyond simple grouping?
- **Integration with Existing Tools**: How does this interact with Jira, Linear, GitHub Issues, Notion, etc.?

---

## Open Questions for Stakeholder Interview

These questions should be explored in the `interviewing-stakeholders` skill session:

### Intent Definition

1. How do users express behavioral intent without accidentally specifying implementation?
2. What guidance/templates help ensure Intent Atoms are properly atomic?
3. How do users know when an intent statement is "precise enough"?

### Commitment Decision

1. What factors help users decide when to commit vs. continue exploring?
2. How do users gain confidence that their intent is complete before committing?
3. What happens if they commit "too early" and discover gaps?

### Agent Interaction

1. How do users provide feedback to agents that generate realizations?
2. What level of transparency do users need into agent reasoning?
3. When should agents proactively suggest Intent Atoms vs. wait for human direction?

### Validation & Evidence

1. What evidence matters most to users for confidence in system correctness?
2. How do users distinguish between "test failure" (needs fix) vs. "intent mismatch" (needs recommit)?
3. What historical evidence do users want to query/compare?

### Workflow & Tooling

1. How does this fit into existing development workflows (sprints, releases, deployments)?
2. What friction points exist in current tools that Pact must eliminate?
3. What's the learning curve tolerance for adopting this new ontology?

---

## Next Steps

1. **Review this synthesis** with stakeholders to validate understanding
2. **Run the interviewing-stakeholders skill** to:
   - Clarify the 8 major ambiguities listed above
   - Fill in missing information about UX, workflows, and integrations
   - Validate assumptions about user mental models
   - Generate detailed Gherkin acceptance criteria for each feature
3. **Refine ontology** based on interview insights (especially around Intent Grouping and Validator definition)
4. **Define Global Invariant Set** formally (expand beyond the 8 in invariants.md if needed)
5. **Prototype commitment boundary UX** to validate the phase transition experience
6. **Begin TDD implementation** starting with Intent Atom model and Commitment Boundary enforcement

---

## Appendix: Source Document Summary

### manifesto.md

Philosophical foundation declaring the phase shift from code-centric to intent-centric software. Establishes Intent Atom and Code Atom as dual irreducible primitives, validators as substrate, and commitment as the sole semantic boundary. Strong, declarative tone intended to align understanding before formalism.

### taxonomy.md

ProdOS Canonical Taxonomy v0.1 - formal meta-system ontology. Five first-class categories (Intent, Boundary, Commitment, Realization, Evidence) with precise definitions. Explicitly excludes domain entities, UI, workflow states, and technology choices to remain portable across client projects. This is the load-bearing semantic structure.

### chat-transcript-2026-01-11-2130.md

Extensive Socratic dialog exploring the ontology. Key insights: Intent Units are cognitive scaffolding, not semantic primitives; collections of atoms don't introduce new boundaries; validators give atoms force; the phase shift requires new industry language; specs/stories/tickets are convenience artifacts, not truth. This represents the thought process that led to the taxonomy.

### invariants.md

Eight global invariants enforced at the Commitment Boundary: explicit commitment required, intent atoms must be testable, no ambiguity in commitments, commitment is immutable, traceability mandatory, agents can't commit, evidence is first-class/immutable, rejection limited to invariants. These are the "hard boundaries" the system enforces.

### chat-transcript-2026-01-12-0743.md

[File too large to read fully; likely continues the taxonomy/UX exploration]

---

## Assumptions Made

1. **Single-user initial scope**: Synthesis assumes initial implementation focuses on individual product builders, with team collaboration as future expansion
2. **JSON as canonical format**: Interpreted preference for JSON over Markdown as authoritative data to mean structured, machine-parseable formats (could be other structured formats)
3. **Test-driven development workflow**: Assumed Pact fits into TDD cycle (write intent atoms → generate tests → implement → validate)
4. **Agent capabilities**: Assumed agents have sufficient capability to generate code, tests, plans from structured intent (LLM-generation quality)
5. **Retrospective as future feature**: Retro/learning loop mentioned but not fully specified; assumed as important but not MVP
6. **Deployment model agnostic**: No assumption about cloud/local/hybrid - system should be deployment-environment independent
7. **Language/framework agnostic**: Pact concepts should apply to any tech stack, not just JavaScript/TypeScript/NestJS (though that's the initial implementation)

These assumptions should be validated during stakeholder interviews before implementation begins.
