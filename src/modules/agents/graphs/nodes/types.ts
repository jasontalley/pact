/**
 * Node Types
 *
 * Type definitions for reusable node functions in LangGraph.
 */

import { Logger } from '@nestjs/common';
import { LLMService } from '../../../../common/llm/llm.service';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { ContentProvider, WriteProvider } from '../../content';
import { CancellationRegistry } from '../../../../common/cancellation.registry';

/**
 * Configuration passed to all nodes via dependency injection
 */
export interface NodeConfig {
  /** LLM service for model invocations */
  llmService: LLMService;
  /** Tool registry for accessing tools */
  toolRegistry: ToolRegistryService;
  /** Optional logger instance */
  logger?: Logger;
  /** Content provider for filesystem abstraction (optional for backward compatibility) */
  contentProvider?: ContentProvider;
  /** Per-run content provider overrides, keyed by runId (for pre-read mode) */
  contentProviderOverrides?: Map<string, ContentProvider>;
  /** Write provider for file modifications (optional, used by apply service) */
  writeProvider?: WriteProvider;
  /** Cancellation registry for cooperative cancellation of long-running operations */
  cancellationRegistry?: CancellationRegistry;
}

/**
 * Generic node function type.
 * Takes state and config, returns partial state update.
 */
export type NodeFunction<TState> = (state: TState, config: NodeConfig) => Promise<Partial<TState>>;

/**
 * Factory function that creates a configured node.
 * This is the preferred pattern for dependency injection.
 *
 * Usage:
 * ```typescript
 * const planNode = createPlanNode({ customPrompt: '...' })(nodeConfig);
 * // planNode is now (state) => Promise<Partial<State>>
 * ```
 */
export type NodeFactory<TState, TOptions = Record<string, unknown>> = (
  options?: TOptions,
) => (config: NodeConfig) => (state: TState) => Promise<Partial<TState>>;
