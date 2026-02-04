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
} from '../../types/interview-state';
import { AgentTaskType } from '../../../../../common/llm/providers/types';
import { NodeInterrupt } from '@langchain/langgraph';

export interface GenerateQuestionsNodeOptions {
  /** Maximum questions per round */
  maxQuestionsPerRound?: number;
}

const QUESTION_GENERATION_PROMPT = `You are a requirements analyst. Based on the intent analysis and conversation so far, generate clarifying questions to help extract precise, testable intent atoms.

Focus on:
- **Scope**: What's included/excluded?
- **Behavior**: What exactly should happen? Under what conditions?
- **Constraints**: Performance, security, or operational requirements?
- **Acceptance**: How would we know this is done correctly?
- **Edge Cases**: What happens in unusual situations?

Do NOT repeat questions that have already been asked and answered.

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
        logger?.log('GenerateQuestions: User done or max rounds reached, proceeding to extraction');
        return {
          currentPhase: 'extract_atoms',
        };
      }

      // Build conversation context for the LLM
      const previousQAs = state.allQuestions
        .filter((q) => q.answered)
        .map((q) => `Q: ${q.question}\nA: ${q.response}`)
        .join('\n\n');

      const userContent = [
        `Intent: "${state.rawIntent}"`,
        state.intentAnalysis
          ? `Analysis:\n- Summary: ${state.intentAnalysis.summary}\n- Ambiguities: ${state.intentAnalysis.ambiguities.join(', ')}\n- Implied behaviors: ${state.intentAnalysis.impliedBehaviors.join(', ')}`
          : '',
        previousQAs ? `Previous Q&A:\n${previousQAs}` : '',
        `Generate up to ${maxQuestions} new clarifying questions.`,
      ]
        .filter(Boolean)
        .join('\n\n');

      try {
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

        let questions: InterviewQuestion[] = [];
        try {
          const content = response.content || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
          questions = (parsed.questions || []).slice(0, maxQuestions).map(
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
          questions = [];
        }

        if (questions.length === 0) {
          logger?.log('GenerateQuestions: No new questions, proceeding to extraction');
          return {
            currentPhase: 'extract_atoms',
            llmCallCount: state.llmCallCount + 1,
          };
        }

        // Format questions for display
        const questionText = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n');

        const turn: ConversationTurn = {
          role: 'assistant',
          content: `Clarifying questions (round ${state.round}):\n\n${questionText}`,
          timestamp: new Date().toISOString(),
        };

        // Throw NodeInterrupt to pause for user response.
        // The interview service will handle collecting answers and resuming.
        throw new NodeInterrupt(
          JSON.stringify({
            type: 'interview_questions',
            questions: questions.map((q) => ({
              id: q.id,
              question: q.question,
              category: q.category,
              rationale: q.rationale,
            })),
            round: state.round,
            maxRounds: state.maxRounds,
            conversationTurn: turn,
            pendingQuestions: questions,
          }),
        );
      } catch (error) {
        // Re-throw NodeInterrupt
        if (error instanceof NodeInterrupt) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        logger?.error(`GenerateQuestions: Error - ${message}`);
        return {
          errors: [message],
          currentPhase: 'extract_atoms',
        };
      }
    };
  };
}
