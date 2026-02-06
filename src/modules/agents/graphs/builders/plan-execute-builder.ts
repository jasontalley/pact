/**
 * Plan-Execute Pattern Builder
 *
 * Creates a linear workflow graph:
 * PLAN -> EXECUTE -> VALIDATE? -> REPORT
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { NodeConfig } from '../nodes/types';

/**
 * Options for customizing the Plan-Execute graph
 */
export interface PlanExecuteGraphOptions<TState> {
  /** State annotation (schema) - required */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateSchema: any;

  /** Node implementations - all required except validate */
  nodes: {
    plan: (config: NodeConfig) => (state: TState) => Promise<Partial<TState>>;
    execute: (config: NodeConfig) => (state: TState) => Promise<Partial<TState>>;
    validate?: (config: NodeConfig) => (state: TState) => Promise<Partial<TState>>;
    report: (config: NodeConfig) => (state: TState) => Promise<Partial<TState>>;
  };

  /** Custom edge after validation */
  edges?: {
    afterValidate?: (state: TState) => string;
  };
}

/**
 * Creates a Plan-Execute graph for linear workflows.
 *
 * Standard flow:
 * ```
 * START -> plan -> execute -> validate? -> report -> END
 * ```
 *
 * @param config - Node configuration (LLM, tools, logger)
 * @param options - Graph customization options
 * @returns Compiled state graph
 */
export function createPlanExecuteGraph<TState>(
  config: NodeConfig,
  options: PlanExecuteGraphOptions<TState>,
) {
  const planNode = options.nodes.plan(config);
  const executeNode = options.nodes.execute(config);
  const validateNode = options.nodes.validate?.(config);
  const reportNode = options.nodes.report(config);

  // Build graph - use type assertion for flexible node naming
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = new StateGraph(options.stateSchema) as any;

  // Add nodes
  builder.addNode('plan', planNode);
  builder.addNode('execute', executeNode);
  builder.addNode('report', reportNode);

  // Add edges
  builder.addEdge(START, 'plan');
  builder.addEdge('plan', 'execute');

  if (validateNode) {
    builder.addNode('validate', validateNode);
    builder.addEdge('execute', 'validate');

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
