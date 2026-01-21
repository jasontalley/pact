# Atomicity Checker Service Architecture

**Module**: `src/modules/agents/atomicity-checker.service.ts`
**Version**: 1.0
**Last Updated**: 2026-01-21

---

## Overview

The `AtomicityCheckerService` evaluates whether an intent description represents an atomic behavioral primitive. It uses a hybrid approach combining fast deterministic heuristics with optional deep LLM analysis.

## Design Philosophy

Intent Atoms must be:
- **Observable**: External effects can be verified
- **Falsifiable**: Can be proven wrong with specific conditions
- **Implementation-agnostic**: Describes WHAT, not HOW
- **Atomic**: Single responsibility, not compound

The checker validates these properties through five heuristic dimensions plus optional LLM analysis.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      AtomicityCheckerService                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                        ┌──────────────────────┐                         │
│                        │   checkAtomicity()   │                         │
│                        └──────────┬───────────┘                         │
│                                   │                                      │
│            ┌──────────────────────┼──────────────────────┐              │
│            ▼                      ▼                      ▼              │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐       │
│  │   Heuristic     │   │   Heuristic     │   │   Heuristic     │       │
│  │   Checks (5)    │   │   Scoring       │   │   Suggestions   │       │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘       │
│           │                     │                     │                 │
│           ▼                     ▼                     ▼                 │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │                    Heuristic Result                          │       │
│  │    totalScore / maxScore = heuristicConfidence               │       │
│  └──────────────────────────┬──────────────────────────────────┘       │
│                              │                                          │
│                              ▼                                          │
│                   ┌────────────────────┐                               │
│                   │  useLLM = true?    │                               │
│                   └─────────┬──────────┘                               │
│                             │                                           │
│              ┌──────────────┼──────────────┐                           │
│              │ No           │              │ Yes                        │
│              ▼              │              ▼                            │
│   ┌─────────────────┐       │   ┌─────────────────────┐                │
│   │ Return heuristic│       │   │ LLM Deep Analysis   │                │
│   │ result only     │       │   │ • behavioralComplete│                │
│   └─────────────────┘       │   │ • testabilityScore  │                │
│                             │   │ • ambiguityScore    │                │
│                             │   └──────────┬──────────┘                │
│                             │              │                            │
│                             │              ▼                            │
│                             │   ┌─────────────────────┐                │
│                             │   │ Combined Confidence │                │
│                             │   │ 60% heuristic +     │                │
│                             │   │ 40% LLM             │                │
│                             │   └──────────┬──────────┘                │
│                             │              │                            │
│                             └──────────────┴────────────────────────▶  │
│                                                                          │
│                           ┌───────────────────┐                         │
│                           │  AtomicityResult  │                         │
│                           └───────────────────┘                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Five Heuristic Dimensions

Each heuristic is scored independently (0-20 points, 100 total possible):

### 1. Single Responsibility (20 pts)

**Purpose**: Detect compound behaviors that should be split.

**Detection**:
- Compound conjunctions: `and`, `or`, `also`, `as well as`, `along with`, `plus`
- Only flagged when conjunction appears mid-sentence (not in phrases like "login and password")

**Scoring**:
- 0 conjunctions: 20 pts (pass)
- 1 conjunction: 10 pts (fail)
- 2+ conjunctions: 0 pts (fail)

**Example Violations**:
- "User can login **and** reset password" → Split into 2 atoms
- "System must validate **or** reject input" → Clarify which behavior

### 2. Observable Outcome (20 pts)

**Purpose**: Ensure behavior can be verified externally.

**Detection**:
- Observable verbs: `display`, `show`, `return`, `send`, `receive`, `respond`, `output`, `emit`, `notify`, `produce`, `generate`, `create`, `present`, `render`, `log`
- Observable patterns: "user can see/verify/observe", "system will display/show/return"

**Scoring**:
- 1+ observable indicators: 10-20 pts (pass)
- 0 indicators: 0 pts (fail)

