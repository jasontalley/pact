# Reconciliation Nodes

Node functions for the reconciliation graph pipeline.

## Overview

The reconciliation graph processes a codebase to discover orphan tests (tests without `@atom` annotations) and infer Intent Atoms from them. This directory contains all node functions for that pipeline.

## Pipeline Flow

```text
                    ┌─────────────────┐
                    │    structure    │
                    │ (scan codebase) │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  discoverRouter │
                    │ (route by mode) │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
┌────────▼────────┐  ┌───────▼────────┐         │
│discover_fullscan│  │ discover_delta │         │
│ (scan all tests)│  │(changed only)  │         │
└────────┬────────┘  └───────┬────────┘         │
         │                   │                   │
         └─────────┬─────────┘                   │
                   │                             │
          ┌────────▼────────┐                    │
          │     context     │                    │
          │(build analysis) │                    │
          └────────┬────────┘                    │
                   │                             │
          ┌────────▼────────┐                    │
          │   infer_atoms   │                    │
          │ (LLM inference) │                    │
          └────────┬────────┘                    │
                   │                             │
          ┌────────▼────────┐                    │
          │synthesize_mols  │                    │
          │(cluster atoms)  │                    │
          └────────┬────────┘                    │
                   │                             │
          ┌────────▼────────┐                    │
          │ interim_persist │                    │
          │(save progress)  │                    │
          └────────┬────────┘                    │
                   │                             │
          ┌────────▼────────┐                    │
          │     verify      │────[NodeInterrupt]─┤
          │(quality check)  │   (if review needed)
          └────────┬────────┘                    │
                   │                             │
          ┌────────▼────────┐                    │
          │     persist     │◄───────────────────┘
          │ (save to DB)    │    (after approval)
          └─────────────────┘
```

## Node Files

### structure.node.ts

**Purpose**: Scan repository to discover file structure and dependencies.

**Input**: `rootDirectory`, `mode`, `options`

**Output**: `repoStructure` (files, testFiles, dependencyEdges)

**Key Features**:
- Respects exclude patterns (node_modules, dist, etc.)
- Optional dependency analysis via tool
- Returns topological ordering for test processing

### discover-fullscan.node.ts

**Purpose**: Find ALL orphan tests in the repository.

**Input**: `repoStructure`, `rootDirectory`

**Output**: `orphanTests`, `totalTests`, `totalOrphans`

**Key Features**:
- Scans all test files matching patterns
- Extracts tests without `@atom` annotations
- Collects test code and related source files

### discover-delta.node.ts

**Purpose**: Find orphan tests only in files changed since baseline.

**Input**: `repoStructure`, `baselineCommit`, `rootDirectory`

**Output**: `orphanTests`, `deltaOrphanTests`, `changedAtomLinkedTests`, `deltaSummary`

**Key Features**:
- Uses git diff to find changed test files
- Implements INV-R001: Track changed tests with @atom annotations
- Falls back to fullscan if baseline not available

### context.node.ts

**Purpose**: Build rich context for each orphan test.

**Input**: `orphanTests`, `repoStructure`, `documentationIndex`

**Output**: `contextPerTest` (Map of test → analysis)

**Key Features**:
- Parses test code structure (assertions, imports, setup)
- Finds related source files via imports
- Extracts domain/technical concepts
- Searches documentation for relevant context

### infer-atoms.node.ts

**Purpose**: Use LLM to infer Intent Atoms from test context.

**Input**: `orphanTests`, `contextPerTest`, `repoStructure`

**Output**: `inferredAtoms`

**Key Features**:
- Batched LLM inference for efficiency
- Includes dependency analysis in prompt
- Applies "foundational boost" for core modules
- Structured output parsing with validation

### synthesize-molecules.node.ts

**Purpose**: Cluster related atoms into molecules.

**Input**: `inferredAtoms`

**Output**: `inferredMolecules`

**Key Features**:
- Multiple clustering strategies (module, category, namespace, semantic)
- Generates molecule names and descriptions
- Calculates clustering confidence
- Links atoms to molecules via tempIds

### interim-persist.node.ts

**Purpose**: Save progress to database before verification.

**Input**: `runId`, `inferredAtoms`, `inferredMolecules`, `orphanTests`

**Output**: (persists to DB, returns runId)

**Key Features**:
- Creates/updates reconciliation run record
- Saves atom recommendations
- Saves molecule recommendations
- Saves test records
- Enables resumable workflows

### verify.node.ts

**Purpose**: Validate atom quality and determine if review is needed.

**Input**: `inferredAtoms`, `options.qualityThreshold`, `options.requireReview`

**Output**: `decisions`, `pendingHumanReview` OR throws `NodeInterrupt`

**Key Features**:
- Uses `validate_atom_quality` tool for 5-dimension scoring
- Falls back to heuristics if tool unavailable
- Throws `NodeInterrupt` with review payload when needed
- Handles human review input on resume

### persist.node.ts

**Purpose**: Apply final decisions and create atoms in database.

**Input**: `decisions`, `inferredAtoms`, `inferredMolecules`, `runId`

**Output**: `createdAtoms`, `createdMolecules`, `summary`

**Key Features**:
- Creates atoms for approved recommendations
- Creates molecules linking approved atoms
- Updates recommendation statuses
- Generates final summary

## Creating a Node

Nodes follow a factory pattern:

```typescript
// my-node.ts
import { NodeConfig } from '../types';
import { ReconciliationStateType } from '../../types/reconciliation-state';

export interface MyNodeOptions {
  someOption?: boolean;
}

export function createMyNode(options: MyNodeOptions = {}) {
  return (config: NodeConfig) => {
    return async (state: ReconciliationStateType): Promise<Partial<ReconciliationStateType>> => {
      const { llmService, toolRegistry, logger } = config;

      logger?.log('[MyNode] Processing...');

      // Access state
      const { orphanTests, inferredAtoms } = state;

      // Use tools
      if (toolRegistry.hasTool('my_tool')) {
        const result = await toolRegistry.executeTool('my_tool', { ... });
      }

      // Use LLM
      const response = await llmService.invoke({
        messages: [{ role: 'user', content: 'prompt' }],
        agentName: 'MyNode',
        purpose: 'Processing something',
      });

      // Return state updates (merged with existing state)
      return {
        myResult: processedData,
        currentPhase: 'next_phase',
      };
    };
  };
}
```

## Testing

Each node has a corresponding `.spec.ts` file:

```bash
# All reconciliation node tests
npm test -- --testPathPattern=reconciliation

# Specific node
npm test -- --testPathPattern=verify.node
```

## Error Handling

Nodes should:
1. Log errors but not crash the graph
2. Return partial results when possible
3. Set appropriate error state for downstream nodes

```typescript
try {
  // Processing
} catch (error) {
  config.logger?.error(`[MyNode] Error: ${error.message}`);
  return {
    errors: [...(state.errors || []), {
      node: 'my_node',
      error: error.message,
      timestamp: new Date().toISOString(),
    }],
    currentPhase: 'error',
  };
}
```

## See Also

- [Reconciliation Graph](../../graphs/reconciliation.graph.ts)
- [Reconciliation State](../../types/reconciliation-state.ts)
- [Reconciliation Tools](../../../tools/reconciliation-tools.service.ts)
