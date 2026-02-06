/**
 * Should Continue Edges
 *
 * Edge conditions for controlling graph flow based on state.
 */

import { BaseExplorationStateType } from '../types/base-state';
import { AnalyzeDecisionType } from '../types/schemas';

/**
 * Edge decision type - returns the name of the next node
 */
export type EdgeDecision = string;

/**
 * State with analysis decision for richer routing
 */
export interface DecisionAwareState extends BaseExplorationStateType {
  analysisDecision?: AnalyzeDecisionType | null;
  clarificationNeeded?: string | null;
}

/**
 * Decision-based routing edge that handles all AnalyzeDecision cases.
 * This is the preferred edge for ReAct graphs.
 *
 * @param options - Node names for each routing decision
 * @returns Edge function
 */
export function createDecisionEdge<TState extends DecisionAwareState>(options: {
  searchNode: string;
  synthesizeNode: string;
  clarifyNode?: string;
}): (state: TState) => EdgeDecision {
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
 *
 * @param options - Node names for continue vs complete
 * @returns Edge function
 */
export function createShouldContinueEdge<TState extends BaseExplorationStateType>(options: {
  continueNode: string;
  completeNode: string;
}): (state: TState) => EdgeDecision {
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

/**
 * Simple edge that always routes to a specific node
 *
 * @param nodeName - Target node name
 * @returns Edge function
 */
export function alwaysRouteTo<TState>(nodeName: string): (state: TState) => string {
  return () => nodeName;
}
