/**
 * Analyze Intent Node
 *
 * First node in the interview graph. Analyzes the user's raw intent
 * to identify ambiguities, implied behaviors, and suggested categories.
 */

import { NodeConfig } from '../types';
import { InterviewGraphStateType, ConversationTurn } from '../../types/interview-state';
import { AgentTaskType } from '../../../../../common/llm/providers/types';
import { parseJsonWithRecovery } from '../../../../../common/llm/json-recovery';

export interface AnalyzeIntentNodeOptions {
  /** Custom system prompt override */
  systemPrompt?: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are an intent analysis expert for the Pact system. Your job is to analyze a user's raw intent statement and identify:

1. **Summary**: A clear, concise summary of what the user wants
2. **Ambiguities**: Areas that are unclear or could be interpreted multiple ways
3. **Implied Behaviors**: Behaviors that are implied but not explicitly stated
4. **Suggested Category**: The most likely category (functional, performance, security, ux, operational)

Respond ONLY with valid JSON matching this schema:
{
  "summary": "string",
  "ambiguities": ["string"],
  "impliedBehaviors": ["string"],
  "suggestedCategory": "string"
}`;

/**
 * Creates an analyze-intent node.
 */
export function createAnalyzeIntentNode(options?: AnalyzeIntentNodeOptions) {
  return (config: NodeConfig) => {
    return async (state: InterviewGraphStateType): Promise<Partial<InterviewGraphStateType>> => {
      const logger = config.logger;
      logger?.log('AnalyzeIntent: Analyzing raw intent...');

      try {
        const response = await config.llmService.invoke({
          messages: [
            {
              role: 'system',
              content: options?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: `Analyze this intent statement:\n\n"${state.rawIntent}"`,
            },
          ],
          agentName: 'interview-analyze',
          purpose: 'Analyze raw intent for ambiguities and implied behaviors',
          taskType: AgentTaskType.ANALYSIS,
          temperature: 0.3,
        });

        let analysis: {
          summary: string;
          ambiguities: string[];
          impliedBehaviors: string[];
          suggestedCategory: string;
        };

        try {
          const content = response.content || '';
          const recovered = parseJsonWithRecovery(content);
          if (!recovered) throw new Error('No JSON in response');
          analysis = recovered as typeof analysis;
        } catch {
          logger?.warn('AnalyzeIntent: Failed to parse LLM response, using fallback');
          analysis = {
            summary: state.rawIntent,
            ambiguities: ['Unable to automatically identify ambiguities'],
            impliedBehaviors: [],
            suggestedCategory: 'functional',
          };
        }

        const turn: ConversationTurn = {
          role: 'assistant',
          content: `I've analyzed your intent: "${analysis.summary}". Let me ask some clarifying questions.`,
          timestamp: new Date().toISOString(),
        };

        return {
          intentAnalysis: analysis,
          currentPhase: 'generate_questions',
          conversationHistory: [turn],
          llmCallCount: state.llmCallCount + 1,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger?.error(`AnalyzeIntent: Error - ${message}`);
        return {
          errors: [message],
          currentPhase: 'generate_questions',
          intentAnalysis: {
            summary: state.rawIntent,
            ambiguities: [],
            impliedBehaviors: [],
            suggestedCategory: 'functional',
          },
        };
      }
    };
  };
}
