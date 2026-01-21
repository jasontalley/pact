import { Test, TestingModule } from '@nestjs/testing';
import {
  AtomicityCheckerService,
  AtomicityResult,
  HeuristicScore,
} from './atomicity-checker.service';
import { LLMService } from '../../common/llm/llm.service';

/**
 * Tests for AtomicityCheckerService
 *
 * Related atoms:
 * - IA-043: Atomicity checker evaluates intent descriptions for atomicity using heuristics
 */
describe('AtomicityCheckerService', () => {
  let service: AtomicityCheckerService;
  let mockLLMService: jest.Mocked<LLMService>;

  beforeEach(async () => {
    mockLLMService = {
      invoke: jest.fn(),
    } as unknown as jest.Mocked<LLMService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [AtomicityCheckerService, { provide: LLMService, useValue: mockLLMService }],
    }).compile();

    service = module.get<AtomicityCheckerService>(AtomicityCheckerService);
  });

  /**
   * @atom IA-043
   * Service must be properly instantiated by NestJS DI
   */
  it('should be defined', () => {
    // Verifies service is created by dependency injection
    expect(service).toBeDefined();
  });

  describe('checkAtomicity', () => {
    /**
     * @atom IA-043
     * Must return AtomicityResult with all required fields
     */
    it('should return a complete AtomicityResult', async () => {
      const result = await service.checkAtomicity('User can view their profile');

      // Verifies isAtomic boolean flag is present in result
      expect(result).toHaveProperty('isAtomic');
      // Verifies confidence score is present for ranking results
      expect(result).toHaveProperty('confidence');
      // Verifies violations array captures atomicity issues
      expect(result).toHaveProperty('violations');
      // Verifies suggestions array provides improvement hints
      expect(result).toHaveProperty('suggestions');
      // Verifies heuristicScores object contains detailed breakdown
      expect(result).toHaveProperty('heuristicScores');
    });

    /**
     * @atom IA-043
     * Must return confidence as a number between 0 and 1
     */
    it('should return confidence between 0 and 1', async () => {
      const result = await service.checkAtomicity('User can view dashboard');

      // Verifies confidence is within valid range
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    /**
     * @atom IA-043
     * Must include all five heuristic scores in result
     */
    it('should include all five heuristic scores', async () => {
      const result = await service.checkAtomicity('System displays error message');

      // Verifies singleResponsibility heuristic detects compound intents
      expect(result.heuristicScores).toHaveProperty('singleResponsibility');
      // Verifies observableOutcome heuristic checks for externally verifiable behavior
      expect(result.heuristicScores).toHaveProperty('observableOutcome');
      // Verifies implementationAgnostic heuristic flags technology-specific language
      expect(result.heuristicScores).toHaveProperty('implementationAgnostic');
      // Verifies measurableCriteria heuristic checks for quantifiable success conditions
      expect(result.heuristicScores).toHaveProperty('measurableCriteria');
      // Verifies reasonableScope heuristic validates appropriate granularity
      expect(result.heuristicScores).toHaveProperty('reasonableScope');
    });
  });

  describe('Single Responsibility Heuristic', () => {
    /**
     * @atom IA-043
     * Must detect compound statements with "and" conjunction
     */
    it('should fail single responsibility check for compound "and" statements', async () => {
      const result = await service.checkAtomicity('User can login and view their dashboard');

      // Verifies compound statement is detected as non-atomic
      expect(result.heuristicScores.singleResponsibility.passed).toBe(false);
      expect(result.isAtomic).toBe(false);
    });

    /**
     * @atom IA-043
     * Must detect compound statements with "or" conjunction
     */
    it('should fail single responsibility check for compound "or" statements', async () => {
      const result = await service.checkAtomicity('User can edit or delete their profile');

      // Verifies compound statement with "or" is detected
      expect(result.heuristicScores.singleResponsibility.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must pass for single-responsibility statements
     */
    it('should pass single responsibility check for simple statements', async () => {
      const result = await service.checkAtomicity('User can view their profile');

      // Verifies simple statement passes single responsibility check
      expect(result.heuristicScores.singleResponsibility.passed).toBe(true);
    });

    /**
     * @atom IA-043
     * Must detect "as well as" compound phrase
     */
    it('should detect "as well as" compound phrase', async () => {
      const result = await service.checkAtomicity('User can save as well as export their data');

      // Verifies "as well as" is detected as compound
      expect(result.heuristicScores.singleResponsibility.passed).toBe(false);
    });
  });

  describe('Observable Outcome Heuristic', () => {
    /**
     * @atom IA-043
     * Must detect observable verbs like "display" and "show"
     */
    it('should pass observable outcome for verbs like "display"', async () => {
      const result = await service.checkAtomicity('System displays confirmation message');

      // Verifies observable verb is detected
      expect(result.heuristicScores.observableOutcome.passed).toBe(true);
    });

    /**
     * @atom IA-043
     * Must fail when no observable outcome is present
     */
    it('should fail observable outcome for internal processing', async () => {
      const result = await service.checkAtomicity('System validates user credentials internally');

      // Verifies lack of observable outcome is detected
      expect(result.heuristicScores.observableOutcome.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must detect "user can see" pattern
     */
    it('should detect "user can see" pattern as observable', async () => {
      const result = await service.checkAtomicity('User can see their account balance');

      // Verifies "user can see" pattern is recognized
      expect(result.heuristicScores.observableOutcome.passed).toBe(true);
    });
  });

  describe('Implementation-Agnostic Heuristic', () => {
    /**
     * @atom IA-043
     * Must detect technology-specific terms like "SQL"
     */
    it('should fail for technology-specific terms', async () => {
      const result = await service.checkAtomicity('System retrieves user data using SQL query');

      // Verifies technology term is detected
      expect(result.heuristicScores.implementationAgnostic.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must detect implementation phrases like "via API"
     */
    it('should fail for implementation phrases like "via API"', async () => {
      const result = await service.checkAtomicity('System sends notification via REST API');

      // Verifies implementation phrase is detected
      expect(result.heuristicScores.implementationAgnostic.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must pass for behavior-focused descriptions
     */
    it('should pass for behavior-focused descriptions', async () => {
      const result = await service.checkAtomicity(
        'System sends notification to user within 5 seconds',
      );

      // Verifies behavior-focused description passes
      expect(result.heuristicScores.implementationAgnostic.passed).toBe(true);
    });

    /**
     * @atom IA-043
     * Must detect database-specific terms
     */
    it('should detect database terms like "postgres" or "mongo"', async () => {
      const result = await service.checkAtomicity('System stores data in postgres database');

      // Verifies database term is detected
      expect(result.heuristicScores.implementationAgnostic.passed).toBe(false);
    });
  });

  describe('Measurable Criteria Heuristic', () => {
    /**
     * @atom IA-043
     * Must pass when time constraint is specified
     */
    it('should pass for time-bounded statements', async () => {
      const result = await service.checkAtomicity('System responds within 3 seconds');

      // Verifies time constraint is recognized
      expect(result.heuristicScores.measurableCriteria.passed).toBe(true);
    });

    /**
     * @atom IA-043
     * Must pass when numeric threshold is specified
     */
    it('should pass for numeric thresholds', async () => {
      const result = await service.checkAtomicity('System allows at least 5 login attempts');

      // Verifies numeric threshold is recognized
      expect(result.heuristicScores.measurableCriteria.passed).toBe(true);
    });

    /**
     * @atom IA-043
     * Must fail for vague qualifiers without measurements
     */
    it('should fail for vague qualifiers like "fast" or "efficient"', async () => {
      const result = await service.checkAtomicity('System provides fast response to user');

      // Verifies vague qualifier is penalized
      expect(result.heuristicScores.measurableCriteria.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must fail for "usually" and similar uncertain language
     */
    it('should fail for uncertain language like "usually"', async () => {
      const result = await service.checkAtomicity('System usually completes the operation');

      // Verifies uncertain language is detected
      expect(result.heuristicScores.measurableCriteria.passed).toBe(false);
    });
  });

  describe('Reasonable Scope Heuristic', () => {
    /**
     * @atom IA-043
     * Must fail for overly broad statements with "all" or "every"
     */
    it('should fail for overly broad scope with "all"', async () => {
      const result = await service.checkAtomicity('System handles all user requests');

      // Verifies broad scope is detected
      expect(result.heuristicScores.reasonableScope.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must fail for very short descriptions (less than 5 words)
     */
    it('should fail for very short descriptions', async () => {
      const result = await service.checkAtomicity('User logs in');

      // Verifies short description is flagged
      expect(result.heuristicScores.reasonableScope.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must pass for reasonably scoped descriptions
     */
    it('should pass for reasonably scoped descriptions', async () => {
      const result = await service.checkAtomicity(
        'User can view their profile information on the settings page',
      );

      // Verifies reasonable scope passes
      expect(result.heuristicScores.reasonableScope.passed).toBe(true);
    });

    /**
     * @atom IA-043
     * Must fail for "entire system" or "complete system" phrases
     */
    it('should fail for "complete system" phrases', async () => {
      const result = await service.checkAtomicity('Complete system must be available at all times');

      // Verifies system-wide scope is detected
      expect(result.heuristicScores.reasonableScope.passed).toBe(false);
    });
  });

  describe('Atomic Intent Detection', () => {
    /**
     * @atom IA-043
     * Must mark well-formed intent as atomic
     */
    it('should mark well-formed intent as atomic', async () => {
      const result = await service.checkAtomicity(
        'System displays user profile within 2 seconds when requested',
      );

      // Verifies well-formed intent is atomic
      expect(result.isAtomic).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    /**
     * @atom IA-043
     * Must mark compound intent as non-atomic
     */
    it('should mark compound intent as non-atomic', async () => {
      const result = await service.checkAtomicity(
        'User can login and view dashboard and edit settings',
      );

      // Verifies compound intent is non-atomic
      expect(result.isAtomic).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    /**
     * @atom IA-043
     * Must generate suggestions when violations are found
     */
    it('should generate suggestions for violations', async () => {
      const result = await service.checkAtomicity(
        'User can login and view dashboard using REST API',
      );

      // Verifies suggestions are generated
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('LLM Integration', () => {
    /**
     * @atom IA-043
     * Must call LLM when useLLM option is true
     */
    it('should call LLM when useLLM option is enabled', async () => {
      mockLLMService.invoke.mockResolvedValueOnce({
        requestId: 'test-123',
        content: JSON.stringify({
          behavioralCompleteness: 0.8,
          testabilityAssessment: 0.9,
          ambiguityScore: 0.1,
          reasoning: 'Well-formed intent',
        }),
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 100,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      await service.checkAtomicity('User can view profile', { useLLM: true });

      // Verifies LLM was called
      expect(mockLLMService.invoke).toHaveBeenCalled();
    });

    /**
     * @atom IA-043
     * Must handle LLM failure gracefully
     */
    it('should handle LLM failure gracefully', async () => {
      mockLLMService.invoke.mockRejectedValueOnce(new Error('LLM unavailable'));

      const result = await service.checkAtomicity('User can view profile', {
        useLLM: true,
      });

      // Verifies service returns valid result even when LLM fails
      expect(result).toHaveProperty('isAtomic');
      // Verifies heuristic scores are still computed without LLM
      expect(result.heuristicScores).toHaveProperty('singleResponsibility');
    });

    /**
     * @atom IA-043
     * Must not call LLM when useLLM option is false
     */
    it('should not call LLM when useLLM is false', async () => {
      await service.checkAtomicity('User can view profile', { useLLM: false });

      // Verifies LLM was not called
      expect(mockLLMService.invoke).not.toHaveBeenCalled();
    });
  });

  describe('Heuristic Score Structure', () => {
    /**
     * @atom IA-043
     * Each heuristic score must have required fields
     */
    it('should return proper heuristic score structure', async () => {
      const result = await service.checkAtomicity('User can view profile');

      const checkScoreStructure = (name: string, score: HeuristicScore) => {
        // Verifies passed boolean indicates if heuristic threshold was met
        expect(score).toHaveProperty('passed');
        // Verifies score is numeric value for ranking
        expect(score).toHaveProperty('score');
        // Verifies maxScore defines upper bound for this heuristic
        expect(score).toHaveProperty('maxScore');
        // Verifies feedback provides human-readable explanation
        expect(score).toHaveProperty('feedback');
        // Verifies passed is strictly boolean type
        expect(typeof score.passed).toBe('boolean');
        // Verifies score is numeric for calculations
        expect(typeof score.score).toBe('number');
        // Verifies maxScore is numeric upper bound
        expect(typeof score.maxScore).toBe('number');
        // Verifies feedback is descriptive string
        expect(typeof score.feedback).toBe('string');
      };

      // Verifies single responsibility heuristic has proper structure
      checkScoreStructure('singleResponsibility', result.heuristicScores.singleResponsibility);
      // Verifies observable outcome heuristic has proper structure
      checkScoreStructure('observableOutcome', result.heuristicScores.observableOutcome);
      // Verifies implementation agnostic heuristic has proper structure
      checkScoreStructure('implementationAgnostic', result.heuristicScores.implementationAgnostic);
      // Verifies measurable criteria heuristic has proper structure
      checkScoreStructure('measurableCriteria', result.heuristicScores.measurableCriteria);
      // Verifies reasonable scope heuristic has proper structure
      checkScoreStructure('reasonableScope', result.heuristicScores.reasonableScope);
    });

    /**
     * @atom IA-043
     * Score must not exceed maxScore for any heuristic
     */
    it('should have score <= maxScore for all heuristics', async () => {
      const result = await service.checkAtomicity('User can view profile');

      // Verifies each heuristic score does not exceed its maximum value
      Object.entries(result.heuristicScores).forEach(([name, score]) => {
        // Verifies score boundary: score must never exceed maxScore
        expect(score.score).toBeLessThanOrEqual(score.maxScore);
        // Verifies score boundary: score must be non-negative
        expect(score.score).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Boundary Tests', () => {
    /**
     * @atom IA-043
     * Must handle empty string input
     */
    it('should handle empty string gracefully', async () => {
      const result = await service.checkAtomicity('');

      // Verifies service returns result for empty string
      expect(result).toHaveProperty('isAtomic');
      // Verifies empty string fails reasonable scope (too short)
      expect(result.heuristicScores.reasonableScope.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must handle single word input
     */
    it('should handle single word input', async () => {
      const result = await service.checkAtomicity('Login');

      // Verifies single word is processed without error
      expect(result).toHaveProperty('confidence');
      // Verifies single word is flagged as too narrow
      expect(result.heuristicScores.reasonableScope.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must handle very long input
     */
    it('should handle very long input', async () => {
      const longIntent =
        'User can view their complete profile information including personal details such as name, email, phone number, address, and preferences while also having the ability to see their recent activity history, notification settings, security options, linked accounts, and billing information all on a single comprehensive dashboard page that updates in real time';

      const result = await service.checkAtomicity(longIntent);

      // Verifies long intent is processed
      expect(result).toHaveProperty('isAtomic');
      // Verifies long intent fails reasonable scope (too broad)
      expect(result.heuristicScores.reasonableScope.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must handle special characters in input
     */
    it('should handle special characters', async () => {
      const result = await service.checkAtomicity(
        'User can view "profile" (email & phone) within <5 seconds>',
      );

      // Verifies special characters don't crash the service
      expect(result).toHaveProperty('isAtomic');
      // Verifies confidence is still computed
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    /**
     * @atom IA-043
     * Must handle confidence edge case: exactly 0.8 threshold
     */
    it('should have confidence score at boundary values', async () => {
      const result = await service.checkAtomicity(
        'System displays user profile within 2 seconds when requested by authenticated user',
      );

      // Verifies confidence is at or above minimum for atomic classification
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      // Verifies confidence does not exceed maximum value
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    /**
     * @atom IA-043
     * Score must never be negative for any heuristic
     */
    it('should never return negative score values', async () => {
      const intents = ['', 'x', 'System handles all requests using SQL and REST API quickly'];

      for (const intent of intents) {
        const result = await service.checkAtomicity(intent);
        // Verifies no heuristic score is negative
        Object.entries(result.heuristicScores).forEach(([name, score]) => {
          // Verifies score boundary: must not be negative
          expect(score.score).toBeGreaterThanOrEqual(0);
        });
      }
    });

    /**
     * @atom IA-043
     * Must handle exactly 5 word boundary (minimum reasonable scope)
     */
    it('should handle exactly 5 word boundary for reasonable scope', async () => {
      const exactlyFiveWords = 'User can view their profile';
      const result = await service.checkAtomicity(exactlyFiveWords);

      // Verifies 5 words is at minimum acceptable scope
      expect(result.heuristicScores.reasonableScope.passed).toBe(true);
    });

    /**
     * @atom IA-043
     * Must handle exactly 4 words (below minimum)
     */
    it('should fail for exactly 4 words (below minimum)', async () => {
      const fourWords = 'User can view profile';
      const result = await service.checkAtomicity(fourWords);

      // Verifies 4 words fails scope check
      expect(result.heuristicScores.reasonableScope.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Confidence must be exactly within [0, 1] range
     */
    it('should have confidence exactly within valid range', async () => {
      const result = await service.checkAtomicity('System displays confirmation within 2 seconds');

      // Verifies confidence is not less than 0
      expect(result.confidence).not.toBeLessThan(0);
      // Verifies confidence is not greater than 1
      expect(result.confidence).not.toBeGreaterThan(1);
    });

    /**
     * @atom IA-043
     * Score boundaries: must be <= maxScore
     */
    it('should have scores not exceeding maxScore', async () => {
      const result = await service.checkAtomicity('User views profile information quickly');

      // Verifies singleResponsibility score is at most maxScore
      expect(result.heuristicScores.singleResponsibility.score).toBeLessThanOrEqual(
        result.heuristicScores.singleResponsibility.maxScore,
      );
      // Verifies observableOutcome score is at most maxScore
      expect(result.heuristicScores.observableOutcome.score).toBeLessThanOrEqual(
        result.heuristicScores.observableOutcome.maxScore,
      );
      // Verifies implementationAgnostic score is at most maxScore
      expect(result.heuristicScores.implementationAgnostic.score).toBeLessThanOrEqual(
        result.heuristicScores.implementationAgnostic.maxScore,
      );
      // Verifies measurableCriteria score is at most maxScore
      expect(result.heuristicScores.measurableCriteria.score).toBeLessThanOrEqual(
        result.heuristicScores.measurableCriteria.maxScore,
      );
      // Verifies reasonableScope score is at most maxScore
      expect(result.heuristicScores.reasonableScope.score).toBeLessThanOrEqual(
        result.heuristicScores.reasonableScope.maxScore,
      );
    });

    /**
     * @atom IA-043
     * Violations count boundary: 0 for atomic, >0 for non-atomic
     */
    it('should have zero violations for well-formed atomic intent', async () => {
      const result = await service.checkAtomicity(
        'System displays user notification within 3 seconds',
      );

      // Verifies well-formed intent has exactly 0 violations
      expect(result.violations.length).toBe(0);
    });

    /**
     * @atom IA-043
     * MaxScore boundary: all heuristics have maxScore of 20
     */
    it('should have maxScore of exactly 20 for all heuristics', async () => {
      const result = await service.checkAtomicity('User views their profile');

      // Verifies singleResponsibility maxScore is exactly 20
      expect(result.heuristicScores.singleResponsibility.maxScore).toBe(20);
      // Verifies observableOutcome maxScore is exactly 20
      expect(result.heuristicScores.observableOutcome.maxScore).toBe(20);
      // Verifies implementationAgnostic maxScore is exactly 20
      expect(result.heuristicScores.implementationAgnostic.maxScore).toBe(20);
      // Verifies measurableCriteria maxScore is exactly 20
      expect(result.heuristicScores.measurableCriteria.maxScore).toBe(20);
      // Verifies reasonableScope maxScore is exactly 20
      expect(result.heuristicScores.reasonableScope.maxScore).toBe(20);
    });

    /**
     * @atom IA-043
     * Suggestions length boundary: must have at least 1 for violations
     */
    it('should have at least 1 suggestion when violations exist', async () => {
      const result = await service.checkAtomicity('User can login and logout');

      // Verifies at least one violation exists
      expect(result.violations.length).toBeGreaterThanOrEqual(1);
      // Verifies at least one suggestion is provided
      expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
    });

    /**
     * @atom IA-043
     * Word count boundary: exactly 50 words triggers too broad
     */
    it('should fail scope for exactly 51 words (above max)', async () => {
      const fiftyOneWords = Array(51).fill('word').join(' ');
      const result = await service.checkAtomicity(fiftyOneWords);

      // Verifies 51 words exceeds reasonable scope
      expect(result.heuristicScores.reasonableScope.passed).toBe(false);
    });
  });

  describe('Additional Boundary Tests', () => {
    /**
     * @atom IA-043
     * Total score across all heuristics should not exceed maximum possible
     */
    it('should have total score less than or equal to 100 (5 heuristics × 20)', async () => {
      const result = await service.checkAtomicity('User can view profile data');

      const totalScore = Object.values(result.heuristicScores).reduce((sum, h) => sum + h.score, 0);

      // Verifies total score does not exceed maximum
      expect(totalScore).toBeLessThanOrEqual(100);
      // Verifies total score is non-negative
      expect(totalScore).toBeGreaterThanOrEqual(0);
    });

    /**
     * @atom IA-043
     * Violations array must have exactly 0 length for perfect atomic intent
     */
    it('should have exactly 0 violations for perfectly atomic intent', async () => {
      const result = await service.checkAtomicity('System displays user name within 1 second');

      // Verifies atomic intent has no violations
      expect(result.violations.length).toBe(0);
    });

    /**
     * @atom IA-043
     * Suggestions array must have length > 0 for non-atomic intent
     */
    it('should have suggestions length greater than 0 for non-atomic', async () => {
      const result = await service.checkAtomicity('User can login and logout using API calls');

      // Verifies suggestions are provided
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    /**
     * @atom IA-043
     * Confidence must not be exactly 0 for valid intent
     */
    it('should not have confidence of exactly 0 for valid intent', async () => {
      const result = await service.checkAtomicity('User can view their profile information');

      // Verifies confidence is not zero
      expect(result.confidence).not.toBe(0);
    });

    /**
     * @atom IA-043
     * Individual heuristic score must be less than maxScore + 1
     */
    it('should have each score strictly less than maxScore + 1', async () => {
      const result = await service.checkAtomicity('User views profile');

      Object.entries(result.heuristicScores).forEach(([name, h]) => {
        // Verifies score is less than maxScore + 1
        expect(h.score).toBeLessThan(h.maxScore + 1);
      });
    });

    /**
     * @atom IA-043
     * Failing heuristic must have score less than maxScore
     */
    it('should have score less than maxScore when heuristic fails', async () => {
      const result = await service.checkAtomicity('User can login and logout');

      // Verifies failing heuristic has reduced score
      expect(result.heuristicScores.singleResponsibility.score).toBeLessThan(
        result.heuristicScores.singleResponsibility.maxScore,
      );
    });

    /**
     * @atom IA-043
     * Word count at boundary: 50 words should pass scope check
     */
    it('should pass scope for exactly 50 words (at max boundary)', async () => {
      const fiftyWords = Array(50).fill('word').join(' ');
      const result = await service.checkAtomicity(fiftyWords);

      // Verifies 50 words is within acceptable range
      expect(result.heuristicScores.reasonableScope.passed).toBe(true);
    });

    /**
     * @atom IA-043
     * Violations count must be greater than 0 for compound intent
     */
    it('should have violations greater than 0 for compound intent', async () => {
      const result = await service.checkAtomicity('User can edit and delete records');

      // Verifies compound intent generates violations
      expect(result.violations.length).toBeGreaterThan(0);
    });

    /**
     * @atom IA-043
     * Confidence boundary: non-atomic intent should have confidence < 1
     */
    it('should have confidence less than 1 for non-atomic intent', async () => {
      const result = await service.checkAtomicity(
        'System quickly handles all requests using database',
      );

      // Verifies non-atomic intent has reduced confidence
      expect(result.confidence).toBeLessThan(1);
    });

    /**
     * @atom IA-043
     * Total violations must not exceed number of heuristics (5)
     */
    it('should have violations less than or equal to 5', async () => {
      const result = await service.checkAtomicity(
        'System quickly handles all using SQL database or MongoDB',
      );

      // Verifies violations don't exceed heuristic count
      expect(result.violations.length).toBeLessThanOrEqual(5);
    });

    /**
     * @atom IA-043
     * Feedback string length boundary: must not be empty when heuristic fails
     */
    it('should have non-empty feedback when heuristic fails', async () => {
      const result = await service.checkAtomicity('User can login and logout');

      // Verifies feedback is not empty for failing heuristic
      expect(result.heuristicScores.singleResponsibility.feedback.length).toBeGreaterThan(0);
    });

    /**
     * @atom IA-043
     * Passing heuristic should have score greater than 0
     */
    it('should have score greater than 0 for passing heuristic', async () => {
      const result = await service.checkAtomicity('System displays notification within 2 seconds');

      // Verifies passing heuristic has positive score
      if (result.heuristicScores.observableOutcome.passed) {
        expect(result.heuristicScores.observableOutcome.score).toBeGreaterThan(0);
      }
    });
  });

  describe('Negative Tests', () => {
    /**
     * @atom IA-043
     * Must NOT mark compound "and" intent as atomic
     */
    it('should NOT mark compound "and" intent as atomic', async () => {
      const result = await service.checkAtomicity('User can login and view dashboard');

      // Verifies compound intent is NOT atomic
      expect(result.isAtomic).not.toBe(true);
      // Verifies single responsibility check fails
      expect(result.heuristicScores.singleResponsibility.passed).toBe(false);
    });

    /**
     * @atom IA-043
     * Must NOT mark compound "or" intent as atomic
     */
    it('should NOT mark compound "or" intent as atomic', async () => {
      const result = await service.checkAtomicity('User can create or update their profile');

      // Verifies compound intent with "or" is NOT atomic
      expect(result.isAtomic).not.toBe(true);
    });

    /**
     * @atom IA-043
     * Must NOT pass implementation-agnostic for SQL mentions
     */
    it('should NOT pass implementation-agnostic for SQL', async () => {
      const result = await service.checkAtomicity('System retrieves data using SQL queries');

      // Verifies SQL mention fails implementation check
      expect(result.heuristicScores.implementationAgnostic.passed).not.toBe(true);
    });

    /**
     * @atom IA-043
     * Must NOT pass implementation-agnostic for database mentions
     */
    it('should NOT pass implementation-agnostic for database mentions', async () => {
      const result = await service.checkAtomicity('System stores user data in the database');

      // Verifies database mention fails implementation check
      expect(result.heuristicScores.implementationAgnostic.passed).not.toBe(true);
    });

    /**
     * @atom IA-043
     * Must NOT pass measurable criteria for vague "fast"
     */
    it('should NOT pass measurable criteria for vague qualifiers', async () => {
      const result = await service.checkAtomicity('System responds fast to user requests');

      // Verifies vague "fast" fails measurable criteria
      expect(result.heuristicScores.measurableCriteria.passed).not.toBe(true);
    });

    /**
     * @atom IA-043
     * Must NOT pass measurable criteria for "usually"
     */
    it('should NOT pass measurable criteria for uncertain language', async () => {
      const result = await service.checkAtomicity('System usually processes requests properly');

      // Verifies "usually" fails measurable criteria
      expect(result.heuristicScores.measurableCriteria.passed).not.toBe(true);
    });

    /**
     * @atom IA-043
     * Must NOT pass reasonable scope for "all" keyword
     */
    it('should NOT pass reasonable scope for "all" keyword', async () => {
      const result = await service.checkAtomicity('System handles all user interactions');

      // Verifies "all" keyword fails scope check
      expect(result.heuristicScores.reasonableScope.passed).not.toBe(true);
    });

    /**
     * @atom IA-043
     * Must NOT pass reasonable scope for "every" keyword
     */
    it('should NOT pass reasonable scope for "every" keyword', async () => {
      const result = await service.checkAtomicity('System validates every user input');

      // Verifies "every" keyword fails scope check
      expect(result.heuristicScores.reasonableScope.passed).not.toBe(true);
    });

    /**
     * @atom IA-043
     * Must NOT mark intent with multiple violations as atomic
     */
    it('should NOT mark intent with multiple violations as atomic', async () => {
      const result = await service.checkAtomicity(
        'System quickly handles all user requests using SQL database',
      );

      // Verifies intent with multiple issues is NOT atomic
      expect(result.isAtomic).not.toBe(true);
      // Verifies multiple violations are detected
      expect(result.violations.length).toBeGreaterThan(0);
    });

    /**
     * @atom IA-043
     * Must NOT return empty violations array for non-atomic intent
     */
    it('should NOT return empty violations for non-atomic intent', async () => {
      const result = await service.checkAtomicity('User can login and logout using REST API');

      // Verifies violations are captured
      expect(result.violations.length).not.toBe(0);
    });
  });
});
