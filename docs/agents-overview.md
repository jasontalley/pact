# Pact Agents: Comprehensive Overview

**Last Updated**: 2026-02-09
**Status**: Phases 12-20 Complete, 25/25 Interview Golden Tests Passing, 14/15 Reconciliation Golden Tests Passing

## Executive Summary

Pact's agent system uses **LangGraph state machines** to bridge the gap between messy human intent and executable, tested software. The system includes two primary agents (Interview and Reconciliation) plus a comprehensive evaluation framework that ensures quality through contract-driven testing.

### Key Achievements

**Interview Agent** (Phase 11, Phase 13 Golden Tests):
- Multi-turn conversational intent extraction
- 25/25 golden test scenarios passing
- 3-layer JSON parsing with recovery
- Semantic drift resistance via vocabulary anchoring
- Answer classification (answered/deferred/out_of_scope/conflict)
- Completion tracking with 5 termination reasons

**Reconciliation Agent** (Phase 5, Phase 16, Phase 17):
- 7-node pipeline (structure → discover → context → infer → synthesize → verify → persist)
- 14/15 golden test scenarios passing
- ContentProvider abstraction enables local/remote deployment
- Drift detection (CI-attested runs only)
- Human-in-the-loop review gates

**Evaluation Framework** (Phase 13):
- 3-layer evaluation (deterministic → LLM-in-the-loop → human calibration)
- Rubric scoring (6 dimensions, 0-2 points each, /12 total)
- Flexible assertion logic (`descriptionContainsAny`, `categoryOneOf`)
- Stochastic tests measure variance (precision, recall, F1, consistency)
- Golden suite + property tests + cost/latency budget tests

**Recent Enhancements** (Phases 15-20):
- **Pact Main Governance** (Phase 15): Proposed → draft → committed → promoted to Main
- **Drift Management** (Phase 16): 4 drift types, CI attestation, exception lanes, convergence policies
- **Local/Remote Split** (Phase 17): ContentProvider abstraction, Client SDK, pre-read API, minimal local state
- **CI Policy & MCP Tools** (Phase 18): `suggest_atom`, `get_implementable_atoms`, CI gate for proposed atoms
- **Interview Enhancements** (Phase 19): Answer classification, scope-bounding, compression scoring
- **GitHub Integration** (Phase 20): GitHubContentProvider (shallow clone), API key auth, MCP `trigger_reconciliation` / `get_reconciliation_status` tools, Batch API infrastructure

## Agent Architectures

### Interview Agent

**Purpose**: Convert vague stakeholder requirements into testable Intent Atoms through multi-turn conversation.

**State Machine**:
```
analyze → generate_questions → [answer loop] → extract_atoms → compose_molecules → finalize
```

**Key Features**:
- **Answer classification**: `AnswerStatus` enum (answered, deferred, unanswered, out_of_scope, conflict)
- **Scope-bounding**: Respects user focus areas and deferrals
- **Vocabulary anchoring**: Uses domain terminology from conversation (not generic synonyms)
- **Category decision tree**: Explicit rules for functional/security/performance/ux/operational
- **Atomicity tests**: Splits atoms with "and" connecting distinct behaviors
- **3-layer JSON parsing**: Standard parse → repair → individual atom extraction

**Completion Reasons**:
- `user_signaled_done` - Explicit finish
- `max_rounds_reached` - Conversation limit
- `no_more_questions` - All questions answered
- `simulation_exhausted` - Fixture mode complete
- `error` - Unrecoverable error

**Current Status**:
- 25/25 golden tests passing (improved from 12/25)
- Compression scoring: 17/25 score 2, 6/25 score 1, 2/25 score 0
- Test runner: `docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=interview`

### Reconciliation Agent

**Purpose**: Reconcile codebase reality (tests, code, coverage) against Pact's intent graph and emit actionable deltas.

**State Machine**:
```
structure → discover → context → infer_atoms → synthesize_molecules → verify → [interrupt] → persist
```

