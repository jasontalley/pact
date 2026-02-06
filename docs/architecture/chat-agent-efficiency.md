# Chat Agent Efficiency Improvements

## Executive Summary

Analysis of LangSmith trace `e34d0bb8-d61b-47b4-a388-3a271f9d096d` revealed that the chat agent successfully answered a coverage question but used **118K tokens ($0.16)** and **86 seconds** due to structural inefficiencies in context management. This document outlines a comprehensive redesign to reduce token usage by 60-70% while maintaining accuracy.

---

## Current Architecture Analysis

### System Flow

```
User Query → Plan Node → Search Node ↔ Analyze Node → Synthesize Node → Response
                              ↑______________|
                           (loop until ready)
```

### Token Distribution (from trace)

| Node | Calls | Tokens | % of Total |
|------|-------|--------|------------|
| Search | 5 | 97,292 | 82% |
| Analyze | 5 | 13,760 | 12% |
| Synthesize | 1 | 6,306 | 5% |
| Plan | 1 | 789 | 1% |

**Key insight**: Search node dominates token usage. Input tokens grow from 15K → 21K per iteration as context accumulates.

---

## Root Cause Analysis

### Issue 1: Append-Only State Reducers

**Location**: `src/modules/agents/graphs/types/base-state.ts`

```typescript
findings: Annotation<Finding[]>({
  reducer: (current, update) => [...current, ...update],  // Always grows
})
messages: Annotation<BaseMessage[]>({
  reducer: (current, update) => [...current, ...update],  // Always grows
})
```

**Impact**: Context only grows, never shrinks. Once a large file is read, it pollutes all subsequent LLM calls.

### Issue 2: Full Content in Prompts

**Location**: `src/modules/agents/graphs/nodes/search.node.ts:935-939`

```typescript
const findingsInfo = allFindings.length > 0
  ? allFindings.map((f) => `- ${f.source}: ${f.relevance}`).join('\n')
  : 'None yet';
```

**Location**: `src/modules/agents/graphs/nodes/synthesize.node.ts:126`

```typescript
lines.push(finding.content);  // Full content, no truncation
```

**Impact**: Directory listings (~500 bytes each) and file contents (~2KB each) accumulate. With 10+ findings, this alone can be 20K+ tokens.

### Issue 3: No Early Termination

**Location**: `src/modules/agents/graphs/nodes/analyze.node.ts:150-157`

The analyze node always calls the LLM to decide if complete, even when:
- Evidence level is already 4 (computed facts)
- Computed facts contain the specific data needed
- The question is a simple lookup

**Impact**: Wasted LLM calls (~2.8K tokens each) when deterministic rules would suffice.

### Issue 4: High Context Limit

**Location**: `src/modules/agents/graphs/nodes/search.node.ts:720`

```typescript
const maxContextChars = options.maxContextChars ?? 100000; // ~25K tokens
```

**Impact**: Truncation doesn't kick in until very late. Most runs never trigger it.

### Issue 5: Re-Planning Every Query

The plan node runs for every query, even simple ones. For "What's the test coverage?", the plan is predictable:
- Look in `test-results/` or `coverage/`
- Read `coverage-summary.json`

**Impact**: 11 seconds and 789 tokens for predictable routing.

---

## Proposed Architecture

### New System Flow

```
User Query → Query Classifier
                 │
    ┌────────────┼────────────┐
    ↓            ↓            ↓
Fast Path   Standard Path   Complex Path
(coverage)  (exploration)   (multi-step)
    │            │            │
    ↓            ↓            ↓
Deterministic  Plan →       Plan →
Extraction     Search ↔     Search ↔
    │          Analyze      Analyze →
    │            │          Refine
    └────────────┴────────────┘
                 │
                 ↓
          Compact Synthesis
                 │
                 ↓
             Response
```

---

## Implementation Plan

### Phase 1: Finding Compaction (High Impact, Medium Effort)

**Goal**: Replace raw content with compact summaries after iteration 2.

#### 1.1 Add CompactFinding Type

