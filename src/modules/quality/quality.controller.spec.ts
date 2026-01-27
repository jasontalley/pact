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
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { QualityController } from './quality.controller';
import { TestQualityService, QualityAnalysisResult } from './test-quality.service';

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

  beforeEach(async () => {
    const mockQualityService = {
      analyzeQuality: jest.fn().mockResolvedValue(mockQualityResult),
      generateHtmlReport: jest.fn().mockReturnValue('<html>Report</html>'),
      getRecentTrends: jest.fn().mockResolvedValue(mockTrends),
      checkQualityGate: jest.fn().mockResolvedValue(undefined),
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
});