**Key Features**:
- **Delta mode**: Incremental analysis (only changed files)
- **Quality gate**: Score ≥ 80 for auto-acceptance (configurable)
- **Human-in-the-loop**: NodeInterrupt before persist if review needed
- **Drift detection**: Only CI-attested runs create/update drift debt (local runs advisory)
- **ContentProvider abstraction**: Supports co-located and remote deployment

**Invariants**:
- **INV-R001**: No new atoms from already-linked tests
- **INV-R002**: Delta closure (stop when no new unlinked tests)
- **INV-R003**: Quality gate enforced (score ≥ 80)
- **INV-R004**: Molecules are descriptive lenses (not authoritative)

**Current Status**:
- 14/15 golden tests passing (rec-003 is known failure)
- Test runner: `docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=reconciliation`

## Evaluation Framework

### Three-Layer Evaluation

**Layer 1: Deterministic (Fast, No Model)**
- Mock LLM responses
- Test state transitions: given state in, expect state out
- Test routing: verify conditional edge choices
- Schema validation with Zod
- Error recovery and interrupt propagation
- Run in CI with zero real model calls

**Layer 2: LLM-in-the-Loop (Medium Speed)**
- Golden datasets against pinned model + settings
- Save outputs as snapshots (Run Artifact JSON)
- Diff against baseline
- Only update snapshots intentionally (`--update-snapshots`)
- Run on schedule or release branch

**Layer 3: Human Calibration (Slow, Essential)**
- Sample ~5-10 runs per week/release
- Manual rubric scoring for nuanced dimensions
- Label pass/weak/fail + reason
- Feed labels back into prompts and few-shot examples
- Track quality trends over time

### Rubric Scoring

Six dimensions (0-2 points each, /12 total):

| Dimension | Description | Auto-Scored? |
|-----------|-------------|--------------|
| **Atom Clarity** | Observable outcomes, falsifiability | ✅ Yes |
| **Validator Testability** | Executable vs manual validators | ✅ Yes |
| **Edge Case Coverage** | Questions about edge cases, error handling | ⚠️ Heuristic (counts questions) |
| **Ambiguity Discipline** | Asks clarifying questions when needed | ✅ Yes |
| **Invariant Alignment** | Atoms reflect domain invariants | ⚠️ Heuristic (keyword matching) |
| **Compression** | Optimal atom count (3-5 ideal, 1-2 too few, 15+ spam) | ✅ Yes |

**Scoring patterns**:
- **Excellent** (10-12 points): Clear atoms, executable validators, good compression
- **Good** (7-9 points): Testable but some manual validators, moderate compression
- **Needs improvement** (0-6 points): Vague atoms, no validators, or atom spam/starvation

### Golden Test Scenarios

**Interview Agent** (25 scenarios):
- Vague intents requiring clarification
- Conflicting constraints (real-time vs cost, security vs usability)
- Domain-specific terminology (healthcare, finance, supply chain)
- Edge cases (contradictory requirements, all questions answered)
- Complexity range: 2-4 atoms (simple) to 15-20 atoms (comprehensive)

**Reconciliation Agent** (15 fixtures):
- Perfect coupling (every atom ↔ test ↔ code)
- Ghost code (code without tests or atoms)
- Orphan tests (tests without `@atom` links)
- Decoupled atoms (atoms without passing tests)
- Zero coverage scenarios

**Flexible Assertions** (Handles semantic drift):
```json
{
  "expectedAtoms": [
    {
      "descriptionContainsAny": ["edit", "collaborative", "document", "change"],
      "categoryOneOf": ["functional", "ux"],
      "minOutcomes": 2,
      "requiresEvidence": true
    }
  ]
}
```

### Stochastic Tests

Measure variance across multiple runs (5 runs per scenario):

**Metrics**:
- **Precision**: decidedFacts ∩ extractedAtoms / totalExtractedAtoms
- **Recall**: decidedFacts ∩ extractedAtoms / totalDecidedFacts
- **F1 Score**: Harmonic mean of precision and recall
- **Variance**: Consistency across runs (low variance = stable agent)

**Current Results** (with Haiku + cache bypass):
- stoch-001: P=0.50, R=1.00, F1=0.67
- stoch-002: P=0.54±0.07, R=1.00, F1=0.70
- stoch-003: P=0.52±0.04, R=1.00, F1=0.69

