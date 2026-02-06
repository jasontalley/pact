# Pact Agent Architecture

This document describes the AI agent architecture in Pact, including the evolution from legacy services to the current LangGraph-based system.

## Table of Contents

1. [Overview](#overview)
2. [Architecture Layers](#architecture-layers)
3. [Available Agents](#available-agents)
4. [Legacy Service Analysis](#legacy-service-analysis)
5. [Tool System](#tool-system)
6. [State Management](#state-management)
7. [Human-in-the-Loop](#human-in-the-loop)
8. [Observability](#observability)

---

## Overview

Pact uses AI agents to automate and assist with intent management:

- **Reconciliation Agent** - Discovers orphan tests and infers Intent Atoms
- **Chat Agent** - Answers questions about the codebase
- **Commitment Agent** - Guides the commitment ceremony for atoms

The agent system has evolved through two generations:

| Generation | Pattern | Technology | Status |
|------------|---------|------------|--------|
| Gen 1 | Service-based | Direct LLM calls | Legacy (some deprecated) |
| Gen 2 | Graph-based | LangGraph | Active |

---

## Architecture Layers

```text
┌─────────────────────────────────────────────────────────────────┐
│                        API Controllers                          │
│  ChatAgentController  ReconciliationController  AtomController  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    Orchestration Services                        │
│     ChatAgentService    ReconciliationService    ApplyService   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                      Graph Registry                              │
│              GraphRegistryService (central hub)                  │
│    ┌────────────────┬────────────────┬────────────────┐         │
│    │ Reconciliation │ ChatExploration│  CoverageFast  │         │
│    │     Graph      │     Graph      │     Graph      │         │
│    └────────────────┴────────────────┴────────────────┘         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                       Tool Registry                              │
│              ToolRegistryService (central hub)                   │
│    ┌────────────────┬────────────────┬────────────────┐         │
│    │   Atom Tools   │ Reconciliation │  Filesystem    │         │
│    │                │    Tools       │    Tools       │         │
│    └────────────────┴────────────────┴────────────────┘         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    Utility Services                              │
│  ContextBuilder  TestAtomCoupling  AtomQuality  MoleculeVerifier│
└─────────────────────────────────────────────────────────────────┘
```

---

## Available Agents

### Reconciliation Agent (Gen 2)

**Purpose**: Analyze a codebase to discover orphan tests and infer Intent Atoms.

**Implementation**: `reconciliation.graph.ts`

**Pipeline**:
```text
structure → discover → context → infer_atoms → synthesize_molecules → verify → persist
```

**Key Features**:
- Delta mode for incremental analysis
- 5-dimension quality validation
- Human-in-the-loop review via NodeInterrupt
- LangSmith tracing integration

**API Endpoints**:
- `POST /api/reconciliation/start` - Start analysis
- `POST /api/reconciliation/:runId/review` - Submit human review
- `POST /api/reconciliation/:runId/apply` - Apply approved recommendations

### Chat Exploration Agent (Gen 2)

**Purpose**: Answer questions about the codebase through iterative search and analysis.

**Implementation**: `chat-exploration.graph.ts`

**Pattern**: ReAct (Reason + Act)

**Pipeline**:
```text
plan → search ↔ analyze → synthesize
```

**Key Features**:
- Iterative tool use for deep exploration
- Finding compaction for context management
- Citation support in responses

**API Endpoint**:
- `POST /api/chat` - Send chat message

### Coverage Fast Agent (Gen 2)

**Purpose**: Quick answers to code coverage questions.

**Implementation**: `coverage-fast.graph.ts`

**Pattern**: Fast-path (minimal hops)

**Key Features**:
- Optimized for coverage queries
- Minimal LLM calls
- Fast response times

### Commitment Agent (Gen 1)

**Purpose**: Guide users through the commitment ceremony for atoms.

**Implementation**: `commitment-agent.service.ts`

**Key Features**:
- Orchestrates atomization → refinement → commitment flow
- Validates invariants before commitment
- Creates commitment artifacts

---

## Legacy Service Analysis

### Classification

| Service | Category | Recommendation | Notes |
|---------|----------|----------------|-------|
| `atomization.service.ts` | Atomization | **Convert to Tool** | Single-shot LLM atomization; useful as tool |
| `atomicity-checker.service.ts` | Validation | **Keep as Utility** | Heuristic checks used by multiple services |
| `brownfield-analysis.service.ts` | Analysis | **DEPRECATE** | Superseded by reconciliation.graph.ts |
| `chat-agent.service.ts` | Orchestration | **Keep** | Routes to appropriate graphs |
| `commitment-agent.service.ts` | Orchestration | **Keep** | Commitment flow still needed |
| `context-builder.service.ts` | Utility | **Keep** | Core parsing logic used by tools |
| `intent-refinement.service.ts` | Refinement | **Keep** | Will be part of interview graph |
| `molecule-verifier.service.ts` | Validation | **Keep** | Used by reconciliation graph |
| `reconciliation.service.ts` | Orchestration | **Keep** | Wraps reconciliation graph |
| `test-atom-coupling.service.ts` | Analysis | **Keep** | Core coupling logic used by tools |
| `apply.service.ts` | Persistence | **Keep** | Applies recommendations to DB |

### Deprecation Plan: brownfield-analysis.service.ts

**Status**: DEPRECATED

**Superseded By**: `reconciliation.graph.ts`

**Reason**: The reconciliation graph provides:
- Same functionality (discover orphans → infer atoms)
- Better architecture (stateful, resumable)
- Human-in-the-loop support
- Delta mode for efficiency
- LangSmith observability

**Migration**:
1. All calls to `BrownfieldAnalysisService.analyze()` should use `ReconciliationService.startAnalysis()`
2. Remove brownfield-analysis.controller.ts
3. Remove brownfield-analysis.service.ts
4. Remove brownfield-analysis.dto.ts

**Timeline**: Remove after confirming no external dependencies.

### Conversion Plan: atomization.service.ts → Tool

**Current State**: Standalone service for single-shot atomization

**Proposed**: Convert to `atomize_intent` tool

**Benefits**:
- Usable by any graph that needs to atomize text
- Consistent with tool-based architecture
- Reduces direct service dependencies

**Implementation**:
```typescript
// tools/atomization-tools.service.ts
async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'atomize_intent':
      return this.atomizeIntent(args);
    // ...
  }
}

private async atomizeIntent(args: Record<string, unknown>): Promise<AtomizationResult> {
  const { intent, category } = args;
  // Move logic from AtomizationService.atomize()
}
```

---

## Tool System

Tools are discrete functions agents can invoke:

### Atom Tools
- `get_atom` - Retrieve atom by ID
- `search_atoms` - Search with filters
- `create_atom` - Create draft atom
- `commit_atom` - Commit atom (requires quality ≥80)

### Reconciliation Tools
- `get_repo_structure` - Scan codebase structure
- `discover_orphans_fullscan` - Find all orphan tests
- `discover_orphans_delta` - Find orphans in changed files
- `get_test_analysis` - Parse test code
- `search_docs_by_concepts` - Semantic doc search
- `infer_atom_from_test` - LLM atom inference
- `cluster_atoms_for_molecules` - Group atoms
- `validate_atom_quality` - 5-dimension quality score

### Filesystem Tools (via LangChain)
- File reading
- Directory listing
- Pattern matching

---

## State Management

### Graph State

Each graph defines its state using LangGraph annotations:

```typescript
const ReconciliationState = Annotation.Root({
  rootDirectory: Annotation<string>(),
  mode: Annotation<'full-scan' | 'delta'>(),
  orphanTests: Annotation<OrphanTestInfo[]>({ reducer: (_, b) => b }),
  inferredAtoms: Annotation<InferredAtom[]>({ reducer: (_, b) => b }),
  // ...
});
```

### Persistence

Reconciliation runs are persisted to enable:
- **Resumption** - Continue after interruption
- **Auditing** - Review what was analyzed
- **History** - Track reconciliation over time

Entities:
- `ReconciliationRun` - Run metadata and status
- `AtomRecommendation` - Inferred atoms pending review
- `MoleculeRecommendation` - Inferred molecules
- `TestRecord` - Tests analyzed

---

## Human-in-the-Loop

The reconciliation agent supports human review via `NodeInterrupt`:

```typescript
// In verify.node.ts
if (needsReview) {
  throw new NodeInterrupt(JSON.stringify({
    summary: { totalAtoms, passCount, failCount },
    pendingAtoms: atomsForReview,
    pendingMolecules: moleculesForReview,
    reason: 'Quality threshold not met'
  }));
}
```

**Flow**:
1. Graph runs until verify node
2. If review needed, NodeInterrupt thrown
3. Run status set to `review`
4. Frontend displays review UI
5. User approves/rejects atoms
6. `submitReview()` called with decisions
7. Graph resumes from checkpoint
8. Persist node creates approved atoms

---

## Observability

### LangSmith Integration

All graph runs are traced to LangSmith when configured:

```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-key
LANGCHAIN_PROJECT=pact-agents
```

Traces include:
- Node execution times
- LLM token usage
- Tool calls and results
- State at each step

### Logging

Agents use NestJS Logger:

```typescript
this.logger.log(`[ReconciliationService] Starting analysis: ${runId}`);
this.logger.warn(`[VerifyNode] Quality threshold not met`);
this.logger.error(`[PersistNode] Failed to create atom: ${error.message}`);
```

### Metrics

Key metrics tracked:
- `reconciliation.runs.total` - Total runs
- `reconciliation.atoms.inferred` - Atoms inferred
- `reconciliation.atoms.approved` - Atoms approved
- `chat.queries.total` - Chat queries
- `chat.latency.p95` - Chat response latency

---

## Future Roadmap

### Interview Agent (Planned)

Multi-turn conversational agent for molecule creation:

```text
analyze_intent → ask_questions ↔ wait_response → extract_atoms → compose_molecule
```

See [Bootstrap Completion Plan](bootstrap-completion-plan.md#capability-2-interviewmolecule-creation-agent).

### MCP Server (Planned)

Expose atoms to external coding agents via Model Context Protocol:

```text
read_atom | list_atoms | get_atom_for_test | get_coupling_status
```

See [Bootstrap Completion Plan](bootstrap-completion-plan.md#capability-5-mcp-server).

---

## Related Documentation

- [Bootstrap Completion Plan](bootstrap-completion-plan.md)
- [Implementation Checklist Phase 5](implementation-checklist-phase5.md)
- [LLM Providers](architecture/llm-providers.md)
- [Agent Module README](../src/modules/agents/README.md)
