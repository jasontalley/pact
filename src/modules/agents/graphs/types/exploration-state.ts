/**
 * Exploration State
 *
 * Extended state for chat exploration workflows with planning.
 */

import { Annotation } from '@langchain/langgraph';
import { BaseExplorationState } from './base-state';
import { Plan, AnalyzeDecisionType } from './schemas';

/**
 * State for chat exploration graphs (ReAct pattern)
 * Extends base state with planning and analysis decision fields.
 */
export const ChatExplorationState = Annotation.Root({
  ...BaseExplorationState.spec,

  // Planning information
  plan: Annotation<Plan | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Analysis decision (richer than boolean isComplete)
  analysisDecision: Annotation<AnalyzeDecisionType | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Clarification request for user (if decision is 'request_clarification')
  clarificationNeeded: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
});

export type ChatExplorationStateType = typeof ChatExplorationState.State;
