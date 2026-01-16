import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AtomizationService } from './atomization.service';
import { Atom } from '../atoms/atom.entity';
import { AgentAction } from './agent-action.entity';
import { LLMService } from '../../common/llm/llm.service';
import { AtomQualityService } from '../validators/atom-quality.service';

describe('AtomizationService', () => {
  let service: AtomizationService;

  const mockAtomRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAgentActionRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        LLM_CONFIDENCE_THRESHOLD_ATOMICITY: '0.7',
        OPENAI_MODEL: 'gpt-4-turbo-preview',
        OPENAI_API_KEY: 'test-key',
        ATOM_QUALITY_GATING: 'true',
      };
      return config[key] || defaultValue;
    }),
  };

  const mockLLMService = {
    invoke: jest.fn().mockImplementation(async () => {
      // Default response - tests will override as needed
      return {
        content: JSON.stringify({
          isAtomic: true,
          confidence: 0.85,
          reasoning: 'Valid atomic intent',
          category: 'functional',
        }),
        cost: 0.001,
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    }),
  };

  const mockAtomQualityService = {
    validateAtom: jest.fn().mockResolvedValue({
      totalScore: 85,
      decision: 'approve',
      dimensions: {},
      overallFeedback: 'This atom meets quality standards.',
      actionableImprovements: [],
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtomizationService,
        {
          provide: getRepositoryToken(Atom),
          useValue: mockAtomRepository,
        },
        {
          provide: getRepositoryToken(AgentAction),
          useValue: mockAgentActionRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
        {
          provide: AtomQualityService,
          useValue: mockAtomQualityService,
        },
      ],
    }).compile();

    service = module.get<AtomizationService>(AtomizationService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  // @atom IA-001
  it('should be instantiated by NestJS dependency injection', () => {
    // AtomizationService must be instantiated by dependency injection
    expect(service).not.toBeNull();
    expect(service instanceof AtomizationService).toBe(true);
  });

  // @atom IA-002
  describe('atomize - valid atomic intent with high confidence', () => {
    it('should create atom from atomic intent with confidence >= 0.7', async () => {
      // Mock LLM response for atomic intent
      mockLLMService.invoke.mockResolvedValueOnce({
        content: JSON.stringify({
          isAtomic: true,
          confidence: 0.85,
          reasoning: 'This intent is irreducible, testable, and implementation-agnostic',
          category: 'performance',
        }),
        cost: 0.002,
        usage: { inputTokens: 150, outputTokens: 75 },
      });

      // Mock repository responses
      mockAtomRepository.findOne.mockResolvedValue(null); // No existing atoms
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-001',
        description: 'User authentication must complete within 2 seconds',
        category: 'performance',
        status: 'draft',
      });
      // Use fixed timestamp for deterministic testing
      const fixedTimestamp = new Date('2024-01-15T10:00:00Z');
      mockAtomRepository.save.mockResolvedValue({
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'User authentication must complete within 2 seconds',
        category: 'performance',
        status: 'draft',
        createdAt: fixedTimestamp,
      });

      mockAgentActionRepository.create.mockReturnValue({});
      mockAgentActionRepository.save.mockResolvedValue({});

      const result = await service.atomize({
        intentDescription: 'User authentication must complete within 2 seconds',
        category: 'performance',
      });

      // Atom must be created successfully with high confidence
      expect(result.success).toBe(true);
      // Atom must be returned in the result
      expect(result.atom).not.toBeNull();
      // Atom ID must follow the IA-XXX format
      expect(result.atom?.atomId).toMatch(/^IA-\d{3}$/);
      // Confidence must meet the 0.7 threshold
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      // New atoms must be in draft status
      expect(result.atom?.status).toBe('draft');
      // Atom must be persisted to database
      expect(mockAtomRepository.save).toHaveBeenCalled();
    });
  });

  // @atom IA-003
  describe('atomize - low confidence threshold', () => {
    it('should request clarification when confidence is below 0.7', async () => {
      // Mock LLM response with low confidence
      mockLLMService.invoke.mockResolvedValueOnce({
        content: JSON.stringify({
          isAtomic: false,
          confidence: 0.55,
          reasoning: 'Intent is too vague and not testable',
          category: 'functional',
        }),
        cost: 0.001,
        usage: { inputTokens: 100, outputTokens: 40 },
      });

      mockAgentActionRepository.create.mockReturnValue({});
      mockAgentActionRepository.save.mockResolvedValue({});

      const result = await service.atomize({
        intentDescription: 'System should be good',
      });

      // Low confidence must result in failure
      expect(result.success).toBe(false);
      // No atom should be created for low confidence
      expect(result.atom).toBeUndefined();
      // Confidence must be below threshold
      expect(result.confidence).toBeLessThan(0.7);
      // Analysis must indicate uncertainty
      expect(result.analysis).toContain('Unable to determine');
      // Message must explain the low confidence rejection
      expect(result.message).toContain('Confidence too low');
      // Database must not be modified for rejected intents
      expect(mockAtomRepository.save).not.toHaveBeenCalled();
    });

    it('should NOT make best-guess suggestions when confidence is low', async () => {
      // Mock LLM response with atomic but low confidence
      mockLLMService.invoke.mockResolvedValueOnce({
        content: JSON.stringify({
          isAtomic: true, // Even if LLM thinks it's atomic
          confidence: 0.64, // But confidence is low
          reasoning: 'Uncertain about decomposition',
          category: 'functional',
        }),
        cost: 0.001,
        usage: { inputTokens: 100, outputTokens: 45 },
      });

      mockAgentActionRepository.create.mockReturnValue({});
      mockAgentActionRepository.save.mockResolvedValue({});

      const result = await service.atomize({
        intentDescription: 'User should be able to save work',
      });

      // Low confidence must prevent atom creation even if LLM says atomic
      expect(result.success).toBe(false);
      // Confidence must be below threshold
      expect(result.confidence).toBeLessThan(0.7);
      // No database modification for uncertain intents
      expect(mockAtomRepository.save).not.toHaveBeenCalled();
    });
  });

  // @atom IA-004
  describe('atomize - non-atomic intent', () => {
    it('should suggest decomposition for non-atomic intent', async () => {
      // Mock LLM response for non-atomic intent with high confidence
      mockLLMService.invoke.mockResolvedValueOnce({
        content: JSON.stringify({
          isAtomic: false,
          confidence: 0.92,
          reasoning: 'This combines two separate behaviors: login and view dashboard',
          category: 'functional',
          suggestedDecomposition: [
            'User can authenticate with valid credentials',
            'User can view dashboard after authentication',
          ],
        }),
        cost: 0.0015,
        usage: { inputTokens: 120, outputTokens: 80 },
      });

      mockAgentActionRepository.create.mockReturnValue({});
      mockAgentActionRepository.save.mockResolvedValue({});

      const result = await service.atomize({
        intentDescription: 'User can log in and view dashboard',
      });

      // Non-atomic intent must be rejected
      expect(result.success).toBe(false);
      // No atom should be created for compound intents
      expect(result.atom).toBeUndefined();
      // Analysis must indicate non-atomic nature
      expect(result.analysis).toContain('not atomic');
      // Message must suggest decomposition
      expect(result.message).toContain('decomposed');
      // Database must not be modified
      expect(mockAtomRepository.save).not.toHaveBeenCalled();
    });
  });

  // @atom IA-005
  describe('atomize - category detection', () => {
    it('should correctly categorize performance intents', async () => {
      // Mock LLM response for performance category
      mockLLMService.invoke.mockResolvedValueOnce({
        content: JSON.stringify({
          isAtomic: true,
          confidence: 0.89,
          reasoning: 'Clear performance requirement',
          category: 'performance',
        }),
        cost: 0.0012,
        usage: { inputTokens: 110, outputTokens: 50 },
      });

      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-001',
        description: 'Response time must not exceed 200ms',
        category: 'performance',
        status: 'draft',
      });
      mockAtomRepository.save.mockResolvedValue({
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Response time must not exceed 200ms',
        category: 'performance',
        status: 'draft',
      });

      mockAgentActionRepository.create.mockReturnValue({});
      mockAgentActionRepository.save.mockResolvedValue({});

      const result = await service.atomize({
        intentDescription: 'Response time must not exceed 200ms',
      });

      // Performance intent must be successfully atomized
      expect(result.success).toBe(true);
      // Category must be correctly detected as performance
      expect(result.atom?.category).toBe('performance');
    });

    it('should correctly categorize security intents', async () => {
      // Mock LLM response for security category
      mockLLMService.invoke.mockResolvedValueOnce({
        content: JSON.stringify({
          isAtomic: true,
          confidence: 0.93,
          reasoning: 'Clear security requirement',
          category: 'security',
        }),
        cost: 0.0011,
        usage: { inputTokens: 105, outputTokens: 48 },
      });

      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-001',
        description: 'Password must be hashed before storage',
        category: 'security',
        status: 'draft',
      });
      mockAtomRepository.save.mockResolvedValue({
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Password must be hashed before storage',
        category: 'security',
        status: 'draft',
      });

      mockAgentActionRepository.create.mockReturnValue({});
      mockAgentActionRepository.save.mockResolvedValue({});

      const result = await service.atomize({
        intentDescription: 'Password must be hashed before storage',
      });

      // Security intent must be successfully atomized
      expect(result.success).toBe(true);
      // Category must be correctly detected as security
      expect(result.atom?.category).toBe('security');
    });
  });

  // @atom IA-006
  describe('agent action logging', () => {
    it('should log all atomization attempts', async () => {
      // Mock LLM response for logging test
      mockLLMService.invoke.mockResolvedValueOnce({
        content: JSON.stringify({
          isAtomic: true,
          confidence: 0.88,
          reasoning: 'Valid atomic intent',
          category: 'functional',
        }),
        cost: 0.0013,
        usage: { inputTokens: 115, outputTokens: 52 },
      });

      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-001',
        description: 'Test intent',
        category: 'functional',
        status: 'draft',
      });
      mockAtomRepository.save.mockResolvedValue({
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Test intent',
        category: 'functional',
        status: 'draft',
      });

      mockAgentActionRepository.create.mockReturnValue({});
      mockAgentActionRepository.save.mockResolvedValue({});

      await service.atomize({
        intentDescription: 'Test intent',
      });

      // Agent action must be logged with correct metadata
      expect(mockAgentActionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'atomization-agent',
          actionType: 'atomize',
          confidenceScore: 0.88,
        }),
      );
      // Agent action must be persisted to database
      expect(mockAgentActionRepository.save).toHaveBeenCalled();
    });
  });

  // @atom IA-007
  describe('atom ID generation', () => {
    it('should generate sequential atom IDs starting from IA-001', async () => {
      // Mock LLM response for ID generation test
      mockLLMService.invoke.mockResolvedValueOnce({
        content: JSON.stringify({
          isAtomic: true,
          confidence: 0.9,
          reasoning: 'Valid',
          category: 'functional',
        }),
        cost: 0.001,
        usage: { inputTokens: 100, outputTokens: 40 },
      });

      mockAtomRepository.findOne.mockResolvedValue(null); // No existing atoms
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-001',
        description: 'First atom',
        category: 'functional',
        status: 'draft',
      });
      mockAtomRepository.save.mockResolvedValue({
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'First atom',
        category: 'functional',
        status: 'draft',
      });

      mockAgentActionRepository.create.mockReturnValue({});
      mockAgentActionRepository.save.mockResolvedValue({});

      const result = await service.atomize({
        intentDescription: 'First atom',
      });

      // First atom must have ID IA-001
      expect(result.atom?.atomId).toBe('IA-001');
    });

    it('should increment atom ID from latest existing atom', async () => {
      // Mock LLM response for incremental ID test
      mockLLMService.invoke.mockResolvedValueOnce({
        content: JSON.stringify({
          isAtomic: true,
          confidence: 0.9,
          reasoning: 'Valid',
          category: 'functional',
        }),
        cost: 0.001,
        usage: { inputTokens: 100, outputTokens: 42 },
      });

      // Mock existing atom with ID IA-042
      mockAtomRepository.findOne.mockResolvedValue({
        atomId: 'IA-042',
      });
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-043',
        description: 'Next atom',
        category: 'functional',
        status: 'draft',
      });
      mockAtomRepository.save.mockResolvedValue({
        id: 'test-uuid',
        atomId: 'IA-043',
        description: 'Next atom',
        category: 'functional',
        status: 'draft',
      });

      mockAgentActionRepository.create.mockReturnValue({});
      mockAgentActionRepository.save.mockResolvedValue({});

      const result = await service.atomize({
        intentDescription: 'Next atom',
      });

      // Atom ID must increment from existing highest ID (IA-042 -> IA-043)
      expect(result.atom?.atomId).toBe('IA-043');
    });
  });
});
