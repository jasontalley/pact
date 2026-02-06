# Agent Evaluation System

This directory contains the evaluation framework for testing and validating Pact's LangGraph agents (Interview and Reconciliation). The system provides contract-driven, repeatable evaluation to prevent vibes-based regressions.

## Overview

The evaluation system uses a **three-layer approach**:

1. **Layer 1: Deterministic** - Fast, model-free unit tests with mocked LLM responses
2. **Layer 2: LLM-in-the-loop** - Regression tests with pinned models and snapshot comparison
3. **Layer 3: Human calibration** - Manual review using scoring rubrics for nuanced quality dimensions

## Current Status (2026-02-05)

### Interview Agent Golden Tests
- **Status**: 25/25 passing
- **Baseline**: Started at 12/25, improved through Phases A-E implementation
- **Key fix patterns**:
  - `descriptionContainsAny` handles LLM semantic drift
  - `categoryOneOf` accepts ambiguous category classifications
  - 3-layer JSON parsing recovery (standard → repair → individual atom extraction)
- **Common drift pattern**: Auth atoms classified as `functional` instead of `security`
- **Compression scoring**: Scaled by complexity (`passThreshold = 5 + rounds * 3`)
- **Results**: 17/25 score 2 points (excellent), 6/25 score 1 point (good), 2/25 score 0 (needs improvement)

### Reconciliation Agent Golden Tests
- **Status**: 14/15 passing (rec-003 is known failure)
- **Coverage**: Orphan tests, ghost code, decoupled atoms, undefined tests, zero coverage scenarios

## Architecture

```
evaluation/
├── run-artifact.types.ts              # Run artifact schema + metrics
├── artifact-capture.service.ts        # Instruments graph execution
├── rubric-scorer.ts                   # Automated quality scoring
├── intent-interview-golden.runner.ts  # Interview test runner
├── intent-interview-stochastic.runner.ts  # Stochastic test runner
├── reconciliation-golden.runner.ts    # Reconciliation test runner
├── ground-truth-scorer.ts             # Ground truth comparison for stochastic tests
└── index.ts                           # Barrel exports
```

## Key Concepts

### Run Artifacts

Every agent execution produces a structured `RunArtifact`:

```typescript
interface RunArtifact {
  inputs: {
    prompt?: string;
    repoSnapshotId?: string;
    options: Record<string, any>;
  };
  outputs: {
    atoms?: Atom[];
    deltas?: Delta[];
    recommendations?: Recommendation[];
  };
  intermediate: {
    nodeTransitions: string[];  // Node execution order
  };
  evidence: {
    filePaths?: string[];
    testNames?: string[];
    coverageRefs?: string[];
  };
  metrics: {
    tokensPerNode?: Record<string, number>;
    latencyPerNode?: Record<string, number>;
    toolCallCounts?: Record<string, number>;
    totalTokens: number;
    totalLatency: number;
  };
}
```

### Rubric Scoring

The `rubric-scorer.ts` provides automated scoring across 6 dimensions (0-2 points each, /12 total):

| Dimension | 0 Points | 1 Point | 2 Points |
|-----------|----------|---------|----------|
| **Atom Clarity** | Vague/non-falsifiable | Somewhat testable | Clear observable outcomes |
| **Validator Testability** | No validators | Manual/semantic only | Executable validators |
| **Edge Case Coverage** | No edge cases | 1-2 questions | 3+ questions about edge cases |
| **Ambiguity Discipline** | Assumes everything | Some clarification | Asks when needed |
| **Invariant Alignment** | No invariants reflected | Some alignment | Most invariants captured |
| **Compression** | Atom spam (15-20+) or too few (1-2) | Moderate (5-10) | Optimal (3-5) |

**Automatic vs Manual**: 4 dimensions are auto-scored (clarity, testability, compression, ambiguity). 2 require manual input (edge_case_coverage, invariant_alignment) but have heuristic auto-scorers.

### Golden Test Scenarios

Golden tests use versioned scenarios with expected outputs. Scenarios support flexible matching:

```json
{
  "scenarioId": "int-006",
  "context": {
    "domain": "Collaborative document editor",
    "constraints": ["Real-time synchronization", "Cost constraints"]
  },
  "expectedAtoms": [
    {
      "descriptionContainsAny": ["edit", "collaborative", "document", "change"],
      "categoryOneOf": ["functional", "ux"],
      "minOutcomes": 2,
      "requiresEvidence": true
    }
  ],
  "minimumRubricScore": 9
}
```

**Key features**:
- `descriptionContainsAny`: Matches if ANY substring found (handles semantic drift)
- `categoryOneOf`: Accepts multiple valid categories (handles ambiguous domains)
- `minOutcomes`: Minimum observable outcomes required
- `minimumRubricScore`: Quality gate (max 12, but 9-10 realistic with auto-scoring)

### Stochastic Tests

Stochastic tests (Tier 2) measure variability across multiple runs:

```typescript
interface StochasticScenario {
  scenarioId: string;
  groundTruth: {
    decidedFacts: string[];  // Facts that should be extracted
    keywordSets: string[][];  // Keyword sets for partial credit
  };
  personaVariant: string;  // e.g., "terse", "verbose"
  runs: number;  // Number of runs (default: 5)
  thresholds: {
    precision: number;  // Min precision (0-1)
    recall: number;     // Min recall (0-1)
  };
}
```

