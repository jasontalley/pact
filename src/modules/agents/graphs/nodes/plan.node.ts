/**
 * Plan Node
 *
 * Generates a search/action strategy for data exploration.
 * Uses Zod schema validation for type-safe parsing.
 */

import { NodeConfig } from './types';
import { AgentTaskType } from '../../../../common/llm/providers/types';
import { PlanSchema, Plan, parseLLMOutput, DEFAULT_PLAN } from '../types/schemas';

/**
 * Options for customizing plan node behavior
 */
export interface PlanNodeOptions {
  /** Custom planning prompt (optional) */
  customPrompt?: string;
  /** Model to use for planning (optional, defaults to routing) */
  model?: string;
}

/**
 * State interface for plan node
 */
export interface PlanNodeState {
  input: string;
  plan?: Plan | null;
}

/**
 * Generic planning node that generates a search/action strategy.
 * Uses Zod schema validation for type-safe parsing.
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createPlanNode<TState extends PlanNodeState>(options: PlanNodeOptions = {}) {
  return (config: NodeConfig) =>
    async (state: TState): Promise<Partial<TState>> => {
      const prompt = options.customPrompt || getDefaultPlanPrompt(state.input);

      const response = await config.llmService.invoke({
        messages: [{ role: 'user', content: prompt }],
        taskType: AgentTaskType.ANALYSIS,
        agentName: 'plan-node',
        purpose: 'generate-strategy',
        preferredModel: options.model,
      });

      // Use Zod schema validation instead of raw JSON.parse
      const {
        data: plan,
        success,
        error,
      } = parseLLMOutput(response.content, PlanSchema, DEFAULT_PLAN);

      if (!success) {
        config.logger?.warn(`Plan parsing failed: ${error}. Using default plan.`);
      }

      return { plan } as Partial<TState>;
    };
}

/**
 * Default planning prompt template
 */
function getDefaultPlanPrompt(input: string): string {
  return `You are a research planner. Given the task, create a search strategy.

Task: ${input}

Generate a JSON plan with:
- strategy: Brief description of how to accomplish the task
- targetDirectories: Array of directories likely to contain relevant information
- filePatterns: Array of file patterns to look for (e.g., "*.json", "*.ts")
- searchTerms: Array of keywords to search for
- actions: Array of specific actions to take

Consider:
1. What type of information would answer this question?
2. Where is that information likely stored?
3. What file types contain that information?
4. What search terms would help locate it?

Return ONLY valid JSON, no markdown code blocks.`;
}
