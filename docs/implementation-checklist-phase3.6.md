# Phase 3.6: LangGraph Composable Agent Architecture

**Version**: 2.1
**Status**: Planning
**Target**: Composable LangGraph infrastructure with ReAct pattern as first implementation
**Last Updated**: 2026-01-28

---

## Changelog

### v2.1 (2026-01-28)

- **Added**: Checkpointer/durability support for session persistence (Part 1.4)
- **Added**: Zod schema validation for Plan and AnalyzeResult (Part 2)
- **Fixed**: Tool category filtering bug - now supports multiple categories
- **Changed**: Analyze node uses `AnalyzeDecision` enum instead of boolean
- **Added**: Evaluation harness with 30 canonical test prompts (Part 7.6)
- **Added**: State hygiene and message discipline patterns

---

## Overview

Phase 3.6 establishes a **composable graph architecture** for all Pact agents, mirroring how the tool registry provides reusable tools. The first implementation is a ReAct (Reasoning + Acting) agent for the chat interface, but the infrastructure supports any graph-based agent workflow.

### Design Principles

1. **Composable by Default**: Nodes, edges, and state are reusable building blocks
2. **Pattern Templates**: Common patterns (ReAct, Plan-Execute) are templated builders
3. **Central Registry**: GraphRegistryService mirrors ToolRegistryService pattern
4. **Extend, Don't Rewrite**: New agents compose from existing pieces

### Architecture Comparison

| Component | Tools System | Graphs System |
|-----------|-------------|---------------|
| **Atomic Unit** | ToolDefinition | Node Function |
| **Registration** | ToolRegistryService | GraphRegistryService |
| **Definitions** | atom-tools.definitions.ts | nodes/*.ts, edges/*.ts |
| **Execution** | atom-tools.service.ts | graphs/*.graph.ts |
| **Patterns** | N/A | builders/*.ts (ReAct, Plan-Execute) |

### Current Architecture Problems

| Issue | Impact |
|-------|--------|
| Hardcoded 2 rounds of tool calls | Can't adapt to queries needing more exploration |
| No planning phase | Jumps straight to execution without strategy |
| Manual message building | Error-prone, hard to debug |
| Prompt-specific examples | Not generic, tuned to test coverage scenarios |
| No "enough information" detection | Can't dynamically decide when to stop |
| **Monolithic implementation** | **Can't reuse logic across agents** |

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Composable LangGraph Architecture                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        REUSABLE COMPONENTS                          │    │
│  │                                                                      │    │
│  │  Nodes:     [plan] [search] [analyze] [synthesize] [validate] ...   │    │
│  │  Edges:     [shouldContinue] [qualityGate] [hasEnoughInfo] ...      │    │
│  │  States:    [BaseExploration] [Atomization] [Brownfield] ...        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        PATTERN BUILDERS                              │    │
│  │                                                                      │    │
│  │  createReactGraph()          createPlanExecuteGraph()               │    │
│  │  - Uses: plan, search,       - Uses: plan, execute,                 │    │
│  │    analyze, synthesize         validate, report                     │    │
│  │  - Loop until complete       - Linear with validation               │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        COMPOSED GRAPHS                               │    │
│  │                                                                      │    │
│  │  chat-exploration.graph.ts   atomization.graph.ts   brownfield.ts   │    │
│  │  (ReAct pattern)             (Plan-Execute)         (ReAct + custom)│    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      GraphRegistryService                            │    │
│  │                                                                      │    │
│  │  getGraph('chat-exploration')  →  Compiled ReAct graph              │    │
│  │  getGraph('atomization')       →  Compiled Plan-Execute graph       │    │
│  │  invoke('brownfield', input)   →  Execute and return result         │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Prerequisites

- Phase 3.5 complete (Multi-provider LLM support)
- `@langchain/langgraph` installed (already in package.json v0.2.3)
- Tool registry operational
- LangSmith tracing configured

### Success Criteria

- [ ] Composable graph infrastructure operational
- [ ] ReAct agent handles arbitrary data-finding queries
- [ ] Agent dynamically decides when to stop exploring
- [ ] Planning phase generates search strategies
- [ ] Agent reads actual data files (not just lists directories)
- [ ] At least 2 agents share common nodes (chat + one other)
- [ ] State is traceable in LangSmith
- [ ] Test coverage ≥ 80% for new code
- [ ] No regression in existing chat functionality
- [ ] **NEW**: Session state persists across failures (checkpointer)
- [ ] **NEW**: All LLM outputs validated with Zod schemas
- [ ] **NEW**: Evaluation harness passes ≥ 80% of canonical prompts

---

## Part 1: Composable Infrastructure

**Goal**: Establish the foundational directory structure and base types for composable graphs.

### 1.1 Directory Structure

Create the following structure under `src/modules/agents/`:

```
src/modules/agents/graphs/
├── index.ts                      # Public exports
├── graph-registry.service.ts     # Central graph registry (like ToolRegistry)
│
├── types/                        # State definitions
│   ├── index.ts
│   ├── base-state.ts             # Base state all graphs can extend
│   ├── exploration-state.ts      # State for data-finding workflows
│   └── atomization-state.ts      # State for atomization workflows
│
├── nodes/                        # REUSABLE NODE FUNCTIONS
│   ├── index.ts
│   ├── plan.node.ts              # Generate search/action strategy
│   ├── search.node.ts            # Execute exploration tool calls
│   ├── analyze.node.ts           # Evaluate "enough info" condition
│   ├── synthesize.node.ts        # Generate final answer/output
│   ├── tool-executor.node.ts     # Generic tool execution helper
│   └── validate.node.ts          # Quality/invariant validation
│
├── edges/                        # REUSABLE EDGE CONDITIONS
│   ├── index.ts
│   ├── should-continue.ts        # Loop vs terminate logic
│   ├── quality-gate.ts           # Score-based routing
│   └── iteration-limit.ts        # Max iteration checks
│
├── builders/                     # PATTERN TEMPLATE FACTORIES
│   ├── index.ts
│   ├── react-builder.ts          # ReAct pattern builder
│   └── plan-execute-builder.ts   # Plan-Execute pattern builder
│
└── graphs/                       # COMPOSED AGENT GRAPHS
    ├── index.ts
    ├── chat-exploration.graph.ts # Chat agent (ReAct pattern)
    ├── atomization.graph.ts      # Atomization workflow
    └── brownfield.graph.ts       # Brownfield analysis
```

- [ ] Create `src/modules/agents/graphs/` directory structure
- [ ] Create `index.ts` files for each subdirectory
- [ ] Add graphs module to agents module

### 1.2 Base State Definition

```typescript
// types/base-state.ts
import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

/**
 * Base state that all exploration-type graphs can extend.
 * Provides common fields for iteration tracking, findings, and messages.
 */
export const BaseExplorationState = Annotation.Root({
  // The original question/task
  input: Annotation<string>,

  // Accumulated findings from tool calls
  findings: Annotation<Array<{
    source: string;
    content: string;
    relevance: string;
  }>>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Tool call history for transparency
  toolHistory: Annotation<Array<{
    tool: string;
    args: Record<string, unknown>;
    result: string;
    timestamp: Date;
  }>>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Iteration tracking
  iteration: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  maxIterations: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 5,
  }),

  // Completion flag
  isComplete: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),

  // Final output
  output: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // LLM message history
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Error tracking
  errors: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