```typescript
// src/modules/agents/graphs/types/base-state.ts

interface CompactFinding {
  source: string;
  type: 'directory' | 'file' | 'search' | 'computed';
  summary: string;           // Max 200 chars
  facts?: Record<string, unknown>;  // Extracted data points
  confidence: number;
}
```

#### 1.2 Add Finding Summarization Function

```typescript
// src/modules/agents/graphs/utils/finding-compactor.ts

function compactFinding(finding: Finding): CompactFinding {
  // For computed facts - keep facts, summarize content
  if (finding.computedFacts) {
    return {
      source: finding.source,
      type: 'computed',
      summary: `Computed: ${Object.keys(finding.computedFacts).join(', ')}`,
      facts: finding.computedFacts,
      confidence: finding.confidence ?? 1,
    };
  }

  // For parsed JSON - extract key facts
  if (finding.parseMetadata?.parseSuccess) {
    return {
      source: finding.source,
      type: 'file',
      summary: finding.parseMetadata.schemaSummary || 'Parsed JSON',
      facts: extractKeyFacts(finding),
      confidence: finding.confidence ?? 0.9,
    };
  }

  // For directory listings - count items
  if (finding.relevance.includes('Directory')) {
    const itemCount = finding.content.split('\n').length;
    return {
      source: finding.source,
      type: 'directory',
      summary: `Directory with ${itemCount} items`,
      confidence: 1,
    };
  }

  // For raw content - truncate aggressively
  return {
    source: finding.source,
    type: 'file',
    summary: finding.content.slice(0, 200) + '...',
    confidence: finding.confidence ?? 0.5,
  };
}
```

#### 1.3 Modify Search Node to Compact After Iteration 2

```typescript
// In search.node.ts, after tool execution

if (state.iteration >= 2) {
  // Compact findings to reduce context size
  const compactedFindings = state.findings.map(compactFinding);
  // Only keep full content for last 3 findings
  // ... implementation
}
```

**Expected Impact**: 40-50% reduction in search node tokens.

---

### Phase 2: Context Window Management (High Impact, Medium Effort)

#### 2.1 Lower Default Context Limit

```typescript
// search.node.ts:720
const maxContextChars = options.maxContextChars ?? 50000; // Was 100000
```

#### 2.2 Add Message Summarization (Not Just Truncation)

```typescript
// src/modules/agents/graphs/utils/message-compactor.ts

function compactMessages(messages: BaseMessage[], maxChars: number): BaseMessage[] {
  // If under limit, return as-is
  if (calculateSize(messages) <= maxChars) {
    return messages;
  }

  // Step 1: Summarize tool results older than last 3
  // Step 2: Keep only summary for messages beyond threshold
  // Step 3: Always keep: first message (task), last 3 messages
}
```

#### 2.3 Deduplicate Findings by Source

```typescript
// In base-state.ts, modify reducer

findings: Annotation<Finding[]>({
  reducer: (current, update) => {
    // Dedupe by source, keeping newest
    const map = new Map<string, Finding>();
    for (const f of [...current, ...update]) {
      const existing = map.get(f.source);
      // Keep the one with higher evidence level
      if (!existing || getEvidenceLevel(f) > getEvidenceLevel(existing)) {
        map.set(f.source, f);
      }
    }
    return Array.from(map.values());
  },
})
```

**Expected Impact**: 20-30% reduction across all nodes.

---

### Phase 3: Early Termination Heuristics (Medium Impact, Low Effort)

#### 3.1 Add Deterministic Completion Checks

```typescript
// analyze.node.ts, before LLM call

// Fast path: If we have computed facts with the answer data, complete immediately
if (state.evidenceLevel >= 4) {
  const hasAnswerData = checkComputedFactsForAnswer(state.input, state.findings);
  if (hasAnswerData) {
    config.logger?.log('Early termination: computed facts contain answer');
    return {
      isComplete: true,
      analysisDecision: 'ready_to_answer' as AnalyzeDecisionType,
    } as Partial<TState>;
  }
}

// Fast path: Coverage questions with metrics
if (isCoverageQuestion(state.input) && hasCompleteCoverageMetrics(state.findings)) {
  return {
    isComplete: true,
    analysisDecision: 'ready_to_answer' as AnalyzeDecisionType,
  } as Partial<TState>;
}
```

