/**
 * Zod Schemas for LLM Outputs
 *
 * Provides validated schemas for all structured LLM outputs.
 * Prevents silent degradation from malformed JSON responses.
 */

import { z } from 'zod';

/**
 * Schema for planning phase output
 */
export const PlanSchema = z.object({
  strategy: z.string().describe('Brief description of approach'),
  targetDirectories: z.array(z.string()).default([]),
  filePatterns: z.array(z.string()).default([]),
  searchTerms: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
});

export type Plan = z.infer<typeof PlanSchema>;

/**
 * Decision enum for analyze node - richer than boolean
 */
export const AnalyzeDecision = z.enum([
  'need_more_search', // Continue exploring
  'ready_to_answer', // Have enough info to synthesize
  'request_clarification', // Need user input to proceed
  'max_iterations_reached', // Hit limit, synthesize with what we have
]);

export type AnalyzeDecisionType = z.infer<typeof AnalyzeDecision>;

/**
 * Schema for analyze phase output
 */
export const AnalyzeResultSchema = z.object({
  decision: AnalyzeDecision,
  reasoning: z.string(),
  missingInfo: z.array(z.string()).optional(),
  clarificationNeeded: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;

/**
 * Helper to safely parse LLM output with schema validation
 *
 * @param content - Raw LLM output string
 * @param schema - Zod schema to validate against
 * @param fallback - Default value if parsing fails
 * @returns Parsed and validated data with success status
 */
export function parseLLMOutput<T>(
  content: string,
  schema: z.ZodSchema<T>,
  fallback: T,
): { data: T; success: boolean; error?: string } {
  try {
    // Handle markdown code blocks that LLMs often include
    const jsonContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(jsonContent);
    const validated = schema.parse(parsed);
    return { data: validated, success: true };
  } catch (error) {
    return {
      data: fallback,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parse error',
    };
  }
}

/**
 * Default plan when parsing fails
 */
export const DEFAULT_PLAN: Plan = {
  strategy: 'Explore the codebase to find relevant information',
  targetDirectories: ['.', 'src', 'test'],
  filePatterns: ['*.ts', '*.json', '*.md'],
  searchTerms: [],
  actions: ['List directories', 'Search for relevant files', 'Read file contents'],
};

/**
 * Default analyze result when parsing fails
 */
export const DEFAULT_ANALYZE_RESULT: AnalyzeResult = {
  decision: 'need_more_search',
  reasoning: 'Unable to parse analysis, continuing search',
};
