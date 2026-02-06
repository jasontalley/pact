/**
 * Chat Exploration Graph
 *
 * ReAct-based graph for exploring codebases and answering questions.
 * Uses the standard ReAct pattern: Plan -> Search <-> Analyze -> Synthesize
 */

import { NodeConfig } from '../nodes/types';
import { ChatExplorationState, ChatExplorationStateType } from '../types/exploration-state';
import { createReactGraph } from '../builders/react-builder';

/**
 * Creates the chat exploration graph using ReAct pattern.
 *
 * This graph is designed for data-finding queries like:
 * - "What's the test coverage?"
 * - "How is X implemented?"
 * - "What dependencies exist?"
 *
 * @param config - Node configuration (LLM, tools, logger)
 * @returns Compiled chat exploration graph
 */
export function createChatExplorationGraph(config: NodeConfig) {
  return createReactGraph<ChatExplorationStateType>(config, {
    stateSchema: ChatExplorationState,
    nodeOptions: {
      search: {
        // Use filesystem tools by default for exploration
        toolCategories: ['filesystem', 'code'],
        maxToolsPerIteration: 5,
      },
      analyze: {
        // Require at least one finding before doing LLM analysis
        minFindings: 1,
      },
      synthesize: {
        // Include citations by default
        includeCitations: true,
      },
    },
  });
}

/**
 * Graph name for registry
 */
export const CHAT_EXPLORATION_GRAPH_NAME = 'chat-exploration';

/**
 * Graph configuration for registry
 */
export const CHAT_EXPLORATION_GRAPH_CONFIG = {
  description: 'ReAct agent for exploring codebase and answering questions',
  stateType: 'ChatExplorationState',
  pattern: 'react' as const,
};