#### 3.2 Pattern Detection for Common Questions

```typescript
function isCoverageQuestion(input: string): boolean {
  const patterns = [
    /coverage/i,
    /test.*percent/i,
    /code.*coverage/i,
    /how much.*tested/i,
  ];
  return patterns.some(p => p.test(input));
}

function hasCompleteCoverageMetrics(findings: Finding[]): boolean {
  return findings.some(f =>
    f.computedFacts?.lines !== undefined ||
    f.computedFacts?.statements !== undefined
  );
}
```

**Expected Impact**: 1-2 fewer iterations for pattern-matched queries (saves ~20K tokens).

---

### Phase 4: Tool Quality Routing (Medium Impact, Medium Effort)

#### 4.1 Enhance Tool Quality Signals

Already implemented in `search.node.ts`:
- `ToolResultQuality`: ok, partial, truncated, wrong_target, unreadable, error
- `ToolResultSignals`: isTruncated, bytesSeen, parseAttempted, parseSuccess

#### 4.2 Add Smart Retry Logic

```typescript
// In search node, after tool execution

if (quality === 'truncated' && toolName === 'read_file') {
  // Suggest using read_json or read_coverage_report instead
  config.logger?.log(`Truncated file read - suggesting structured reader`);
  newLimitations.push(
    `${args.file_path} was truncated. Use read_json or read_coverage_report for full data.`
  );
}

if (quality === 'unreadable' && signals.parseAttempted && !signals.parseSuccess) {
  // JSON parse failed - might be LCOV or other format
  config.logger?.log(`JSON parse failed - trying alternate parser`);
  // Add suggestion to use read_coverage_report
}
```

#### 4.3 Auto-Route Based on File Extension

```typescript
// In search node prompt generation

function suggestToolForFile(filePath: string): string {
  if (filePath.match(/coverage.*\.json$/i)) return 'read_coverage_report';
  if (filePath.endsWith('.json')) return 'read_json';
  if (filePath.endsWith('.lcov') || filePath.endsWith('.info')) return 'read_coverage_report';
  return 'read_file';
}
```

**Expected Impact**: Fewer iterations due to better tool selection (saves ~15K tokens).

---

### Phase 5: Fast-Path Micro-Graphs (High Impact, High Effort)

For common query patterns, bypass the full ReAct loop.

#### 5.1 Coverage Fast Path

```typescript
// src/modules/agents/graphs/graphs/coverage-fast.graph.ts

export function createCoverageFastGraph(config: NodeConfig) {
  // No planning - deterministic file discovery
  // 1. List test-results/ and coverage/ directories
  // 2. Find coverage-summary.json or similar
  // 3. Use read_coverage_report tool
  // 4. Return structured metrics

  return new StateGraph(CoverageFastState)
    .addNode('discover', discoverCoverageFiles)
    .addNode('extract', extractCoverageMetrics)
    .addNode('format', formatCoverageResponse)
    .addEdge(START, 'discover')
    .addEdge('discover', 'extract')
    .addEdge('extract', 'format')
    .addEdge('format', END)
    .compile();
}
```

#### 5.2 Query Router

```typescript
// src/modules/agents/chat-agent.service.ts

private routeQuery(message: string): 'fast-coverage' | 'fast-deps' | 'standard' {
  if (isCoverageQuestion(message)) return 'fast-coverage';
  if (isDependencyQuestion(message)) return 'fast-deps';
  return 'standard';
}

async chat(request: ChatRequestDto): Promise<ChatResponseDto> {
  const route = this.routeQuery(request.message);

  switch (route) {
    case 'fast-coverage':
      return this.chatWithCoverageFastPath(request, session);
    case 'fast-deps':
      return this.chatWithDepsFastPath(request, session);
    default:
      return this.chatWithGraph(request, session, startTime);
  }
}
```

