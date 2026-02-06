# Agents Module

The agents module contains AI-powered services for analyzing, creating, and managing Intent Atoms. This module has evolved from simple LLM-calling services to a sophisticated LangGraph-based architecture.

## Architecture Overview

```
agents/
├── Services (Orchestration & Utilities)
│   ├── chat-agent.service.ts      # Routes chat to appropriate graph
│   ├── reconciliation.service.ts  # Wraps reconciliation graph
│   ├── commitment-agent.service.ts # Commitment flow orchestration
│   └── apply.service.ts           # Applies recommendations
│
├── graphs/                        # LangGraph State Machines
│   ├── graphs/                    # Graph definitions
│   ├── nodes/                     # Reusable node functions
│   ├── edges/                     # Edge/routing logic
│   ├── builders/                  # Graph construction patterns
│   ├── types/                     # State type definitions
│   └── utils/                     # Graph utilities
│
├── tools/                         # Tool Registry & Definitions
│   ├── tool-registry.service.ts   # Central tool lookup
│   ├── atom-tools.service.ts      # Atom CRUD tools
│   └── reconciliation-tools.service.ts
│
├── entities/                      # Database Entities
│   ├── reconciliation-run.entity.ts
│   ├── atom-recommendation.entity.ts
│   ├── molecule-recommendation.entity.ts
│   └── test-record.entity.ts
│
├── repositories/                  # Data Access
│   └── reconciliation.repository.ts
│
├── dto/                          # Data Transfer Objects
├── prompts/                      # LLM Prompt Templates
└── utils/                        # Utility Functions
```

## Service Categories

### 1. Graph-Based Agents (Modern)

These are LangGraph state machines that handle complex, multi-step reasoning:

| Graph | Purpose | Pattern |
|-------|---------|---------|
| `reconciliation.graph.ts` | Infer atoms from orphan tests | Custom pipeline |
| `chat-exploration.graph.ts` | Codebase exploration & Q&A | ReAct |
| `coverage-fast.graph.ts` | Fast coverage queries | Fast-path |

### 2. Orchestration Services

These services wrap graphs and provide API endpoints:

| Service | Purpose | Status |
|---------|---------|--------|
| `chat-agent.service.ts` | Routes chat to graphs | Active |
| `reconciliation.service.ts` | Reconciliation API | Active |
| `commitment-agent.service.ts` | Commitment ceremony | Active |
| `apply.service.ts` | Apply recommendations | Active |

### 3. Utility Services

These provide reusable functionality for tools and graphs:

| Service | Purpose | Status |
|---------|---------|--------|
| `context-builder.service.ts` | Test code parsing & context extraction | Active |
| `test-atom-coupling.service.ts` | Test-atom coupling analysis | Active |
| `molecule-verifier.service.ts` | Molecule quality verification | Active |
| `atomicity-checker.service.ts` | Heuristic atomicity checks | Active |

### 4. Legacy Services (Review Needed)

These predate the graph architecture and may need refactoring:

| Service | Purpose | Recommendation |
|---------|---------|----------------|
| `atomization.service.ts` | Single-shot atomization | **Convert to tool** |
| `brownfield-analysis.service.ts` | Pre-graph reconciliation | **DEPRECATE** - Superseded by reconciliation graph |
| `intent-refinement.service.ts` | Intent refinement loop | **Keep** - Will be part of interview graph |

## Key Patterns

### Tool Registration

All tools are registered in `ToolRegistryService` during module init:

```typescript
// tools/tool-registry.service.ts
async onModuleInit() {
  this.registerToolsFromService('atom-tools', this.atomToolsService);
  this.registerToolsFromService('reconciliation-tools', this.reconciliationToolsService);
}
```

### Graph Registration

Graphs are registered in `GraphRegistryService`:

```typescript
// graphs/graph-registry.service.ts
async onModuleInit() {
  const chatGraph = createChatExplorationGraph(this.nodeConfig);
  this.registerGraph('chat-exploration', chatGraph, config);

  const reconciliationGraph = createReconciliationGraph(this.nodeConfig);
  this.registerGraph('reconciliation', reconciliationGraph, config);
}
```

