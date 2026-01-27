import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BrownfieldAnalysisService } from './brownfield-analysis.service';
import { TestAtomCouplingService } from './test-atom-coupling.service';
import { ContextBuilderService } from './context-builder.service';
import { AtomQualityService } from '../validators/atom-quality.service';
import { LLMService } from '../../common/llm/llm.service';
import { Atom } from '../atoms/atom.entity';
import { AgentAction } from './agent-action.entity';
import { BrownfieldAnalysisDto } from './dto/brownfield-analysis.dto';

// Mock fs module
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
}));

import * as fs from 'fs';
const mockFs = fs as jest.Mocked<typeof fs>;

describe('BrownfieldAnalysisService', () => {
  let service: BrownfieldAnalysisService;
  let atomRepository: Repository<Atom>;
  let agentActionRepository: Repository<AgentAction>;
  let testAtomCouplingService: TestAtomCouplingService;
  let llmService: LLMService;
  let atomQualityService: AtomQualityService;
  let contextBuilderService: ContextBuilderService;

  const mockAtomRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAgentActionRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockTestAtomCouplingService = {
    analyzeCoupling: jest.fn(),
  };

  const mockLLMService = {
    invoke: jest.fn(),
  };

  const mockAtomQualityService = {
    validateAtom: jest.fn(),
  };

  const mockContextBuilderService = {
    buildPromptContext: jest.fn(),
    analyzeTest: jest.fn().mockResolvedValue({
      testName: 'should create user',
      filePath: '/test/repo/test.spec.ts',
      lineNumber: 10,
      testCode: 'it("should create user", () => { expect(true).toBe(true); })',
      isolatedTestCode: 'expect(true).toBe(true);',
      fileImports: [],
      describeBlocks: ['User creation'],
      containingDescribe: 'User creation',
      testType: 'unit',
    }),
    buildFocusedContext: jest.fn().mockReturnValue({
      testSummary: 'Unit test for user creation',
      behavioralClues: ['Creates a user', 'Validates data'],
      relatedFunctionality: [],
      testType: 'unit',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrownfieldAnalysisService,
        {
          provide: getRepositoryToken(Atom),
          useValue: mockAtomRepository,
        },
        {
          provide: getRepositoryToken(AgentAction),
          useValue: mockAgentActionRepository,
        },
        {
          provide: TestAtomCouplingService,
          useValue: mockTestAtomCouplingService,
        },
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
        {
          provide: AtomQualityService,
          useValue: mockAtomQualityService,
        },
        {
          provide: ContextBuilderService,
          useValue: mockContextBuilderService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BrownfieldAnalysisService>(BrownfieldAnalysisService);
    atomRepository = module.get<Repository<Atom>>(getRepositoryToken(Atom));
    agentActionRepository = module.get<Repository<AgentAction>>(getRepositoryToken(AgentAction));
    testAtomCouplingService = module.get<TestAtomCouplingService>(TestAtomCouplingService);
    llmService = module.get<LLMService>(LLMService);
    atomQualityService = module.get<AtomQualityService>(AtomQualityService);
    contextBuilderService = module.get<ContextBuilderService>(ContextBuilderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset fs mocks to default (returning empty/false)
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.readFileSync.mockReturnValue('');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(atomRepository).toBeDefined();
    expect(agentActionRepository).toBeDefined();
    expect(testAtomCouplingService).toBeDefined();
    expect(llmService).toBeDefined();
    expect(atomQualityService).toBeDefined();
    expect(contextBuilderService).toBeDefined();
  });

  describe('analyzeRepository', () => {
    it('should discover orphan tests and infer atoms', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: false,
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 5,
          totalTests: 10,
          annotatedTests: 3,
          orphanTestCount: 7,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 30,
        },
        orphanTests: [
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'should create user',
            lineNumber: 10,
          },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          description: 'User can be created with valid data',
          category: 'functional',
          confidence: 0.85,
          reasoning: 'Test verifies user creation',
          observableOutcomes: ['User record exists in database'],
          relatedDocs: [],
        }),
        requestId: 'test-request-id',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 500,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      const result = await service.analyzeRepository(dto);

      expect(result.success).toBe(true);
      expect(result.totalOrphanTests).toBe(1);
      expect(result.inferredAtomsCount).toBeGreaterThan(0);
      expect(mockTestAtomCouplingService.analyzeCoupling).toHaveBeenCalled();
      expect(mockLLMService.invoke).toHaveBeenCalled();
    });

    it('should create atoms when autoCreateAtoms is true', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: true,
        createdBy: 'test-user',
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 1,
          totalTests: 1,
          annotatedTests: 0,
          orphanTestCount: 1,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: [
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'should create user',
            lineNumber: 10,
          },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          description: 'User can be created with valid data',
          category: 'functional',
          confidence: 0.85,
          reasoning: 'Test verifies user creation',
          observableOutcomes: ['User record exists in database'],
          relatedDocs: [],
        }),
        requestId: 'test-request-id',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 500,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomQualityService.validateAtom.mockResolvedValue({
        totalScore: 85,
        decision: 'approve',
        overallFeedback: 'High quality atom',
        actionableImprovements: [],
      });
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-001',
        description: 'User can be created with valid data',
        category: 'functional',
        status: 'draft',
      });
      mockAtomRepository.save.mockResolvedValue({
        id: 'uuid-123',
        atomId: 'IA-001',
        description: 'User can be created with valid data',
        category: 'functional',
        status: 'draft',
      });

      const result = await service.analyzeRepository(dto);

      expect(result.success).toBe(true);
      expect(result.createdAtomsCount).toBe(1);
      expect(mockAtomRepository.create).toHaveBeenCalled();
      expect(mockAtomRepository.save).toHaveBeenCalled();
    });

    it('should store recommendations as drafts when autoCreateAtoms is false', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: false,
        createdBy: 'test-user',
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 1,
          totalTests: 1,
          annotatedTests: 0,
          orphanTestCount: 1,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: [
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'should validate email',
            lineNumber: 20,
          },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          description: 'Email must be validated before submission',
          category: 'functional',
          confidence: 0.75,
          reasoning: 'Test validates email format',
          observableOutcomes: ['Invalid email is rejected'],
          relatedDocs: [],
        }),
        requestId: 'test-request-id',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 500,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomQualityService.validateAtom.mockResolvedValue({
        totalScore: 80,
        decision: 'approve',
        overallFeedback: 'Good quality atom',
        actionableImprovements: [],
      });
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-001',
        description: 'Email must be validated before submission',
        category: 'functional',
        status: 'draft',
        metadata: { pendingReview: true },
      });
      mockAtomRepository.save.mockResolvedValue({
        id: 'uuid-456',
        atomId: 'IA-001',
        description: 'Email must be validated before submission',
        category: 'functional',
        status: 'draft',
        metadata: { pendingReview: true },
      });

      const result = await service.analyzeRepository(dto);

      expect(result.success).toBe(true);
      expect(result.inferredAtomsCount).toBe(1);
      // Even with autoCreateAtoms=false, atoms are stored as drafts with pendingReview flag
      expect(result.createdAtomsCount).toBe(1);
      expect(mockAtomRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            pendingReview: true,
          }),
        }),
      );
    });

    it('should skip low confidence inferences when creating atoms', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: true,
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 1,
          totalTests: 1,
          annotatedTests: 0,
          orphanTestCount: 1,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: [
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'vague test',
            lineNumber: 5,
          },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      // Return low confidence inference
      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          description: 'Unclear behavior',
          category: 'functional',
          confidence: 0.4, // Below 0.6 threshold
          reasoning: 'Test is too vague',
          observableOutcomes: [],
          relatedDocs: [],
        }),
        requestId: 'test-request-id',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 500,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      const result = await service.analyzeRepository(dto);

      expect(result.success).toBe(true);
      expect(result.inferredAtomsCount).toBe(1);
      expect(result.createdAtomsCount).toBe(0); // Skipped due to low confidence
      expect(mockAtomRepository.create).not.toHaveBeenCalled();
    });

    it('should deduplicate orphan tests before processing', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: false,
      };

      // Return duplicate tests
      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 1,
          totalTests: 3,
          annotatedTests: 0,
          orphanTestCount: 3,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: [
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'should work',
            lineNumber: 10,
          },
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'should work',
            lineNumber: 10, // Duplicate
          },
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'different test',
            lineNumber: 20,
          },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          description: 'Test behavior',
          category: 'functional',
          confidence: 0.8,
          reasoning: 'Test explanation',
          observableOutcomes: ['Outcome'],
          relatedDocs: [],
        }),
        requestId: 'test-request-id',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 500,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomQualityService.validateAtom.mockResolvedValue({
        totalScore: 80,
        decision: 'approve',
        overallFeedback: 'Good',
        actionableImprovements: [],
      });
      mockAtomRepository.create.mockImplementation((data) => data);
      mockAtomRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'uuid', ...data }),
      );

      const result = await service.analyzeRepository(dto);

      // Should only process 2 unique tests (deduplicates the duplicate)
      expect(result.totalOrphanTests).toBe(3);
      expect(mockLLMService.invoke).toHaveBeenCalledTimes(2);
    });

    it('should analyze documentation when analyzeDocumentation is true', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: true,
        autoCreateAtoms: false,
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 1,
          totalTests: 1,
          annotatedTests: 0,
          orphanTestCount: 1,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: [
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'should work',
            lineNumber: 10,
          },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      // Mock file system for documentation discovery - return only files, no directories to avoid recursion
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'README.md', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue('# Documentation\nThis is a test project.');

      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          description: 'Test behavior',
          category: 'functional',
          confidence: 0.8,
          reasoning: 'Test explanation with doc context',
          observableOutcomes: ['Outcome'],
          relatedDocs: ['Documentation reference'],
        }),
        requestId: 'test-request-id',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 500,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomQualityService.validateAtom.mockResolvedValue({
        totalScore: 80,
        decision: 'approve',
        overallFeedback: 'Good',
        actionableImprovements: [],
      });
      mockAtomRepository.create.mockImplementation((data) => data);
      mockAtomRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'uuid', ...data }),
      );

      const result = await service.analyzeRepository(dto);

      expect(result.success).toBe(true);
      expect(result.metadata.documentationFilesAnalyzed).toBeGreaterThanOrEqual(0);
    });

    it('should handle LLM returning invalid JSON', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: false,
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 1,
          totalTests: 1,
          annotatedTests: 0,
          orphanTestCount: 1,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: [
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'should work',
            lineNumber: 10,
          },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      // Return invalid response (no JSON)
      mockLLMService.invoke.mockResolvedValue({
        content: 'This is not valid JSON at all',
        requestId: 'test-request-id',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 500,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      const result = await service.analyzeRepository(dto);

      expect(result.success).toBe(true);
      expect(result.inferredAtomsCount).toBe(0);
      expect(result.unanalyzedTests.length).toBe(1);
    });

    it('should handle LLM errors gracefully', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: false,
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 1,
          totalTests: 1,
          annotatedTests: 0,
          orphanTestCount: 1,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: [
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'should work',
            lineNumber: 10,
          },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      // LLM throws error
      mockLLMService.invoke.mockRejectedValue(new Error('LLM service unavailable'));

      const result = await service.analyzeRepository(dto);

      expect(result.success).toBe(true);
      expect(result.inferredAtomsCount).toBe(0);
      expect(result.unanalyzedTests.length).toBe(1);
    });

    it('should respect maxTests limit', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: false,
        maxTests: 2,
      };

      // Return 5 orphan tests
      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 1,
          totalTests: 5,
          annotatedTests: 0,
          orphanTestCount: 5,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: [
          { filePath: '/test/repo/test.spec.ts', testName: 'test1', lineNumber: 10 },
          { filePath: '/test/repo/test.spec.ts', testName: 'test2', lineNumber: 20 },
          { filePath: '/test/repo/test.spec.ts', testName: 'test3', lineNumber: 30 },
          { filePath: '/test/repo/test.spec.ts', testName: 'test4', lineNumber: 40 },
          { filePath: '/test/repo/test.spec.ts', testName: 'test5', lineNumber: 50 },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          description: 'Test behavior',
          category: 'functional',
          confidence: 0.8,
          reasoning: 'Test explanation',
          observableOutcomes: ['Outcome'],
          relatedDocs: [],
        }),
        requestId: 'test-request-id',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 500,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomQualityService.validateAtom.mockResolvedValue({
        totalScore: 80,
        decision: 'approve',
        overallFeedback: 'Good',
        actionableImprovements: [],
      });
      mockAtomRepository.create.mockImplementation((data) => data);
      mockAtomRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'uuid', ...data }),
      );

      const result = await service.analyzeRepository(dto);

      // Should only process 2 tests due to maxTests limit
      expect(mockLLMService.invoke).toHaveBeenCalledTimes(2);
      expect(result.inferredAtomsCount).toBe(2);
    });

    it('should use default rootDirectory when not provided', async () => {
      const dto: BrownfieldAnalysisDto = {
        analyzeDocumentation: false,
        autoCreateAtoms: false,
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 0,
          totalTests: 0,
          annotatedTests: 0,
          orphanTestCount: 0,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 100,
        },
        orphanTests: [],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: true,
      });

      const result = await service.analyzeRepository(dto);

      expect(result.success).toBe(true);
      expect(result.metadata.rootDirectory).toBe(process.cwd());
    });

    it('should log agent action after analysis', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: false,
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 0,
          totalTests: 0,
          annotatedTests: 0,
          orphanTestCount: 0,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 100,
        },
        orphanTests: [],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: true,
      });

      mockAgentActionRepository.create.mockReturnValue({});
      mockAgentActionRepository.save.mockResolvedValue({});

      await service.analyzeRepository(dto);

      expect(mockAgentActionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'brownfield-analysis-agent',
          actionType: 'brownfield-analysis',
        }),
      );
      expect(mockAgentActionRepository.save).toHaveBeenCalled();
    });

    it('should handle atom creation failure gracefully', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: true,
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 1,
          totalTests: 1,
          annotatedTests: 0,
          orphanTestCount: 1,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: [
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'should work',
            lineNumber: 10,
          },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          description: 'Test behavior',
          category: 'functional',
          confidence: 0.8,
          reasoning: 'Test explanation',
          observableOutcomes: ['Outcome'],
          relatedDocs: [],
        }),
        requestId: 'test-request-id',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 500,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomQualityService.validateAtom.mockResolvedValue({
        totalScore: 80,
        decision: 'approve',
        overallFeedback: 'Good',
        actionableImprovements: [],
      });
      mockAtomRepository.create.mockReturnValue({});
      mockAtomRepository.save.mockRejectedValue(new Error('Database error'));

      const result = await service.analyzeRepository(dto);

      expect(result.success).toBe(true);
      expect(result.createdAtomsCount).toBe(0); // Failed to create
    });

    it('should increment atom ID based on existing atoms', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: false,
        autoCreateAtoms: true,
      };

      mockTestAtomCouplingService.analyzeCoupling.mockResolvedValue({
        summary: {
          totalTestFiles: 1,
          totalTests: 1,
          annotatedTests: 0,
          orphanTestCount: 1,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: [
          {
            filePath: '/test/repo/test.spec.ts',
            testName: 'should work',
            lineNumber: 10,
          },
        ],
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      });

      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          description: 'Test behavior',
          category: 'functional',
          confidence: 0.8,
          reasoning: 'Test explanation',
          observableOutcomes: ['Outcome'],
          relatedDocs: [],
        }),
        requestId: 'test-request-id',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        latencyMs: 500,
        cacheHit: false,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      });

      // Existing atom with ID IA-005
      mockAtomRepository.findOne.mockResolvedValue({ atomId: 'IA-005' });
      mockAtomQualityService.validateAtom.mockResolvedValue({
        totalScore: 80,
        decision: 'approve',
        overallFeedback: 'Good',
        actionableImprovements: [],
      });
      mockAtomRepository.create.mockImplementation((data) => data);
      mockAtomRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'uuid', ...data }),
      );

      await service.analyzeRepository(dto);

      // Should create IA-006 (next ID after IA-005)
      expect(mockAtomRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          atomId: 'IA-006',
        }),
      );
    });
  });

  describe('storeRecommendationsAsDrafts', () => {
    it('should store inferred atoms with pendingReview flag', async () => {
      const inferredAtoms = [
        {
          description: 'User can log in',
          category: 'functional' as const,
          confidence: 0.8,
          reasoning: 'Test verifies login',
          sourceTest: {
            filePath: '/test.spec.ts',
            testName: 'should log in',
            lineNumber: 10,
            testCode: 'it("should log in", () => {})',
          },
          observableOutcomes: ['User sees dashboard'],
          relatedDocs: [],
        },
      ];

      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomQualityService.validateAtom.mockResolvedValue({
        totalScore: 85,
        decision: 'approve',
        overallFeedback: 'Good',
        actionableImprovements: [],
      });
      mockAtomRepository.create.mockImplementation((data) => data);
      mockAtomRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'uuid', ...data }),
      );

      const count = await service.storeRecommendationsAsDrafts(inferredAtoms, 'test-user');

      expect(count).toBe(1);
      expect(mockAtomRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'draft',
          createdBy: 'test-user',
          metadata: expect.objectContaining({
            pendingReview: true,
            source: 'brownfield-analysis-agent',
          }),
        }),
      );
    });

    it('should skip atoms with confidence below threshold', async () => {
      const inferredAtoms = [
        {
          description: 'Vague behavior',
          category: 'functional' as const,
          confidence: 0.5, // Below 0.6 threshold
          reasoning: 'Test is vague',
          sourceTest: {
            filePath: '/test.spec.ts',
            testName: 'vague test',
            lineNumber: 10,
            testCode: 'it("vague test", () => {})',
          },
          observableOutcomes: [],
          relatedDocs: [],
        },
      ];

      const count = await service.storeRecommendationsAsDrafts(inferredAtoms);

      expect(count).toBe(0);
      expect(mockAtomRepository.create).not.toHaveBeenCalled();
    });
  });
});