**Expected Impact**: 80%+ reduction for pattern-matched queries (e.g., coverage: ~5K tokens instead of ~118K).

#### 5.3 Graceful Fallback Mechanism

When a fast-path graph completes but fails to find the requested data, it must fall back to the standard ReAct loop for more thorough exploration.

```typescript
// src/modules/agents/chat-agent.service.ts

private async chatWithCoverageFastPath(
  request: ChatRequestDto,
  session: ChatSession,
  startTime: number,
): Promise<ChatResponseDto> {
  try {
    const result = await this.graphRegistry.invoke<
      { input: string },
      CoverageFastStateType
    >('coverage-fast', { input: request.message });

    // Check if fast-path found actual coverage data
    // If not, fall back to standard graph for more thorough exploration
    const hasData = result.metrics && !result.error;

    if (!hasData) {
      this.logger.warn(
        `Coverage fast-path found no data: ${result.error || 'no metrics'}. ` +
        `Falling back to standard graph.`
      );
      return this.chatWithGraph(request, session, startTime);
    }

    // Fast-path succeeded, return result
    return { sessionId: session.id, message: result.output };
  } catch (error) {
    // Exception handling: also fall back to standard graph
    this.logger.error(`Coverage fast-path error: ${error.message}`);
    return this.chatWithGraph(request, session, startTime);
  }
}
```

**Fallback Triggers**:

- `result.error` is set (e.g., "No coverage files found in standard locations")
- `result.metrics` is null or undefined
- Graph throws an exception

**Rationale**: The fast-path is optimized for common cases (coverage files in standard locations). When coverage files are in non-standard locations, the standard ReAct loop with its full exploration capabilities can find them through iterative search.

---

## Implementation Priority

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| Phase 1: Finding Compaction | Medium | High (40-50%) | P0 |
| Phase 2: Context Management | Medium | Medium (20-30%) | P0 |
| Phase 3: Early Termination | Low | Medium (15-20%) | P1 |
| Phase 4: Tool Quality Routing | Medium | Medium (10-15%) | P1 |
| Phase 5: Fast-Path Graphs | High | Very High (80%+) | P2 |

---

## Success Metrics

### Before (Current)
- Coverage question: 118K tokens, 86 seconds, $0.16
- Average iterations: 5

### After (Target)
- Coverage question (fast path): <10K tokens, <10 seconds, <$0.02
- Coverage question (standard): <40K tokens, <30 seconds, <$0.06
- Average iterations: 2-3

### Measurement
- Track token usage per graph invocation in LangSmith
- Add metric: `tokens_per_finding` and `tokens_per_iteration`
- Alert if token usage exceeds 50K for simple queries

---

## Files to Modify

| File | Changes |
|------|---------|
| `graphs/types/base-state.ts` | Add CompactFinding, modify reducer |
| `graphs/nodes/search.node.ts` | Lower context limit, add compaction |
| `graphs/nodes/analyze.node.ts` | Add early termination heuristics |
| `graphs/nodes/synthesize.node.ts` | Use compact findings |
| `graphs/utils/finding-compactor.ts` | New file |
| `graphs/utils/message-compactor.ts` | New file |
| `graphs/graphs/coverage-fast.graph.ts` | New file |
| `chat-agent.service.ts` | Add query router |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Over-compaction loses critical data | Keep full content for last 3 findings |
| Early termination returns incomplete answers | Add confidence threshold check |
| Fast-path misses edge cases | Fall back to standard path on low confidence |
| Breaking existing tests | Implement behind feature flags |

---

## Timeline

- **Week 1**: Phase 1 + Phase 2 (core efficiency)
- **Week 2**: Phase 3 + Phase 4 (smart routing)
- **Week 3**: Phase 5 (fast paths for coverage, deps, tests)
- **Week 4**: Testing, metrics, rollout

---

*Document created: 2026-01-29*
*Based on analysis of LangSmith trace e34d0bb8-d61b-47b4-a388-3a271f9d096d*