### Node Configuration

All graph nodes receive a standard `NodeConfig`:

```typescript
interface NodeConfig {
  llmService: LLMService;
  toolRegistry: ToolRegistryService;
  logger: Logger;
}
```

## Data Flow

### Reconciliation Flow

```
User Request
    │
    ▼
ReconciliationController
    │
    ▼
ReconciliationService.startAnalysis()
    │
    ▼
GraphRegistryService.invoke('reconciliation', input)
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                Reconciliation Graph                      │
├─────────────────────────────────────────────────────────┤
│  structure → discover → context → infer_atoms →         │
│  synthesize_molecules → verify → [interrupt] → persist  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
NodeInterrupt (if review needed)
    │
    ▼
Human Review via UI
    │
    ▼
ReconciliationService.submitReview()
    │
    ▼
ApplyService.apply() → Create atoms in DB
```

### Chat Flow

```
User Message
    │
    ▼
ChatAgentController
    │
    ▼
ChatAgentService.chat()
    │
    ├─[coverage query]─→ CoverageFastGraph
    ├─[reconciliation]──→ ReconciliationService
    └─[general query]───→ ChatExplorationGraph
```

## Evaluation (Phase 13)

The evaluation harness provides contract-driven testing for LangGraph agents.

### Running Evaluations

```bash
# Run all agent tests (contracts, properties, cost/latency)
npm run test:agents

# Run property tests only
npm run test:agents:property

# Run cost/latency budget tests
npm run test:agents:cost

# Run golden suite via evaluation CLI
npm run evaluate:agents -- --suite=golden --agent=reconciliation

# Update snapshots after intentional changes
npm run evaluate:agents -- --suite=golden --update-snapshots
```

### Prompt Packages

Prompts use a versioned, node-local policy pattern:

```
prompts/
├── policies/
│   ├── reconciliation/policies-v1.md   # Reconciliation node policies
│   └── interview/policies-v1.md        # Interview node policies
└── index.ts                            # Barrel exports
```

**To update a policy:**

1. Edit the relevant `policies-v*.md` file.
2. Run golden tests: `npm run evaluate:agents -- --suite=golden`
3. If tests pass, commit the change.
4. If tests fail, either fix the policy or update snapshots: `--update-snapshots`

**To add a few-shot example:**

1. Add the example to the relevant node's prompt (inline in the node file).
2. Run the golden suite to verify the change doesn't regress other scenarios.
3. Document the change in the commit message.

### Key Files

| File | Purpose |
|------|---------|
| `evaluation/run-artifact.types.ts` | Run Artifact schema, metrics, failure taxonomy |
| `evaluation/artifact-capture.service.ts` | Instruments graph invocation |
| `evaluation/rubric-scorer.ts` | Automated rubric scoring |
| `evaluation/reconciliation-golden.runner.ts` | Reconciliation golden test runner |
| `evaluation/intent-interview-golden.runner.ts` | Interview golden test runner |
| `evaluation/index.ts` | Barrel exports |
| `scripts/evaluate-agents.ts` | Evaluation CLI |

### Related Docs

- [Agent Contracts](../../../docs/architecture/agent-contracts.md)
- [Evaluation Rubrics](../../../docs/architecture/agent-evaluation-rubrics.md)

## Testing

All services have corresponding `.spec.ts` files. Run tests:

```bash
# All agent tests
npm test -- --testPathPattern=agents

# Specific service
npm test -- --testPathPattern=reconciliation.service

# Graph tests
npm test -- --testPathPattern=graphs
```

## Dependencies

- `@langchain/langgraph` - State machine framework
- `@langchain/core` - LLM abstractions
- `typeorm` - Database entities
- `class-validator` - DTO validation

## Related Documentation

- [Bootstrap Completion Plan](../../../docs/bootstrap-completion-plan.md)
- [Implementation Checklist Phase 5](../../../docs/implementation-checklist-phase5.md)
- [LLM Providers](../../../docs/architecture/llm-providers.md)
