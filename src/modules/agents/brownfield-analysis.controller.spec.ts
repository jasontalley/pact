/**
 * Tests for BrownfieldAnalysisController
 *
 * @atom IA-PHASE2-001 Brownfield analysis endpoint works correctly
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BrownfieldAnalysisController } from './brownfield-analysis.controller';
import { BrownfieldAnalysisService } from './brownfield-analysis.service';
import { BrownfieldAnalysisDto, BrownfieldAnalysisResult } from './dto/brownfield-analysis.dto';

describe('BrownfieldAnalysisController', () => {
  let controller: BrownfieldAnalysisController;
  let service: jest.Mocked<BrownfieldAnalysisService>;

  const mockAnalysisResult: BrownfieldAnalysisResult = {
    success: true,
    totalOrphanTests: 5,
    inferredAtomsCount: 3,
    createdAtomsCount: 3,
    inferredAtoms: [
      {
        description: 'User can log in with valid credentials',
        category: 'functional',
        confidence: 0.85,
        reasoning: 'Test verifies login flow',
        sourceTest: {
          filePath: '/src/auth/auth.spec.ts',
          testName: 'should log in user',
          lineNumber: 25,
          testCode: 'it("should log in user", () => {})',
        },
        observableOutcomes: ['User session is created'],
        relatedDocs: [],
      },
    ],
    unanalyzedTests: [
      {
        filePath: '/src/utils/utils.spec.ts',
        testName: 'vague test',
        lineNumber: 10,
        testCode: 'it("vague test", () => {})',
      },
    ],
    summary: 'Analyzed 5 test files, found 5 orphan tests, inferred 3 atoms',
    metadata: {
      rootDirectory: '/test/repo',
      testFilesAnalyzed: 5,
      documentationFilesAnalyzed: 2,
      analysisDurationMs: 1500,
    },
  };

  beforeEach(async () => {
    const mockService = {
      analyzeRepository: jest.fn().mockResolvedValue(mockAnalysisResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrownfieldAnalysisController],
      providers: [
        {
          provide: BrownfieldAnalysisService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<BrownfieldAnalysisController>(BrownfieldAnalysisController);
    service = module.get(BrownfieldAnalysisService);
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('analyze', () => {
    it('should call analyzeRepository with the provided DTO', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/test/repo',
        analyzeDocumentation: true,
        autoCreateAtoms: false,
      };

      const result = await controller.analyze(dto);

      expect(service.analyzeRepository).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAnalysisResult);
    });

    it('should return analysis result with inferred atoms', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/project',
        analyzeDocumentation: false,
        autoCreateAtoms: true,
        createdBy: 'test-user',
      };

      const result = await controller.analyze(dto);

      expect(result.success).toBe(true);
      expect(result.inferredAtomsCount).toBe(3);
      expect(result.inferredAtoms).toHaveLength(1);
      expect(result.metadata.rootDirectory).toBe('/test/repo');
    });

    it('should handle analysis with maxTests parameter', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/large-repo',
        analyzeDocumentation: true,
        autoCreateAtoms: false,
        maxTests: 50,
      };

      const result = await controller.analyze(dto);

      expect(service.analyzeRepository).toHaveBeenCalledWith(dto);
      expect(result).toBeDefined();
    });

    it('should propagate errors from service', async () => {
      const dto: BrownfieldAnalysisDto = {
        rootDirectory: '/invalid/path',
        analyzeDocumentation: false,
        autoCreateAtoms: false,
      };

      service.analyzeRepository.mockRejectedValue(new Error('Directory not found'));

      await expect(controller.analyze(dto)).rejects.toThrow('Directory not found');
    });
  });
});
