# Intent Refinement Service Architecture

**Module**: `src/modules/agents/intent-refinement.service.ts`
**Version**: 1.0
**Last Updated**: 2026-01-21

---

## Overview

The `IntentRefinementService` provides AI-powered iterative refinement of Intent Atoms. It transforms vague, compound, or poorly-formed intents into atomic, testable specifications through a feedback-driven process.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        IntentRefinementService                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────────┐    ┌────────────────────┐    │
│  │ analyzeIntent│───▶│ AtomicityChecker │───▶│ Quality Preview    │    │
│  └──────────────┘    └──────────────────┘    └────────────────────┘    │
│         │                    │                        │                 │
│         ▼                    ▼                        ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    IntentAnalysisResult                           │  │
│  │  • atomicity: atomic | non-atomic | ambiguous                     │  │
│  │  • confidence: 0-1                                                │  │
│  │  • violations: string[]                                           │  │
│  │  • clarifyingQuestions: string[]                                  │  │
│  │  • decompositionSuggestions: string[]                             │  │
│  │  • precisionImprovements: string[]                                │  │
│  │  • qualityPreview: { estimatedScore, decision }                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────┐    ┌───────────────────┐                        │
│  │ suggestRefinements│───▶│ RefinementSuggestion[]                      │
│  └───────────────────┘    │  • type: clarification | decomposition |   │
│                           │         precision | rewrite                 │
│                           │  • suggested: string                        │
│                           │  • reasoning: string                        │
│                           │  • confidence: 0-1                          │
│                           └───────────────────┘                        │
│                                                                          │
│  ┌──────────────┐    ┌────────────────┐    ┌────────────────────┐      │
│  │  refineAtom  │───▶│ Update Atom    │───▶│ Re-evaluate Quality│      │
│  └──────────────┘    │ + History      │    └────────────────────┘      │
│                      └────────────────┘                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Intent Analysis (`analyzeIntent`)

Analyzes raw intent text for atomicity and quality.

**Input**: Raw intent description string

**Process**:
1. Run `AtomicityCheckerService.checkAtomicity()` with heuristics
2. Generate clarifying questions based on violations
3. Generate decomposition suggestions for compound intents
4. Generate precision improvements for vague criteria
5. Preview quality score using `AtomQualityService`

**Output**: `IntentAnalysisResult` with:
- `atomicity`: Classification (`atomic`, `non-atomic`, `ambiguous`)
- `confidence`: 0-1 score
- `violations`: List of issues found
- `clarifyingQuestions`: Questions to resolve ambiguity
- `decompositionSuggestions`: Suggested atom splits
- `precisionImprovements`: Ways to add measurable criteria
- `qualityPreview`: Estimated score and decision

### 2. Suggestion Generation (`suggestRefinements`)

Generates actionable refinement suggestions.

**Suggestion Types**:

| Type | When Generated | Example |
|------|----------------|---------|
| `clarification` | Ambiguous terms detected | "Define 'fast' as a specific time" |
| `decomposition` | Compound intent (and/or) | Split into separate atoms |
| `precision` | Missing measurements | Add "within 5 seconds" |
| `rewrite` | Implementation-specific | Remove technology terms |

**LLM Enhancement**: When LLM is available, AI-powered suggestions supplement heuristic-based ones.

### 3. Refinement Application (`refineAtom`)

Applies refinements to existing draft atoms.

**Process**:
1. Validate atom exists and is in `draft` status
2. Interpret feedback (direct replacement or AI interpretation)
3. Create `RefinementRecord` with timestamp, before/after
4. Update atom description
5. Append to `refinementHistory`
6. Re-evaluate quality score
7. Save and return result

**Constraints**:
- Only `draft` atoms can be refined
- Refinement history is immutable (append-only)
- Each refinement triggers quality re-evaluation

## Data Structures

### IntentAnalysisResult

```typescript
interface IntentAnalysisResult {
  atomicity: 'atomic' | 'non-atomic' | 'ambiguous';
  confidence: number;  // 0-1
  violations: string[];
  clarifyingQuestions: string[];
  decompositionSuggestions: string[];
  precisionImprovements: string[];
  qualityPreview?: {
    estimatedScore: number;  // 0-100
    decision: 'approve' | 'revise' | 'reject';
  };
}
```

### RefinementSuggestion

```typescript
interface RefinementSuggestion {
  id: string;
  type: 'clarification' | 'decomposition' | 'precision' | 'rewrite';
  original: string;
  suggested: string;
  reasoning: string;
  confidence: number;  // 0-1
}
```

### RefinementRecord

```typescript
interface RefinementRecord {
  timestamp: Date;
  feedback: string;        // User input that triggered refinement
  previousDescription: string;
  newDescription: string;
  source: 'user' | 'ai' | 'system';
}
```

## Dependencies

| Service | Purpose | Optional |
|---------|---------|----------|
| `AtomRepository` | CRUD operations on atoms | No |
| `AtomicityCheckerService` | Heuristic + LLM atomicity analysis | No |
| `AtomQualityService` | Quality score calculation | No |
| `LLMService` | AI-powered suggestions | Yes |

## API Endpoints

The service is exposed via `AtomsController`:

| Endpoint | Method | Service Method |
|----------|--------|----------------|
| `/atoms/analyze` | POST | `analyzeIntent()` |
| `/atoms/:id/suggest-refinements` | POST | `suggestRefinements()` |
| `/atoms/:id/refine` | POST | `refineAtom()` |
| `/atoms/:id/refinement-history` | GET | `getRefinementHistory()` |

## Usage Examples

### Analyze Raw Intent

```typescript
const result = await intentRefinementService.analyzeIntent(
  'Users should be able to login quickly and securely'
);

// Result:
// {
//   atomicity: 'non-atomic',
//   confidence: 0.85,
//   violations: ['Single Responsibility: Found compound conjunction'],
//   clarifyingQuestions: ['What defines "quickly"?'],
//   decompositionSuggestions: [
//     'Users should be able to login quickly',
//     'Users should be able to login securely'
//   ],
//   precisionImprovements: ['Add specific time constraint'],
//   qualityPreview: { estimatedScore: 45, decision: 'reject' }
// }
```

### Refine Atom with Feedback

```typescript
const result = await intentRefinementService.refineAtom(
  'IA-001',
  'Make it more specific with a 3 second timeout'
);

// Result:
// {
//   success: true,
//   atom: {
//     id: '...',
//     atomId: 'IA-001',
//     description: 'User login must complete within 3 seconds',
//     qualityScore: 78
//   },
//   previousDescription: 'Users should be able to login quickly',
//   refinementRecord: { ... },
//   newQualityScore: 78,
//   message: 'Atom IA-001 refined successfully. Refinement count: 1'
// }
```

## Error Handling

| Error | Condition | HTTP Status |
|-------|-----------|-------------|
| `NotFoundException` | Atom not found | 404 |
| `Error` | Refining non-draft atom | 400 |
| LLM timeout | LLM unavailable | Graceful degradation |

## Performance Considerations

- **Heuristics-first**: Always run fast heuristics before LLM
- **LLM timeout**: 30-second default timeout for LLM calls
- **Caching**: Quality preview results cached during analysis
- **Batch operations**: Multiple suggestions generated in single LLM call

## Cross-References

- [Atomicity Checker Architecture](./atomicity-checker.md)
- [Quality Validation](../user-guide/refinement-workflow.md)
- [Atom Entity](../schema.md#1-atoms)