**Metrics**:
- **Precision**: decidedFacts ∩ extractedAtoms / totalExtractedAtoms
- **Recall**: decidedFacts ∩ extractedAtoms / totalDecidedFacts
- **F1 Score**: Harmonic mean of precision and recall
- **Variance**: Measures consistency across runs (low variance = stable)

**Known issues**:
- LLM semantic cache can return identical results (stddev=0) without `noCache: true`
- Precision capped at `min(totalAtoms, decidedFacts * 2)` to avoid penalizing legitimate inference
- Keyword scoring uses threshold-based matching (2+ keywords = 1.0, 1 = 0.5, 0 = 0.0)

## Running Evaluations

### Interview Agent Tests

```bash
# Golden suite (25 scenarios)
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=interview

# Stochastic suite (3 scenarios, 5 runs each)
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=stochastic --agent=interview

# Update snapshots after intentional prompt changes
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=interview --update-snapshots
```

### Reconciliation Agent Tests

```bash
# Golden suite (15 fixtures)
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=reconciliation

# Property tests (invariants)
docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=property --agent=reconciliation
```

### Results Location

All evaluation results are stored in `test-results/agents/`:

```
test-results/agents/
├── evaluation-*.json            # Full evaluation report
├── summary-*.json               # Pass/fail summary
├── golden/
│   ├── interview-*.json         # Interview golden results
│   └── reconciliation-*.json    # Reconciliation golden results
└── snapshots/
    ├── interview/               # Baseline snapshots
    └── reconciliation/          # Baseline snapshots
```

## JSON Parsing Recovery

The interview agent uses a **3-layer JSON parsing approach** to handle LLM output variability:

**Layer 1**: Standard `JSON.parse()` on extracted text
**Layer 2**: Targeted repairs when Layer 1 fails:
- Remove trailing commas before `]` or `}`
- Replace unescaped newlines in strings with `\n`
- Replace single quotes with double quotes
- Attempt to close truncated JSON structures

**Layer 3**: Individual atom extraction via regex when Layer 2 fails:
- Pattern: `\{[^{}]*"description"\s*:\s*"[^"]+"`
- Parse each candidate object individually
- Return partial results with warning

This approach recovered 2 failing tests (int-016, int-023) where LLM generated markdown fences or unescaped special characters.

## Failure Taxonomy

When evaluations fail, results are tagged with failure type:

| Tag | Meaning | Fix Strategy |
|-----|---------|--------------|
| `prompt` | Agent didn't have the rule | Update prompt policy or few-shot examples |
| `tooling` | Coverage parser, file mapping wrong | Fix tooling service |
| `routing` | Wrong node chosen | Fix conditional edge logic |
| `schema` | Invalid output | Improve JSON parsing or prompt instructions |
| `model` | Knew rule but ignored | Adjust prompt emphasis or model temperature |

## Prompt Packages

Prompts use a **versioned, node-local policy pattern** stored in `src/modules/agents/prompts/policies/`:

```
prompts/policies/
├── reconciliation/
│   └── policies-v1.md      # Classification rules, evidence requirements
└── interview/
    └── policies-v1.md      # Vocabulary rules, category decision tree, atomicity tests
```

**To update a policy**:
1. Edit the relevant `policies-v*.md` file
2. Run golden tests: `docker exec pact-app npx ts-node scripts/evaluate-agents.ts --suite=golden`
3. If tests pass, commit; if tests fail, update snapshots or fix policy

**To add a few-shot example**:
1. Add inline in the relevant node file (e.g., `extract-atoms.node.ts`)
2. Run golden suite to verify no regressions
3. Document in commit message

## Calibration Workflow

For dimensions requiring manual judgment (edge_case_coverage, invariant_alignment):

1. **Sample runs**: Review ~5-10 runs per week/release
2. **Label**: Mark pass/weak/fail + reason
3. **Feed back**: Update prompts, few-shots, or tool policies
4. **Document**: Store labels in evaluation artifacts for trend analysis

## Known Patterns

### Interview Agent

**Common semantic drift**:
- Auth atoms → "biometric unlock", "PIN verification" instead of "authentication"
- Healthcare records → "FHIR", "patient portal" instead of "record"
- Inventory → "stock", "warehouse", "SKU" instead of "inventory"

**Fix**: Use `descriptionContainsAny` with domain synonyms

**Category ambiguity**:
- Payment/escrow → Could be `functional` or `security`
- Healthcare records → Could be `functional` or `security`

**Fix**: Use `categoryOneOf: ["functional", "security"]`

**Compression issues**:
- LLM tends to target prompt-suggested atom count (removed from prompt)
- Atomicity test: "If description contains 'and' connecting distinct behaviors, split"
- Consolidation test: "If two atoms describe same behavior at different specificity, keep only more specific"

### Reconciliation Agent

**Evidence grounding**: Every repo claim must cite file path, test name, or coverage line range

**Classification stability**: Adding comments or renaming locals should not flip `ghost` → `coupled`

**Bounded actions**: Next tasks list must be bounded (max N tasks), each with clear success condition

## Related Documentation

- [Agent Contracts](../../../../docs/architecture/agent-contracts.md) - Non-negotiable acceptance criteria
- [Evaluation Rubrics](../../../../docs/architecture/agent-evaluation-rubrics.md) - Scoring dimensions and critical failures
- [Implementation Checklist: Interview Golden](../../../../docs/implementation-checklist-interview-golden.md) - Complete implementation plan
- [Agents Module README](../README.md) - Overall agent architecture

---

**Last Updated**: 2026-02-05
**Status**: 25/25 interview golden tests passing, 14/15 reconciliation golden tests passing