**Known Issues**:
- LLM semantic cache can return identical results → use `noCache: true`
- Precision dilution: agent extracts many legitimate atoms beyond ground truth
- Keyword scoring: threshold-based (2+ keywords = 1.0, 1 = 0.5, 0 = 0.0)

## Governance and Drift Management

### Pact Main Governance (Phase 15)

**Atom State Machine**:
```
proposed → draft → committed → superseded
              ↓
     promotedToMainAt set
```

**Key Concepts**:
- **Pact Main** = all atoms where `promotedToMainAt IS NOT NULL`
- **Proposed atoms**: In change sets awaiting approval (mutable)
- **Draft atoms**: Created directly or promoted from change sets (mutable)
- **Committed atoms**: Immutable, versioned via intentIdentity chain
- **Scope filtering**: `?scope=main|proposed|all` (default: `all` for backward compatibility)

**Change Set Workflow**:
1. Reconciliation creates change set with proposed atoms
2. Team reviews and approves
3. Commit batch-commits all atoms and sets `promotedToMainAt`
4. Atoms now on Pact Main (canonical state)

### Drift Management (Phase 16)

**Core Principle**: Drift is not failure — it's an expected consequence of development velocity. The goal is to ensure drift is always **visible** and always **converging**.

**Truth Model**: Local = plausible, Canonical = true. Drift is measured against canonical reality only.

**Four Drift Types**:
- `orphan_test` - Test without `@atom` link
- `commitment_backlog` - Committed atom without passing test evidence
- `stale_coupling` - Test changed but atom link may be stale
- `uncovered_code` - Source file without any atom coverage

**CI Attestation** (Canonical Truth Gate):
- **Local reconciliation**: Advisory plausibility reports (no server state modification)
- **CI-attested reconciliation**: Updates canonical state, creates/updates drift debt records
- Only CI-attested runs prove reality

**Exception Lanes**:
- `normal` - 14-day convergence deadline (default)
- `hotfix-exception` - 3-day accelerated deadline (requires justification)
- `spike-exception` - 7-day exploratory deadline (requires justification)

**Convergence Policies**:
- Time-bounded deadlines enforce resolution
- Severity auto-escalates: medium (0d) → high (7d) → critical (14d)
- Project-level overrides via `ProjectSettings.driftPolicies`
- `blockOnOverdueDrift` option for build-blocking enforcement

**Drift Detection Flow**:
1. Reconciliation persist node calls `driftDetectionService.detectDriftFromRun(runId)`
2. Service checks `attestationType === 'ci-attested'` (gate)
3. If CI-attested: create/update/resolve drift debt records
4. If local: return advisory report, no DB writes
5. Store `DriftDetectionResult` in run metadata

## Local/Remote Split (Phase 17)

### ContentProvider Abstraction

**Purpose**: Decouple Pact from direct filesystem access, enabling remote deployment.

**Implementations**:
- **FilesystemContentProvider**: Co-located deployment (direct fs access)
- **PreReadContentProvider**: Remote deployment (client submits file content via API)
- **GitHubContentProvider**: Clone from GitHub via PAT, delegate to FilesystemContentProvider (Phase 20)
- **WriteProvider**: For apply service's @atom injection

**Deployment Models**:
| Model | Client | Server | Content Delivery | Truth Level |
|-------|--------|--------|------------------|-------------|
| A: Co-located | Same machine | Same machine | FilesystemContentProvider | Canonical if CI-attested |
| B: Local Client + Remote | VSCode ext / CLI | Remote server | Pre-read API | Local = plausible |
| C: CI/CD Pipeline | GitHub Action | Remote server | Pre-read API | Canonical (CI-attested) |
| D: GitHub Clone | Dashboard / CLI / MCP | Pact server | GitHubContentProvider | Canonical (default branch) |
| E: PactHub (future) | Multiple locals | Shared remote | CI pipelines | Canonical via CI |

**Model D** is the primary production model: Pact clones the configured GitHub repository at the default branch (or a specific commit) and reconciles against it. This is the canonical reconciliation path — atoms are only fully realized against the default branch.

