/**
 * JSON Recovery Utility Tests
 *
 * Tests for robust JSON extraction from LLM responses that may include
 * markdown fences, preamble text, trailing commas, or truncated output.
 */

import { parseJsonWithRecovery, extractJsonFromContent } from './json-recovery';

describe('JSON Recovery Utility', () => {
  describe('parseJsonWithRecovery', () => {
    it('should parse clean JSON', () => {
      const input = '{"score": 85, "feedback": "Good quality"}';
      const result = parseJsonWithRecovery(input);
      expect(result).toEqual({ score: 85, feedback: 'Good quality' });
    });

    it('should strip ```json fences', () => {
      const input = '```json\n{"score": 85}\n```';
      const result = parseJsonWithRecovery(input);
      expect(result).toEqual({ score: 85 });
    });

    it('should strip ``` fences without language tag', () => {
      const input = '```\n{"score": 85}\n```';
      const result = parseJsonWithRecovery(input);
      expect(result).toEqual({ score: 85 });
    });

    it('should handle preamble text before JSON', () => {
      const input = 'Here is the evaluation:\n\n{"score": 85, "feedback": "Good"}';
      const result = parseJsonWithRecovery(input);
      expect(result).toEqual({ score: 85, feedback: 'Good' });
    });

    it('should handle preamble text before fenced JSON', () => {
      const input = 'Here is the result:\n```json\n{"score": 85}\n```';
      const result = parseJsonWithRecovery(input);
      expect(result).toEqual({ score: 85 });
    });

    it('should handle trailing text after JSON', () => {
      const input = '{"score": 85}\n\nThis is my evaluation.';
      const result = parseJsonWithRecovery(input);
      expect(result).toEqual({ score: 85 });
    });

    it('should fix trailing commas', () => {
      const input = '{"score": 85, "items": ["a", "b",], }';
      const result = parseJsonWithRecovery(input);
      expect(result).toEqual({ score: 85, items: ['a', 'b'] });
    });

    it('should handle nested JSON objects', () => {
      const input = `{
        "observable": {"score": 20, "feedback": "Good"},
        "falsifiable": {"score": 18, "feedback": "OK"}
      }`;
      const result = parseJsonWithRecovery(input);
      expect(result).toEqual({
        observable: { score: 20, feedback: 'Good' },
        falsifiable: { score: 18, feedback: 'OK' },
      });
    });

    it('should handle truncated JSON by closing braces', () => {
      const input = '{"score": 85, "items": ["a", "b"';
      const result = parseJsonWithRecovery(input) as Record<string, unknown> | null;
      expect(result).not.toBeNull();
      expect(result?.score).toBe(85);
    });

    it('should return null for completely unparseable content', () => {
      const input = 'This is just plain text with no JSON at all.';
      const result = parseJsonWithRecovery(input);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseJsonWithRecovery('');
      expect(result).toBeNull();
    });

    it('should handle JSON arrays', () => {
      const input = '[{"id": 1}, {"id": 2}]';
      const result = parseJsonWithRecovery(input);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should handle JSON with newlines in string values', () => {
      const input = '{"feedback": "Line 1\\nLine 2", "score": 85}';
      const result = parseJsonWithRecovery(input);
      expect(result).toEqual({ feedback: 'Line 1\nLine 2', score: 85 });
    });

    it('should handle real-world quality scoring response', () => {
      const input = `Here is my evaluation of the atom quality:

\`\`\`json
{
  "observable": {
    "score": 20,
    "feedback": "The behavior is observable through test assertions",
    "suggestions": ["Add specific response codes"]
  },
  "falsifiable": {
    "score": 22,
    "feedback": "Clear failure conditions defined",
    "suggestions": []
  },
  "implementationAgnostic": {
    "score": 15,
    "feedback": "Mostly describes what, not how",
    "suggestions": ["Remove reference to HTTP"]
  },
  "unambiguousLanguage": {
    "score": 12,
    "feedback": "Clear wording",
    "suggestions": []
  },
  "clearSuccessCriteria": {
    "score": 10,
    "feedback": "Success criteria implied but not explicit",
    "suggestions": ["Add explicit pass/fail threshold"]
  }
}
\`\`\`

This atom scores 79/100 overall, which places it in the REVISE category.`;

      const result = parseJsonWithRecovery(input) as Record<string, Record<string, unknown>> | null;
      expect(result).not.toBeNull();
      expect(result?.observable?.score).toBe(20);
      expect(result?.falsifiable?.score).toBe(22);
      expect(result?.implementationAgnostic?.score).toBe(15);
      expect(result?.unambiguousLanguage?.score).toBe(12);
      expect(result?.clearSuccessCriteria?.score).toBe(10);
    });
  });

  describe('extractJsonFromContent', () => {
    it('should extract first JSON object from mixed content', () => {
      const input = 'Some text {"key": "value"} more text';
      const result = extractJsonFromContent(input);
      expect(result).toBe('{"key": "value"}');
    });

    it('should extract JSON array', () => {
      const input = 'Result: [1, 2, 3]';
      const result = extractJsonFromContent(input);
      expect(result).toBe('[1, 2, 3]');
    });

    it('should handle nested braces correctly', () => {
      const input = '{"outer": {"inner": "value"}}';
      const result = extractJsonFromContent(input);
      expect(result).toBe('{"outer": {"inner": "value"}}');
    });

    it('should return null when no JSON found', () => {
      const result = extractJsonFromContent('no json here');
      expect(result).toBeNull();
    });
  });
});