export type BaseExplorationStateType = typeof BaseExplorationState.State;
```

- [ ] Create `types/base-state.ts` with `BaseExplorationState`
- [ ] Create `types/exploration-state.ts` extending base with `plan` field
- [ ] Create `types/atomization-state.ts` with atomization-specific fields
- [ ] Export all types from `types/index.ts`

### 1.3 Zod Schemas for LLM Outputs

**Problem**: `JSON.parse()` without validation causes silent degradation when LLMs return malformed JSON.

**Solution**: Define Zod schemas for all structured LLM outputs.

```typescript
// types/schemas.ts
import { z } from 'zod';

/**
 * Schema for planning phase output
 */
export const PlanSchema = z.object({
  strategy: z.string().describe('Brief description of approach'),
  targetDirectories: z.array(z.string()).default([]),
  filePatterns: z.array(z.string()).default([]),
  searchTerms: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
});

export type Plan = z.infer<typeof PlanSchema>;

/**
 * Decision enum for analyze node - richer than boolean
 */
export const AnalyzeDecision = z.enum([
  'need_more_search',      // Continue exploring
  'ready_to_answer',       // Have enough info to synthesize
  'request_clarification', // Need user input to proceed
  'max_iterations_reached', // Hit limit, synthesize with what we have
]);

export type AnalyzeDecisionType = z.infer<typeof AnalyzeDecision>;

/**
 * Schema for analyze phase output
 */