### Client SDK (@pact/client-sdk)

**Features**:
- Zero NestJS dependencies (Node.js built-ins + fetch only)
- 99 passing tests
- Typed API client for all Pact endpoints
- Local file reading and manifest building
- Git integration (commit hashes, diffs, changed files)
- Coverage collection (Istanbul/c8/lcov)
- Patch application (@atom annotations)
- Main state caching (read-only, pull-only)
- Local reconciliation (advisory plausibility reports)

**Key Commands**:
```bash
pact pull          # Cache Pact Main state (read-only)
pact check         # Generate local reconciliation report (advisory)
pact apply         # Apply patches locally
```

**CI Integration**:
```typescript
const result = await client.reconciliation.analyzeWithPreReadContent({
  rootDirectory: process.cwd(),
  manifest,
  fileContents: contents,
  options: {
    mode: 'full',
    attestationType: 'ci-attested',  // Canonical update
    exceptionLane: 'normal',
  },
});
```

### Minimal Local State

**Philosophy**: Local state is ephemeral plausibility signals, not canonical truth.

**Files** (in `.pact/`, gitignored):
- `main-cache.json` - Cached Pact Main state (atoms, molecules, test links)
- `local-report.json` - Last local reconciliation report

**What Was Cut** (Deferred to PactHub Phase):
- Push sync (local overlays pushing recommendations to remote)
- Conflict detection/resolution (`duplicate_atom`, `overlapping_test_link`, `stale_snapshot` types)
- Bidirectional merge (`remote_wins`, `local_wins`, `merge`, `manual` resolution strategies)
- Rich overlay data model (`localAtomTestLinks`, `localTestResults`)
- Merged scope (mixing local + remote data in query results)

**Why This Works**: CI attestation is the single promotion gate, so local→remote sync is unnecessary until multi-tenant collaboration requires it.

## Running the System

### Development Workflow

```bash
# Run all unit tests
./scripts/test.sh

# Run in watch mode (for TDD workflow)
./scripts/test.sh --watch

# Run with coverage report
./scripts/test.sh --coverage

# Run end-to-end tests
./scripts/test.sh --e2e

# Run full CI test suite
./scripts/test.sh --ci

# Run test quality analyzer
./scripts/test.sh --quality

# Run test-atom coupling analysis
./scripts/test.sh --coupling
```

### Agent Evaluation

```bash
# Interview golden suite (25 scenarios)
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=interview

# Interview stochastic suite (3 scenarios, 5 runs each)
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=stochastic --agent=interview

# Reconciliation golden suite (15 fixtures)
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=reconciliation

# Property tests (invariants)
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=property

# Cost/latency budget tests
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=cost

# Update snapshots after intentional changes
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=golden --update-snapshots
```

### Results Location

All test and evaluation results centralized in `test-results/`:

```
test-results/
├── backend/unit/coverage/         # Backend unit test coverage
├── frontend/unit/coverage/        # Frontend unit test coverage
├── frontend/e2e/html-report/      # Playwright E2E reports
├── quality/
│   ├── quality-report.html        # Test quality analysis
│   └── coupling-report.json       # Test-atom coupling
└── agents/
    ├── evaluation-*.json          # Full evaluation reports
    ├── summary-*.json             # Pass/fail summaries
    └── golden/
        ├── interview-*.json       # Interview golden results
        └── reconciliation-*.json  # Reconciliation golden results
```

## Key Patterns and Best Practices

### Prompt Engineering

**Vocabulary Anchoring** (Interview Agent):
```
## Vocabulary Rules
- Use exact domain terminology from conversation
- If user says "edit", use "edit" not "modify"
- Description MUST include key domain noun (e.g., "appointment", "inventory", "bid")
- Do not paraphrase domain-specific terms into generic synonyms
```

**Category Decision Rules**:
```
## Category Decision Rules
- Default to "functional" unless atom is PRIMARILY about another category
- Use "security" ONLY for atoms protecting data, controlling access, or authenticating users
- Use "performance" ONLY for measurable latency/throughput targets
- When in doubt between "security" and "functional", choose "functional"
```