**Example Violations**:
- "System processes data efficiently" → No observable effect mentioned
- "User authentication is secure" → What does the user see?

### 3. Implementation-Agnostic (20 pts)

**Purpose**: Prevent technology coupling in intent descriptions.

**Detection - Technology Terms**:
```
sql, database, api, http, https, rest, graphql, redis, postgres, mysql, mongo,
kafka, rabbitmq, jwt, oauth, docker, kubernetes, aws, azure, gcp, lambda, s3,
elasticsearch, json, xml, csv, tcp, udp, websocket, grpc
```

**Detection - Implementation Phrases**:
```
using, via, through, by calling, by invoking, by querying, implemented with,
stored in, cached in, fetched from
```

**Scoring**:
- 0 violations: 20 pts (pass)
- Each term: -5 pts
- Minimum: 0 pts

**Example Violations**:
- "User data is **stored in PostgreSQL**" → Remove "stored in PostgreSQL"
- "API returns **JSON** response" → "System returns structured data"

### 4. Measurable Criteria (20 pts)

**Purpose**: Ensure testable success conditions.

**Positive Detection - Measurable Indicators**:
```
within, less than, more than, at least, at most, exactly, between,
maximum, minimum, percent, %, seconds, minutes, milliseconds, bytes, times, attempts
```

**Negative Detection - Vague Qualifiers**:
```
fast, slow, quick, efficient, good, bad, better, proper, appropriate,
adequate, reasonable, sufficient, usually, sometimes, often, might, could,
possibly, probably
```

**Scoring**:
- Net score = measurable count - vague count
- Base: 10 pts + (net × 5)
- Range: 0-20 pts

**Example Violations**:
- "System should be **fast**" → "System responds **within 200ms**"
- "Usually **works well**" → Remove vague terms, add measurements

### 5. Reasonable Scope (20 pts)

**Purpose**: Detect intents too broad or too narrow.

**Too Broad Detection**:
- Keywords: `all`, `every`, `any`, `entire`, `whole`, `complete system`, `everything`, `always`, `never`
- Word count > 50

**Too Narrow Detection**:
- Keywords: `specific field`, `single character`, `one pixel`, `exact byte`, `only on tuesdays`
- Word count < 5

**Scoring**:
- Neither too broad nor narrow: 20 pts (pass)
- Either violation: 5 pts (fail)

**Example Violations**:
- "**All** users can do **everything**" → Too broad
- "Button is blue" → Too narrow (trivial)

## LLM Deep Analysis

When `useLLM: true` and LLM service is available:

### LLM Evaluation Dimensions

| Dimension | Score Range | Description |
|-----------|-------------|-------------|
| `behavioralCompleteness` | 0-1 | Does it describe a complete, self-contained behavior? |
| `testabilityAssessment` | 0-1 | Can this be tested with a single test case? |
| `ambiguityScore` | 0-1 | How ambiguous is the language? (0=clear, 1=ambiguous) |

### Confidence Combination

```
llmConfidence = (behavioralCompleteness + testabilityAssessment + (1 - ambiguityScore)) / 3
finalConfidence = (heuristicConfidence × 0.6) + (llmConfidence × 0.4)
```

### LLM Override Rules

- If `llmConfidence > 0.8` AND `violations ≤ 1`: Force `isAtomic = true`
- If `llmConfidence < 0.4`: Force `isAtomic = false`

## Data Structures

### AtomicityResult

```typescript
interface AtomicityResult {
  isAtomic: boolean;
  confidence: number;  // 0-1, rounded to 2 decimals
  violations: string[];
  suggestions: string[];
  heuristicScores: {
    singleResponsibility: HeuristicScore;
    observableOutcome: HeuristicScore;
    implementationAgnostic: HeuristicScore;
    measurableCriteria: HeuristicScore;
    reasonableScope: HeuristicScore;
  };
  llmAnalysis?: LLMAtomicityAnalysis;
}
```

### HeuristicScore

```typescript
interface HeuristicScore {
  passed: boolean;
  score: number;      // 0 to maxScore
  maxScore: number;   // Always 20
  feedback: string;   // Human-readable explanation
}
```

