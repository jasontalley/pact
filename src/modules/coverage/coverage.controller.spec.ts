/**
 * Tests for CoverageController
 *
 * The CoverageController provides endpoints for coverage data ingestion and retrieval:
 * - POST /coverage/upload    - Upload raw coverage report (auto-detect format)
 * - POST /coverage/json      - Submit pre-parsed Istanbul JSON
 * - GET  /coverage/latest    - Get latest coverage report (optional projectId)
 * - GET  /coverage/:id       - Get specific report by ID
 * - GET  /coverage/history   - Paginated history (projectId, limit, offset)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CoverageController } from './coverage.controller';
import { CoverageIngestionService } from './coverage-ingestion.service';
import {
  CoverageReportResponse,
  UploadCoverageDto,
  SubmitCoverageJsonDto,
} from './dto/coverage.dto';
import { CoverageReport, CoverageSummary } from './coverage-report.entity';

describe('CoverageController', () => {
  let controller: CoverageController;
  let coverageService: jest.Mocked<CoverageIngestionService>;

  const mockSummary: CoverageSummary = {
    statements: { total: 100, covered: 85, pct: 85 },
    branches: { total: 50, covered: 40, pct: 80 },
    functions: { total: 30, covered: 27, pct: 90 },
    lines: { total: 120, covered: 102, pct: 85 },
  };

  const mockCoverageReport: CoverageReport = {
    id: 'report-uuid-1',
    projectId: 'project-uuid-1',
    reconciliationRunId: null,
    format: 'istanbul',
    commitHash: 'abc123def456',
    branchName: 'develop',
    summary: mockSummary,
    fileDetails: [
      {
        filePath: 'src/modules/atoms/atoms.service.ts',
        statements: { total: 20, covered: 18, pct: 90 },
        branches: { total: 10, covered: 8, pct: 80 },
        functions: { total: 5, covered: 5, pct: 100 },
        lines: { total: 25, covered: 22, pct: 88 },
        uncoveredLines: [15, 42, 67],
      },
    ],
    metadata: { ci: true, runner: 'jest' },
    createdAt: new Date('2026-02-01T12:00:00Z'),
    project: null,
    reconciliationRun: null,
  } as CoverageReport;

  const mockReportResponse: CoverageReportResponse = {
    id: 'report-uuid-1',
    projectId: 'project-uuid-1',
    reconciliationRunId: null,
    format: 'istanbul',
    commitHash: 'abc123def456',
    branchName: 'develop',
    summary: mockSummary,
    fileDetails: [
      {
        filePath: 'src/modules/atoms/atoms.service.ts',
        statements: { total: 20, covered: 18, pct: 90 },
        branches: { total: 10, covered: 8, pct: 80 },
        functions: { total: 5, covered: 5, pct: 100 },
        lines: { total: 25, covered: 22, pct: 88 },
        uncoveredLines: [15, 42, 67],
      },
    ],
    metadata: { ci: true, runner: 'jest' },
    createdAt: '2026-02-01T12:00:00.000Z',
  };

  const mockCoverageReport2: CoverageReport = {
    id: 'report-uuid-2',
    projectId: 'project-uuid-1',
    reconciliationRunId: 'run-uuid-1',
    format: 'lcov',
    commitHash: '789abc',
    branchName: 'feature/test',
    summary: {
      statements: { total: 200, covered: 150, pct: 75 },
      branches: { total: 80, covered: 60, pct: 75 },
      functions: { total: 60, covered: 48, pct: 80 },
      lines: { total: 250, covered: 188, pct: 75.2 },
    },
    fileDetails: [],
    metadata: null,
    createdAt: new Date('2026-02-02T14:00:00Z'),
    project: null,
    reconciliationRun: null,
  } as CoverageReport;

  const mockReportResponse2: CoverageReportResponse = {
    id: 'report-uuid-2',
    projectId: 'project-uuid-1',
    reconciliationRunId: 'run-uuid-1',
    format: 'lcov',
    commitHash: '789abc',
    branchName: 'feature/test',
    summary: {
      statements: { total: 200, covered: 150, pct: 75 },
      branches: { total: 80, covered: 60, pct: 75 },
      functions: { total: 60, covered: 48, pct: 80 },
      lines: { total: 250, covered: 188, pct: 75.2 },
    },
    fileDetails: [],
    metadata: null,
    createdAt: '2026-02-02T14:00:00.000Z',
  };

  beforeEach(async () => {
    const mockCoverageService = {
      uploadCoverage: jest.fn().mockResolvedValue(mockCoverageReport),
      submitCoverageJson: jest.fn().mockResolvedValue(mockCoverageReport),
      getLatest: jest.fn().mockResolvedValue(mockCoverageReport),
      getById: jest.fn().mockResolvedValue(mockCoverageReport),
      getHistory: jest.fn().mockResolvedValue({
        reports: [mockCoverageReport, mockCoverageReport2],
        total: 2,
      }),
      toResponse: jest.fn().mockReturnValue(mockReportResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoverageController],
      providers: [
        {
          provide: CoverageIngestionService,
          useValue: mockCoverageService,
        },
      ],
    }).compile();

    controller = module.get<CoverageController>(CoverageController);
    coverageService = module.get(CoverageIngestionService);
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('POST /coverage/upload - uploadCoverage', () => {
    const uploadDto: UploadCoverageDto = {
      content: 'TN:\nSF:src/index.ts\nDA:1,1\nDA:2,0\nend_of_record\n',
      projectId: 'project-uuid-1',
      commitHash: 'abc123def456',
      branchName: 'develop',
    };

    it('should delegate to coverageService.uploadCoverage with the DTO', async () => {
      await controller.uploadCoverage(uploadDto);

      expect(coverageService.uploadCoverage).toHaveBeenCalledWith(uploadDto);
      expect(coverageService.uploadCoverage).toHaveBeenCalledTimes(1);
    });

    it('should call toResponse with the report returned by uploadCoverage', async () => {
      await controller.uploadCoverage(uploadDto);

      expect(coverageService.toResponse).toHaveBeenCalledWith(mockCoverageReport);
    });

    it('should return the transformed CoverageReportResponse', async () => {
      const result = await controller.uploadCoverage(uploadDto);

      expect(result).toEqual(mockReportResponse);
    });

    it('should handle upload with explicit format', async () => {
      const dtoWithFormat: UploadCoverageDto = {
        ...uploadDto,
        format: 'lcov',
      };

      await controller.uploadCoverage(dtoWithFormat);

      expect(coverageService.uploadCoverage).toHaveBeenCalledWith(dtoWithFormat);
    });

    it('should handle upload with metadata', async () => {
      const dtoWithMetadata: UploadCoverageDto = {
        ...uploadDto,
        metadata: { pipeline: 'ci', build: 42 },
      };

      await controller.uploadCoverage(dtoWithMetadata);

      expect(coverageService.uploadCoverage).toHaveBeenCalledWith(dtoWithMetadata);
    });

    it('should handle upload with reconciliationRunId', async () => {
      const dtoWithRun: UploadCoverageDto = {
        ...uploadDto,
        reconciliationRunId: 'run-uuid-1',
      };

      await controller.uploadCoverage(dtoWithRun);

      expect(coverageService.uploadCoverage).toHaveBeenCalledWith(dtoWithRun);
    });

    it('should propagate errors from the service', async () => {
      const error = new Error('Parse error: unsupported format');
      coverageService.uploadCoverage.mockRejectedValue(error);

      await expect(controller.uploadCoverage(uploadDto)).rejects.toThrow(
        'Parse error: unsupported format',
      );
    });
  });

  describe('POST /coverage/json - submitCoverageJson', () => {
    const submitDto: SubmitCoverageJsonDto = {
      summary: mockSummary,
      fileDetails: mockCoverageReport.fileDetails,
      projectId: 'project-uuid-1',
      commitHash: 'abc123def456',
      branchName: 'develop',
    };

    it('should delegate to coverageService.submitCoverageJson with the DTO', async () => {
      await controller.submitCoverageJson(submitDto);

      expect(coverageService.submitCoverageJson).toHaveBeenCalledWith(submitDto);
      expect(coverageService.submitCoverageJson).toHaveBeenCalledTimes(1);
    });

    it('should call toResponse with the report returned by submitCoverageJson', async () => {
      await controller.submitCoverageJson(submitDto);

      expect(coverageService.toResponse).toHaveBeenCalledWith(mockCoverageReport);
    });

    it('should return the transformed CoverageReportResponse', async () => {
      const result = await controller.submitCoverageJson(submitDto);

      expect(result).toEqual(mockReportResponse);
    });

    it('should handle submission without fileDetails', async () => {
      const minimalDto: SubmitCoverageJsonDto = {
        summary: mockSummary,
      };

      await controller.submitCoverageJson(minimalDto);

      expect(coverageService.submitCoverageJson).toHaveBeenCalledWith(minimalDto);
    });

    it('should handle submission with metadata', async () => {
      const dtoWithMetadata: SubmitCoverageJsonDto = {
        ...submitDto,
        metadata: { source: 'programmatic' },
      };

      await controller.submitCoverageJson(dtoWithMetadata);

      expect(coverageService.submitCoverageJson).toHaveBeenCalledWith(dtoWithMetadata);
    });

    it('should propagate errors from the service', async () => {
      const error = new Error('Database write failed');
      coverageService.submitCoverageJson.mockRejectedValue(error);

      await expect(controller.submitCoverageJson(submitDto)).rejects.toThrow(
        'Database write failed',
      );
    });
  });

  describe('GET /coverage/latest - getLatest', () => {
    it('should delegate to coverageService.getLatest without projectId', async () => {
      await controller.getLatest();

      expect(coverageService.getLatest).toHaveBeenCalledWith(undefined);
    });

    it('should delegate to coverageService.getLatest with projectId', async () => {
      await controller.getLatest('project-uuid-1');

      expect(coverageService.getLatest).toHaveBeenCalledWith('project-uuid-1');
    });

    it('should call toResponse with the report returned by getLatest', async () => {
      await controller.getLatest();

      expect(coverageService.toResponse).toHaveBeenCalledWith(mockCoverageReport);
    });

    it('should return the transformed CoverageReportResponse', async () => {
      const result = await controller.getLatest();

      expect(result).toEqual(mockReportResponse);
    });

    it('should throw NotFoundException when no reports exist', async () => {
      coverageService.getLatest.mockResolvedValue(null);

      await expect(controller.getLatest()).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with descriptive message', async () => {
      coverageService.getLatest.mockResolvedValue(null);

      await expect(controller.getLatest()).rejects.toThrow('No coverage reports found');
    });

    it('should throw NotFoundException when no reports exist for specific projectId', async () => {
      coverageService.getLatest.mockResolvedValue(null);

      await expect(controller.getLatest('nonexistent-project')).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /coverage/:id - getById', () => {
    it('should delegate to coverageService.getById with the ID', async () => {
      await controller.getById('report-uuid-1');

      expect(coverageService.getById).toHaveBeenCalledWith('report-uuid-1');
      expect(coverageService.getById).toHaveBeenCalledTimes(1);
    });

    it('should call toResponse with the report returned by getById', async () => {
      await controller.getById('report-uuid-1');

      expect(coverageService.toResponse).toHaveBeenCalledWith(mockCoverageReport);
    });

    it('should return the transformed CoverageReportResponse', async () => {
      const result = await controller.getById('report-uuid-1');

      expect(result).toEqual(mockReportResponse);
    });

    it('should throw NotFoundException when report does not exist', async () => {
      coverageService.getById.mockResolvedValue(null);

      await expect(controller.getById('nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with the report ID in the message', async () => {
      coverageService.getById.mockResolvedValue(null);

      await expect(controller.getById('missing-uuid')).rejects.toThrow(
        'Coverage report missing-uuid not found',
      );
    });

    it('should not call toResponse when report is not found', async () => {
      coverageService.getById.mockResolvedValue(null);

      await expect(controller.getById('nonexistent-id')).rejects.toThrow();
      expect(coverageService.toResponse).not.toHaveBeenCalled();
    });
  });

  describe('GET /coverage/history - getHistory', () => {
    it('should delegate to coverageService.getHistory with default pagination', async () => {
      await controller.getHistory();

      expect(coverageService.getHistory).toHaveBeenCalledWith({
        projectId: undefined,
        limit: 20,
        offset: 0,
      });
    });

    it('should pass projectId to the service', async () => {
      await controller.getHistory('project-uuid-1');

      expect(coverageService.getHistory).toHaveBeenCalledWith({
        projectId: 'project-uuid-1',
        limit: 20,
        offset: 0,
      });
    });

    it('should parse limit string to number', async () => {
      await controller.getHistory(undefined, '10');

      expect(coverageService.getHistory).toHaveBeenCalledWith({
        projectId: undefined,
        limit: 10,
        offset: 0,
      });
    });

    it('should parse offset string to number', async () => {
      await controller.getHistory(undefined, undefined, '5');

      expect(coverageService.getHistory).toHaveBeenCalledWith({
        projectId: undefined,
        limit: 20,
        offset: 5,
      });
    });

    it('should pass all query parameters together', async () => {
      await controller.getHistory('project-uuid-1', '50', '25');

      expect(coverageService.getHistory).toHaveBeenCalledWith({
        projectId: 'project-uuid-1',
        limit: 50,
        offset: 25,
      });
    });

    it('should call toResponse for each report in the result', async () => {
      coverageService.toResponse
        .mockReturnValueOnce(mockReportResponse)
        .mockReturnValueOnce(mockReportResponse2);

      await controller.getHistory();

      expect(coverageService.toResponse).toHaveBeenCalledTimes(2);
      expect(coverageService.toResponse).toHaveBeenCalledWith(mockCoverageReport);
      expect(coverageService.toResponse).toHaveBeenCalledWith(mockCoverageReport2);
    });

    it('should return CoverageHistoryResponse with reports, total, limit, and offset', async () => {
      coverageService.toResponse
        .mockReturnValueOnce(mockReportResponse)
        .mockReturnValueOnce(mockReportResponse2);

      const result = await controller.getHistory(undefined, '20', '0');

      expect(result).toEqual({
        reports: [mockReportResponse, mockReportResponse2],
        total: 2,
        limit: 20,
        offset: 0,
      });
    });

    it('should return empty reports array when no history exists', async () => {
      coverageService.getHistory.mockResolvedValue({ reports: [], total: 0 });

      const result = await controller.getHistory();

      expect(result).toEqual({
        reports: [],
        total: 0,
        limit: 20,
        offset: 0,
      });
    });

    it('should use default limit of 20 when limitStr is undefined', async () => {
      await controller.getHistory('project-uuid-1', undefined, '10');

      expect(coverageService.getHistory).toHaveBeenCalledWith({
        projectId: 'project-uuid-1',
        limit: 20,
        offset: 10,
      });
    });

    it('should use default offset of 0 when offsetStr is undefined', async () => {
      await controller.getHistory('project-uuid-1', '15');

      expect(coverageService.getHistory).toHaveBeenCalledWith({
        projectId: 'project-uuid-1',
        limit: 15,
        offset: 0,
      });
    });

    it('should propagate errors from the service', async () => {
      const error = new Error('Database connection lost');
      coverageService.getHistory.mockRejectedValue(error);

      await expect(controller.getHistory()).rejects.toThrow('Database connection lost');
    });
  });
});
