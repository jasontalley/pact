/**
 * Atom Quality Validator Service Tests
 *
 * Tests for the 5 quality dimensions and gating logic:
 * - Observable (0-25)
 * - Falsifiable (0-25)
 * - Implementation-Agnostic (0-20)
 * - Unambiguous Language (0-15)
 * - Clear Success Criteria (0-15)
 *
 * Gating: ≥80 approve, 60-79 revise, <60 reject
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  AtomQualityService,
  AtomForValidation,
} from './atom-quality.service';
import { LLMService } from '../../common/llm/llm.service';

describe('AtomQualityService', () => {
  let service: AtomQualityService;

  const mockLLMService = {
    invoke: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtomQualityService,
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
      ],
    }).compile();

    service = module.get<AtomQualityService>(AtomQualityService);

    jest.clearAllMocks();
  });

  // @atom IA-020
  describe('service initialization', () => {
    // @atom IA-020
    it('should be defined', () => {
      // Service must be instantiated by NestJS DI
      expect(service).toBeInstanceOf(AtomQualityService);
    });
  });

  // @atom IA-021
  describe('quality dimension evaluation', () => {
    // @atom IA-021
    it('should evaluate all 5 quality dimensions', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-001',
        description: 'User authentication must complete within 2 seconds',
        category: 'performance',
      };

      // Mock LLM responses for each dimension
      mockLLMService.invoke
        .mockResolvedValueOnce({
          content: JSON.stringify({
            score: 22,
            feedback: 'Clearly observable with measurable time constraint',
            suggestions: [],
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            score: 23,
            feedback: 'Falsifiable with clear 2-second threshold',
            suggestions: [],
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            score: 18,
            feedback: 'Implementation-agnostic, focuses on behavior',
            suggestions: [],
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            score: 14,
            feedback: 'Clear and unambiguous language',
            suggestions: [],
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            score: 13,
            feedback: 'Clear success criteria with time threshold',
            suggestions: [],
          }),
        });

      const result = await service.validateAtom(atom);

      // All 5 quality dimensions must be evaluated with scores
      expect(result.dimensions.observable.score).toBeGreaterThanOrEqual(0);
      // Falsifiable dimension must have a valid score
      expect(result.dimensions.falsifiable.score).toBeGreaterThanOrEqual(0);
      // Implementation-agnostic dimension must have a valid score
      expect(result.dimensions.implementationAgnostic.score).toBeGreaterThanOrEqual(0);
      // Unambiguous language dimension must have a valid score
      expect(result.dimensions.unambiguousLanguage.score).toBeGreaterThanOrEqual(0);
      // Clear success criteria dimension must have a valid score
      expect(result.dimensions.clearSuccessCriteria.score).toBeGreaterThanOrEqual(0);
    });

    // @atom IA-021
    it('should respect maximum scores for each dimension', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-002',
        description: 'Test atom',
        category: 'functional',
      };

      // Mock LLM returning scores above max
      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          score: 100, // Way above max
          feedback: 'Perfect',
          suggestions: [],
        }),
      });

      const result = await service.validateAtom(atom);

      // Observable max is 25
      expect(result.dimensions.observable.score).toBeLessThanOrEqual(25);
      // Falsifiable max is 25
      expect(result.dimensions.falsifiable.score).toBeLessThanOrEqual(25);
      // Implementation-agnostic max is 20
      expect(result.dimensions.implementationAgnostic.score).toBeLessThanOrEqual(20);
      // Unambiguous language max is 15
      expect(result.dimensions.unambiguousLanguage.score).toBeLessThanOrEqual(15);
      // Clear success criteria max is 15
      expect(result.dimensions.clearSuccessCriteria.score).toBeLessThanOrEqual(15);
    });

    // @atom IA-021
    it('should not allow negative scores', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-003',
        description: 'Test atom',
        category: 'functional',
      };

      // Mock LLM returning negative score
      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          score: -10,
          feedback: 'Invalid',
          suggestions: [],
        }),
      });

      const result = await service.validateAtom(atom);

      // Scores must be clamped to minimum 0
      expect(result.dimensions.observable.score).toBeGreaterThanOrEqual(0);
      // Negative scores must be clamped to 0
      expect(result.dimensions.falsifiable.score).toBeGreaterThanOrEqual(0);
    });
  });

  // @atom IA-022
  describe('gating logic', () => {
    // @atom IA-022
    it('should approve atoms with score >= 80', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-004',
        description: 'User receives email confirmation within 60 seconds of registration',
        category: 'functional',
      };

      // Mock high scores totaling 88
      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 23, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 22, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 18, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 13, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 12, feedback: '', suggestions: [] }) });

      const result = await service.validateAtom(atom);

      // Score should be sum of all dimensions: 23+22+18+13+12 = 88
      expect(result.totalScore).toBe(88);
      // Score >= 80 should result in approve decision
      expect(result.decision).toBe('approve');
    });

    // @atom IA-022
    it('should recommend revision for atoms with score 60-79', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-005',
        description: 'System should be fast',
        category: 'performance',
      };

      // Mock medium scores totaling 60 (boundary for revise)
      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 15, feedback: '', suggestions: ['Be more specific'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 14, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 12, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 10, feedback: '', suggestions: ['Define fast'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 9, feedback: '', suggestions: [] }) });

      const result = await service.validateAtom(atom);

      // Score should be 15+14+12+10+9 = 60
      expect(result.totalScore).toBe(60);
      // Score 60-79 should result in revise decision
      expect(result.decision).toBe('revise');
    });

    // @atom IA-022
    it('should reject atoms with score < 60', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-006',
        description: 'Things work good',
        category: 'functional',
      };

      // Mock low scores totaling 34
      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 8, feedback: '', suggestions: ['Too vague'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 7, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 10, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 5, feedback: '', suggestions: ['Define "good"'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 4, feedback: '', suggestions: [] }) });

      const result = await service.validateAtom(atom);

      // Score should be 8+7+10+5+4 = 34
      expect(result.totalScore).toBe(34);
      // Score < 60 should result in reject decision
      expect(result.decision).toBe('reject');
    });

    // @atom IA-022
    it('should handle boundary case at exactly 80', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-007',
        description: 'Boundary test atom',
        category: 'functional',
      };

      // Mock scores totaling exactly 80 (approve threshold)
      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 20, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 20, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 16, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 12, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 12, feedback: '', suggestions: [] }) });

      const result = await service.validateAtom(atom);

      // Boundary: 80 is the minimum for approve
      expect(result.totalScore).toBe(80);
      // Score of exactly 80 should approve
      expect(result.decision).toBe('approve');
    });

    // @atom IA-022
    it('should handle boundary case at exactly 60', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-008',
        description: 'Boundary test atom',
        category: 'functional',
      };

      // Mock scores totaling exactly 60 (revise threshold)
      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 15, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 15, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 12, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 9, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 9, feedback: '', suggestions: [] }) });

      const result = await service.validateAtom(atom);

      // Boundary: 60 is the minimum for revise
      expect(result.totalScore).toBe(60);
      // Score of exactly 60 should revise
      expect(result.decision).toBe('revise');
    });

    // @atom IA-022
    it('should handle boundary case at 59 (just below revise threshold)', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-009',
        description: 'Boundary test atom',
        category: 'functional',
      };

      // Mock scores totaling 59 (just below revise threshold)
      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 15, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 14, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 12, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 9, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 9, feedback: '', suggestions: [] }) });

      const result = await service.validateAtom(atom);

      // Boundary: 59 is just below revise threshold
      expect(result.totalScore).toBe(59);
      // Score of 59 should reject
      expect(result.decision).toBe('reject');
    });
  });

  // @atom IA-023
  describe('feedback generation', () => {
    // @atom IA-023
    it('should generate overall feedback for approved atoms', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-010',
        description: 'High quality atom',
        category: 'functional',
      };

      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({ score: 20, feedback: 'Good', suggestions: [] }),
      });

      const result = await service.validateAtom(atom);

      // Approved atoms should receive positive feedback about quality
      expect(result.overallFeedback).toContain('meets quality standards');
      // Feedback should indicate atom is ready for commitment
      expect(result.overallFeedback).toContain('ready for commitment');
    });

    // @atom IA-023
    it('should generate actionable feedback for revise decisions', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-011',
        description: 'Needs work atom',
        category: 'functional',
      };

      // Mock scores totaling 65 (in revise range: 60-79)
      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 16, feedback: '', suggestions: ['Add time constraint'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 15, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 14, feedback: '', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 10, feedback: '', suggestions: ['Be more specific'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 10, feedback: '', suggestions: [] }) });

      const result = await service.validateAtom(atom);

      // Score of 65 falls in revise range (60-79)
      expect(result.decision).toBe('revise');
      // Revise decisions should include improvement guidance
      expect(result.overallFeedback).toContain('needs improvement');
      // Actionable improvements must be provided for revision
      expect(result.actionableImprovements.length).toBeGreaterThan(0);
    });

    // @atom IA-023
    it('should collect suggestions from low-scoring dimensions', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-012',
        description: 'Test atom',
        category: 'functional',
      };

      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 10, feedback: '', suggestions: ['Suggestion 1'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 10, feedback: '', suggestions: ['Suggestion 2'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 8, feedback: '', suggestions: ['Suggestion 3'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 6, feedback: '', suggestions: ['Suggestion 4'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 5, feedback: '', suggestions: ['Suggestion 5'] }) });

      const result = await service.validateAtom(atom);

      // Suggestions from each dimension should be collected
      expect(result.actionableImprovements).toContain('Suggestion 1');
      // Multiple dimension suggestions should be aggregated
      expect(result.actionableImprovements).toContain('Suggestion 2');
    });

    // @atom IA-023
    it('should limit actionable improvements to 5', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-013',
        description: 'Test atom',
        category: 'functional',
      };

      // Mock many suggestions
      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          score: 5,
          feedback: '',
          suggestions: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'],
        }),
      });

      const result = await service.validateAtom(atom);

      // Prevent overwhelming users with too many suggestions
      expect(result.actionableImprovements.length).toBeLessThanOrEqual(5);
    });

    // @atom IA-023
    it('should deduplicate suggestions', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-014',
        description: 'Test atom',
        category: 'functional',
      };

      // Mock duplicate suggestions
      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          score: 5,
          feedback: '',
          suggestions: ['Same suggestion', 'Same suggestion'],
        }),
      });

      const result = await service.validateAtom(atom);

      // Duplicate suggestions from different dimensions should be merged
      const duplicates = result.actionableImprovements.filter(
        (s) => s === 'Same suggestion',
      );
      // Only one instance of each unique suggestion should remain
      expect(duplicates.length).toBe(1);
    });
  });

  // @atom IA-024
  describe('heuristic fallbacks', () => {
    // @atom IA-024
    it('should use heuristics when LLM fails', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-015',
        description: 'User receives notification within 5 seconds',
        category: 'functional',
      };

      // Mock LLM failure
      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const result = await service.validateAtom(atom);

      // Should still get a result with valid decision when using heuristics
      expect(['approve', 'revise', 'reject']).toContain(result.decision);
      // Heuristics should produce non-zero scores for valid descriptions
      expect(result.totalScore).toBeGreaterThan(0);
      // Feedback should indicate heuristic mode was used
      expect(result.dimensions.observable.feedback).toContain('heuristic');
    });

    // @atom IA-024
    it('should detect observable verbs in heuristic mode', async () => {
      const observableAtom: AtomForValidation = {
        atomId: 'IA-016',
        description: 'System displays error message when validation fails',
        category: 'functional',
      };

      const internalAtom: AtomForValidation = {
        atomId: 'IA-017',
        description: 'System stores user data internally',
        category: 'functional',
      };

      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const observableResult = await service.validateAtom(observableAtom);
      const internalResult = await service.validateAtom(internalAtom);

      // "displays" is an observable verb, "stores internally" is not user-visible
      expect(observableResult.dimensions.observable.score).toBeGreaterThan(
        internalResult.dimensions.observable.score,
      );
    });

    // @atom IA-024
    it('should detect vague language in heuristic mode', async () => {
      const clearAtom: AtomForValidation = {
        atomId: 'IA-018',
        description: 'Response time must be exactly 200 milliseconds',
        category: 'performance',
      };

      const vagueAtom: AtomForValidation = {
        atomId: 'IA-019',
        description: 'System should be fast and user-friendly',
        category: 'performance',
      };

      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const clearResult = await service.validateAtom(clearAtom);
      const vagueResult = await service.validateAtom(vagueAtom);

      // "exactly 200 milliseconds" is precise, "fast and user-friendly" is vague
      expect(clearResult.dimensions.unambiguousLanguage.score).toBeGreaterThan(
        vagueResult.dimensions.unambiguousLanguage.score,
      );
    });

    // @atom IA-024
    it('should detect implementation details in heuristic mode', async () => {
      const agnosticAtom: AtomForValidation = {
        atomId: 'IA-020',
        description: 'User can view their order history',
        category: 'functional',
      };

      const implementationAtom: AtomForValidation = {
        atomId: 'IA-021',
        description: 'System queries PostgreSQL database using SQL to fetch orders',
        category: 'functional',
      };

      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const agnosticResult = await service.validateAtom(agnosticAtom);
      const implementationResult = await service.validateAtom(implementationAtom);

      // "User can view" is behavior-focused; "PostgreSQL...SQL" exposes implementation
      expect(agnosticResult.dimensions.implementationAgnostic.score).toBeGreaterThan(
        implementationResult.dimensions.implementationAgnostic.score,
      );
    });
  });

  // @atom IA-025
  describe('JSON response parsing', () => {
    // @atom IA-025
    it('should parse plain JSON response', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-022',
        description: 'Test atom',
        category: 'functional',
      };

      mockLLMService.invoke.mockResolvedValue({
        content: '{"score": 20, "feedback": "Good", "suggestions": ["Improve"]}',
      });

      const result = await service.validateAtom(atom);

      // Score should be extracted from JSON response
      expect(result.dimensions.observable.score).toBe(20);
      // Feedback string should be parsed correctly
      expect(result.dimensions.observable.feedback).toBe('Good');
    });

    // @atom IA-025
    it('should parse JSON wrapped in markdown code blocks', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-023',
        description: 'Test atom',
        category: 'functional',
      };

      mockLLMService.invoke.mockResolvedValue({
        content: '```json\n{"score": 18, "feedback": "OK", "suggestions": []}\n```',
      });

      const result = await service.validateAtom(atom);

      // LLM may wrap JSON in markdown - parser should handle this
      expect(result.dimensions.observable.score).toBe(18);
    });

    // @atom IA-025
    it('should handle malformed JSON gracefully', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-024',
        description: 'Test atom',
        category: 'functional',
      };

      mockLLMService.invoke.mockResolvedValue({
        content: 'Not valid JSON at all',
      });

      // Should not throw, should use default values
      const result = await service.validateAtom(atom);

      // Service should gracefully handle parse failures with valid decision
      expect(['approve', 'revise', 'reject']).toContain(result.decision);
      // Malformed JSON should result in zero score for dimension
      expect(result.dimensions.observable.score).toBe(0);
    });
  });

  // @atom IA-026
  describe('real-world atom examples', () => {
    // @atom IA-026
    it('should evaluate a high-quality performance atom', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-025',
        description: 'API response time must be less than 200 milliseconds for 95% of requests',
        category: 'performance',
      };

      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 24, feedback: 'Highly observable', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 25, feedback: 'Clearly falsifiable', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 19, feedback: 'Implementation-agnostic', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 14, feedback: 'Clear language', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 15, feedback: 'Clear criteria', suggestions: [] }) });

      const result = await service.validateAtom(atom);

      // High-quality atom with specific metrics should score 97/100
      expect(result.totalScore).toBe(97);
      // Score of 97 exceeds 80 threshold for approval
      expect(result.decision).toBe('approve');
    });

    // @atom IA-026
    it('should evaluate a low-quality vague atom', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-026',
        description: 'System should be responsive and provide good user experience',
        category: 'functional',
      };

      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 8, feedback: 'Hard to observe', suggestions: ['Define responsive'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 5, feedback: 'Not falsifiable', suggestions: ['Add thresholds'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 14, feedback: 'Mostly agnostic', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 3, feedback: 'Very vague', suggestions: ['Define good'] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 2, feedback: 'No criteria', suggestions: ['Add acceptance criteria'] }) });

      const result = await service.validateAtom(atom);

      // Vague atom with undefined terms should score poorly (32/100)
      expect(result.totalScore).toBe(32);
      // Score below 60 results in rejection
      expect(result.decision).toBe('reject');
      // Rejected atoms must include actionable improvement suggestions
      expect(result.actionableImprovements.length).toBeGreaterThan(0);
    });

    // @atom IA-026
    it('should evaluate a security atom', async () => {
      const atom: AtomForValidation = {
        atomId: 'IA-027',
        description: 'User session must expire after 30 minutes of inactivity',
        category: 'security',
      };

      mockLLMService.invoke
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 22, feedback: 'Observable session expiry', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 24, feedback: 'Clear failure condition', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 18, feedback: 'Behavior-focused', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 14, feedback: 'Specific time', suggestions: [] }) })
        .mockResolvedValueOnce({ content: JSON.stringify({ score: 14, feedback: 'Clear 30-minute threshold', suggestions: [] }) });

      const result = await service.validateAtom(atom);

      // Security atom with specific timeout should score 92/100
      expect(result.totalScore).toBe(92);
      // Score of 92 exceeds approval threshold
      expect(result.decision).toBe('approve');
    });
  });
});
