/**
 * Graph Registry Service
 *
 * Centralized registry for all LangGraph state machines.
 * Mirrors the pattern of ToolRegistryService for consistency.
 *
 * Provides:
 * - Graph registration and lookup
 * - Graph invocation with optional thread persistence
 * - Session resumption for failure recovery
 */

import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { CompiledStateGraph } from '@langchain/langgraph';
import { LLMService } from '../../../common/llm/llm.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import { ReconciliationAtomInferenceService } from '../reconciliation-atom-inference.service';
import {
  ContentProvider,
  WriteProvider,
  FilesystemContentProvider,
  FilesystemWriteProvider,
} from '../content';
import { CONTENT_PROVIDER } from '../context-builder.service';
import { WRITE_PROVIDER } from '../apply.service';

import { NodeConfig } from './nodes/types';

/**
 * Configuration metadata for a registered graph
 */
export interface GraphConfig {
  /** Unique graph name */
  name: string;
  /** Human-readable description */
  description: string;
  /** State type name for documentation */
  stateType: string;
  /** Pattern used (react, plan-execute, fast-path, custom) */
  pattern: 'react' | 'plan-execute' | 'fast-path' | 'custom';
}

/**
 * Options for graph invocation
 */
export interface InvokeOptions {
  /** Thread ID for session persistence (optional) */
  threadId?: string;
  /** Additional configurable options */
  configurable?: Record<string, unknown>;
  /** Run name for LangSmith tracing (defaults to graph name) */
  runName?: string;
  /** Tags for LangSmith tracing */
  tags?: string[];
  /** Metadata for LangSmith tracing */
  metadata?: Record<string, unknown>;
}

/**
 * Central registry for all LangGraph state machines.
 * Manages graph lifecycle, registration, and invocation.
 */
@Injectable()
export class GraphRegistryService implements OnModuleInit {
  private readonly logger = new Logger(GraphRegistryService.name);
  private graphs = new Map<string, CompiledStateGraph<unknown, unknown>>();
  private configs = new Map<string, GraphConfig>();
  private nodeConfig: NodeConfig;

  constructor(
    private readonly llmService: LLMService,
    private readonly toolRegistry: ToolRegistryService,
    @Optional() private readonly reconciliationRepository?: ReconciliationRepository,
    @Optional()
    private readonly reconciliationAtomInferenceService?: ReconciliationAtomInferenceService,
    @Optional() @Inject(CONTENT_PROVIDER) contentProvider?: ContentProvider,
    @Optional() @Inject(WRITE_PROVIDER) writeProvider?: WriteProvider,
  ) {
    this.nodeConfig = {
      llmService: this.llmService,
      toolRegistry: this.toolRegistry,
      logger: this.logger,
      contentProvider: contentProvider || new FilesystemContentProvider(),
      writeProvider: writeProvider || new FilesystemWriteProvider(),
    };
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing graph registry...');
    await this.initializeGraphs();
  }

  /**
   * Initialize and register all graphs.
   * Called during module initialization.
   */
  private async initializeGraphs(): Promise<void> {
    // Import and register graphs dynamically to avoid circular dependencies
    const {
      createChatExplorationGraph,
      CHAT_EXPLORATION_GRAPH_NAME,
      CHAT_EXPLORATION_GRAPH_CONFIG,
    } = await import('./graphs/chat-exploration.graph');

    const { createCoverageFastGraph, COVERAGE_FAST_GRAPH_NAME, COVERAGE_FAST_GRAPH_CONFIG } =
      await import('./graphs/coverage-fast.graph');

    const { createReconciliationGraph, RECONCILIATION_GRAPH_NAME, RECONCILIATION_GRAPH_CONFIG } =
      await import('./graphs/reconciliation.graph');

    const { createInterviewGraph, INTERVIEW_GRAPH_NAME, INTERVIEW_GRAPH_CONFIG } =
      await import('./graphs/interview.graph');

    // Register chat exploration graph
    const chatGraph = createChatExplorationGraph(this.nodeConfig);
    this.registerGraph(CHAT_EXPLORATION_GRAPH_NAME, chatGraph, CHAT_EXPLORATION_GRAPH_CONFIG);

    // Register coverage fast-path graph
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coverageGraph = createCoverageFastGraph(this.nodeConfig) as any;
    this.registerGraph(COVERAGE_FAST_GRAPH_NAME, coverageGraph, COVERAGE_FAST_GRAPH_CONFIG);

    // Register reconciliation graph with repository for database persistence

    const reconciliationGraph = createReconciliationGraph(this.nodeConfig, {
      nodeOptions: {
        interimPersist: {
          repository: this.reconciliationRepository,
          persistToDatabase: !!this.reconciliationRepository,
        },
        persist: {
          repository: this.reconciliationRepository,
          persistToDatabase: !!this.reconciliationRepository,
          reconciliationAtomInferenceService: this.reconciliationAtomInferenceService,
        },
      },
    }) as any;
    this.registerGraph(RECONCILIATION_GRAPH_NAME, reconciliationGraph, {
      description: RECONCILIATION_GRAPH_CONFIG.description,
      stateType: RECONCILIATION_GRAPH_CONFIG.stateType,
      pattern: 'custom',
    });

    // Register interview graph
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interviewGraph = createInterviewGraph(this.nodeConfig) as any;
    this.registerGraph(INTERVIEW_GRAPH_NAME, interviewGraph, INTERVIEW_GRAPH_CONFIG);

    this.logger.log(`Graph registry initialized with ${this.graphs.size} graphs`);
  }

  /**
   * Get the node configuration for creating graph nodes
   */
  getNodeConfig(): NodeConfig {
    return this.nodeConfig;
  }

