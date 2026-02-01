/**
 * ReAct Pattern Builder
 *
 * Creates a ReAct (Reasoning + Acting) graph with the standard pattern:
 * PLANNING -> SEARCH <-> ANALYZE -> SYNTHESIZE
 *
 * Note: Node is named 'planning' (not 'plan') to avoid conflict with
 * the 'plan' state attribute in LangGraph.
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { NodeConfig } from '../nodes/types';
import { Plan } from '../types/schemas';
import { createPlanNode, PlanNodeOptions } from '../nodes/plan.node';
import { createSearchNode, SearchNodeOptions } from '../nodes/search.node';
import { createAnalyzeNode, AnalyzeNodeOptions } from '../nodes/analyze.node';
import { createSynthesizeNode, SynthesizeNodeOptions } from '../nodes/synthesize.node';
import { createDecisionEdge, DecisionAwareState } from '../edges/should-continue';

/**
 * State requirements for ReAct pattern
 */
export interface ReactState extends DecisionAwareState {
  plan?: Plan | null;
}

/**
 * Options for customizing the ReAct graph
 */
export interface ReactGraphOptions<TState extends ReactState> {
  /** State annotation (schema) - required */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateSchema: any;

  /** Override default node options */
  nodeOptions?: {
    plan?: PlanNodeOptions;
    search?: SearchNodeOptions;
    analyze?: AnalyzeNodeOptions;
    synthesize?: SynthesizeNodeOptions;
  };

  /** Custom node factories (for complete override) */
  customNodes?: {
    plan?: (config: NodeConfig) => (state: TState) => Promise<Partial<TState>>;
    search?: (config: NodeConfig) => (state: TState) => Promise<Partial<TState>>;
    analyze?: (config: NodeConfig) => (state: TState) => Promise<Partial<TState>>;
    synthesize?: (config: NodeConfig) => (state: TState) => Promise<Partial<TState>>;
  };

  /** Skip planning phase */
  skipPlan?: boolean;

  /** Node to handle clarification requests (optional) */
  clarifyNode?: string;
}

/**
 * Creates a ReAct (Reasoning + Acting) graph.
 *
 * Standard flow:
 * ```
 * START -> planning -> search -> analyze -> [decision]
 *                        ^                      |
 *                        |--- need_more_search -+
 *                                               |
 *                        synthesize <- ready ---+
 *                            |
 *                           END
 * ```
 *
 * Note: The planning node is named 'planning' to avoid conflict
 * with the 'plan' state attribute.
 *
 * @param config - Node configuration (LLM, tools, logger)
 * @param options - Graph customization options
 * @returns Compiled state graph
 */
export function createReactGraph<TState extends ReactState>(
  config: NodeConfig,
  options: ReactGraphOptions<TState>,
) {
  // Create nodes with defaults or overrides
  const planNode = options.customNodes?.plan
    ? options.customNodes.plan(config)
    : createPlanNode(options.nodeOptions?.plan)(config);

  const searchNode = options.customNodes?.search
    ? options.customNodes.search(config)
    : createSearchNode(options.nodeOptions?.search)(config);

  const analyzeNode = options.customNodes?.analyze
    ? options.customNodes.analyze(config)
    : createAnalyzeNode(options.nodeOptions?.analyze)(config);

  const synthesizeNode = options.customNodes?.synthesize
    ? options.customNodes.synthesize(config)
    : createSynthesizeNode(options.nodeOptions?.synthesize)(config);

  // Create decision edge
  const decisionEdge = createDecisionEdge<TState>({
    searchNode: 'search',
    synthesizeNode: 'synthesize',
    clarifyNode: options.clarifyNode,
  });

  // Build graph - use type assertion for flexible node naming
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = new StateGraph(options.stateSchema) as any;

  // Add nodes
  // Note: 'planning' node name avoids conflict with 'plan' state attribute
  if (!options.skipPlan) {
    builder.addNode('planning', planNode);
  }
  builder.addNode('search', searchNode);
  builder.addNode('analyze', analyzeNode);
  builder.addNode('synthesize', synthesizeNode);

  // Add edges
  if (!options.skipPlan) {
    builder.addEdge(START, 'planning');
    builder.addEdge('planning', 'search');
  } else {
    builder.addEdge(START, 'search');
  }

  builder.addEdge('search', 'analyze');
  builder.addConditionalEdges('analyze', decisionEdge);
  builder.addEdge('synthesize', END);

  return builder.compile();
}
