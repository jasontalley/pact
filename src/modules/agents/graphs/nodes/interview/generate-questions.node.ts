/**
 * Generate Questions Node
 *
 * Generates clarifying questions based on the intent analysis
 * and any previous conversation context. Uses NodeInterrupt
 * to pause for user responses.
 *
 * On resume: processes user answers and decides whether to
 * ask more questions or proceed to atom extraction.
 */

import { v4 as uuidv4 } from 'uuid';
import { NodeConfig } from '../types';
import {
  InterviewGraphStateType,
  InterviewQuestion,
  ConversationTurn,
  CompletionReason,
} from '../../types/interview-state';
import { AgentTaskType } from '../../../../../common/llm/providers/types';
import { NodeInterrupt } from '@langchain/langgraph';

export interface GenerateQuestionsNodeOptions {
  /** Maximum questions per round */
  maxQuestionsPerRound?: number;
  /**
   * Stochastic mode: LLM-based interviewee callback.
   * When provided, bypasses NodeInterrupt and instead calls this function
   * to get interviewee responses for the generated questions.
   */
  intervieweeCallback?: (
    questions: InterviewQuestion[],
    conversationHistory: ConversationTurn[],
    round: number,
  ) => Promise<{ content: string; signalsDone: boolean }>;
}

const QUESTION_GENERATION_PROMPT = `You are a requirements analyst. Based on the intent analysis and conversation so far, generate clarifying questions to help extract precise, testable intent atoms.

Focus on:
- **Scope**: What's included/excluded?
- **Behavior**: What exactly should happen? Under what conditions?
- **Constraints**: Performance, security, or operational requirements?
- **Acceptance**: How would we know this is done correctly?
- **Edge Cases**: What happens in unusual situations?

Scope rules:
- Do NOT repeat questions that have already been asked and answered.
- If the user has explicitly deferred topics (e.g. "later", "not now", "Phase 2", "not in scope"), do NOT generate questions about those topics.
- If the user has narrowed scope to a specific area or phase, only generate questions within that agreed scope.
- Respect the user's boundaries — asking about out-of-scope topics wastes turns and pollutes the intent record.

Respond ONLY with valid JSON matching this schema:
{
  "questions": [
    {
      "question": "string",
      "rationale": "string",
      "category": "scope|behavior|constraint|acceptance|edge_case"
    }
  ]
}

If there are no more useful questions to ask, respond with:
{ "questions": [] }`;

/**
 * Creates a generate-questions node.
 */
export function createGenerateQuestionsNode(options?: GenerateQuestionsNodeOptions) {
  const maxQuestions = options?.maxQuestionsPerRound ?? 3;

  return (config: NodeConfig) => {
    return async (state: InterviewGraphStateType): Promise<Partial<InterviewGraphStateType>> => {
      const logger = config.logger;
      logger?.log(`GenerateQuestions: Round ${state.round}/${state.maxRounds}`);

      // Check if we should stop asking questions
      if (state.userDone || state.round > state.maxRounds) {
        const reason: CompletionReason = state.userDone ? 'user_signaled_done' : 'max_rounds_reached';
        logger?.log(`GenerateQuestions: ${reason}, proceeding to extraction`);
        return { currentPhase: 'extract_atoms', completionReason: reason };
      }

      const userContent = buildPromptContext(state, maxQuestions);

      try {
        const questions = await generateQuestions(config, userContent, maxQuestions, logger);

        if (questions.length === 0) {
          logger?.log('GenerateQuestions: No new questions, proceeding to extraction');
          return {
            currentPhase: 'extract_atoms',
            completionReason: 'no_more_questions',
            llmCallCount: state.llmCallCount + 1,
          };
        }

        const turn = buildAssistantTurn(questions, state.round);

        // Fixture/simulation mode: use pre-provided responses
        const simulatedResponses = state.simulatedResponses || [];
        const responseIndex = state.simulatedResponseIndex || 0;
        if (simulatedResponses.length > 0) {
          return handleFixtureMode(
            questions, turn, simulatedResponses, responseIndex, state, logger,
          );
        }

        // Stochastic mode: use interviewee callback
        if (options?.intervieweeCallback) {
          return handleStochasticMode(
            questions, turn, state, options.intervieweeCallback, logger,
          );
        }

        // Interactive mode: pause for real user response
        throw new NodeInterrupt(
          JSON.stringify({
            type: 'interview_questions',
            questions: questions.map((q) => ({
              id: q.id, question: q.question, category: q.category, rationale: q.rationale,
            })),
            round: state.round,
            maxRounds: state.maxRounds,
            conversationTurn: turn,
            pendingQuestions: questions,
          }),
        );
      } catch (error) {
        if (error instanceof NodeInterrupt) throw error;
        const message = error instanceof Error ? error.message : String(error);
        logger?.error(`GenerateQuestions: Error - ${message}`);
        return { errors: [message], currentPhase: 'extract_atoms', completionReason: 'error' };
      }
    };
  };
}