  /**
   * Register a compiled graph
   *
   * @param name - Unique identifier for the graph
   * @param graph - Compiled LangGraph state machine
   * @param config - Configuration metadata
   */
  registerGraph<TState, TUpdate>(
    name: string,
    graph: CompiledStateGraph<TState, TUpdate>,
    config: Omit<GraphConfig, 'name'>,
  ): void {
    if (this.graphs.has(name)) {
      this.logger.warn(`Graph ${name} already registered, overwriting`);
    }
    this.graphs.set(name, graph as CompiledStateGraph<unknown, unknown>);
    this.configs.set(name, { name, ...config });
    this.logger.log(`Registered graph: ${name} (${config.pattern} pattern)`);
  }

  /**
   * Get a compiled graph by name
   *
   * @param name - Graph identifier
   * @returns Compiled graph or undefined if not found
   */
  getGraph<TState, TUpdate = Partial<TState>>(
    name: string,
  ): CompiledStateGraph<TState, TUpdate> | undefined {
    return this.graphs.get(name) as CompiledStateGraph<TState, TUpdate> | undefined;
  }

  /**
   * Get graph configuration metadata
   *
   * @param name - Graph identifier
   * @returns Graph configuration or undefined
   */
  getGraphConfig(name: string): GraphConfig | undefined {
    return this.configs.get(name);
  }

  /**
   * List all registered graphs
   *
   * @returns Array of graph configurations
   */
  listGraphs(): GraphConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Check if a graph exists
   *
   * @param name - Graph identifier
   * @returns True if graph is registered
   */
  hasGraph(name: string): boolean {
    return this.graphs.has(name);
  }

  /**
   * Invoke a graph by name
   *
   * @param name - Graph identifier
   * @param input - Input state for the graph
   * @param options - Optional invocation options (threadId, etc.)
   * @returns Final graph state
   * @throws Error if graph not found
   */
  async invoke<TInput, TOutput>(
    name: string,
    input: TInput,
    options?: InvokeOptions,
  ): Promise<TOutput> {
    const graph = this.getGraph(name);
    if (!graph) {
      throw new Error(`Graph '${name}' not found in registry`);
    }

    // Build config with LangSmith tracing options
    const config: Record<string, unknown> = {
      // Use provided runName or default to graph name for easy identification in LangSmith
      runName: options?.runName || `graph:${name}`,
      // Add graph name as a tag for filtering in LangSmith
      tags: ['langgraph', name, ...(options?.tags || [])],
      // Include metadata about the graph
      metadata: {
        graphName: name,
        graphPattern: this.configs.get(name)?.pattern,
        ...options?.metadata,
      },
    };

    // Add configurable options (thread_id, etc.)
    if (options?.threadId || options?.configurable) {
      config.configurable = {
        ...(options?.threadId ? { thread_id: options.threadId } : {}),
        ...options?.configurable,
      };
    }

    this.logger.debug(
      `Invoking graph '${name}'${options?.threadId ? ` with thread ${options.threadId}` : ''}`,
    );

    const startTime = Date.now();
    try {
      const result = await graph.invoke(input, config);
      const duration = Date.now() - startTime;
      this.logger.debug(`Graph '${name}' completed in ${duration}ms`);
      return result as TOutput;
    } catch (error) {
      this.logger.error(`Graph '${name}' failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resume a graph from a checkpoint (requires checkpointer)
   *
   * @param name - Graph identifier
   * @param threadId - Thread ID to resume from
   * @param updateState - Optional state updates before resuming
   * @returns Final graph state
   * @throws Error if graph not found
   */
  async resume<TOutput>(
    name: string,
    threadId: string,
    updateState?: Record<string, unknown>,
  ): Promise<TOutput> {
    const graph = this.getGraph(name);
    if (!graph) {
      throw new Error(`Graph '${name}' not found in registry`);
    }

    // Build config with LangSmith tracing options
    const config: Record<string, unknown> = {
      runName: `graph:${name}:resume`,
      tags: ['langgraph', name, 'resume'],
      metadata: {
        graphName: name,
        graphPattern: this.configs.get(name)?.pattern,
        isResume: true,
        threadId,
      },
      configurable: { thread_id: threadId },
    };

    // Optionally update state before resuming
    if (updateState) {
      await graph.updateState(config, updateState);
    }

    this.logger.debug(`Resuming graph '${name}' from thread ${threadId}`);

    return graph.invoke(null, config) as Promise<TOutput>;
  }

  /**
   * Stream graph execution (for real-time updates)
   *
   * @param name - Graph identifier
   * @param input - Input state for the graph
   * @param options - Optional invocation options
   * @returns AsyncGenerator yielding state updates
   */
  async *stream<TInput, TOutput>(
    name: string,
    input: TInput,
    options?: InvokeOptions,
  ): AsyncGenerator<TOutput> {
    const graph = this.getGraph(name);
    if (!graph) {
      throw new Error(`Graph '${name}' not found in registry`);
    }

    // Build config with LangSmith tracing options
    const config: Record<string, unknown> = {
      runName: options?.runName || `graph:${name}:stream`,
      tags: ['langgraph', name, 'stream', ...(options?.tags || [])],
      metadata: {
        graphName: name,
        graphPattern: this.configs.get(name)?.pattern,
        isStreaming: true,
        ...options?.metadata,
      },
    };

    // Add configurable options (thread_id, etc.)
    if (options?.threadId || options?.configurable) {
      config.configurable = {
        ...(options?.threadId ? { thread_id: options.threadId } : {}),
        ...options?.configurable,
      };
    }

    for await (const chunk of await graph.stream(input, config)) {
      yield chunk as TOutput;
    }
  }
}
