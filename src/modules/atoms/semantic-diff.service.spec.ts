import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SemanticDiffService } from './semantic-diff.service';
import { Atom } from './atom.entity';
import { LLMService } from '../../common/llm/llm.service';

describe('SemanticDiffService', () => {
  let service: SemanticDiffService;
  let mockLlmService: { invoke: jest.Mock };

  const mockAtomRepository = {
    findOne: jest.fn(),
  };

  const makeAtom = (overrides: Partial<Atom> = {}): Atom =>
    ({
      id: 'uuid-a',
      atomId: 'IA-001',
      description: 'User can log in with email and password',
      category: 'functional',
      status: 'draft',
      qualityScore: 85,
      tags: ['auth', 'login'],
      metadata: { category: 'functional' },
      observableOutcomes: [
        { description: 'User sees dashboard after login', measurementCriteria: 'redirect check' },
      ],
      falsifiabilityCriteria: [
        { condition: 'Invalid password', expectedBehavior: 'Login rejected with error' },
      ],
      refinementHistory: [],
      canvasPosition: null,
      parentIntent: null,
      supersededBy: null,
      createdAt: new Date(),
      committedAt: null,
      createdBy: null,
      intentIdentity: null,
      intentVersion: 1,
      validators: [],
      ...overrides,
    }) as Atom;

  const atomA = makeAtom();
  const atomB = makeAtom({
    id: 'uuid-b',
    atomId: 'IA-002',
    description: 'User can log in with email, password, or SSO',
    qualityScore: 90,
    tags: ['auth', 'sso'],
    metadata: { category: 'security' },
    observableOutcomes: [
      { description: 'User sees dashboard after login', measurementCriteria: 'redirect check' },
      { description: 'SSO token is validated', measurementCriteria: 'token check' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Invalid password', expectedBehavior: 'Login rejected with error message' },
      { condition: 'Expired SSO token', expectedBehavior: 'Re-authentication required' },
    ],
  });

  beforeEach(async () => {
    mockLlmService = { invoke: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SemanticDiffService,
        {
          provide: getRepositoryToken(Atom),
          useValue: mockAtomRepository,
        },
        {
          provide: LLMService,
          useValue: mockLlmService,
        },
      ],
    }).compile();

    service = module.get<SemanticDiffService>(SemanticDiffService);
    jest.clearAllMocks();
  });

  describe('service instantiation', () => {
    it('should be instantiated by NestJS dependency injection', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(SemanticDiffService);
    });
  });

  describe('diff', () => {
    it('should return a correctly structured SemanticDiff', async () => {
      mockAtomRepository.findOne
        .mockResolvedValueOnce(atomA) // first findOne by id for atomA
        .mockResolvedValueOnce(atomB); // first findOne by id for atomB

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify({
          changeType: 'expanded',
          summary: 'SSO support was added',
          overallAssessment: 'Scope expanded to include SSO authentication.',
        }),
      });

      const result = await service.diff('uuid-a', 'uuid-b');

      expect(result).toHaveProperty('atomA');
      expect(result).toHaveProperty('atomB');
      expect(result).toHaveProperty('descriptionDiff');
      expect(result).toHaveProperty('outcomesDiff');
      expect(result).toHaveProperty('falsifiabilityDiff');
      expect(result).toHaveProperty('categoryDiff');
      expect(result).toHaveProperty('qualityDiff');
      expect(result).toHaveProperty('tagsDiff');
      expect(result).toHaveProperty('overallAssessment');
    });

    it('should return atom summaries with correct fields', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(atomA).mockResolvedValueOnce(atomB);

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify({
          changeType: 'expanded',
          summary: 'SSO added',
          overallAssessment: 'Expanded.',
        }),
      });

      const result = await service.diff('uuid-a', 'uuid-b');

      expect(result.atomA.id).toBe('uuid-a');
      expect(result.atomA.atomId).toBe('IA-001');
      expect(result.atomA.description).toBe(atomA.description);
      expect(result.atomB.id).toBe('uuid-b');
      expect(result.atomB.atomId).toBe('IA-002');
    });

    it('should detect identical descriptions as unchanged when LLM is unavailable', async () => {
      const atomACopy = makeAtom();
      const atomBSame = makeAtom({ id: 'uuid-b', atomId: 'IA-002' });

      // Create service without LLM
      const moduleNoLlm = await Test.createTestingModule({
        providers: [
          SemanticDiffService,
          {
            provide: getRepositoryToken(Atom),
            useValue: mockAtomRepository,
          },
        ],
      }).compile();
      const serviceNoLlm = moduleNoLlm.get<SemanticDiffService>(SemanticDiffService);

      mockAtomRepository.findOne.mockResolvedValueOnce(atomACopy).mockResolvedValueOnce(atomBSame);

      const result = await serviceNoLlm.diff('uuid-a', 'uuid-b');
      expect(result.descriptionDiff.changeType).toBe('unchanged');
      expect(result.descriptionDiff.summary).toBe('Descriptions are identical.');
    });
  });

  describe('findAtom', () => {
    it('should find an atom by UUID', async () => {
      mockAtomRepository.findOne
        .mockResolvedValueOnce(atomA) // first findAtom: found by id
        .mockResolvedValueOnce(atomA); // second findAtom: found by id

      const result = await service.diff('uuid-a', 'uuid-a');
      // The first call should be with { where: { id: 'uuid-a' } }
      expect(mockAtomRepository.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-a' } });
    });

    it('should find an atom by atomId when UUID lookup fails', async () => {
      // First lookup by id returns null, second by atomId returns atomA
      mockAtomRepository.findOne
        .mockResolvedValueOnce(null) // id lookup for first atom
        .mockResolvedValueOnce(atomA) // atomId lookup for first atom
        .mockResolvedValueOnce(null) // id lookup for second atom
        .mockResolvedValueOnce(atomA); // atomId lookup for second atom

      const result = await service.diff('IA-001', 'IA-001');

      // Should have tried id first, then atomId
      expect(mockAtomRepository.findOne).toHaveBeenCalledWith({ where: { id: 'IA-001' } });
      expect(mockAtomRepository.findOne).toHaveBeenCalledWith({ where: { atomId: 'IA-001' } });
    });

    it('should throw NotFoundException when atom is not found', async () => {
      mockAtomRepository.findOne.mockResolvedValue(null);

      await expect(service.diff('nonexistent', 'uuid-b')).rejects.toThrow(NotFoundException);
      await expect(service.diff('nonexistent', 'uuid-b')).rejects.toThrow(
        'Atom "nonexistent" not found',
      );
    });
  });

  describe('diffOutcomes', () => {
    it('should identify added outcomes', async () => {
      const atomNoOutcomes = makeAtom({ observableOutcomes: [] });
      const atomWithOutcomes = makeAtom({
        id: 'uuid-b',
        atomId: 'IA-002',
        observableOutcomes: [{ description: 'New outcome' }],
      });

      mockAtomRepository.findOne
        .mockResolvedValueOnce(atomNoOutcomes)
        .mockResolvedValueOnce(atomWithOutcomes);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.outcomesDiff.added).toHaveLength(1);
      expect(result.outcomesDiff.added[0].description).toBe('New outcome');
      expect(result.outcomesDiff.removed).toHaveLength(0);
    });

    it('should identify removed outcomes', async () => {
      const atomWithOutcomes = makeAtom({
        observableOutcomes: [{ description: 'Old outcome' }],
      });
      const atomNoOutcomes = makeAtom({
        id: 'uuid-b',
        atomId: 'IA-002',
        observableOutcomes: [],
      });

      mockAtomRepository.findOne
        .mockResolvedValueOnce(atomWithOutcomes)
        .mockResolvedValueOnce(atomNoOutcomes);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.outcomesDiff.removed).toHaveLength(1);
      expect(result.outcomesDiff.removed[0].description).toBe('Old outcome');
      expect(result.outcomesDiff.added).toHaveLength(0);
    });

    it('should identify modified outcomes based on description similarity', async () => {
      const atomOld = makeAtom({
        observableOutcomes: [{ description: 'User sees dashboard after successful login' }],
      });
      const atomNew = makeAtom({
        id: 'uuid-b',
        atomId: 'IA-002',
        observableOutcomes: [{ description: 'User sees dashboard after successful login attempt' }],
      });

      mockAtomRepository.findOne.mockResolvedValueOnce(atomOld).mockResolvedValueOnce(atomNew);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.outcomesDiff.modified).toHaveLength(1);
      expect(result.outcomesDiff.unchanged).toBe(0);
    });

    it('should identify unchanged outcomes', async () => {
      const outcome = {
        description: 'User sees dashboard after login',
        measurementCriteria: 'redirect check',
      };
      const atomOld = makeAtom({ observableOutcomes: [outcome] });
      const atomNew = makeAtom({
        id: 'uuid-b',
        atomId: 'IA-002',
        observableOutcomes: [outcome],
      });

      mockAtomRepository.findOne.mockResolvedValueOnce(atomOld).mockResolvedValueOnce(atomNew);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.outcomesDiff.unchanged).toBe(1);
      expect(result.outcomesDiff.added).toHaveLength(0);
      expect(result.outcomesDiff.removed).toHaveLength(0);
      expect(result.outcomesDiff.modified).toHaveLength(0);
    });
  });

  describe('diffFalsifiability', () => {
    it('should identify added falsifiability criteria', async () => {
      const atomOld = makeAtom({ falsifiabilityCriteria: [] });
      const atomNew = makeAtom({
        id: 'uuid-b',
        atomId: 'IA-002',
        falsifiabilityCriteria: [
          { condition: 'Expired token', expectedBehavior: 'Re-auth required' },
        ],
      });

      mockAtomRepository.findOne.mockResolvedValueOnce(atomOld).mockResolvedValueOnce(atomNew);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.falsifiabilityDiff.added).toHaveLength(1);
      expect(result.falsifiabilityDiff.removed).toHaveLength(0);
    });

    it('should identify removed falsifiability criteria', async () => {
      const atomOld = makeAtom({
        falsifiabilityCriteria: [{ condition: 'Old condition', expectedBehavior: 'Old behavior' }],
      });
      const atomNew = makeAtom({
        id: 'uuid-b',
        atomId: 'IA-002',
        falsifiabilityCriteria: [],
      });

      mockAtomRepository.findOne.mockResolvedValueOnce(atomOld).mockResolvedValueOnce(atomNew);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.falsifiabilityDiff.removed).toHaveLength(1);
      expect(result.falsifiabilityDiff.added).toHaveLength(0);
    });

    it('should identify modified criteria when expectedBehavior changes', async () => {
      const atomOld = makeAtom({
        falsifiabilityCriteria: [
          { condition: 'Invalid password', expectedBehavior: 'Login rejected' },
        ],
      });
      const atomNew = makeAtom({
        id: 'uuid-b',
        atomId: 'IA-002',
        falsifiabilityCriteria: [
          { condition: 'Invalid password', expectedBehavior: 'Login rejected with error message' },
        ],
      });

      mockAtomRepository.findOne.mockResolvedValueOnce(atomOld).mockResolvedValueOnce(atomNew);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.falsifiabilityDiff.modified).toHaveLength(1);
      expect(result.falsifiabilityDiff.modified[0].old.expectedBehavior).toBe('Login rejected');
      expect(result.falsifiabilityDiff.modified[0].new.expectedBehavior).toBe(
        'Login rejected with error message',
      );
    });
  });

  describe('diffTags', () => {
    it('should identify added tags', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(atomA).mockResolvedValueOnce(atomB);

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify({
          changeType: 'expanded',
          summary: 'test',
          overallAssessment: 'test',
        }),
      });

      const result = await service.diff('uuid-a', 'uuid-b');
      // atomA tags: ['auth', 'login'], atomB tags: ['auth', 'sso']
      expect(result.tagsDiff.added).toContain('sso');
      expect(result.tagsDiff.added).not.toContain('auth');
    });

    it('should identify removed tags', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(atomA).mockResolvedValueOnce(atomB);

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify({
          changeType: 'expanded',
          summary: 'test',
          overallAssessment: 'test',
        }),
      });

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.tagsDiff.removed).toContain('login');
      expect(result.tagsDiff.removed).not.toContain('auth');
    });

    it('should return empty arrays when tags are identical', async () => {
      const a = makeAtom({ tags: ['a', 'b'] });
      const b = makeAtom({ id: 'uuid-b', atomId: 'IA-002', tags: ['a', 'b'] });

      mockAtomRepository.findOne.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.tagsDiff.added).toHaveLength(0);
      expect(result.tagsDiff.removed).toHaveLength(0);
    });
  });

  describe('diffQuality', () => {
    it('should compute quality delta correctly', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(atomA).mockResolvedValueOnce(atomB);

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify({
          changeType: 'expanded',
          summary: 'test',
          overallAssessment: 'test',
        }),
      });

      const result = await service.diff('uuid-a', 'uuid-b');
      // atomA quality: 85, atomB quality: 90
      expect(result.qualityDiff).not.toBeNull();
      expect(result.qualityDiff!.old).toBe(85);
      expect(result.qualityDiff!.new).toBe(90);
      expect(result.qualityDiff!.delta).toBe(5);
    });

    it('should return null when both quality scores are null', async () => {
      const a = makeAtom({ qualityScore: null });
      const b = makeAtom({ id: 'uuid-b', atomId: 'IA-002', qualityScore: null });

      mockAtomRepository.findOne.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.qualityDiff).toBeNull();
    });

    it('should handle one null quality score', async () => {
      const a = makeAtom({ qualityScore: null });
      const b = makeAtom({ id: 'uuid-b', atomId: 'IA-002', qualityScore: 75 });

      mockAtomRepository.findOne.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.qualityDiff).not.toBeNull();
      expect(result.qualityDiff!.old).toBeNull();
      expect(result.qualityDiff!.new).toBe(75);
      expect(result.qualityDiff!.delta).toBe(75);
    });
  });

  describe('categoryDiff', () => {
    it('should detect category changes via metadata', async () => {
      mockAtomRepository.findOne
        .mockResolvedValueOnce(atomA) // metadata.category = 'functional'
        .mockResolvedValueOnce(atomB); // metadata.category = 'security'

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify({
          changeType: 'reframed',
          summary: 'Category changed',
          overallAssessment: 'Changed from functional to security',
        }),
      });

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.categoryDiff).not.toBeNull();
      expect(result.categoryDiff!.old).toBe('functional');
      expect(result.categoryDiff!.new).toBe('security');
    });

    it('should return null when categories are the same', async () => {
      const a = makeAtom({ metadata: { category: 'functional' } });
      const b = makeAtom({
        id: 'uuid-b',
        atomId: 'IA-002',
        metadata: { category: 'functional' },
      });

      mockAtomRepository.findOne.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

      const result = await service.diff('uuid-a', 'uuid-b');
      expect(result.categoryDiff).toBeNull();
    });
  });

  describe('LLM analysis', () => {
    it('should use LLM for description diff when available and descriptions differ', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(atomA).mockResolvedValueOnce(atomB);

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify({
          changeType: 'expanded',
          summary: 'SSO support was added to authentication',
          overallAssessment: 'The atom scope expanded to include SSO as an authentication method.',
        }),
      });

      const result = await service.diff('uuid-a', 'uuid-b');

      expect(mockLlmService.invoke).toHaveBeenCalledTimes(1);
      expect(result.descriptionDiff.changeType).toBe('expanded');
      expect(result.descriptionDiff.summary).toBe('SSO support was added to authentication');
      expect(result.overallAssessment).toBe(
        'The atom scope expanded to include SSO as an authentication method.',
      );
    });

    it('should handle LLM failure gracefully with fallback assessment', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(atomA).mockResolvedValueOnce(atomB);

      mockLlmService.invoke.mockRejectedValue(new Error('LLM service unavailable'));

      const result = await service.diff('uuid-a', 'uuid-b');

      expect(result.descriptionDiff.changeType).toBe('reframed');
      expect(result.descriptionDiff.summary).toBe('Description changed (LLM analysis failed).');
      expect(result.overallAssessment).toContain('Description was modified.');
    });

    it('should handle malformed LLM JSON response gracefully', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(atomA).mockResolvedValueOnce(atomB);

      mockLlmService.invoke.mockResolvedValue({
        content: 'not valid json',
      });

      const result = await service.diff('uuid-a', 'uuid-b');

      // Should fall back gracefully
      expect(result.descriptionDiff.changeType).toBe('reframed');
      expect(result.descriptionDiff.summary).toBe('Description changed (LLM analysis failed).');
    });
  });

  describe('basic assessment without LLM', () => {
    let serviceNoLlm: SemanticDiffService;

    beforeEach(async () => {
      const moduleNoLlm = await Test.createTestingModule({
        providers: [
          SemanticDiffService,
          {
            provide: getRepositoryToken(Atom),
            useValue: mockAtomRepository,
          },
        ],
      }).compile();
      serviceNoLlm = moduleNoLlm.get<SemanticDiffService>(SemanticDiffService);
    });

    it('should generate basic assessment mentioning description change', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(atomA).mockResolvedValueOnce(atomB);

      const result = await serviceNoLlm.diff('uuid-a', 'uuid-b');

      expect(result.descriptionDiff.changeType).toBe('reframed');
      expect(result.overallAssessment).toContain('Description was modified.');
    });

    it('should generate basic assessment mentioning outcome changes', async () => {
      const a = makeAtom({ observableOutcomes: [] });
      const b = makeAtom({
        id: 'uuid-b',
        atomId: 'IA-002',
        observableOutcomes: [{ description: 'New outcome' }],
      });

      mockAtomRepository.findOne.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

      const result = await serviceNoLlm.diff('uuid-a', 'uuid-b');
      expect(result.overallAssessment).toContain('1 outcome(s) added.');
    });

    it('should generate basic assessment mentioning tag changes', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(atomA).mockResolvedValueOnce(atomB);

      const result = await serviceNoLlm.diff('uuid-a', 'uuid-b');
      expect(result.overallAssessment).toContain('Tags added: sso.');
      expect(result.overallAssessment).toContain('Tags removed: login.');
    });

    it('should generate basic assessment mentioning quality score changes', async () => {
      mockAtomRepository.findOne.mockResolvedValueOnce(atomA).mockResolvedValueOnce(atomB);

      const result = await serviceNoLlm.diff('uuid-a', 'uuid-b');
      expect(result.overallAssessment).toContain('Quality score changed from 85 to 90.');
    });

    it('should report no significant changes for identical atoms', async () => {
      const a = makeAtom();
      const b = makeAtom({ id: 'uuid-b', atomId: 'IA-002' });

      mockAtomRepository.findOne.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

      const result = await serviceNoLlm.diff('uuid-a', 'uuid-b');
      expect(result.overallAssessment).toBe('No significant changes detected.');
    });
  });

  describe('stringSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(service.stringSimilarity('hello world', 'hello world')).toBe(1.0);
    });

    it('should return 0 for completely different strings', () => {
      expect(service.stringSimilarity('aaa', 'bbb')).toBe(0);
    });

    it('should return a value between 0 and 1 for partially similar strings', () => {
      const sim = service.stringSimilarity('hello world foo', 'hello world bar');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    it('should handle empty strings', () => {
      // Both empty strings are equal
      expect(service.stringSimilarity('', '')).toBe(1.0);
    });
  });
});