### LLMAtomicityAnalysis

```typescript
interface LLMAtomicityAnalysis {
  behavioralCompleteness: number;  // 0-1
  testabilityAssessment: number;   // 0-1
  ambiguityScore: number;          // 0-1 (lower is better)
  reasoning: string;               // LLM explanation
}
```

## Usage Examples

### Basic Heuristic Check

```typescript
const result = await atomicityChecker.checkAtomicity(
  'User authentication must complete within 2 seconds'
);

// Result:
// {
//   isAtomic: true,
//   confidence: 0.9,
//   violations: [],
//   suggestions: [],
//   heuristicScores: {
//     singleResponsibility: { passed: true, score: 20, maxScore: 20, feedback: '...' },
//     observableOutcome: { passed: true, score: 20, maxScore: 20, feedback: '...' },
//     implementationAgnostic: { passed: true, score: 20, maxScore: 20, feedback: '...' },
//     measurableCriteria: { passed: true, score: 20, maxScore: 20, feedback: '...' },
//     reasonableScope: { passed: true, score: 20, maxScore: 20, feedback: '...' }
//   }
// }
```

### Compound Intent Detection

```typescript
const result = await atomicityChecker.checkAtomicity(
  'User can login and reset password and view dashboard'
);

// Result:
// {
//   isAtomic: false,
//   confidence: 0.4,
//   violations: [
//     'Single Responsibility: Found 2 compound conjunction(s) suggesting multiple behaviors'
//   ],
//   suggestions: [
//     'Consider splitting this intent into multiple atoms, one for each distinct behavior.'
//   ],
//   heuristicScores: {
//     singleResponsibility: { passed: false, score: 0, maxScore: 20, feedback: '...' },
//     // ...
//   }
// }
```

### With LLM Analysis

```typescript
const result = await atomicityChecker.checkAtomicity(
  'Password reset tokens must expire exactly 15 minutes after generation',
  { useLLM: true }
);

// Result includes llmAnalysis:
// {
//   isAtomic: true,
//   confidence: 0.92,
//   llmAnalysis: {
//     behavioralCompleteness: 0.95,
//     testabilityAssessment: 0.98,
//     ambiguityScore: 0.05,
//     reasoning: 'Clear, testable behavior with specific time constraint'
//   }
// }
```

## Performance Characteristics

| Operation | Typical Time | Notes |
|-----------|--------------|-------|
| Heuristics only | 1-5ms | No I/O, pure computation |
| With LLM | 500-3000ms | Depends on LLM latency |
| LLM timeout | 30000ms | Graceful fallback to heuristics |

## Configuration

The service accepts optional `LLMService` via dependency injection:

```typescript
constructor(@Optional() private readonly llmService?: LLMService) {}
```

When `LLMService` is not provided:
- `useLLM: true` is ignored
- Only heuristic analysis runs
- No degradation in core functionality

## Word Lists Reference

All word lists are defined as constants at module level:

| Constant | Count | Purpose |
|----------|-------|---------|
| `COMPOUND_CONJUNCTIONS` | 6 | Detect multiple responsibilities |
| `OBSERVABLE_VERBS` | 15 | Detect externally observable actions |
| `TECH_IMPLEMENTATION_TERMS` | 32 | Detect technology coupling |
| `IMPLEMENTATION_PHRASES` | 10 | Detect "how" instead of "what" |
| `MEASURABLE_INDICATORS` | 18 | Detect quantifiable criteria |
| `VAGUE_QUALIFIERS` | 17 | Detect non-measurable terms |
| `TOO_BROAD_INDICATORS` | 9 | Detect overly broad scope |
| `TOO_NARROW_INDICATORS` | 5 | Detect trivially narrow scope |

## Cross-References

- [Intent Refinement Architecture](./intent-refinement.md)
- [Quality Validation Service](../user-guide/refinement-workflow.md)
- [Test Quality Standards](../../ingest/test-quality.md)
