/**
 * Interview Graph
 *
 * Multi-turn conversational agent for extracting intent atoms
 * from stakeholder interviews.
 *
 * Flow:
 * ```
 * START -> analyze_intent -> generate_questions -> [interrupt] -> extract_atoms -> compose_molecule -> END
 *                                  ^                   |
 *                                  |   [resume with answers]
 *                                  +------- (via service) ----+
 * ```
 *
 * The graph supports multi-turn interaction via NodeInterrupt:
 * 1. analyze_intent: Analyzes the raw intent
 * 2. generate_questions: Generates questions, then interrupts for user response
 * 3. The InterviewService handles resuming with user answers
 * 4. extract_atoms: Extracts atom candidates from the full conversation
 * 5. compose_molecule: Groups atoms into molecules
 */

import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { NodeConfig } from '../nodes/types';
import { InterviewGraphState, InterviewGraphStateType } from '../types/interview-state';
import {
  createAnalyzeIntentNode,
  AnalyzeIntentNodeOptions,
} from '../nodes/interview/analyze-intent.node';
import {
  createGenerateQuestionsNode,
  GenerateQuestionsNodeOptions,
} from '../nodes/interview/generate-questions.node';
import {
  createExtractAtomsNode,
  ExtractAtomsNodeOptions,
} from '../nodes/interview/extract-atoms.node';
import {
  createComposeMoleculeNode,
  ComposeMoleculeNodeOptions,
} from '../nodes/interview/compose-molecule.node';

/**
 * Options for customizing the interview graph
 */
export interface InterviewGraphOptions {
  /** Custom checkpointer (defaults to MemorySaver) */
  checkpointer?: InstanceType<typeof MemorySaver>;
  /** Per-node options */
  nodeOptions?: {
    analyzeIntent?: AnalyzeIntentNodeOptions;
    generateQuestions?: GenerateQuestionsNodeOptions;
    extractAtoms?: ExtractAtomsNodeOptions;
    composeMolecule?: ComposeMoleculeNodeOptions;
  };
}

/**
 * Routing function: after generate_questions, decide whether to
 * extract atoms (if done) or end (interrupt handles the loop).
 */
function afterGenerateQuestions(state: InterviewGraphStateType): string {
  if (state.currentPhase === 'extract_atoms') {
    return 'extract_atoms';
  }
  // If still in waiting_for_response, the NodeInterrupt will handle it
  return END;
}

/**
 * Creates the interview graph.
 *
 * @param config - Node configuration (LLM, tools, logger)
 * @param options - Optional graph customization
 * @returns Compiled interview graph
 */
export function createInterviewGraph(config: NodeConfig, options?: InterviewGraphOptions) {
  const nodeOptions = options?.nodeOptions || {};

  // Create node functions
  const analyzeIntentNode = createAnalyzeIntentNode(nodeOptions.analyzeIntent)(config);
  const generateQuestionsNode = createGenerateQuestionsNode(nodeOptions.generateQuestions)(config);
  const extractAtomsNode = createExtractAtomsNode(nodeOptions.extractAtoms)(config);
  const composeMoleculeNode = createComposeMoleculeNode(nodeOptions.composeMolecule)(config);

  // Build the graph
  const graph = new StateGraph(InterviewGraphState)
    .addNode('analyze_intent', analyzeIntentNode)
    .addNode('generate_questions', generateQuestionsNode)
    .addNode('extract_atoms', extractAtomsNode)
    .addNode('compose_molecule', composeMoleculeNode)
    .addEdge(START, 'analyze_intent')
    .addEdge('analyze_intent', 'generate_questions')
    .addConditionalEdges('generate_questions', afterGenerateQuestions, {
      extract_atoms: 'extract_atoms',
      [END]: END,
    })
    .addEdge('extract_atoms', 'compose_molecule')
    .addEdge('compose_molecule', END);

  // Compile with checkpointer for pause/resume support
  const checkpointer = options?.checkpointer || new MemorySaver();
  return graph.compile({ checkpointer });
}

/**
 * Graph name for registry
 */
export const INTERVIEW_GRAPH_NAME = 'interview';

/**
 * Graph configuration for registry
 */
export const INTERVIEW_GRAPH_CONFIG = {
  description:
    'Multi-turn interview agent for extracting intent atoms from stakeholder conversations',
  stateType: 'InterviewGraphState',
  pattern: 'custom' as const,
};
