# Graphs Module

LangGraph-based state machines for complex, multi-step agent workflows.

## Overview

This module implements Pact's AI agents using [LangGraph](https://langchain-ai.github.io/langgraph/), a framework for building stateful, multi-actor applications. Each graph is a state machine where nodes perform actions and edges determine the next step.

## Directory Structure

```
graphs/
├── graph-registry.service.ts  # Central registry for all graphs
├── graphs/                    # Graph definitions
│   ├── reconciliation.graph.ts
│   ├── chat-exploration.graph.ts
│   └── coverage-fast.graph.ts
├── nodes/                     # Reusable node functions
│   ├── reconciliation/        # Reconciliation-specific nodes
│   ├── plan.node.ts
│   ├── search.node.ts
│   ├── analyze.node.ts
│   └── synthesize.node.ts
├── edges/                     # Routing logic
│   ├── should-continue.ts
│   └── quality-gate.ts
├── builders/                  # Graph construction helpers
│   ├── react-builder.ts
│   └── plan-execute-builder.ts
├── types/                     # State type definitions
│   ├── base-state.ts
│   ├── exploration-state.ts
│   ├── reconciliation-state.ts
│   └── schemas.ts
└── utils/                     # Utilities
    └── finding-compactor.ts
```

## Available Graphs

### 1. Reconciliation Graph

**Purpose**: Analyze a codebase to discover orphan tests and infer Intent Atoms.

**Pattern**: Custom pipeline with human-in-the-loop review

**Pipeline**:
```
structure → discoverRouter → [discover_fullscan | discover_delta] →
context → infer_atoms → synthesize_molecules → verify →
[NodeInterrupt if review needed] → persist
```

**Key Features**:
- Delta mode for incremental analysis (INV-R001, INV-R002)
- Quality validation before persistence
- Human review via NodeInterrupt
- LangSmith tracing support

**Usage**:
```typescript
const result = await graphRegistry.invoke('reconciliation', {
  rootDirectory: '/path/to/repo',
  mode: 'full-scan',
  options: { qualityThreshold: 80 }
});
```

### 2. Chat Exploration Graph

**Purpose**: Answer questions about the codebase through iterative search and analysis.

**Pattern**: ReAct (Reason + Act)

**Pipeline**:
```
plan → search ↔ analyze → synthesize
```

**Key Features**:
- Iterative tool use for deep exploration
- Finding compaction to manage context
- Citation support in responses

**Usage**:
```typescript
const result = await graphRegistry.invoke('chat-exploration', {
  query: 'How does authentication work?',
  conversationHistory: previousMessages
});
```

### 3. Coverage Fast Graph

**Purpose**: Quick answers to code coverage questions.

**Pattern**: Fast-path (minimal hops)

**Pipeline**:
```
execute_coverage → format_response
```

**Key Features**:
- Optimized for coverage-specific queries
- Minimal LLM calls
- Fast response times

## Node Configuration

All nodes receive a standard configuration object:

```typescript
interface NodeConfig {
  llmService: LLMService;      // For LLM invocations
  toolRegistry: ToolRegistryService;  // For tool access
  logger: Logger;              // For logging
}
```

## State Management

### Base State

All graphs extend `BaseState`:

```typescript
interface BaseState {
  messages: BaseMessage[];     // Conversation history
  currentPhase?: string;       // Current processing phase
  errors?: ErrorInfo[];        // Accumulated errors
}
```

### Reconciliation State

```typescript
interface ReconciliationState extends BaseState {
  rootDirectory: string;
  mode: 'full-scan' | 'delta';
  orphanTests: OrphanTestInfo[];
  inferredAtoms: InferredAtom[];
  inferredMolecules: InferredMolecule[];
  decisions: AtomDecision[];
  runId?: string;
  // ... more fields
}
```

### Exploration State

```typescript
interface ExplorationState extends BaseState {
  query: string;
  findings: Finding[];
  synthesizedAnswer?: string;
  citations?: Citation[];
}
```

## Graph Registration

Graphs are registered at module initialization:

```typescript
// graph-registry.service.ts
async onModuleInit() {
  const chatGraph = createChatExplorationGraph(this.nodeConfig);
  this.registerGraph('chat-exploration', chatGraph, {
    description: 'ReAct agent for exploring codebase',
    stateType: 'ChatExplorationState',
    pattern: 'react'
  });
}
```

## Creating New Graphs

### 1. Define State Type

```typescript
// types/my-state.ts
import { Annotation } from '@langchain/langgraph';

export const MyState = Annotation.Root({
  input: Annotation<string>(),
  result: Annotation<string>(),
  // ... other fields
});

export type MyStateType = typeof MyState.State;
```

### 2. Create Node Functions

```typescript
// nodes/my-node.ts
export function createMyNode(options = {}) {
  return (config: NodeConfig) => {
    return async (state: MyStateType): Promise<Partial<MyStateType>> => {
      // Process state
      return { result: 'processed' };
    };
  };
}
```

### 3. Build the Graph

```typescript
// graphs/my-graph.ts
import { StateGraph } from '@langchain/langgraph';
import { MyState, MyStateType } from '../types/my-state';

export function createMyGraph(config: NodeConfig) {
  const graph = new StateGraph(MyState);

  graph
    .addNode('step1', createMyNode()(config))
    .addNode('step2', createOtherNode()(config))
    .addEdge('__start__', 'step1')
    .addEdge('step1', 'step2')
    .addEdge('step2', '__end__');

  return graph.compile();
}
```

### 4. Register in GraphRegistryService

```typescript
// graph-registry.service.ts
const myGraph = createMyGraph(this.nodeConfig);
this.registerGraph('my-graph', myGraph, {
  description: 'My custom graph',
  stateType: 'MyState',
  pattern: 'custom'
});
```

## Human-in-the-Loop

Use `NodeInterrupt` to pause execution for human input:

```typescript
import { NodeInterrupt } from '@langchain/langgraph';

// In a node function
if (needsHumanReview) {
  throw new NodeInterrupt(JSON.stringify({
    reason: 'Quality threshold not met',
    pendingItems: itemsForReview
  }));
}
```

Resume with:
```typescript
await graphRegistry.invoke('my-graph', humanDecisions, {
  threadId: previousThreadId  // Resume from checkpoint
});
```

## LangSmith Tracing

Graphs automatically integrate with LangSmith when configured:

```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-key
LANGCHAIN_PROJECT=pact-agents
```

Trace runs appear with graph name and can be analyzed at [smith.langchain.com](https://smith.langchain.com).

## Testing

Each graph and node has corresponding tests:

```bash
# All graph tests
npm test -- --testPathPattern=graphs

# Specific graph
npm test -- --testPathPattern=reconciliation.graph

# Specific node
npm test -- --testPathPattern=verify.node
```

## Common Patterns

### Conditional Routing

```typescript
graph.addConditionalEdges('router', (state) => {
  if (state.mode === 'delta') return 'discover_delta';
  return 'discover_fullscan';
});
```

### Error Handling

```typescript
try {
  // Node logic
} catch (error) {
  return {
    errors: [...(state.errors || []), {
      node: 'my-node',
      error: error.message,
      timestamp: new Date().toISOString()
    }]
  };
}
```

### Tool Invocation

```typescript
if (config.toolRegistry.hasTool('my_tool')) {
  const result = await config.toolRegistry.executeTool('my_tool', args);
}
```

## See Also

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Reconciliation Implementation](../../../docs/implementation-checklist-phase5.md)
- [Agents Module README](../README.md)
