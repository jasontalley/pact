/**
 * Tests for QualityController
 *
 * The QualityController provides endpoints for test quality analysis:
 * - Analyze test quality
 * - Generate HTML reports
 * - Get quality trends
 * - Dashboard data
 * - Save snapshots
 * - Check quality gates
 * - Phase 14B: Text-based analysis (analyze-test, analyze-batch)
 * - Phase 14B: Quality Profile CRUD (profiles endpoints)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { QualityController } from './quality.controller';
import { TestQualityService, QualityAnalysisResult } from './test-quality.service';
import { DEFAULT_QUALITY_DIMENSIONS, QualityProfile } from './quality-profile.entity';

describe('QualityController', () => {
  let controller: QualityController;
  let qualityService: jest.Mocked<TestQualityService>;

  const mockQualityResult: QualityAnalysisResult = {
    timestamp: new Date(),
    commitHash: 'abc123',
    branchName: 'develop',
    summary: {
      totalFiles: 10,
      passedFiles: 8,
      failedFiles: 2,
      overallScore: 85,
      totalTests: 50,
      annotatedTests: 45,
      orphanTests: 5,
    },
    dimensionAverages: {
      intentFidelity: 80,
      noVacuousTests: 90,
      noBrittleTests: 85,
    },
    fileResults: [],
  };

  const mockTrends = [
    { date: new Date(), overallScore: 80, passedFiles: 7, totalFiles: 10 },
    { date: new Date(), overallScore: 85, passedFiles: 8, totalFiles: 10 },
  ];

  const mockTestQualityResult = {
    overallScore: 85,
    grade: 'B',
    passed: true,
    dimensions: {
      intentFidelity: { score: 1.0, passed: true, issues: [] },
      noVacuousTests: { score: 1.0, passed: true, issues: [] },
    },
    totalTests: 2,
    annotatedTests: 2,
    referencedAtoms: ['IA-001'],
  };

  const mockBatchResult = {
    results: [
      { ...mockTestQualityResult, testRecordId: 'rec-1' },
      { ...mockTestQualityResult, testRecordId: 'rec-2' },
    ],
    summary: {
      totalAnalyzed: 2,
      averageScore: 85,
      gradeDistribution: { A: 0, B: 2, C: 0, D: 0, F: 0 },
    },
  };

  const mockProfileResponse = {
    id: 'profile-1',
    name: 'Default Profile',
    description: 'System default',
    projectId: null,
    dimensions: DEFAULT_QUALITY_DIMENSIONS,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const mockProfileEntity = {
    id: 'profile-1',
    name: 'Default Profile',
    description: 'System default',
    projectId: null,
    dimensions: DEFAULT_QUALITY_DIMENSIONS,
    isDefault: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    project: null,
  } as QualityProfile;

  beforeEach(async () => {
    const mockQualityService = {
      analyzeQuality: jest.fn().mockResolvedValue(mockQualityResult),
      generateHtmlReport: jest.fn().mockReturnValue('<html>Report</html>'),
      getRecentTrends: jest.fn().mockResolvedValue(mockTrends),
      checkQualityGate: jest.fn().mockResolvedValue(undefined),
      analyzeTestSource: jest.fn().mockReturnValue(mockTestQualityResult),
      analyzeTestSourceBatch: jest.fn().mockReturnValue(mockBatchResult),
      listProfiles: jest.fn().mockResolvedValue([mockProfileResponse]),
      createProfile: jest.fn().mockResolvedValue(mockProfileEntity),
      getProfile: jest.fn().mockResolvedValue(mockProfileEntity),
      updateProfile: jest.fn().mockResolvedValue(mockProfileEntity),
      deleteProfile: jest.fn().mockResolvedValue(true),
      toProfileResponse: jest.fn().mockReturnValue(mockProfileResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QualityController],
      providers: [
        {
          provide: TestQualityService,
          useValue: mockQualityService,
        },
      ],
    }).compile();

    controller = module.get<QualityController>(QualityController);
    qualityService = module.get(TestQualityService);
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('analyzeQuality', () => {
    it('should analyze quality with default parameters', async () => {
      const result = await controller.analyzeQuality();

      expect(result).toEqual(mockQualityResult);
      expect(qualityService.analyzeQuality).toHaveBeenCalledWith({
        testDirectory: undefined,
        saveSnapshot: false,
      });
    });

    it('should analyze quality with custom directory', async () => {
      const result = await controller.analyzeQuality('src/custom');

      expect(result).toEqual(mockQualityResult);
      expect(qualityService.analyzeQuality).toHaveBeenCalledWith({
        testDirectory: 'src/custom',
        saveSnapshot: false,
      });
    });

    it('should save snapshot when requested', async () => {
      const result = await controller.analyzeQuality(undefined, 'true');

      expect(result).toEqual(mockQualityResult);
      expect(qualityService.analyzeQuality).toHaveBeenCalledWith({
        testDirectory: undefined,
        saveSnapshot: true,
      });
    });

    it('should not save snapshot when false', async () => {
      const result = await controller.analyzeQuality(undefined, 'false');

      expect(result).toEqual(mockQualityResult);
      expect(qualityService.analyzeQuality).toHaveBeenCalledWith({
        testDirectory: undefined,
        saveSnapshot: false,
      });
    });
  });

  describe('getHtmlReport', () => {
    it('should generate and return HTML report', async () => {
      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.getHtmlReport('src', mockResponse);

      expect(qualityService.analyzeQuality).toHaveBeenCalledWith({
        testDirectory: 'src',
      });
      expect(qualityService.generateHtmlReport).toHaveBeenCalledWith(mockQualityResult);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(mockResponse.send).toHaveBeenCalledWith('<html>Report</html>');
    });

    it('should handle undefined directory', async () => {
      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.getHtmlReport(undefined as any, mockResponse);

      expect(qualityService.analyzeQuality).toHaveBeenCalledWith({
        testDirectory: undefined,
      });
    });
  });

  describe('getTrends', () => {
    it('should get trends with default days', async () => {
      const result = await controller.getTrends();

      expect(result).toEqual(mockTrends);
      expect(qualityService.getRecentTrends).toHaveBeenCalledWith(7);
    });

    it('should get trends with custom days', async () => {
      const result = await controller.getTrends('30');

      expect(result).toEqual(mockTrends);
      expect(qualityService.getRecentTrends).toHaveBeenCalledWith(30);
    });

    it('should parse string to number for days', async () => {
      await controller.getTrends('14');

      expect(qualityService.getRecentTrends).toHaveBeenCalledWith(14);
    });
  });

  describe('getDashboard', () => {
    it('should return dashboard data with current and trends', async () => {
      const result = await controller.getDashboard();

      expect(result).toEqual({
        current: mockQualityResult,
        trends: mockTrends,
      });
      expect(qualityService.analyzeQuality).toHaveBeenCalled();
      expect(qualityService.getRecentTrends).toHaveBeenCalledWith(7);
    });

    it('should call both analyzeQuality and getRecentTrends', async () => {
      await controller.getDashboard();

      expect(qualityService.analyzeQuality).toHaveBeenCalledTimes(1);
      expect(qualityService.getRecentTrends).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveSnapshot', () => {
    it('should save snapshot and return success message', async () => {
      const result = await controller.saveSnapshot();

      expect(result).toEqual({
        message: 'Snapshot saved successfully',
        summary: mockQualityResult.summary,
        commitHash: mockQualityResult.commitHash,
      });
      expect(qualityService.analyzeQuality).toHaveBeenCalledWith({
        testDirectory: undefined,
        saveSnapshot: true,
      });
    });

    it('should save snapshot with custom directory', async () => {
      const result = await controller.saveSnapshot('custom/dir');

      expect(result).toEqual({
        message: 'Snapshot saved successfully',
        summary: mockQualityResult.summary,
        commitHash: mockQualityResult.commitHash,
      });
      expect(qualityService.analyzeQuality).toHaveBeenCalledWith({
        testDirectory: 'custom/dir',
        saveSnapshot: true,
      });
    });
  });

  describe('checkGate', () => {
    it('should return passed status when gate passes', async () => {
      const result = await controller.checkGate();

      expect(result).toEqual({
        status: 'passed',
        message: 'All quality checks passed',
      });
      expect(qualityService.checkQualityGate).toHaveBeenCalledWith({
        testDirectory: undefined,
      });
    });

    it('should check gate with custom directory', async () => {
      await controller.checkGate('src/modules');

      expect(qualityService.checkQualityGate).toHaveBeenCalledWith({
        testDirectory: 'src/modules',
      });
    });

    it('should propagate errors from quality gate check', async () => {
      const error = new Error('Quality gate failed');
      qualityService.checkQualityGate.mockRejectedValue(error);

      await expect(controller.checkGate()).rejects.toThrow('Quality gate failed');
    });
  });

  // ============================================================================
  // Phase 14B: Text-Based Analysis Endpoints
  // ============================================================================

  describe('analyzeTestSource (POST /quality/analyze-test)', () => {
    it('should analyze test source code and return quality result', async () => {
      const dto = {
        sourceCode: 'describe("Test", () => { it("works", () => { expect(1).toBe(1); }); });',
      };

      const result = await controller.analyzeTestSource(dto);

      // Should delegate to service with correct parameters
      expect(qualityService.analyzeTestSource).toHaveBeenCalledWith(dto.sourceCode, {
        filePath: undefined,
        profileId: undefined,
      });
      // Should return the service result
      expect(result).toEqual(mockTestQualityResult);
    });

    it('should pass filePath option to service', async () => {
      const dto = {
        sourceCode: 'describe("Test", () => { it("works", () => { expect(1).toBe(1); }); });',
        filePath: 'src/utils/helper.spec.ts',
      };

      await controller.analyzeTestSource(dto);

      // Should pass filePath through to the service
      expect(qualityService.analyzeTestSource).toHaveBeenCalledWith(dto.sourceCode, {
        filePath: 'src/utils/helper.spec.ts',
        profileId: undefined,
      });
    });

    it('should pass profileId option to service', async () => {
      const dto = {
        sourceCode: 'describe("Test", () => { it("works", () => { expect(1).toBe(1); }); });',
        profileId: 'profile-strict',
      };

      await controller.analyzeTestSource(dto);

      // Should pass profileId through to the service
      expect(qualityService.analyzeTestSource).toHaveBeenCalledWith(dto.sourceCode, {
        filePath: undefined,
        profileId: 'profile-strict',
      });
    });

    it('should pass both filePath and profileId', async () => {
      const dto = {
        sourceCode: 'const x = 1;',
        filePath: 'test/integration/api.e2e-spec.ts',
        profileId: 'profile-123',
      };

      await controller.analyzeTestSource(dto);

      // Both optional fields should be forwarded
      expect(qualityService.analyzeTestSource).toHaveBeenCalledWith(dto.sourceCode, {
        filePath: 'test/integration/api.e2e-spec.ts',
        profileId: 'profile-123',
      });
    });
  });

  describe('analyzeTestBatch (POST /quality/analyze-batch)', () => {
    it('should batch analyze multiple test sources', async () => {
      const dto = {
        tests: [
          { sourceCode: 'describe("A", () => { it("a", () => {}); });' },
          { sourceCode: 'describe("B", () => { it("b", () => {}); });' },
        ],
      };

      const result = await controller.analyzeTestBatch(dto);

      // Should delegate to service with tests array and options
      expect(qualityService.analyzeTestSourceBatch).toHaveBeenCalledWith(dto.tests, {
        profileId: undefined,
      });
      // Should return the batch result
      expect(result).toEqual(mockBatchResult);
    });

    it('should pass profileId to batch analysis', async () => {
      const dto = {
        tests: [{ sourceCode: 'describe("A", () => {});', testRecordId: 'rec-1' }],
        profileId: 'profile-strict',
      };

      await controller.analyzeTestBatch(dto);

      // Should forward profileId in options
      expect(qualityService.analyzeTestSourceBatch).toHaveBeenCalledWith(dto.tests, {
        profileId: 'profile-strict',
      });
    });

    it('should handle empty tests array', async () => {
      const emptyBatchResult = {
        results: [],
        summary: { totalAnalyzed: 0, averageScore: 0, gradeDistribution: {} },
      };
      qualityService.analyzeTestSourceBatch.mockReturnValue(emptyBatchResult);

      const dto = { tests: [] };
      const result = await controller.analyzeTestBatch(dto);

      // Should return empty batch result
      expect(result.results).toHaveLength(0);
      expect(result.summary.totalAnalyzed).toBe(0);
    });
  });

  // ============================================================================
  // Phase 14B: Quality Profile CRUD Endpoints
  // ============================================================================

  describe('listProfiles (GET /quality/profiles)', () => {
    it('should list all profiles without filtering', async () => {
      const result = await controller.listProfiles();

      // Should call service without projectId
      expect(qualityService.listProfiles).toHaveBeenCalledWith(undefined);
      // Should return profile array
      expect(result).toEqual([mockProfileResponse]);
    });

    it('should filter profiles by projectId', async () => {
      await controller.listProfiles('proj-abc');

      // Should pass projectId to service
      expect(qualityService.listProfiles).toHaveBeenCalledWith('proj-abc');
    });
  });

  describe('createProfile (POST /quality/profiles)', () => {
    it('should create a profile and return response DTO', async () => {
      const dto = {
        name: 'Strict',
        description: 'High thresholds',
        dimensions: DEFAULT_QUALITY_DIMENSIONS,
        isDefault: false,
      };

      const result = await controller.createProfile(dto);

      // Should delegate creation to service
      expect(qualityService.createProfile).toHaveBeenCalledWith(dto);
      // Should convert entity to response DTO
      expect(qualityService.toProfileResponse).toHaveBeenCalledWith(mockProfileEntity);
      // Should return the response DTO
      expect(result).toEqual(mockProfileResponse);
    });

    it('should create a default profile', async () => {
      const dto = {
        name: 'New Default',
        dimensions: DEFAULT_QUALITY_DIMENSIONS,
        isDefault: true,
      };

      await controller.createProfile(dto);

      // Should pass isDefault through to service
      expect(qualityService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({ isDefault: true }),
      );
    });

    it('should create a project-specific profile', async () => {
      const dto = {
        name: 'Project Specific',
        projectId: 'proj-xyz',
        dimensions: DEFAULT_QUALITY_DIMENSIONS,
      };

      await controller.createProfile(dto);

      // Should pass projectId through to service
      expect(qualityService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-xyz' }),
      );
    });
  });

  describe('getProfile (GET /quality/profiles/:id)', () => {
    it('should return a profile when found', async () => {
      const result = await controller.getProfile('profile-1');

      // Should call service with the correct ID
      expect(qualityService.getProfile).toHaveBeenCalledWith('profile-1');
      // Should convert to response DTO
      expect(qualityService.toProfileResponse).toHaveBeenCalledWith(mockProfileEntity);
      // Should return the response
      expect(result).toEqual(mockProfileResponse);
    });

    it('should throw NotFoundException when profile not found', async () => {
      qualityService.getProfile.mockResolvedValue(null);

      // Should throw NotFoundException
      await expect(controller.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should include profile ID in the not found error message', async () => {
      qualityService.getProfile.mockResolvedValue(null);

      // Error message should reference the ID
      await expect(controller.getProfile('missing-id')).rejects.toThrow(
        'Quality profile missing-id not found',
      );
    });
  });

  describe('updateProfile (PATCH /quality/profiles/:id)', () => {
    it('should update a profile and return response DTO', async () => {
      const dto = { name: 'Updated Name' };

      const result = await controller.updateProfile('profile-1', dto);

      // Should call service with ID and update data
      expect(qualityService.updateProfile).toHaveBeenCalledWith('profile-1', dto);
      // Should convert to response DTO
      expect(qualityService.toProfileResponse).toHaveBeenCalledWith(mockProfileEntity);
      // Should return the response
      expect(result).toEqual(mockProfileResponse);
    });

    it('should throw NotFoundException when profile to update not found', async () => {
      qualityService.updateProfile.mockResolvedValue(null);

      await expect(controller.updateProfile('nonexistent', { name: 'Fail' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include profile ID in the update not found error', async () => {
      qualityService.updateProfile.mockResolvedValue(null);

      await expect(controller.updateProfile('bad-id', { name: 'Fail' })).rejects.toThrow(
        'Quality profile bad-id not found',
      );
    });

    it('should update description', async () => {
      const dto = { description: 'New description' };

      await controller.updateProfile('profile-1', dto);

      // Should pass description update to service
      expect(qualityService.updateProfile).toHaveBeenCalledWith('profile-1', {
        description: 'New description',
      });
    });

    it('should update dimensions', async () => {
      const dto = {
        dimensions: [
          { key: 'intentFidelity', name: 'Intent', weight: 0.5, threshold: 0.9, enabled: true },
        ],
      };

      await controller.updateProfile('profile-1', dto);

      // Should pass dimensions update to service
      expect(qualityService.updateProfile).toHaveBeenCalledWith('profile-1', dto);
    });

    it('should update isDefault flag', async () => {
      const dto = { isDefault: true };

      await controller.updateProfile('profile-1', dto);

      // Should pass isDefault update to service
      expect(qualityService.updateProfile).toHaveBeenCalledWith('profile-1', {
        isDefault: true,
      });
    });
  });

  describe('deleteProfile (DELETE /quality/profiles/:id)', () => {
    it('should delete a profile and return success message', async () => {
      const result = await controller.deleteProfile('profile-1');

      // Should call service with the correct ID
      expect(qualityService.deleteProfile).toHaveBeenCalledWith('profile-1');
      // Should return success message
      expect(result).toEqual({ message: 'Profile deleted' });
    });

    it('should throw NotFoundException when profile to delete not found', async () => {
      qualityService.deleteProfile.mockResolvedValue(false);

      await expect(controller.deleteProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should include profile ID in the delete not found error', async () => {
      qualityService.deleteProfile.mockResolvedValue(false);

      await expect(controller.deleteProfile('gone-id')).rejects.toThrow(
        'Quality profile gone-id not found',
      );
    });
  });
});