export const AnalyzeResultSchema = z.object({
  decision: AnalyzeDecision,
  reasoning: z.string(),
  missingInfo: z.array(z.string()).optional(),
  clarificationNeeded: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;

/**
 * Helper to safely parse LLM output with schema validation
 */
export function parseLLMOutput<T>(
  content: string,
  schema: z.ZodSchema<T>,
  fallback: T,
): { data: T; success: boolean; error?: string } {
  try {
    // Handle markdown code blocks
    const jsonContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(jsonContent);
    const validated = schema.parse(parsed);
    return { data: validated, success: true };
  } catch (error) {
    return {
      data: fallback,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parse error',
    };
  }
}
```

- [ ] Create `types/schemas.ts` with Zod schemas
- [ ] Define `PlanSchema` for planning output
- [ ] Define `AnalyzeDecision` enum (not boolean)
- [ ] Define `AnalyzeResultSchema` for analysis output
- [ ] Create `parseLLMOutput` helper with fallback support
- [ ] Export schemas from `types/index.ts`

### 1.4 Checkpointer for Session Durability

**Problem**: If the server restarts mid-conversation or a request fails, all state is lost.

**Solution**: Use LangGraph's checkpointer to persist state to PostgreSQL.

```typescript
// types/checkpointer.ts
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';

/**
 * Create a PostgreSQL checkpointer for durable graph state
 */
export async function createCheckpointer(pool: Pool): Promise<PostgresSaver> {
  const checkpointer = PostgresSaver.fromConnString(pool);

  // Ensure checkpoint tables exist
  await checkpointer.setup();

  return checkpointer;
}

/**
 * Configuration for checkpointer behavior
 */
export interface CheckpointerConfig {
  /** Enable checkpointing (default: true in production) */
  enabled: boolean;
  /** Checkpoint every N nodes (default: 1 = every node) */
  checkpointFrequency: number;
  /** TTL for checkpoints in seconds (default: 24 hours) */
  ttlSeconds: number;
}

export const DEFAULT_CHECKPOINTER_CONFIG: CheckpointerConfig = {
  enabled: process.env.NODE_ENV === 'production',
  checkpointFrequency: 1,
  ttlSeconds: 24 * 60 * 60,
};
```

```typescript
// Update graph-registry.service.ts to use checkpointer
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

@Injectable()
export class GraphRegistryService implements OnModuleInit {
  private checkpointer: PostgresSaver | null = null;

  constructor(
    private readonly llmService: LLMService,
    private readonly toolRegistry: ToolRegistryService,
    @InjectPool() private readonly pool: Pool, // Inject PG pool
  ) {}

  async onModuleInit(): Promise<void> {
    // Initialize checkpointer
    if (process.env.ENABLE_CHECKPOINTER !== 'false') {
      this.checkpointer = await createCheckpointer(this.pool);
      this.logger.log('Checkpointer initialized');
    }

    await this.initializeGraphs();
  }

  /**
   * Invoke a graph with optional thread_id for session persistence
   */
  async invoke<TInput, TOutput>(
    name: string,
    input: TInput,
    options?: { threadId?: string },
  ): Promise<TOutput> {
    const graph = this.getGraph<TInput>(name);
    if (!graph) {
      throw new Error(`Graph ${name} not found`);
    }

    const config = options?.threadId
      ? { configurable: { thread_id: options.threadId } }
      : undefined;

    return graph.invoke(input, config) as Promise<TOutput>;
  }

  /**
   * Resume a graph from a checkpoint
   */
  async resume<TOutput>(
    name: string,
    threadId: string,
    updateState?: Record<string, unknown>,
  ): Promise<TOutput> {
    const graph = this.getGraph(name);
    if (!graph) {
      throw new Error(`Graph ${name} not found`);
    }

    // Optionally update state before resuming
    if (updateState) {
      await graph.updateState(
        { configurable: { thread_id: threadId } },
        updateState,
      );
    }

    return graph.invoke(null, {
      configurable: { thread_id: threadId },
    }) as Promise<TOutput>;
  }
}
```

- [ ] Install `@langchain/langgraph-checkpoint-postgres`
- [ ] Create `types/checkpointer.ts` with setup function
- [ ] Update `GraphRegistryService` to initialize checkpointer
- [ ] Add `threadId` support to `invoke()` method
- [ ] Add `resume()` method for recovering from failures
- [ ] Pass checkpointer to graph compilation
- [ ] Add cleanup job for expired checkpoints

### 1.5 Graph Registry Service

```typescript
// graph-registry.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CompiledStateGraph } from '@langchain/langgraph';
import { LLMService } from '../../../common/llm/llm.service';
import { ToolRegistryService } from '../tools/tool-registry.service';

export interface GraphConfig {
  name: string;
  description: string;
  stateType: string;
  pattern: 'react' | 'plan-execute' | 'custom';
}

@Injectable()
export class GraphRegistryService implements OnModuleInit {
  private readonly logger = new Logger(GraphRegistryService.name);
  private graphs = new Map<string, CompiledStateGraph<any>>();
  private configs = new Map<string, GraphConfig>();

  constructor(
    private readonly llmService: LLMService,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Register all graphs at startup
    await this.initializeGraphs();
  }

  private async initializeGraphs(): Promise<void> {
    // Import and register graphs
    // This is where composed graphs are instantiated
    this.logger.log('Initializing graph registry...');

    // Graphs will be registered here in Part 2
  }

  /**
   * Register a compiled graph
   */
  registerGraph<T>(
    name: string,
    graph: CompiledStateGraph<T>,
    config: Omit<GraphConfig, 'name'>,
  ): void {
    if (this.graphs.has(name)) {
      this.logger.warn(`Graph ${name} already registered, overwriting`);
    }
    this.graphs.set(name, graph);
    this.configs.set(name, { name, ...config });
    this.logger.log(`Registered graph: ${name} (${config.pattern} pattern)`);
  }

  /**
   * Get a compiled graph by name
   */
  getGraph<T>(name: string): CompiledStateGraph<T> | undefined {
    return this.graphs.get(name) as CompiledStateGraph<T> | undefined;
  }

  /**
   * Get graph configuration
   */
  getGraphConfig(name: string): GraphConfig | undefined {
    return this.configs.get(name);
  }

  /**
   * List all registered graphs
   */
  listGraphs(): GraphConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Invoke a graph by name
   */
  async invoke<TInput, TOutput>(
    name: string,
    input: TInput,
  ): Promise<TOutput> {
    const graph = this.getGraph<TInput>(name);
    if (!graph) {
      throw new Error(`Graph ${name} not found`);
    }
    return graph.invoke(input) as Promise<TOutput>;
  }

  /**
   * Check if a graph exists
   */
  hasGraph(name: string): boolean {
    return this.graphs.has(name);
  }
}
```

- [ ] Create `graph-registry.service.ts`
- [ ] Add to agents module providers
- [ ] Inject LLMService and ToolRegistryService
- [ ] Implement lazy graph initialization

---

## Part 2: Reusable Nodes

**Goal**: Create a library of reusable node functions that can be composed into different graphs.

### 2.1 Node Interface

```typescript
// nodes/types.ts
import { LLMService } from '../../../../common/llm/llm.service';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { BaseExplorationStateType } from '../types';

/**
 * Configuration passed to all nodes
 */
export interface NodeConfig {
  llmService: LLMService;
  toolRegistry: ToolRegistryService;
  logger?: Logger;
}

/**
 * Generic node function type
 */
export type NodeFunction<TState> = (
  state: TState,
  config: NodeConfig,
) => Promise<Partial<TState>>;

/**
 * Factory function that creates a configured node
 */
export type NodeFactory<TState> = (
  config: NodeConfig,
) => (state: TState) => Promise<Partial<TState>>;
```

- [ ] Create `nodes/types.ts` with interfaces
- [ ] Define `NodeConfig` for dependency injection
- [ ] Define `NodeFunction` and `NodeFactory` types

### 2.2 Plan Node

```typescript
// nodes/plan.node.ts
import { NodeFactory } from './types';
import { AgentTaskType } from '../../../../common/llm/providers/types';
import { PlanSchema, Plan, parseLLMOutput } from '../types/schemas';

export interface PlanNodeOptions {
  /** Custom planning prompt (optional) */
  customPrompt?: string;
  /** Model to use for planning (optional, defaults to routing) */
  model?: string;
}

/** Default plan when parsing fails */
const DEFAULT_PLAN: Plan = {
  strategy: 'Explore the codebase to find relevant information',
  targetDirectories: ['.', 'src', 'test'],
  filePatterns: ['*.ts', '*.json', '*.md'],
  searchTerms: [],
  actions: ['List directories', 'Search for relevant files', 'Read file contents'],
};

/**
 * Generic planning node that generates a search/action strategy.
 * Uses Zod schema validation for type-safe parsing.
 */
export const createPlanNode = <TState extends { input: string; plan?: Plan }>(
  options: PlanNodeOptions = {},
): NodeFactory<TState> => {
  return (config) => async (state) => {
    const prompt = options.customPrompt || getDefaultPlanPrompt(state.input);

    const response = await config.llmService.invoke({
      messages: [{ role: 'user', content: prompt }],
      taskType: AgentTaskType.ANALYSIS,
      agentName: 'plan-node',
      purpose: 'generate-strategy',
      preferredModel: options.model,
    });

    // Use Zod schema validation instead of raw JSON.parse
    const { data: plan, success, error } = parseLLMOutput(
      response.content,
      PlanSchema,
      DEFAULT_PLAN,
    );

    if (!success) {
      config.logger?.warn(`Plan parsing failed: ${error}. Using default plan.`);
    }

    return { plan } as Partial<TState>;
  };
};

function getDefaultPlanPrompt(input: string): string {
  return `You are a research planner. Given the task, create a search strategy.

Task: ${input}

Generate a JSON plan with:
- strategy: Brief description of how to accomplish the task
- targetDirectories: Array of directories likely to contain relevant information
- filePatterns: Array of file patterns to look for (e.g., "*.json", "*.ts")
- searchTerms: Array of keywords to search for
- actions: Array of specific actions to take

Consider:
1. What type of information would answer this question?
2. Where is that information likely stored?
3. What file types contain that information?
4. What search terms would help locate it?

Return ONLY valid JSON, no markdown code blocks.`;
}
```

- [ ] Create `nodes/plan.node.ts`
- [ ] Implement `createPlanNode` factory
- [ ] Add customizable prompt option
- [ ] Handle JSON parsing errors gracefully
- [ ] Add unit tests

### 2.3 Search Node

```typescript
// nodes/search.node.ts
import { NodeFactory } from './types';
import { BaseExplorationStateType } from '../types';
import { AgentTaskType } from '../../../../common/llm/providers/types';
import { ToolDefinition } from '../../../../common/llm/providers/types';

export interface SearchNodeOptions {
  /** Tool categories to use (default: all) */
  toolCategories?: ('filesystem' | 'atom' | 'code' | 'all')[];
  /** Maximum tools per iteration */
  maxToolsPerIteration?: number;
  /** Custom search prompt */
  customPrompt?: string;
}

/**
 * Collect tools from multiple categories (fixes single-category bug)
 */
function getToolsFromCategories(
  registry: ToolRegistryService,
  categories?: string[],
): ToolDefinition[] {
  if (!categories || categories.length === 0 || categories.includes('all')) {
    return registry.getAllTools();
  }

  // Collect tools from ALL specified categories, deduplicated by name
  const toolMap = new Map<string, ToolDefinition>();
  for (const category of categories) {
    const categoryTools = registry.getToolsByCategory(category);
    for (const tool of categoryTools) {
      if (!toolMap.has(tool.name)) {
        toolMap.set(tool.name, tool);
      }
    }
  }
  return Array.from(toolMap.values());
}

/**
 * Generic search/exploration node that executes tool calls.
 * Uses the plan (if available) to guide exploration.
 */
export const createSearchNode = <TState extends BaseExplorationStateType>(
  options: SearchNodeOptions = {},
): NodeFactory<TState> => {
  return (config) => async (state) => {
    // FIX: Use all specified categories, not just the first one
    const tools = getToolsFromCategories(
      config.toolRegistry,
      options.toolCategories,
    );

    const prompt = options.customPrompt || getDefaultSearchPrompt(state);

    const response = await config.llmService.invoke({
      messages: [...state.messages, { role: 'user', content: prompt }],
      tools,
      taskType: AgentTaskType.CHAT,
      agentName: 'search-node',
      purpose: 'execute-exploration',
    });

    // Execute tool calls
    const newFindings: TState['findings'] = [];
    const newToolHistory: TState['toolHistory'] = [];

    const toolCalls = response.toolCalls || [];
    const maxTools = options.maxToolsPerIteration || toolCalls.length;

    for (const toolCall of toolCalls.slice(0, maxTools)) {
      try {
        const result = await config.toolRegistry.executeTool(
          toolCall.name,
          toolCall.arguments,
        );

        newToolHistory.push({
          tool: toolCall.name,
          args: toolCall.arguments,
          result: JSON.stringify(result).slice(0, 5000), // Truncate large results
          timestamp: new Date(),
        });

        // Extract findings from read_file results
        if (toolCall.name === 'read_file' && result.content) {
          newFindings.push({
            source: toolCall.arguments.file_path as string,
            content: truncateContent(result.content, 2000),
            relevance: 'File contents',
          });
        }
      } catch (error) {
        config.logger?.warn(`Tool ${toolCall.name} failed: ${error.message}`);
        newToolHistory.push({
          tool: toolCall.name,
          args: toolCall.arguments,
          result: `Error: ${error.message}`,
          timestamp: new Date(),
        });
      }
    }

    return {
      findings: newFindings,
      toolHistory: newToolHistory,
      iteration: state.iteration + 1,
    } as Partial<TState>;
  };
};

function getDefaultSearchPrompt<TState extends BaseExplorationStateType>(
  state: TState,
): string {
  const planInfo = (state as any).plan
    ? `\nPlan:\n${JSON.stringify((state as any).plan, null, 2)}`
    : '';

  return `You are exploring a codebase to complete a task.

Task: ${state.input}
${planInfo}

Previous findings:
${state.findings.map((f) => `- ${f.source}: ${f.relevance}`).join('\n') || 'None yet'}

Iteration: ${state.iteration + 1} of ${state.maxIterations}

IMPORTANT RULES:
1. If you list a directory and see data files (*.json, *.html, *.xml), READ them
2. Don't just list directories - extract actual data
3. Look for specific values, numbers, metrics in files
4. Each iteration should make progress toward completing the task

What tool calls should you make next?`;
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '\n... (truncated)';
}
```

- [ ] Create `nodes/search.node.ts`
- [ ] Implement `createSearchNode` factory
- [ ] Add tool category filtering
- [ ] Handle tool execution errors
- [ ] Truncate large file contents
- [ ] Add unit tests

### 2.4 Analyze Node

```typescript
// nodes/analyze.node.ts
import { NodeFactory } from './types';
import { BaseExplorationStateType } from '../types';
import { AgentTaskType } from '../../../../common/llm/providers/types';
import {
  AnalyzeResultSchema,
  AnalyzeResult,
  AnalyzeDecisionType,
  parseLLMOutput,
} from '../types/schemas';

export interface AnalyzeNodeOptions {
  /** Custom completion criteria prompt */
  customPrompt?: string;
  /** Use cheaper model for analysis (default: true) */
  useCheapModel?: boolean;
  /** Minimum findings required */
  minFindings?: number;
}

/** Extended state with analysis decision */
export interface AnalyzableState extends BaseExplorationStateType {
  analysisDecision?: AnalyzeDecisionType;
  clarificationNeeded?: string;
}

/** Default result when parsing fails */
const DEFAULT_ANALYZE_RESULT: AnalyzeResult = {
  decision: 'need_more_search',
  reasoning: 'Unable to parse analysis, continuing search',
};

/**
 * Analyze node that evaluates whether enough information has been gathered.
 * Returns a decision enum, not just a boolean.
 */
export const createAnalyzeNode = <TState extends AnalyzableState>(
  options: AnalyzeNodeOptions = {},
): NodeFactory<TState> => {
  return (config) => async (state) => {
    // Quick heuristic checks before LLM call
    if (state.iteration >= state.maxIterations) {
      return {
        isComplete: true,
        analysisDecision: 'max_iterations_reached' as AnalyzeDecisionType,
      } as Partial<TState>;
    }

    if (options.minFindings && state.findings.length < options.minFindings) {
      return {
        isComplete: false,
        analysisDecision: 'need_more_search' as AnalyzeDecisionType,
      } as Partial<TState>;
    }

    const prompt = options.customPrompt || getDefaultAnalyzePrompt(state);

    const response = await config.llmService.invoke({
      messages: [{ role: 'user', content: prompt }],
      taskType: AgentTaskType.CLASSIFICATION, // Use cheap model
      agentName: 'analyze-node',
      purpose: 'evaluate-completeness',
    });

    // Use Zod schema validation instead of raw JSON.parse
    const { data: analysis, success, error } = parseLLMOutput(
      response.content,
      AnalyzeResultSchema,
      DEFAULT_ANALYZE_RESULT,
    );

    if (!success) {
      config.logger?.warn(`Analyze parsing failed: ${error}`);
    }

    // Map decision enum to state
    const isComplete =
      analysis.decision === 'ready_to_answer' ||
      analysis.decision === 'max_iterations_reached';

    return {
      isComplete,
      analysisDecision: analysis.decision,
      clarificationNeeded: analysis.clarificationNeeded,
    } as Partial<TState>;
  };
};

function getDefaultAnalyzePrompt<TState extends BaseExplorationStateType>(
  state: TState,
): string {
  return `Evaluate whether you have enough information to complete this task.

Task: ${state.input}

Findings so far (${state.findings.length} items):
${state.findings.map((f) => `### ${f.source}\n${f.content.slice(0, 500)}`).join('\n\n')}

Iteration: ${state.iteration} of ${state.maxIterations}

Consider:
1. Do the findings contain actual DATA (numbers, metrics, specific content)?
2. Or just directory listings and file names?
3. Can you give a specific, data-backed answer to the task?
4. Is the question ambiguous and needs user clarification?

Respond with JSON:
{
  "decision": "need_more_search" | "ready_to_answer" | "request_clarification",
  "reasoning": "Brief explanation of your decision",
  "missingInfo": ["What's still needed"],  // if decision is need_more_search
  "clarificationNeeded": "Question for user", // if decision is request_clarification
  "confidence": 0.0 to 1.0  // how confident in the decision
}

Decision meanings:
- "need_more_search": Need to explore more files/directories
- "ready_to_answer": Have sufficient information to provide a complete answer
- "request_clarification": The question is ambiguous, need user input`;
}
```

- [ ] Create `nodes/analyze.node.ts`
- [ ] Implement `createAnalyzeNode` factory
- [ ] Add heuristic fast-path checks
- [ ] Use cheap model for cost efficiency
- [ ] Add unit tests

### 2.5 Synthesize Node

```typescript
// nodes/synthesize.node.ts
import { NodeFactory } from './types';
import { BaseExplorationStateType } from '../types';
import { AgentTaskType } from '../../../../common/llm/providers/types';

export interface SynthesizeNodeOptions {
  /** Custom synthesis prompt */
  customPrompt?: string;
  /** Output format instructions */
  formatInstructions?: string;
  /** Include citations (default: true) */
  includeCitations?: boolean;
}

/**
 * Synthesize node that generates the final output from findings.
 */
export const createSynthesizeNode = <TState extends BaseExplorationStateType>(
  options: SynthesizeNodeOptions = {},
): NodeFactory<TState> => {
  return (config) => async (state) => {
    const prompt = options.customPrompt || getDefaultSynthesizePrompt(state, options);

    const response = await config.llmService.invoke({
      messages: [{ role: 'user', content: prompt }],
      tools: [], // No tools - force synthesis
      taskType: AgentTaskType.SUMMARIZATION,
      agentName: 'synthesize-node',
      purpose: 'generate-output',
    });

    return {
      output: response.content,
      isComplete: true,
    } as Partial<TState>;
  };
};

function getDefaultSynthesizePrompt<TState extends BaseExplorationStateType>(
  state: TState,
  options: SynthesizeNodeOptions,
): string {
  const formatInstructions = options.formatInstructions || '';
  const citationInstruction = options.includeCitations !== false
    ? '2. Cite sources (file paths) for key facts\n'
    : '';

  return `Based on your research, provide a comprehensive response.

Task: ${state.input}

Findings:
${state.findings.map((f) => `### ${f.source}\n${f.content}`).join('\n\n')}

REQUIREMENTS:
1. Include specific data from the findings (numbers, metrics, actual content)
${citationInstruction}3. If findings are incomplete, acknowledge what couldn't be determined
4. Be direct and informative
${formatInstructions}

Provide your final response:`;
}
```

- [ ] Create `nodes/synthesize.node.ts`
- [ ] Implement `createSynthesizeNode` factory
- [ ] Add format customization options
- [ ] Include citation support
- [ ] Add unit tests

### 2.6 Node Index

```typescript
// nodes/index.ts
export * from './types';
export * from './plan.node';
export * from './search.node';
export * from './analyze.node';
export * from './synthesize.node';

// Convenience: Pre-configured default nodes
export { createPlanNode as planNode } from './plan.node';
export { createSearchNode as searchNode } from './search.node';
export { createAnalyzeNode as analyzeNode } from './analyze.node';
export { createSynthesizeNode as synthesizeNode } from './synthesize.node';
```

- [ ] Create `nodes/index.ts` with all exports
- [ ] Add convenience exports for common configurations

---

## Part 3: Reusable Edges

**Goal**: Create reusable edge condition functions for graph routing.

### 3.1 Should Continue Edge

```typescript
// edges/should-continue.ts
import { BaseExplorationStateType } from '../types';
import { AnalyzeDecisionType } from '../types/schemas';

export type EdgeDecision = string; // Node name to route to

/** State with analysis decision for richer routing */
export interface DecisionAwareState extends BaseExplorationStateType {
  analysisDecision?: AnalyzeDecisionType;
  clarificationNeeded?: string;
}

/**
 * Decision-based routing edge that handles all AnalyzeDecision cases.
 * This is the preferred edge for ReAct graphs.
 */
export function createDecisionEdge<TState extends DecisionAwareState>(
  options: {
    searchNode: string;
    synthesizeNode: string;
    clarifyNode?: string; // Optional node for handling clarification requests
  },
): (state: TState) => EdgeDecision {
  return (state) => {
    const decision = state.analysisDecision;

    switch (decision) {
      case 'ready_to_answer':
      case 'max_iterations_reached':
        return options.synthesizeNode;

      case 'request_clarification':
        // Route to clarify node if provided, otherwise synthesize with caveat
        return options.clarifyNode || options.synthesizeNode;

      case 'need_more_search':
      default:
        // Check iteration limit as safety
        if (state.iteration >= state.maxIterations) {
          return options.synthesizeNode;
        }
        return options.searchNode;
    }
  };
}

/**
 * Legacy "should continue" edge for backwards compatibility.
 * Prefer createDecisionEdge for new graphs.
 */
export function createShouldContinueEdge<TState extends BaseExplorationStateType>(
  options: {
    continueNode: string;
    completeNode: string;
  },
): (state: TState) => EdgeDecision {
  return (state) => {
    if (state.isComplete || state.iteration >= state.maxIterations) {
      return options.completeNode;
    }
    return options.continueNode;
  };
}

/**
 * Simple edge that always routes to analyze after search
 */
export function alwaysAnalyze<TState>(): (state: TState) => 'analyze' {
  return () => 'analyze';
}
```

- [ ] Create `edges/should-continue.ts`
- [ ] Implement `createDecisionEdge` for rich decision routing
- [ ] Implement `createShouldContinueEdge` for backwards compatibility
- [ ] Add helper functions for common patterns

### 3.2 Quality Gate Edge

```typescript
// edges/quality-gate.ts

/**
 * Quality gate edge that routes based on a score threshold.
 */
export function createQualityGateEdge<TState extends { qualityScore?: number }>(
  options: {
    threshold: number;
    passNode: string;
    failNode: string;
    scoreField?: keyof TState;
  },
): (state: TState) => string {
  return (state) => {
    const scoreField = options.scoreField || 'qualityScore';
    const score = (state as any)[scoreField] ?? 0;
    return score >= options.threshold ? options.passNode : options.failNode;
  };
}
```

- [ ] Create `edges/quality-gate.ts`
- [ ] Implement score-based routing

### 3.3 Edge Index

```typescript
// edges/index.ts
export * from './should-continue';
export * from './quality-gate';
```

- [ ] Create `edges/index.ts`

---

## Part 4: Pattern Builders

**Goal**: Create factory functions that build common graph patterns from reusable nodes.

### 4.1 ReAct Builder

```typescript
// builders/react-builder.ts
import { StateGraph, END } from '@langchain/langgraph';
import { NodeConfig, NodeFactory } from '../nodes/types';
import { BaseExplorationStateType } from '../types';
import { createPlanNode, createSearchNode, createAnalyzeNode, createSynthesizeNode } from '../nodes';
import { createShouldContinueEdge, alwaysAnalyze } from '../edges';

export interface ReactGraphOptions<TState extends BaseExplorationStateType> {
  /** State annotation (schema) */
  stateSchema: any;

  /** Override default nodes */
  nodes?: {
    plan?: NodeFactory<TState>;
    search?: NodeFactory<TState>;
    analyze?: NodeFactory<TState>;
    synthesize?: NodeFactory<TState>;
  };

  /** Override default edges */
  edges?: {
    shouldContinue?: (state: TState) => string;
  };

  /** Skip planning phase */
  skipPlan?: boolean;
}

/**
 * Creates a ReAct (Reasoning + Acting) graph with the standard pattern:
 * PLAN -> SEARCH <-> ANALYZE -> SYNTHESIZE
 */
export function createReactGraph<TState extends BaseExplorationStateType>(
  config: NodeConfig,
  options: ReactGraphOptions<TState>,
) {
  // Create nodes with defaults or overrides
  const planNode = (options.nodes?.plan ?? createPlanNode())(config);
  const searchNode = (options.nodes?.search ?? createSearchNode())(config);
  const analyzeNode = (options.nodes?.analyze ?? createAnalyzeNode())(config);
  const synthesizeNode = (options.nodes?.synthesize ?? createSynthesizeNode())(config);

  // Create edges
  const shouldContinue = options.edges?.shouldContinue ??
    createShouldContinueEdge({ continueNode: 'search', completeNode: 'synthesize' });

  // Build graph
  const builder = new StateGraph(options.stateSchema);

  if (!options.skipPlan) {
    builder
      .addNode('plan', planNode)
      .addEdge('__start__', 'plan')
      .addEdge('plan', 'search');
  } else {
    builder.addEdge('__start__', 'search');
  }

  builder
    .addNode('search', searchNode)
    .addNode('analyze', analyzeNode)
    .addNode('synthesize', synthesizeNode)
    .addEdge('search', 'analyze')
    .addConditionalEdges('analyze', shouldContinue)
    .addEdge('synthesize', END);

  return builder.compile();
}
```

- [ ] Create `builders/react-builder.ts`
- [ ] Implement `createReactGraph` factory
- [ ] Support node overrides
- [ ] Support edge overrides
- [ ] Support skipPlan option
- [ ] Add unit tests

### 4.2 Plan-Execute Builder

```typescript
// builders/plan-execute-builder.ts
import { StateGraph, END } from '@langchain/langgraph';
import { NodeConfig, NodeFactory } from '../nodes/types';

export interface PlanExecuteGraphOptions<TState> {
  stateSchema: any;
  nodes: {
    plan: NodeFactory<TState>;
    execute: NodeFactory<TState>;
    validate?: NodeFactory<TState>;
    report: NodeFactory<TState>;
  };
  edges?: {
    afterValidate?: (state: TState) => string;
  };
}

/**
 * Creates a Plan-Execute graph for linear workflows:
 * PLAN -> EXECUTE -> VALIDATE? -> REPORT
 */
export function createPlanExecuteGraph<TState>(
  config: NodeConfig,
  options: PlanExecuteGraphOptions<TState>,
) {
  const planNode = options.nodes.plan(config);
  const executeNode = options.nodes.execute(config);
  const validateNode = options.nodes.validate?.(config);
  const reportNode = options.nodes.report(config);

  const builder = new StateGraph(options.stateSchema)
    .addNode('plan', planNode)
    .addNode('execute', executeNode)
    .addNode('report', reportNode)
    .addEdge('__start__', 'plan')
    .addEdge('plan', 'execute');

  if (validateNode) {
    builder
      .addNode('validate', validateNode)
      .addEdge('execute', 'validate');

    if (options.edges?.afterValidate) {
      builder.addConditionalEdges('validate', options.edges.afterValidate);
    } else {
      builder.addEdge('validate', 'report');
    }
  } else {
    builder.addEdge('execute', 'report');
  }

  builder.addEdge('report', END);

  return builder.compile();
}
```

- [ ] Create `builders/plan-execute-builder.ts`
- [ ] Implement `createPlanExecuteGraph` factory
- [ ] Support optional validation node
- [ ] Add unit tests

### 4.3 Builder Index

```typescript
// builders/index.ts
export * from './react-builder';
export * from './plan-execute-builder';
```

- [ ] Create `builders/index.ts`

---

## Part 5: Composed Graphs

**Goal**: Create specific agent graphs using the builders and reusable components.

### 5.1 Chat Exploration Graph

```typescript
// graphs/chat-exploration.graph.ts
import { Annotation } from '@langchain/langgraph';
import { BaseExplorationState } from '../types';
import { createReactGraph } from '../builders';
import { NodeConfig } from '../nodes/types';

/**
 * Extended state for chat exploration with planning
 */
export const ChatExplorationState = Annotation.Root({
  ...BaseExplorationState.spec,

  // Planning information
  plan: Annotation<{
    strategy: string;
    targetDirectories: string[];
    filePatterns: string[];
    searchTerms: string[];
  } | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
});

export type ChatExplorationStateType = typeof ChatExplorationState.State;

/**
 * Create the chat exploration graph using ReAct pattern
 */
export function createChatExplorationGraph(config: NodeConfig) {
  return createReactGraph<ChatExplorationStateType>(config, {
    stateSchema: ChatExplorationState,
    // Use all defaults - no customization needed
  });
}
```

- [ ] Create `graphs/chat-exploration.graph.ts`
- [ ] Define `ChatExplorationState` extending base
- [ ] Implement `createChatExplorationGraph`

### 5.2 Register Graphs in Registry

```typescript
// Update graph-registry.service.ts initializeGraphs()
private async initializeGraphs(): Promise<void> {
  const nodeConfig: NodeConfig = {
    llmService: this.llmService,
    toolRegistry: this.toolRegistry,
    logger: this.logger,
  };

  // Register chat exploration graph
  const chatGraph = createChatExplorationGraph(nodeConfig);
  this.registerGraph('chat-exploration', chatGraph, {
    description: 'ReAct agent for exploring codebase and answering questions',
    stateType: 'ChatExplorationState',
    pattern: 'react',
  });

  this.logger.log(`Initialized ${this.graphs.size} graphs`);
}
```

- [ ] Update `GraphRegistryService.initializeGraphs()`
- [ ] Register chat exploration graph
- [ ] Add logging for initialization

### 5.3 Graphs Index

```typescript
// graphs/index.ts
export * from './chat-exploration.graph';
// Future: export * from './atomization.graph';
// Future: export * from './brownfield.graph';
```

- [ ] Create `graphs/index.ts`

---

## Part 6: Integration with Chat Agent

**Goal**: Update ChatAgentService to use the graph registry.

### 6.1 Update Chat Agent Service

```typescript
// src/modules/agents/chat-agent.service.ts
@Injectable()
export class ChatAgentService {
  private readonly logger = new Logger(ChatAgentService.name);
  private sessions: Map<string, ChatSession> = new Map();
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  constructor(
    private readonly graphRegistry: GraphRegistryService,
  ) {
    setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
  }

  async chat(request: ChatRequestDto): Promise<ChatResponseDto> {
    const startTime = Date.now();
    const session = this.getOrCreateSession(request.sessionId, request.context);

    session.messages.push({ role: 'user', content: request.message });
    session.lastActivityAt = new Date();

    this.logger.log(`Chat request in session ${session.id}: ${request.message.slice(0, 50)}...`);

    try {
      // Use the graph registry to invoke the chat exploration graph
      const result = await this.graphRegistry.invoke<
        { input: string; maxIterations: number },
        ChatExplorationStateType
      >('chat-exploration', {
        input: request.message,
        maxIterations: 5,
      });

      // Map graph result to response DTO
      const response: ChatResponseDto = {
        sessionId: session.id,
        message: result.output || 'I was unable to find an answer.',
        toolCalls: result.toolHistory.map((t, i) => ({
          id: `tool-${i}`,
          name: t.tool,
          arguments: t.args,
        })),
        toolResults: result.toolHistory.map((t, i) => ({
          toolCallId: `tool-${i}`,
          name: t.tool,
          result: t.result,
          success: !t.result.startsWith('Error:'),
        })),
        suggestedActions: this.generateSuggestedActions(request.message, result),
      };

      session.messages.push({ role: 'assistant', content: response.message });

      const latencyMs = Date.now() - startTime;
      this.logger.log(`Chat response generated in ${latencyMs}ms (${result.iteration} iterations)`);

      return response;
    } catch (error) {
      this.logger.error(`Chat error: ${error.message}`, error.stack);
      // ... error handling unchanged
    }
  }

  // ... other methods unchanged
}
```

- [ ] Inject GraphRegistryService instead of LLMService/ToolRegistry
- [ ] Update chat() to use `graphRegistry.invoke()`
- [ ] Map graph state to ChatResponseDto
- [ ] Remove old manual tool loop code
- [ ] Update error handling

### 6.2 Update Module Dependencies

```typescript
// src/modules/agents/agents.module.ts
@Module({
  imports: [/* ... */],
  providers: [
    // Tools
    ToolRegistryService,
    AtomToolsService,
    // Graphs (NEW)
    GraphRegistryService,
    // Agents
    ChatAgentService,
    // ...
  ],
  exports: [
    ToolRegistryService,
    GraphRegistryService, // Export for other modules
    ChatAgentService,
  ],
})
export class AgentsModule {}
```

- [ ] Add GraphRegistryService to providers
- [ ] Export GraphRegistryService
- [ ] Update ChatAgentService dependencies

---

## Part 7: Testing

**Goal**: Comprehensive test coverage for all components.

### 7.1 Node Unit Tests

- [ ] Test `createPlanNode` generates valid plans
- [ ] Test `createSearchNode` executes tools correctly
- [ ] Test `createAnalyzeNode` detects sufficient/insufficient info
- [ ] Test `createSynthesizeNode` generates answers with citations
- [ ] Test nodes handle errors gracefully

### 7.2 Edge Unit Tests

- [ ] Test `createShouldContinueEdge` routing logic
- [ ] Test `createQualityGateEdge` threshold logic

### 7.3 Builder Unit Tests

- [ ] Test `createReactGraph` builds valid graph
- [ ] Test `createReactGraph` with custom nodes
- [ ] Test `createReactGraph` with skipPlan option
- [ ] Test `createPlanExecuteGraph` builds valid graph

### 7.4 Integration Tests

- [ ] Test full chat exploration graph execution
- [ ] Test graph handles tool errors gracefully
- [ ] Test graph respects max iterations
- [ ] Test GraphRegistryService registration and invocation

### 7.5 E2E Tests

- [ ] Test "What's the test coverage?" query
- [ ] Test "How is X implemented?" query
- [ ] Test "What dependencies exist?" query
- [ ] Test query with no relevant data (graceful failure)

### 7.6 Evaluation Harness

**Purpose**: Systematic evaluation of agent quality with canonical test prompts.

**Problem**: Without a standardized evaluation suite, we can't measure agent improvements or detect regressions.

**Solution**: Create ~30 canonical prompts covering different query types, with expected behaviors.

```typescript
// test/evaluation/canonical-prompts.ts

export interface EvalPrompt {
  id: string;
  category: 'data-finding' | 'code-understanding' | 'metrics' | 'ambiguous' | 'edge-case';
  prompt: string;
  expectedBehavior: {
    shouldReadFiles: boolean;
    minFindings: number;
    maxIterations: number;
    mustContain?: string[];      // Strings that must appear in output
    mustNotContain?: string[];   // Strings that must NOT appear
    expectedDecision?: 'ready_to_answer' | 'request_clarification';
  };
  difficulty: 'easy' | 'medium' | 'hard';
}

export const CANONICAL_PROMPTS: EvalPrompt[] = [
  // === DATA FINDING (10 prompts) ===
  {
    id: 'DF-001',
    category: 'data-finding',
    prompt: "What's the current test coverage percentage?",
    expectedBehavior: {
      shouldReadFiles: true,
      minFindings: 1,
      maxIterations: 3,
      mustContain: ['%', 'coverage'],
    },
    difficulty: 'easy',
  },
  {
    id: 'DF-002',
    category: 'data-finding',
    prompt: 'How many atoms are defined in the system?',
    expectedBehavior: {
      shouldReadFiles: true,
      minFindings: 1,
      maxIterations: 3,
    },
    difficulty: 'easy',
  },
  {
    id: 'DF-003',
    category: 'data-finding',
    prompt: 'What test quality issues were found in the last analysis?',
    expectedBehavior: {
      shouldReadFiles: true,
      minFindings: 1,
      maxIterations: 4,
      mustContain: ['quality'],
    },
    difficulty: 'medium',
  },
  {
    id: 'DF-004',
    category: 'data-finding',
    prompt: 'List all API endpoints defined in the backend',
    expectedBehavior: {
      shouldReadFiles: true,
      minFindings: 3,
      maxIterations: 5,
      mustContain: ['endpoint', '/'],
    },
    difficulty: 'medium',
  },
  {
    id: 'DF-005',
    category: 'data-finding',
    prompt: 'What database migrations exist and what do they do?',
    expectedBehavior: {
      shouldReadFiles: true,
      minFindings: 2,
      maxIterations: 4,
      mustContain: ['migration'],
    },
    difficulty: 'medium',
  },

  // === CODE UNDERSTANDING (8 prompts) ===
  {
    id: 'CU-001',
    category: 'code-understanding',
    prompt: 'How does the LLM service route requests to different providers?',
    expectedBehavior: {
      shouldReadFiles: true,
      minFindings: 2,
      maxIterations: 4,
      mustContain: ['provider', 'route'],
    },
    difficulty: 'medium',
  },
  {
    id: 'CU-002',
    category: 'code-understanding',
    prompt: 'What tools are available to agents and how are they registered?',
    expectedBehavior: {
      shouldReadFiles: true,
      minFindings: 2,
      maxIterations: 4,
      mustContain: ['tool', 'registry'],
    },
    difficulty: 'medium',
  },
  {
    id: 'CU-003',
    category: 'code-understanding',
    prompt: 'Explain the atom lifecycle from draft to committed',
    expectedBehavior: {
      shouldReadFiles: true,
      minFindings: 2,
      maxIterations: 5,
      mustContain: ['draft', 'committed'],
    },
    difficulty: 'hard',
  },

  // === METRICS (5 prompts) ===
  {
    id: 'MT-001',
    category: 'metrics',
    prompt: 'What is the line count breakdown by file type in the codebase?',
    expectedBehavior: {
      shouldReadFiles: false, // Can use tools
      minFindings: 1,
      maxIterations: 3,
    },
    difficulty: 'easy',
  },
  {
    id: 'MT-002',
    category: 'metrics',
    prompt: 'How many tests are passing vs failing?',
    expectedBehavior: {
      shouldReadFiles: true,
      minFindings: 1,
      maxIterations: 3,
      mustContain: ['pass', 'fail'],
    },
    difficulty: 'easy',
  },

  // === AMBIGUOUS (4 prompts) - Should request clarification ===
  {
    id: 'AM-001',
    category: 'ambiguous',
    prompt: 'Fix the bug',
    expectedBehavior: {
      shouldReadFiles: false,
      minFindings: 0,
      maxIterations: 2,
      expectedDecision: 'request_clarification',
    },
    difficulty: 'easy',
  },
  {
    id: 'AM-002',
    category: 'ambiguous',
    prompt: 'Is it good?',
    expectedBehavior: {
      shouldReadFiles: false,
      minFindings: 0,
      maxIterations: 2,
      expectedDecision: 'request_clarification',
    },
    difficulty: 'easy',
  },

  // === EDGE CASES (3 prompts) ===
  {
    id: 'EC-001',
    category: 'edge-case',
    prompt: 'What is in the file /nonexistent/path/file.ts?',
    expectedBehavior: {
      shouldReadFiles: false, // File doesn't exist
      minFindings: 0,
      maxIterations: 2,
      mustContain: ['not found', 'does not exist'],
    },
    difficulty: 'easy',
  },
  {
    id: 'EC-002',
    category: 'edge-case',
    prompt: '', // Empty prompt
    expectedBehavior: {
      shouldReadFiles: false,
      minFindings: 0,
      maxIterations: 1,
      expectedDecision: 'request_clarification',
    },
    difficulty: 'easy',
  },
];
```

```typescript
// test/evaluation/eval-runner.ts

export interface EvalResult {
  promptId: string;
  passed: boolean;
  metrics: {
    iterations: number;
    findingsCount: number;
    readFilesCalled: boolean;
    finalDecision: string;
    outputContainsRequired: boolean;
    outputExcludesForbidden: boolean;
    latencyMs: number;
  };
  failures: string[];
}

export async function runEvaluation(
  graphRegistry: GraphRegistryService,
  prompts: EvalPrompt[] = CANONICAL_PROMPTS,
): Promise<{ results: EvalResult[]; summary: EvalSummary }> {
  const results: EvalResult[] = [];

  for (const prompt of prompts) {
    const start = Date.now();
    const result = await graphRegistry.invoke('chat-exploration', {
      input: prompt.prompt,
      maxIterations: prompt.expectedBehavior.maxIterations + 1,
    });

    const evalResult = evaluateResult(prompt, result, Date.now() - start);
    results.push(evalResult);
  }

  return {
    results,
    summary: summarizeResults(results),
  };
}

function evaluateResult(
  prompt: EvalPrompt,
  result: ChatExplorationStateType,
  latencyMs: number,
): EvalResult {
  const failures: string[] = [];

  // Check file reading behavior
  const readFilesCalled = result.toolHistory.some(t => t.tool === 'read_file');
  if (prompt.expectedBehavior.shouldReadFiles && !readFilesCalled) {
    failures.push('Expected to read files but did not');
  }

  // Check findings count
  if (result.findings.length < prompt.expectedBehavior.minFindings) {
    failures.push(
      `Expected at least ${prompt.expectedBehavior.minFindings} findings, got ${result.findings.length}`
    );
  }

  // Check iterations
  if (result.iteration > prompt.expectedBehavior.maxIterations) {
    failures.push(
      `Exceeded max iterations: ${result.iteration} > ${prompt.expectedBehavior.maxIterations}`
    );
  }

  // Check output content
  const output = result.output?.toLowerCase() || '';
  const containsRequired = prompt.expectedBehavior.mustContain?.every(
    s => output.includes(s.toLowerCase())
  ) ?? true;
  if (!containsRequired) {
    failures.push(`Output missing required content: ${prompt.expectedBehavior.mustContain}`);
  }

  const excludesForbidden = prompt.expectedBehavior.mustNotContain?.every(
    s => !output.includes(s.toLowerCase())
  ) ?? true;
  if (!excludesForbidden) {
    failures.push(`Output contains forbidden content: ${prompt.expectedBehavior.mustNotContain}`);
  }

  // Check decision
  if (prompt.expectedBehavior.expectedDecision) {
    if (result.analysisDecision !== prompt.expectedBehavior.expectedDecision) {
      failures.push(
        `Expected decision ${prompt.expectedBehavior.expectedDecision}, got ${result.analysisDecision}`
      );
    }
  }

  return {
    promptId: prompt.id,
    passed: failures.length === 0,
    metrics: {
      iterations: result.iteration,
      findingsCount: result.findings.length,
      readFilesCalled,
      finalDecision: result.analysisDecision || 'unknown',
      outputContainsRequired: containsRequired,
      outputExcludesForbidden: excludesForbidden,
      latencyMs,
    },
    failures,
  };
}

export interface EvalSummary {
  totalPrompts: number;
  passed: number;
  failed: number;
  passRate: number;
  byCategory: Record<string, { passed: number; total: number }>;
  byDifficulty: Record<string, { passed: number; total: number }>;
  avgLatencyMs: number;
}
```

**Checklist**:

- [ ] Create `test/evaluation/` directory
- [ ] Create `canonical-prompts.ts` with 30 test prompts
- [ ] Create `eval-runner.ts` with evaluation logic
- [ ] Add npm script: `npm run eval:agent`
- [ ] Create evaluation report generator (HTML/JSON)
- [ ] Add to CI as optional quality gate (warn, don't fail initially)
- [ ] Document how to add new canonical prompts

**Success Criteria**:

- Pass rate ≥ 80% on canonical prompts
- All "easy" difficulty prompts pass
- ≥ 70% of "medium" difficulty prompts pass
- Ambiguous prompts correctly request clarification

---

## Part 8: Documentation

**Goal**: Document the composable architecture.

### 8.1 Architecture Documentation

- [ ] Create `docs/architecture/langgraph-composable-agents.md`
- [ ] Document the layered architecture (nodes → builders → graphs → registry)
- [ ] Document state composition patterns
- [ ] Include diagram of component relationships

### 8.2 Developer Guide

- [ ] Create `docs/developer-guide/creating-agent-graphs.md`
- [ ] Document how to create custom nodes
- [ ] Document how to compose graphs from existing nodes
- [ ] Document how to register new graphs
- [ ] Include step-by-step examples

### 8.3 API Documentation

- [ ] Document GraphRegistryService API
- [ ] Document node factory signatures
- [ ] Document builder options

---

## Implementation Order

**Recommended sequence**:

1. **Part 1** (Infrastructure) - Directory structure, types, registry
2. **Part 2** (Nodes) - Reusable node library
3. **Part 3** (Edges) - Reusable edge conditions
4. **Part 4** (Builders) - Pattern templates
5. **Part 5** (Graphs) - Compose chat exploration graph
6. **Part 6** (Integration) - Update ChatAgentService
7. **Part 7** (Testing) - Comprehensive tests
8. **Part 8** (Documentation) - Architecture docs

**Parallel work possible**:

- Part 2 nodes can be developed in parallel
- Part 3 edges can parallel Part 2
- Part 8 documentation can start after Part 1

---

## Technical Decisions

### Why Composable Architecture

| Aspect | Monolithic | Composable |
|--------|------------|------------|
| Code reuse | Copy-paste | Import and configure |
| Testing | Mock everything | Test nodes independently |
| New agents | Write from scratch | Compose from pieces |
| Maintenance | N implementations | 1 implementation, N compositions |
| Learning curve | Understand one agent | Understand pattern library |

### Graph Compilation Strategy

**Compile at registry initialization**, not per-request:

```typescript
onModuleInit() {
  this.registerGraph('chat-exploration', createChatExplorationGraph(config));
}
```

Benefits:
- No per-request compilation overhead
- Early validation of graph structure
- Consistent graph instances

### State Extension Pattern

Use TypeScript intersection for state composition:

```typescript
export const CustomState = Annotation.Root({
  ...BaseExplorationState.spec,
  customField: Annotation<string>,
});
```

This allows extending base state without modification.

---

## Dependencies

### Existing (Already Installed)

```json
{
  "@langchain/langgraph": "^0.2.3",
  "@langchain/core": "^0.3.0"
}
```

### New Dependencies Required

```json
{
  "@langchain/langgraph-checkpoint-postgres": "^0.0.x"
}
```

**Note**: The checkpointer package is optional for development but recommended for production durability.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LangGraph API changes | Pin version, abstract behind builders |
| Over-engineering | Start with chat graph, add more only when needed |
| Performance regression | Benchmark vs old implementation |
| Breaking existing chat | Feature flag for gradual rollout |
| Composition complexity | Clear documentation, examples |
| Checkpointer DB overhead | Make checkpointer optional, TTL cleanup |
| Zod schema drift | Generate schemas from TypeScript types where possible |
| Eval flakiness | Use deterministic prompts, seed randomness, retry logic |
| LLM output instability | Fallback defaults for all schema validations |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Query success rate | ≥ 90% queries return useful data |
| Code reuse | ≥ 2 graphs share nodes |
| Average iterations | 2-3 for simple, 4-5 for complex |
| Test coverage | ≥ 80% for new code |
| Time to create new agent | < 1 hour using existing nodes |
| **Eval harness pass rate** | **≥ 80% of canonical prompts** |
| **Schema validation rate** | **100% of LLM outputs validated** |
| **Clarification accuracy** | **≥ 90% of ambiguous prompts request clarification** |

---

## References

- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
- [LangGraph State Management](https://langchain-ai.github.io/langgraphjs/concepts/low_level/#state)
- [ReAct Paper](https://arxiv.org/abs/2210.03629)
- [Phase 3.5: LLM Service Enhancements](./implementation-checklist-phase3.5.md)
- [Tool Registry Pattern](../src/modules/agents/tools/tool-registry.service.ts)

---

*Phase 3.6 establishes a composable graph architecture that makes future agent development faster and more consistent, while delivering an improved chat experience as the first implementation.*