**No Atom Count Targets** (Removed):
- Previous: "Aim for 3-5 atoms"
- Now: Let count emerge naturally from conversation content
- Atomicity test: Split if "and" connects distinct behaviors
- Consolidation test: Keep only more specific if two atoms describe same behavior

### State Management

**Immutability**:
```typescript
// ❌ Bad
state.testCases.push(newTestCase);
return state;

// ✅ Good
return {
  testCases: [...state.testCases, newTestCase],
};
```

**Reducers**:
```typescript
const ReconciliationState = Annotation.Root({
  testFiles: Annotation<TestFile[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],  // Append
  }),
  atomRecommendations: Annotation<AtomRecommendation[]>({
    reducer: (existing, incoming) => incoming,  // Replace
  }),
});
```

### Error Handling

```typescript
try {
  const result = await llmService.generateStructured(prompt, schema);
  return { atomRecommendations: result };
} catch (error) {
  logger.error(`Atom inference failed: ${error.message}`);
  throw new Error(`Failed to infer atoms: ${error.message}`);
}
```

### Human-in-the-Loop

```typescript
if (requiresHumanReview) {
  throw new NodeInterrupt('Review required', { recommendations });
}
```

Resume with:
```typescript
await reconciliationService.submitReview(runId, userSelections);
```

## Architecture Decisions

### AD-1: JSON Parsing Strategy

**Decision**: Use layered parsing (prompt → standard → repair → fallback) instead of relying on LLM quality alone.

**Rationale**: LLMs are probabilistic. Even the best prompts occasionally produce malformed JSON. Recovery parser is a resilience mechanism, not a substitute for good prompting.

### AD-2: Category Ambiguity

**Decision**: Do not use human-in-the-loop for categorization. Expand matching logic to accept equivalent categories.

**Rationale**: Categories have genuine overlap. Asking humans to resolve ambiguity doesn't improve the system — it just shifts the judgment call.

### AD-3: Semantic Drift Prevention

**Decision**: Multi-pronged approach (prompt engineering + flexible assertions + vocabulary anchoring).

**Rationale**: Semantic drift is inherent to LLM systems. No single technique eliminates it. Make the system robust to reasonable variation.

### AD-4: Input Decomposition

**Decision**: Remove numeric atom count guidance. Let count emerge naturally from content.

**Rationale**: Numeric targets cause LLM to converge on that number regardless of input complexity. Better to instruct on when to split vs. combine.

### AD-5: Local vs Canonical Truth

**Decision**: Local = plausible, Canonical = true. Only CI-attested runs update canonical state.

**Rationale**: Eliminates need for push/pull sync, conflict resolution, and merged scopes. CI is the single promotion gate.

## Related Documentation

### Implementation Checklists
- [Phase 5: Reconciliation Agent](./implementation-checklist-phase5.md)
- [Phase 11: Interview Agent](./implementation-checklist-phase11.md)
- [Phase 12: Polish](./implementation-checklist-phase12.md)
- [Phase 13: Agent Testing](./implementation-checklist-phase13.md)
- [Phase 15: Pact Main Governance](./implementation-checklist-phase15.md)
- [Phase 16: Drift Management](./implementation-checklist-phase16.md)
- [Phase 17: Local/Remote Split](./implementation-checklist-phase17.md)
- [Interview Golden Tests](./implementation-checklist-interview-golden.md)

### Architecture Documentation
- [Agent Contracts](./architecture/agent-contracts.md) - Non-negotiable acceptance criteria
- [Evaluation Rubrics](./architecture/agent-evaluation-rubrics.md) - Scoring dimensions and critical failures

### Module READMEs
- [Agents Module](../src/modules/agents/README.md) - Overall agent architecture
- [Graphs](../src/modules/agents/graphs/README.md) - LangGraph architecture
- [Evaluation](../src/modules/agents/evaluation/README.md) - Evaluation framework
- [Client SDK](../packages/client-sdk/README.md) - Local/remote deployment
- [Test Results](../test-results/README.md) - Test result navigation

---

**Maintained By**: Pact Development Team
**Review Frequency**: After each phase completion
**Last Major Update**: Phase 17 completion (2026-02-05)
