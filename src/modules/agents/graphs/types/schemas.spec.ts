/**
 * Schema Tests
 *
 * Tests for Zod schemas used for LLM output validation.
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import {
  PlanSchema,
  AnalyzeResultSchema,
  AnalyzeDecision,
  parseLLMOutput,
  DEFAULT_PLAN,
  DEFAULT_ANALYZE_RESULT,
} from './schemas';

describe('Schemas', () => {
  describe('PlanSchema', () => {
    it('should validate a valid plan', () => {
      const validPlan = {
        strategy: 'Search for authentication-related atoms in the codebase',
        targetDirectories: ['src/modules/auth'],
        filePatterns: ['*.ts'],
        searchTerms: ['authentication', 'login'],
        actions: ['Search files', 'Analyze results'],
      };

      const result = PlanSchema.safeParse(validPlan);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.strategy).toBe(
          'Search for authentication-related atoms in the codebase',
        );
        expect(result.data.targetDirectories).toHaveLength(1);
        expect(result.data.searchTerms).toContain('authentication');
      }
    });

    it('should use default values for optional arrays', () => {
      const minimalPlan = {
        strategy: 'Test strategy',
      };

      const result = PlanSchema.safeParse(minimalPlan);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.targetDirectories).toEqual([]);
        expect(result.data.filePatterns).toEqual([]);
        expect(result.data.searchTerms).toEqual([]);
        expect(result.data.actions).toEqual([]);
      }
    });

    it('should reject plan without strategy', () => {
      const invalidPlan = {
        targetDirectories: ['src'],
        searchTerms: ['test'],
      };

      const result = PlanSchema.safeParse(invalidPlan);

      expect(result.success).toBe(false);
    });

    it('should validate DEFAULT_PLAN', () => {
      const result = PlanSchema.safeParse(DEFAULT_PLAN);

      expect(result.success).toBe(true);
    });
  });

  describe('AnalyzeDecision', () => {
    it('should accept valid decision values', () => {
      const validDecisions = [
        'need_more_search',
        'ready_to_answer',
        'request_clarification',
        'max_iterations_reached',
      ];

      for (const decision of validDecisions) {
        const result = AnalyzeDecision.safeParse(decision);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid decision values', () => {
      const invalidDecisions = ['continue', 'stop', 'maybe', '', 'READY_TO_ANSWER'];

      for (const decision of invalidDecisions) {
        const result = AnalyzeDecision.safeParse(decision);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('AnalyzeResultSchema', () => {
    it('should validate complete analyze result', () => {
      const validResult = {
        decision: 'ready_to_answer',
        reasoning: 'Found sufficient information about the topic',
        confidence: 0.9,
      };

      const result = AnalyzeResultSchema.safeParse(validResult);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.decision).toBe('ready_to_answer');
        expect(result.data.confidence).toBe(0.9);
      }
    });

    it('should validate minimal analyze result', () => {
      const minimalResult = {
        decision: 'need_more_search',
        reasoning: 'Need more data',
      };

      const result = AnalyzeResultSchema.safeParse(minimalResult);

      expect(result.success).toBe(true);
    });

    it('should include optional missingInfo', () => {
      const resultWithMissing = {
        decision: 'need_more_search',
        reasoning: 'Missing key information',
        missingInfo: ['User authentication flow', 'Database schema'],
      };

      const result = AnalyzeResultSchema.safeParse(resultWithMissing);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.missingInfo).toHaveLength(2);
      }
    });

    it('should include optional clarificationNeeded', () => {
      const resultWithClarification = {
        decision: 'request_clarification',
        reasoning: 'Ambiguous query',
        clarificationNeeded: 'Did you mean authentication or authorization?',
      };

      const result = AnalyzeResultSchema.safeParse(resultWithClarification);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.clarificationNeeded).toBe(
          'Did you mean authentication or authorization?',
        );
      }
    });

    it('should reject invalid decision', () => {
      const invalidResult = {
        decision: 'invalid_decision',
        reasoning: 'Some reason',
      };

      const result = AnalyzeResultSchema.safeParse(invalidResult);

      expect(result.success).toBe(false);
    });

    it('should reject confidence outside 0-1 range', () => {
      const invalidResult1 = {
        decision: 'ready_to_answer',
        reasoning: 'Some reason',
        confidence: 1.5,
      };

      const invalidResult2 = {
        decision: 'ready_to_answer',
        reasoning: 'Some reason',
        confidence: -0.1,
      };

      expect(AnalyzeResultSchema.safeParse(invalidResult1).success).toBe(false);
      expect(AnalyzeResultSchema.safeParse(invalidResult2).success).toBe(false);
    });

    it('should validate DEFAULT_ANALYZE_RESULT', () => {
      const result = AnalyzeResultSchema.safeParse(DEFAULT_ANALYZE_RESULT);

      expect(result.success).toBe(true);
    });
  });

  describe('parseLLMOutput', () => {
    it('should parse valid JSON successfully', () => {
      const content = JSON.stringify({
        decision: 'ready_to_answer',
        reasoning: 'Test reasoning',
        confidence: 0.8,
      });

      const result = parseLLMOutput(content, AnalyzeResultSchema, DEFAULT_ANALYZE_RESULT);

      expect(result.success).toBe(true);
      expect(result.data.decision).toBe('ready_to_answer');
    });

    it('should handle JSON wrapped in markdown code blocks', () => {
      const content = `\`\`\`json
{
  "decision": "ready_to_answer",
  "reasoning": "Found it",
  "confidence": 0.9
}
\`\`\``;

      const result = parseLLMOutput(content, AnalyzeResultSchema, DEFAULT_ANALYZE_RESULT);

      expect(result.success).toBe(true);
      expect(result.data.decision).toBe('ready_to_answer');
    });

    it('should return fallback for invalid JSON', () => {
      const content = 'This is not valid JSON at all';

      const result = parseLLMOutput(content, AnalyzeResultSchema, DEFAULT_ANALYZE_RESULT);

      expect(result.success).toBe(false);
      expect(result.data).toEqual(DEFAULT_ANALYZE_RESULT);
      expect(result.error).toBeDefined();
    });

    it('should return fallback for JSON that fails schema validation', () => {
      const content = JSON.stringify({
        decision: 'invalid_decision',
        reasoning: 'Test',
      });

      const result = parseLLMOutput(content, AnalyzeResultSchema, DEFAULT_ANALYZE_RESULT);

      expect(result.success).toBe(false);
      expect(result.data).toEqual(DEFAULT_ANALYZE_RESULT);
    });

    it('should handle empty string input', () => {
      const result = parseLLMOutput('', AnalyzeResultSchema, DEFAULT_ANALYZE_RESULT);

      expect(result.success).toBe(false);
      expect(result.data).toEqual(DEFAULT_ANALYZE_RESULT);
    });

    it('should handle PlanSchema parsing', () => {
      const content = JSON.stringify({
        strategy: 'Explore authentication code',
        targetDirectories: ['src/auth'],
        filePatterns: ['*.ts'],
        searchTerms: ['login', 'auth'],
        actions: ['Search', 'Analyze'],
      });

      const result = parseLLMOutput(content, PlanSchema, DEFAULT_PLAN);

      expect(result.success).toBe(true);
      expect(result.data.strategy).toBe('Explore authentication code');
      expect(result.data.targetDirectories).toContain('src/auth');
    });

    it('should handle JSON with whitespace', () => {
      const content = `

        {
          "decision": "need_more_search",
          "reasoning": "Need more info"
        }

      `;

      const result = parseLLMOutput(content, AnalyzeResultSchema, DEFAULT_ANALYZE_RESULT);

      expect(result.success).toBe(true);
      expect(result.data.decision).toBe('need_more_search');
    });

    it('should handle code block without json specifier', () => {
      const content = `\`\`\`
{
  "decision": "ready_to_answer",
  "reasoning": "Done"
}
\`\`\``;

      const result = parseLLMOutput(content, AnalyzeResultSchema, DEFAULT_ANALYZE_RESULT);

      expect(result.success).toBe(true);
      expect(result.data.decision).toBe('ready_to_answer');
    });
  });
});
