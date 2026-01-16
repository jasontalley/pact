import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import {
  IntentRefinementService,
  IntentAnalysisResult,
  RefinementSuggestion,
  RefinementResult,
} from './intent-refinement.service';
import { AtomicityCheckerService, AtomicityResult } from './atomicity-checker.service';
import { AtomQualityService } from '../validators/atom-quality.service';
import { LLMService } from '../../common/llm/llm.service';
import { Atom, RefinementRecord } from '../atoms/atom.entity';

/**
 * Tests for IntentRefinementService
 *
 * Related atoms:
 * - IA-044: Intent refinement service provides AI-powered iterative refinement of atoms
 */
describe('IntentRefinementService', () => {
  let service: IntentRefinementService;
  let mockAtomRepository: jest.Mocked<Repository<Atom>>;
  let mockAtomicityChecker: jest.Mocked<AtomicityCheckerService>;
  let mockAtomQualityService: jest.Mocked<AtomQualityService>;
  let mockLLMService: jest.Mocked<LLMService>;

  const mockAtom: Partial<Atom> = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    atomId: 'IA-001',
    description: 'User can login to the system',
    category: 'functional',
    status: 'draft',
    qualityScore: 75,
    refinementHistory: [],
  };

  const mockAtomicityResult: AtomicityResult = {
    isAtomic: true,
    confidence: 0.85,
    violations: [],
    suggestions: [],
    heuristicScores: {
      singleResponsibility: { passed: true, score: 20, maxScore: 20, feedback: 'OK' },
      observableOutcome: { passed: true, score: 20, maxScore: 20, feedback: 'OK' },
      implementationAgnostic: { passed: true, score: 20, maxScore: 20, feedback: 'OK' },
      measurableCriteria: { passed: true, score: 15, maxScore: 20, feedback: 'OK' },
      reasonableScope: { passed: true, score: 20, maxScore: 20, feedback: 'OK' },
    },
  };

  beforeEach(async () => {
    mockAtomRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Atom>>;

    mockAtomicityChecker = {
      checkAtomicity: jest.fn().mockResolvedValue(mockAtomicityResult),
    } as unknown as jest.Mocked<AtomicityCheckerService>;

    mockAtomQualityService = {
      validateAtom: jest.fn().mockResolvedValue({
        totalScore: 85,
        decision: 'approve',
        dimensions: {},
      }),
    } as unknown as jest.Mocked<AtomQualityService>;

    mockLLMService = {
      invoke: jest.fn(),
    } as unknown as jest.Mocked<LLMService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentRefinementService,
        { provide: getRepositoryToken(Atom), useValue: mockAtomRepository },
        { provide: AtomicityCheckerService, useValue: mockAtomicityChecker },
        { provide: AtomQualityService, useValue: mockAtomQualityService },
        { provide: LLMService, useValue: mockLLMService },
      ],
    }).compile();

    service = module.get<IntentRefinementService>(IntentRefinementService);
  });

  /**
   * @atom IA-044
   * Service must be properly instantiated by NestJS DI
   */
  it('should be defined', () => {
    // Verifies service is created by dependency injection
    expect(service).toBeDefined();
  });

  describe('analyzeIntent', () => {
    /**
     * @atom IA-044
     * Must return IntentAnalysisResult with atomicity classification
     */
    it('should return analysis result with atomicity classification', async () => {
      const result = await service.analyzeIntent('User can view their profile');

      // Verifies atomicity classification is present
      expect(result).toHaveProperty('atomicity');
      expect(['atomic', 'non-atomic', 'ambiguous']).toContain(result.atomicity);
    });

    /**
     * @atom IA-044
     * Must return confidence score between 0 and 1
     */
    it('should return confidence score', async () => {
      const result = await service.analyzeIntent('User can view their profile');

      // Verifies confidence is within valid range
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    /**
     * @atom IA-044
     * Must include clarifying questions for ambiguous intents
     */
    it('should include clarifying questions when applicable', async () => {
      mockAtomicityChecker.checkAtomicity.mockResolvedValueOnce({
        ...mockAtomicityResult,
        heuristicScores: {
          ...mockAtomicityResult.heuristicScores,
          observableOutcome: { passed: false, score: 0, maxScore: 20, feedback: 'No observable outcome' },
        },
      });

      const result = await service.analyzeIntent('Process user data');

      // Verifies clarifyingQuestions property exists on result
      expect(result).toHaveProperty('clarifyingQuestions');
      // Verifies clarifyingQuestions is an array for iteration
      expect(Array.isArray(result.clarifyingQuestions)).toBe(true);
    });

    /**
     * @atom IA-044
     * Must include quality preview when available
     */
    it('should include quality preview', async () => {
      const result = await service.analyzeIntent('User can view their profile');

      // Verifies qualityPreview object is included for quick assessment
      expect(result).toHaveProperty('qualityPreview');
      // Verifies estimatedScore allows numeric comparison for gates
      expect(result.qualityPreview).toHaveProperty('estimatedScore');
      // Verifies decision provides categorical approval status
      expect(result.qualityPreview).toHaveProperty('decision');
    });

    /**
     * @atom IA-044
     * Must handle quality preview failure gracefully
     */
    it('should handle quality preview failure', async () => {
      mockAtomQualityService.validateAtom.mockRejectedValueOnce(
        new Error('Quality service unavailable'),
      );

      const result = await service.analyzeIntent('User can view profile');

      // Verifies result contains atomicity classification even when quality fails
      expect(result).toHaveProperty('atomicity');
      // Verifies atomicity value is one of the valid classifications
      expect(['atomic', 'non-atomic', 'ambiguous']).toContain(result.atomicity);
    });

    /**
     * @atom IA-044
     * Must classify high-confidence atomic as "atomic"
     */
    it('should classify high-confidence atomic intent', async () => {
      mockAtomicityChecker.checkAtomicity.mockResolvedValueOnce({
        ...mockAtomicityResult,
        isAtomic: true,
        confidence: 0.9,
      });

      const result = await service.analyzeIntent('System displays confirmation');

      // Verifies high confidence atomic classification
      expect(result.atomicity).toBe('atomic');
    });

    /**
     * @atom IA-044
     * Must classify high-confidence non-atomic as "non-atomic"
     */
    it('should classify high-confidence non-atomic intent', async () => {
      mockAtomicityChecker.checkAtomicity.mockResolvedValueOnce({
        ...mockAtomicityResult,
        isAtomic: false,
        confidence: 0.9,
        violations: ['Multiple responsibilities detected'],
      });

      const result = await service.analyzeIntent('User can login and logout');

      // Verifies non-atomic classification
      expect(result.atomicity).toBe('non-atomic');
    });

    /**
     * @atom IA-044
     * Must classify low-confidence result as "ambiguous"
     */
    it('should classify low-confidence result as ambiguous', async () => {
      mockAtomicityChecker.checkAtomicity.mockResolvedValueOnce({
        ...mockAtomicityResult,
        isAtomic: true,
        confidence: 0.5,
      });

      const result = await service.analyzeIntent('Handle user request');

      // Verifies ambiguous classification for low confidence
      expect(result.atomicity).toBe('ambiguous');
    });
  });

  describe('suggestRefinements', () => {
    /**
     * @atom IA-044
     * Must return array of refinement suggestions
     */
    it('should return array of suggestions', async () => {
      const result = await service.suggestRefinements('User can view profile');

      // Verifies suggestions array is returned
      expect(Array.isArray(result)).toBe(true);
    });

    /**
     * @atom IA-044
     * Must suggest decomposition for compound intents
     */
    it('should suggest decomposition for compound intents', async () => {
      mockAtomicityChecker.checkAtomicity.mockResolvedValueOnce({
        ...mockAtomicityResult,
        heuristicScores: {
          ...mockAtomicityResult.heuristicScores,
          singleResponsibility: { passed: false, score: 0, maxScore: 20, feedback: 'Compound' },
        },
      });

      const result = await service.suggestRefinements('User can login and view dashboard');

      // Verifies decomposition suggestions are generated
      const decompositionSuggestions = result.filter((s) => s.type === 'decomposition');
      expect(decompositionSuggestions.length).toBeGreaterThan(0);
    });

    /**
     * @atom IA-044
     * Each suggestion must have required fields
     */
    it('should return suggestions with required fields', async () => {
      mockAtomicityChecker.checkAtomicity.mockResolvedValueOnce({
        ...mockAtomicityResult,
        heuristicScores: {
          ...mockAtomicityResult.heuristicScores,
          observableOutcome: { passed: false, score: 0, maxScore: 20, feedback: 'Not observable' },
        },
      });

      const result = await service.suggestRefinements('Process data internally');

      // Verifies at least one suggestion is generated for the violation
      expect(result.length).toBeGreaterThan(0);
      const suggestion = result[0];
      // Verifies id uniquely identifies the suggestion
      expect(suggestion).toHaveProperty('id');
      // Verifies type categorizes the refinement approach
      expect(suggestion).toHaveProperty('type');
      // Verifies original preserves the input for comparison
      expect(suggestion).toHaveProperty('original');
      // Verifies suggested provides the improved text
      expect(suggestion).toHaveProperty('suggested');
      // Verifies reasoning explains why this change helps
      expect(suggestion).toHaveProperty('reasoning');
      // Verifies confidence indicates reliability of suggestion
      expect(suggestion).toHaveProperty('confidence');
    });

    /**
     * @atom IA-044
     * Must suggest measurable criteria when missing
     */
    it('should suggest measurable criteria when missing', async () => {
      mockAtomicityChecker.checkAtomicity.mockResolvedValueOnce({
        ...mockAtomicityResult,
        heuristicScores: {
          ...mockAtomicityResult.heuristicScores,
          measurableCriteria: { passed: false, score: 0, maxScore: 20, feedback: 'No measurements' },
        },
      });

      const result = await service.suggestRefinements('User can view profile');

      // Verifies precision suggestion with time constraint is generated
      const precisionSuggestions = result.filter((s) => s.type === 'precision');
      expect(precisionSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe('refineAtom', () => {
    /**
     * @atom IA-044
     * Must find atom by ID before refining
     */
    it('should find atom before refining', async () => {
      // Use fixed date for deterministic testing
      const fixedDate = new Date('2024-01-15T10:00:00Z');
      mockAtomRepository.findOne.mockResolvedValueOnce(mockAtom as Atom);
      mockAtomRepository.save.mockResolvedValueOnce({
        ...mockAtom,
        description: 'Refined description',
        refinementHistory: [{ timestamp: fixedDate, feedback: 'test', previousDescription: '', newDescription: '', source: 'user' }],
      } as Atom);

      await service.refineAtom('IA-001', 'Make it more specific');

      // Verifies repository findOne was called with both id and atomId lookup
      expect(mockAtomRepository.findOne).toHaveBeenCalledWith({
        where: [{ id: 'IA-001' }, { atomId: 'IA-001' }],
      });
    });

    /**
     * @atom IA-044
     * Must throw NotFoundException when atom not found
     */
    it('should throw NotFoundException when atom not found', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(null);

      // Verifies NotFoundException is thrown
      await expect(service.refineAtom('non-existent', 'feedback')).rejects.toThrow(
        NotFoundException,
      );
    });

    /**
     * @atom IA-044
     * Must reject refinement of non-draft atoms
     */
    it('should reject refinement of committed atoms', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce({
        ...mockAtom,
        status: 'committed',
      } as Atom);

      // Verifies error is thrown for committed atoms
      await expect(service.refineAtom('IA-001', 'feedback')).rejects.toThrow(
        "Cannot refine atom with status 'committed'",
      );
    });

    /**
     * @atom IA-044
     * Must save refinement record to history
     */
    it('should save refinement record to history', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce({
        ...mockAtom,
        refinementHistory: [],
      } as Atom);
      mockAtomRepository.save.mockImplementation(async (atom) => atom as Atom);

      await service.refineAtom('IA-001', 'Updated intent description for clarity');

      // Verifies save was called with atom containing refinement history
      const savedAtom = mockAtomRepository.save.mock.calls[0][0] as Atom;
      // Verifies exactly one refinement record was added
      expect(savedAtom.refinementHistory.length).toBe(1);
      // Verifies timestamp records when refinement occurred
      expect(savedAtom.refinementHistory[0]).toHaveProperty('timestamp');
      // Verifies previousDescription preserves original for audit
      expect(savedAtom.refinementHistory[0]).toHaveProperty('previousDescription');
      // Verifies newDescription captures the refined text
      expect(savedAtom.refinementHistory[0]).toHaveProperty('newDescription');
    });

    /**
     * @atom IA-044
     * Must return RefinementResult with success flag
     */
    it('should return RefinementResult with success flag', async () => {
      // Use fixed date for deterministic testing
      const fixedDate = new Date('2024-01-15T12:00:00Z');
      mockAtomRepository.findOne.mockResolvedValueOnce({
        ...mockAtom,
        refinementHistory: [],
      } as Atom);
      mockAtomRepository.save.mockImplementation(async (atom) => ({
        ...atom,
        refinementHistory: [{ timestamp: fixedDate, feedback: '', previousDescription: '', newDescription: '', source: 'ai' as const }],
      }) as Atom);

      const result = await service.refineAtom('IA-001', 'Clearer description here');

      // Verifies success flag indicates refinement completed
      expect(result.success).toBe(true);
      // Verifies atom object contains updated atom data
      expect(result).toHaveProperty('atom');
      // Verifies previousDescription preserved for audit trail
      expect(result).toHaveProperty('previousDescription');
      // Verifies refinementRecord contains the change metadata
      expect(result).toHaveProperty('refinementRecord');
      // Verifies message provides human-readable confirmation
      expect(result).toHaveProperty('message');
    });

    /**
     * @atom IA-044
     * Must re-evaluate quality after refinement
     */
    it('should re-evaluate quality after refinement', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce({
        ...mockAtom,
        refinementHistory: [],
      } as Atom);
      mockAtomRepository.save.mockImplementation(async (atom) => atom as Atom);

      await service.refineAtom('IA-001', 'Improved description with time constraint');

      // Verifies quality validation was called
      expect(mockAtomQualityService.validateAtom).toHaveBeenCalled();
    });

    /**
     * @atom IA-044
     * Must treat long feedback as direct replacement
     */
    it('should treat long feedback as direct replacement', async () => {
      const longFeedback = 'User can view their complete profile information including name, email, and preferences within 2 seconds';
      mockAtomRepository.findOne.mockResolvedValueOnce({
        ...mockAtom,
        refinementHistory: [],
      } as Atom);
      mockAtomRepository.save.mockImplementation(async (atom) => atom as Atom);

      await service.refineAtom('IA-001', longFeedback);

      // Verifies long feedback is used as direct replacement
      const savedAtom = mockAtomRepository.save.mock.calls[0][0] as Atom;
      expect(savedAtom.description).toBe(longFeedback);
    });
  });

  describe('getRefinementHistory', () => {
    /**
     * @atom IA-044
     * Must return refinement history for existing atom
     */
    it('should return refinement history', async () => {
      // Use fixed dates for deterministic testing
      const fixedDate1 = new Date('2024-01-01T10:00:00Z');
      const fixedDate2 = new Date('2024-01-01T11:00:00Z');
      const history: RefinementRecord[] = [
        { timestamp: fixedDate1, feedback: 'First', previousDescription: 'v1', newDescription: 'v2', source: 'user' },
        { timestamp: fixedDate2, feedback: 'Second', previousDescription: 'v2', newDescription: 'v3', source: 'ai' },
      ];
      mockAtomRepository.findOne.mockResolvedValueOnce({
        ...mockAtom,
        refinementHistory: history,
      } as Atom);

      const result = await service.getRefinementHistory('IA-001');

      // Verifies history length matches expected records
      expect(result).toHaveLength(2);
      // Verifies first record feedback is preserved
      expect(result[0].feedback).toBe('First');
      // Verifies second record feedback is preserved
      expect(result[1].feedback).toBe('Second');
    });

    /**
     * @atom IA-044
     * Must throw NotFoundException for non-existent atom
     */
    it('should throw NotFoundException for non-existent atom', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(null);

      // Verifies NotFoundException is thrown
      await expect(service.getRefinementHistory('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    /**
     * @atom IA-044
     * Must return empty array for atom with no history
     */
    it('should return empty array for atom with no history', async () => {
      // Test edge case where refinementHistory might be missing (legacy data)
      const atomWithoutHistory = { ...mockAtom };
      delete (atomWithoutHistory as any).refinementHistory;
      mockAtomRepository.findOne.mockResolvedValueOnce(atomWithoutHistory as Atom);

      const result = await service.getRefinementHistory('IA-001');

      // Verifies empty array is returned for no history
      expect(result).toEqual([]);
    });
  });

  describe('acceptSuggestion', () => {
    /**
     * @atom IA-044
     * Must apply suggestion to atom
     */
    it('should apply suggestion to atom', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce({
        ...mockAtom,
        refinementHistory: [],
      } as Atom);
      mockAtomRepository.save.mockImplementation(async (atom) => atom as Atom);

      const suggestion: RefinementSuggestion = {
        id: 'suggestion-1',
        type: 'precision',
        original: 'User can view profile',
        suggested: 'User can view profile within 2 seconds',
        reasoning: 'Added time constraint',
        confidence: 0.8,
      };

      await service.acceptSuggestion('IA-001', suggestion);

      // Verifies suggestion text was applied
      const savedAtom = mockAtomRepository.save.mock.calls[0][0] as Atom;
      expect(savedAtom.description).toBe('User can view profile within 2 seconds');
    });

    /**
     * @atom IA-044
     * Must record suggestion acceptance in history
     */
    it('should record suggestion acceptance in history', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce({
        ...mockAtom,
        refinementHistory: [],
      } as Atom);
      mockAtomRepository.save.mockImplementation(async (atom) => atom as Atom);

      const suggestion: RefinementSuggestion = {
        id: 'suggestion-1',
        type: 'rewrite',
        original: 'User can view profile',
        suggested: 'System displays user profile information',
        reasoning: 'Made observable',
        confidence: 0.85,
      };

      await service.acceptSuggestion('IA-001', suggestion);

      // Verifies suggestion was recorded in history
      const savedAtom = mockAtomRepository.save.mock.calls[0][0] as Atom;
      expect(savedAtom.refinementHistory.length).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    /**
     * @atom IA-044
     * Must handle empty intent string
     */
    it('should handle very short intent', async () => {
      const result = await service.analyzeIntent('Login');

      // Verifies analysis returns atomicity classification
      expect(result).toHaveProperty('atomicity');
      // Verifies atomicity is valid classification value
      expect(['atomic', 'non-atomic', 'ambiguous']).toContain(result.atomicity);
    });

    /**
     * @atom IA-044
     * Must handle special characters in intent
     */
    it('should handle special characters in intent', async () => {
      const result = await service.analyzeIntent(
        'User can view profile (including email & phone)',
      );

      // Verifies result has atomicity classification despite special chars
      expect(result).toHaveProperty('atomicity');
      // Verifies violations array is present for issue detection
      expect(result).toHaveProperty('violations');
      // Verifies violations is an array
      expect(Array.isArray(result.violations)).toBe(true);
    });

    /**
     * @atom IA-044
     * Must handle quality re-evaluation failure gracefully
     */
    it('should handle quality re-evaluation failure gracefully', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce({
        ...mockAtom,
        refinementHistory: [],
      } as Atom);
      mockAtomRepository.save.mockImplementation(async (atom) => atom as Atom);
      mockAtomQualityService.validateAtom.mockRejectedValueOnce(
        new Error('Quality service error'),
      );

      const result = await service.refineAtom('IA-001', 'Updated description');

      // Verifies refinement succeeds even when quality service fails
      expect(result.success).toBe(true);
      // Verifies newQualityScore is undefined when quality eval fails
      expect(result.newQualityScore).toBeUndefined();
    });
  });
});
