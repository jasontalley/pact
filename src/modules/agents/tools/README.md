# Tools Module

Tool definitions and registry for agent function calling.

## Overview

Tools are discrete functions that agents can invoke to interact with the codebase, database, and external systems. This module provides:

1. **Tool Registry** - Central registration and lookup of tools
2. **Tool Definitions** - Zod schemas defining tool inputs/outputs
3. **Tool Executors** - Implementation of tool logic

## Directory Structure

```
tools/
├── tool-registry.service.ts       # Central tool lookup and execution
├── atom-tools.service.ts          # Atom CRUD tools
├── atom-tools.definitions.ts      # Atom tool schemas
├── reconciliation-tools.service.ts # Reconciliation-specific tools
├── reconciliation-tools.definitions.ts # Reconciliation tool schemas
└── index.ts                       # Public exports
```

## Tool Registry

The `ToolRegistryService` provides centralized tool management:

```typescript
// Registration (at module init)
toolRegistry.registerToolsFromService('atom-tools', atomToolsService);
toolRegistry.registerToolsFromService('reconciliation-tools', reconciliationToolsService);

// Lookup
if (toolRegistry.hasTool('get_atom')) {
  const result = await toolRegistry.executeTool('get_atom', { atomId: 'IA-001' });
}

// Get all tools for LLM
const tools = toolRegistry.getToolsForLLM();
```

## Available Tools

### Atom Tools

| Tool | Description |
|------|-------------|
| `get_atom` | Retrieve atom by ID |
| `search_atoms` | Search atoms with filters |
| `create_atom` | Create new draft atom |
| `update_atom` | Update draft atom |
| `commit_atom` | Commit atom (requires quality score ≥80) |

### Reconciliation Tools

| Tool | Description |
|------|-------------|
| `get_repo_structure` | List files with optional dependency analysis |
| `discover_orphans_fullscan` | Find all tests without @atom annotations |
| `discover_orphans_delta` | Find orphans in changed files only |
| `get_test_analysis` | Parse and analyze test code |
| `search_docs_by_concepts` | Semantic search in documentation |
| `infer_atom_from_test` | LLM inference of atom from test |
| `cluster_atoms_for_molecules` | Group atoms into molecules |
| `validate_atom_quality` | Quality score with 5 dimensions |

## Tool Definition Pattern

Tools are defined with Zod schemas for type safety:

```typescript
// reconciliation-tools.definitions.ts
import { z } from 'zod';

export const GetRepoStructureSchema = z.object({
  root_directory: z.string().describe('Root directory to scan'),
  include_dependencies: z.boolean().optional().describe('Include dependency analysis'),
  max_files: z.number().optional().describe('Maximum files to return'),
  exclude_patterns: z.array(z.string()).optional().describe('Patterns to exclude'),
});

export type GetRepoStructureInput = z.infer<typeof GetRepoStructureSchema>;
```

## Creating New Tools

### 1. Define Schema

```typescript
// my-tools.definitions.ts
import { z } from 'zod';

export const MyToolSchema = z.object({
  input: z.string().describe('Input parameter'),
  option: z.boolean().optional().describe('Optional flag'),
});

export type MyToolInput = z.infer<typeof MyToolSchema>;
```

### 2. Implement Executor

```typescript
// my-tools.service.ts
import { Injectable } from '@nestjs/common';
import { ToolExecutor } from './tool-registry.service';

@Injectable()
export class MyToolsService implements ToolExecutor {
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'my_tool':
        return this.myTool(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async myTool(args: Record<string, unknown>): Promise<MyResult> {
    const input = args.input as string;
    // Implementation
    return { result: 'done' };
  }
}
```

### 3. Register Tools

```typescript
// tool-registry.service.ts
async onModuleInit() {
  // Existing registrations...
  this.registerToolsFromService('my-tools', this.myToolsService);
}
```

## Tool Execution Flow

```
LLM decides to call tool
    │
    ▼
ToolRegistryService.executeTool(name, args)
    │
    ├── Validate args against schema
    │
    ├── Find registered executor
    │
    └── Execute and return result
    │
    ▼
Result returned to LLM
```

## LLM Integration

Tools are formatted for LLM function calling:

```typescript
// Get tools as LangChain tool objects
const tools = toolRegistry.getToolsForLLM();

// Or get raw definitions for manual integration
const definitions = toolRegistry.getToolDefinitions();
```

## Error Handling

Tools should throw descriptive errors:

```typescript
private async getAtom(args: Record<string, unknown>): Promise<Atom> {
  const atomId = args.atom_id as string;
  if (!atomId) {
    throw new Error('atom_id is required');
  }

  const atom = await this.atomRepository.findOne({ where: { atomId } });
  if (!atom) {
    throw new Error(`Atom not found: ${atomId}`);
  }

  return atom;
}
```

Errors are captured and returned to the LLM for retry or user feedback.

## Parameter Parsing

Since LLMs may pass parameters as strings, use parsing helpers:

```typescript
// reconciliation-tools.service.ts
private parseNumber(value: unknown, defaultValue: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

private parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return defaultValue;
}
```

## Testing

```bash
# All tool tests
npm test -- --testPathPattern=tools

# Specific service
npm test -- --testPathPattern=reconciliation-tools
```

## See Also

- [Graphs Module](../graphs/README.md) - How graphs use tools
- [LangChain Tool Documentation](https://js.langchain.com/docs/modules/agents/tools/)