/**
 * Build the prompt context for the LLM, including conversation history
 * for scope-awareness and previous Q&A to avoid repetition.
 */
function buildPromptContext(state: InterviewGraphStateType, maxQuestions: number): string {
  const previousQAs = state.allQuestions
    .filter((q) => q.answered)
    .map((q) => `Q: ${q.question}\nA: ${q.response}`)
    .join('\n\n');

  // Include raw conversation history so the LLM can detect scope
  // narrowing, deferrals, and other signals not captured in Q&A pairs
  const conversationContext = (state.conversationHistory || [])
    .filter((t) => t.role === 'user')
    .map((t) => t.content)
    .join('\n');

  return [
    `Intent: "${state.rawIntent}"`,
    state.intentAnalysis
      ? `Analysis:\n- Summary: ${state.intentAnalysis.summary}\n- Ambiguities: ${state.intentAnalysis.ambiguities.join(', ')}\n- Implied behaviors: ${state.intentAnalysis.impliedBehaviors.join(', ')}`
      : '',
    conversationContext ? `Conversation history (user messages):\n${conversationContext}` : '',
    previousQAs ? `Previous Q&A:\n${previousQAs}` : '',
    `Generate up to ${maxQuestions} new clarifying questions.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Call the LLM to generate questions and parse the response.
 */
async function generateQuestions(
  config: NodeConfig,
  userContent: string,
  maxQuestions: number,
  logger?: { warn: (msg: string) => void },
): Promise<InterviewQuestion[]> {
  const response = await config.llmService.invoke({
    messages: [
      { role: 'system', content: QUESTION_GENERATION_PROMPT },
      { role: 'user', content: userContent },
    ],
    agentName: 'interview-questions',
    purpose: 'Generate clarifying questions for intent extraction',
    taskType: AgentTaskType.ANALYSIS,
    temperature: 0.5,
  });

  try {
    const content = response.content || '';
    const jsonMatch = /\{[\s\S]*\}/.exec(content);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    return (parsed.questions || []).slice(0, maxQuestions).map(
      (q: { question: string; rationale: string; category: string }) =>
        ({
          id: uuidv4(),
          question: q.question,
          rationale: q.rationale,
          category: q.category as InterviewQuestion['category'],
          answered: false,
        }) as InterviewQuestion,
    );
  } catch {
    logger?.warn('GenerateQuestions: Failed to parse LLM response');
    return [];
  }
}

/**
 * Build an assistant conversation turn from generated questions.
 */
function buildAssistantTurn(questions: InterviewQuestion[], round: number): ConversationTurn {
  const questionText = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
  return {
    role: 'assistant',
    content: `Clarifying questions (round ${round}):\n\n${questionText}`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Handle fixture/simulation mode: apply pre-provided responses to questions.
 * Returns the state update for the current round.
 */
function handleFixtureMode(
  questions: InterviewQuestion[],
  turn: ConversationTurn,
  simulatedResponses: { content: string; signalsDone?: boolean }[],
  responseIndex: number,
  state: InterviewGraphStateType,
  logger?: { log?: (msg: string) => void },
): Partial<InterviewGraphStateType> {
  if (responseIndex >= simulatedResponses.length) {
    logger?.log?.('GenerateQuestions: All simulated responses used, proceeding to extraction');
    return {
      currentPhase: 'extract_atoms',
      completionReason: 'simulation_exhausted',
      pendingQuestions: questions,
      llmCallCount: state.llmCallCount + 1,
    };
  }

  const simResponse = simulatedResponses[responseIndex];
  logger?.log?.(`GenerateQuestions: Using simulated response ${responseIndex + 1}/${simulatedResponses.length}`);

  // Mark questions as answered with the simulated response.
  // responseScope: 'batch' indicates this is a single response applied
  // to all questions in the round (not per-question answers).
  const answeredQuestions = questions.map((q) => ({
    ...q,
    answered: true,
    answerStatus: 'answered' as const,
    responseScope: 'batch' as const,
    response: simResponse.content,
  }));

  const userTurn: ConversationTurn = {
    role: 'user',
    content: simResponse.content,
    timestamp: new Date().toISOString(),
  };

  const base = {
    allQuestions: answeredQuestions,
    conversationHistory: [turn, userTurn],
    simulatedResponseIndex: responseIndex + 1,
    llmCallCount: state.llmCallCount + 1,
  };

  if (simResponse.signalsDone) {
    logger?.log?.('GenerateQuestions: Simulated user signaled done');
    return { ...base, currentPhase: 'extract_atoms', completionReason: 'user_signaled_done', userDone: true };
  }

  const hasMoreResponses = simulatedResponses.length > responseIndex + 1;
  if (hasMoreResponses) {
    return { ...base, currentPhase: 'generate_questions', pendingQuestions: [], round: state.round + 1 };
  }

  logger?.log?.('GenerateQuestions: Last simulated response used, proceeding to extraction');
  return { ...base, currentPhase: 'extract_atoms', completionReason: 'simulation_exhausted' };
}

/**
 * Handle stochastic mode: call the interviewee callback to get LLM-generated responses.
 * Similar to fixture mode but uses a dynamic callback instead of pre-scripted responses.
 */
async function handleStochasticMode(
  questions: InterviewQuestion[],
  turn: ConversationTurn,
  state: InterviewGraphStateType,
  callback: (
    questions: InterviewQuestion[],
    conversationHistory: ConversationTurn[],
    round: number,
  ) => Promise<{ content: string; signalsDone: boolean }>,
  logger?: { log?: (msg: string) => void },
): Promise<Partial<InterviewGraphStateType>> {
  logger?.log?.(`GenerateQuestions: Stochastic mode — calling interviewee callback (round ${state.round})`);

  const response = await callback(
    questions,
    [...(state.conversationHistory || []), turn],
    state.round,
  );

  const answeredQuestions = questions.map((q) => ({
    ...q,
    answered: true,
    answerStatus: 'answered' as const,
    responseScope: 'batch' as const,
    response: response.content,
  }));

  const userTurn: ConversationTurn = {
    role: 'user' as const,
    content: response.content,
    timestamp: new Date().toISOString(),
  };

  const base = {
    allQuestions: answeredQuestions,
    conversationHistory: [turn, userTurn],
    llmCallCount: state.llmCallCount + 1,
  };

  if (response.signalsDone) {
    logger?.log?.('GenerateQuestions: Stochastic interviewee signaled done');
    return { ...base, currentPhase: 'extract_atoms', completionReason: 'user_signaled_done', userDone: true };
  }

  return { ...base, currentPhase: 'generate_questions', pendingQuestions: [], round: state.round + 1 };
}
