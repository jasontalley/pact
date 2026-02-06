import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CoverageIngestionService } from './coverage-ingestion.service';
import {
  CoverageReport,
  CoverageFormat,
  CoverageSummary,
  CoverageFileDetail,
} from './coverage-report.entity';
import { UploadCoverageDto, SubmitCoverageJsonDto } from './dto/coverage.dto';
import * as parsersModule from './parsers';

// Mock the parsers module so autoDetectAndParse can be controlled
jest.mock('./parsers', () => ({
  autoDetectAndParse: jest.fn(),
}));

const autoDetectAndParseMock = parsersModule.autoDetectAndParse as jest.Mock;

/**
 * Helper to build a CoverageSummary with sensible defaults.
 */
function makeSummary(overrides: Partial<CoverageSummary> = {}): CoverageSummary {
  const dim = (pct: number) => ({ total: 100, covered: pct, pct });
  return {
    statements: dim(80),
    branches: dim(60),
    functions: dim(75),
    lines: dim(85),
    ...overrides,
  };
}

/**
 * Helper to build a CoverageFileDetail.
 */
function makeFileDetail(filePath: string, pct = 90): CoverageFileDetail {
  const dim = { total: 50, covered: Math.round((50 * pct) / 100), pct };
  return {
    filePath,
    statements: { ...dim },
    branches: { ...dim },
    functions: { ...dim },
    lines: { ...dim },
    uncoveredLines: [10, 20, 30],
  };
}

/**
 * Helper to build a full CoverageReport entity.
 */
function makeReport(overrides: Partial<CoverageReport> = {}): CoverageReport {
  return {
    id: 'report-uuid-1',
    projectId: null,
    project: null,
    reconciliationRunId: null,
    reconciliationRun: null,
    format: 'lcov' as CoverageFormat,
    commitHash: null,
    branchName: null,
    summary: makeSummary(),
    fileDetails: [makeFileDetail('src/app.ts')],
    metadata: null,
    createdAt: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  } as CoverageReport;
}

describe('CoverageIngestionService', () => {
  let service: CoverageIngestionService;

  // Query builder mock with chainable methods
  const mockQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoverageIngestionService,
        {
          provide: getRepositoryToken(CoverageReport),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CoverageIngestionService>(CoverageIngestionService);
    jest.clearAllMocks();

    // Reset the query builder mock chain after clearAllMocks
    mockQueryBuilder.andWhere.mockReturnThis();
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.take.mockReturnThis();
    mockQueryBuilder.skip.mockReturnThis();
  });

  describe('service instantiation', () => {
    it('should be instantiated by NestJS dependency injection', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(CoverageIngestionService);
    });
  });

  // ---------------------------------------------------------------------------
  // uploadCoverage
  // ---------------------------------------------------------------------------
  describe('uploadCoverage', () => {
    const summary = makeSummary();
    const files = [makeFileDetail('src/main.ts')];

    beforeEach(() => {
      autoDetectAndParseMock.mockReturnValue({
        summary,
        files,
        format: 'lcov',
      });
    });

    it('should auto-detect lcov format and store the parsed report', async () => {
      const dto: UploadCoverageDto = {
        content: 'SF:src/main.ts\nend_of_record\n',
      };

      const createdEntity = makeReport({ format: 'lcov', summary, fileDetails: files });
      mockRepository.create.mockReturnValue(createdEntity);
      mockRepository.save.mockResolvedValue(createdEntity);

      const result = await service.uploadCoverage(dto);

      expect(autoDetectAndParseMock).toHaveBeenCalledWith(dto.content);
      expect(mockRepository.create).toHaveBeenCalledWith({
        format: 'lcov',
        projectId: null,
        reconciliationRunId: null,
        commitHash: null,
        branchName: null,
        summary,
        fileDetails: files,
        metadata: null,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toBe(createdEntity);
    });

    it('should auto-detect istanbul format', async () => {
      autoDetectAndParseMock.mockReturnValue({
        summary,
        files,
        format: 'istanbul',
      });

      const dto: UploadCoverageDto = { content: '{"total":{}}' };
      const entity = makeReport({ format: 'istanbul' });
      mockRepository.create.mockReturnValue(entity);
      mockRepository.save.mockResolvedValue(entity);

      await service.uploadCoverage(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'istanbul' }),
      );
    });

    it('should auto-detect cobertura format', async () => {
      autoDetectAndParseMock.mockReturnValue({
        summary,
        files,
        format: 'cobertura',
      });

      const dto: UploadCoverageDto = { content: '<?xml version="1.0"?><coverage/>' };
      const entity = makeReport({ format: 'cobertura' });
      mockRepository.create.mockReturnValue(entity);
      mockRepository.save.mockResolvedValue(entity);

      await service.uploadCoverage(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'cobertura' }),
      );
    });

    it('should use explicitly specified format when provided', async () => {
      const dto: UploadCoverageDto = {
        content: 'some content',
        format: 'istanbul' as CoverageFormat,
      };

      const entity = makeReport({ format: 'istanbul' });
      mockRepository.create.mockReturnValue(entity);
      mockRepository.save.mockResolvedValue(entity);

      await service.uploadCoverage(dto);

      // autoDetectAndParse is still called (service uses it for parsing regardless)
      expect(autoDetectAndParseMock).toHaveBeenCalledWith(dto.content);
      // But the format stored comes from dto.format
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'istanbul' }),
      );
    });

    it('should pass all optional fields from the DTO to the entity', async () => {
      const dto: UploadCoverageDto = {
        content: 'TN:\nSF:src/app.ts\nend_of_record\n',
        projectId: 'proj-123',
        reconciliationRunId: 'run-456',
        commitHash: 'abc123def',
        branchName: 'feature/coverage',
        metadata: { ci: true, pipelineId: 42 },
      };

      const entity = makeReport();
      mockRepository.create.mockReturnValue(entity);
      mockRepository.save.mockResolvedValue(entity);

      await service.uploadCoverage(dto);

      expect(mockRepository.create).toHaveBeenCalledWith({
        format: 'lcov',
        projectId: 'proj-123',
        reconciliationRunId: 'run-456',
        commitHash: 'abc123def',
        branchName: 'feature/coverage',
        summary,
        fileDetails: files,
        metadata: { ci: true, pipelineId: 42 },
      });
    });

    it('should default optional DTO fields to null when not provided', async () => {
      const dto: UploadCoverageDto = { content: 'some lcov' };
      const entity = makeReport();
      mockRepository.create.mockReturnValue(entity);
      mockRepository.save.mockResolvedValue(entity);

      await service.uploadCoverage(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: null,
          reconciliationRunId: null,
          commitHash: null,
          branchName: null,
          metadata: null,
        }),
      );
    });

    it('should propagate error when autoDetectAndParse throws for unsupported format', async () => {
      autoDetectAndParseMock.mockImplementation(() => {
        throw new Error(
          'Unable to detect coverage format. Supported formats: lcov, istanbul JSON, cobertura XML',
        );
      });

      const dto: UploadCoverageDto = { content: 'not a valid coverage format' };

      await expect(service.uploadCoverage(dto)).rejects.toThrow('Unable to detect coverage format');

      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should propagate error when autoDetectAndParse throws for invalid content', async () => {
      autoDetectAndParseMock.mockImplementation(() => {
        throw new Error('Parse error: malformed LCOV data');
      });

      const dto: UploadCoverageDto = { content: 'SF:\n\nbroken' };

      await expect(service.uploadCoverage(dto)).rejects.toThrow('Parse error');
    });
  });

  // ---------------------------------------------------------------------------
  // submitCoverageJson
  // ---------------------------------------------------------------------------
  describe('submitCoverageJson', () => {
    it('should store pre-parsed coverage data with istanbul format', async () => {
      const summary = makeSummary();
      const fileDetails = [makeFileDetail('src/utils.ts')];

      const dto: SubmitCoverageJsonDto = {
        summary,
        fileDetails,
      };

      const entity = makeReport({ format: 'istanbul', summary, fileDetails });
      mockRepository.create.mockReturnValue(entity);
      mockRepository.save.mockResolvedValue(entity);

      const result = await service.submitCoverageJson(dto);

      expect(mockRepository.create).toHaveBeenCalledWith({
        format: 'istanbul',
        projectId: null,
        reconciliationRunId: null,
        commitHash: null,
        branchName: null,
        summary,
        fileDetails,
        metadata: null,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(entity);
      expect(result).toBe(entity);
    });

    it('should pass all optional fields to the entity', async () => {
      const dto: SubmitCoverageJsonDto = {
        summary: makeSummary(),
        fileDetails: [makeFileDetail('src/index.ts')],
        projectId: 'proj-abc',
        reconciliationRunId: 'run-xyz',
        commitHash: 'deadbeef',
        branchName: 'main',
        metadata: { tool: 'jest' },
      };

      const entity = makeReport();
      mockRepository.create.mockReturnValue(entity);
      mockRepository.save.mockResolvedValue(entity);

      await service.submitCoverageJson(dto);

      expect(mockRepository.create).toHaveBeenCalledWith({
        format: 'istanbul',
        projectId: 'proj-abc',
        reconciliationRunId: 'run-xyz',
        commitHash: 'deadbeef',
        branchName: 'main',
        summary: dto.summary,
        fileDetails: dto.fileDetails,
        metadata: { tool: 'jest' },
      });
    });

    it('should default fileDetails to empty array when not provided', async () => {
      const dto: SubmitCoverageJsonDto = {
        summary: makeSummary(),
      };

      const entity = makeReport();
      mockRepository.create.mockReturnValue(entity);
      mockRepository.save.mockResolvedValue(entity);

      await service.submitCoverageJson(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ fileDetails: [] }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getLatest
  // ---------------------------------------------------------------------------
  describe('getLatest', () => {
    it('should return the latest report without project filter', async () => {
      const report = makeReport();
      mockRepository.findOne.mockResolvedValue(report);

      const result = await service.getLatest();

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {},
        order: { createdAt: 'DESC' },
      });
      expect(result).toBe(report);
    });

    it('should return the latest report filtered by projectId', async () => {
      const report = makeReport({ projectId: 'proj-1' });
      mockRepository.findOne.mockResolvedValue(report);

      const result = await service.getLatest('proj-1');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toBe(report);
    });

    it('should return null when no reports exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getLatest();

      expect(result).toBeNull();
    });

    it('should return null when no reports exist for the given projectId', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getLatest('nonexistent-project');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { projectId: 'nonexistent-project' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getById
  // ---------------------------------------------------------------------------
  describe('getById', () => {
    it('should return the report when found', async () => {
      const report = makeReport({ id: 'uuid-abc' });
      mockRepository.findOne.mockResolvedValue(report);

      const result = await service.getById('uuid-abc');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid-abc' },
      });
      expect(result).toBe(report);
    });

    it('should return null when no report is found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getById('nonexistent-uuid');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'nonexistent-uuid' },
      });
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getHistory
  // ---------------------------------------------------------------------------
  describe('getHistory', () => {
    it('should return paginated results with default limit and offset', async () => {
      const reports = [makeReport({ id: 'r1' }), makeReport({ id: 'r2' })];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([reports, 2]);

      const result = await service.getHistory({});

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('cr');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('cr.createdAt', 'DESC');
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual({ reports, total: 2 });
    });

    it('should apply custom limit and offset', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getHistory({ limit: 5, offset: 10 });

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
    });

    it('should filter by projectId when provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getHistory({ projectId: 'proj-filter' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('cr.projectId = :projectId', {
        projectId: 'proj-filter',
      });
    });

    it('should not filter by projectId when not provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getHistory({});

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('should return total count for pagination', async () => {
      const reports = [makeReport()];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([reports, 50]);

      const result = await service.getHistory({ limit: 1, offset: 0 });

      expect(result.total).toBe(50);
      expect(result.reports).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getFileCoverage
  // ---------------------------------------------------------------------------
  describe('getFileCoverage', () => {
    it('should return file detail when file path matches in the latest report', async () => {
      const fileDetail = makeFileDetail('src/service.ts', 92);
      const report = makeReport({
        fileDetails: [
          makeFileDetail('src/other.ts', 50),
          fileDetail,
          makeFileDetail('src/controller.ts', 70),
        ],
      });
      mockRepository.findOne.mockResolvedValue(report);

      const result = await service.getFileCoverage('src/service.ts');

      expect(result).toBe(fileDetail);
    });

    it('should return null when file path is not found in the latest report', async () => {
      const report = makeReport({
        fileDetails: [makeFileDetail('src/app.ts')],
      });
      mockRepository.findOne.mockResolvedValue(report);

      const result = await service.getFileCoverage('src/nonexistent.ts');

      expect(result).toBeNull();
    });

    it('should return null when no latest report exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getFileCoverage('src/app.ts');

      expect(result).toBeNull();
    });

    it('should pass projectId through to getLatest', async () => {
      const report = makeReport({
        projectId: 'proj-x',
        fileDetails: [makeFileDetail('src/index.ts')],
      });
      mockRepository.findOne.mockResolvedValue(report);

      await service.getFileCoverage('src/index.ts', 'proj-x');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { projectId: 'proj-x' },
        order: { createdAt: 'DESC' },
      });
    });

    it('should return null when latest report has empty fileDetails', async () => {
      const report = makeReport({ fileDetails: [] });
      mockRepository.findOne.mockResolvedValue(report);

      const result = await service.getFileCoverage('src/anything.ts');

      expect(result).toBeNull();
    });

    it('should match file paths exactly (no partial matching)', async () => {
      const report = makeReport({
        fileDetails: [makeFileDetail('src/app.ts')],
      });
      mockRepository.findOne.mockResolvedValue(report);

      // Partial match should NOT return a result
      const result = await service.getFileCoverage('src/app');

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // toResponse
  // ---------------------------------------------------------------------------
  describe('toResponse', () => {
    it('should map entity fields to response DTO', () => {
      const report = makeReport({
        id: 'uuid-123',
        projectId: 'proj-1',
        reconciliationRunId: 'run-1',
        format: 'istanbul',
        commitHash: 'abc123',
        branchName: 'main',
        summary: makeSummary(),
        fileDetails: [makeFileDetail('src/foo.ts')],
        metadata: { tool: 'vitest' },
        createdAt: new Date('2026-01-20T08:30:00Z'),
      });

      const response = service.toResponse(report);

      expect(response.id).toBe('uuid-123');
      expect(response.projectId).toBe('proj-1');
      expect(response.reconciliationRunId).toBe('run-1');
      expect(response.format).toBe('istanbul');
      expect(response.commitHash).toBe('abc123');
      expect(response.branchName).toBe('main');
      expect(response.summary).toEqual(report.summary);
      expect(response.fileDetails).toEqual(report.fileDetails);
      expect(response.metadata).toEqual({ tool: 'vitest' });
    });

    it('should convert createdAt Date to ISO string', () => {
      const date = new Date('2026-02-01T14:00:00.000Z');
      const report = makeReport({ createdAt: date });

      const response = service.toResponse(report);

      expect(response.createdAt).toBe('2026-02-01T14:00:00.000Z');
      expect(typeof response.createdAt).toBe('string');
    });

    it('should preserve null values for optional fields', () => {
      const report = makeReport({
        projectId: null,
        reconciliationRunId: null,
        commitHash: null,
        branchName: null,
        metadata: null,
      });

      const response = service.toResponse(report);

      expect(response.projectId).toBeNull();
      expect(response.reconciliationRunId).toBeNull();
      expect(response.commitHash).toBeNull();
      expect(response.branchName).toBeNull();
      expect(response.metadata).toBeNull();
    });

    it('should preserve empty fileDetails array', () => {
      const report = makeReport({ fileDetails: [] });

      const response = service.toResponse(report);

      expect(response.fileDetails).toEqual([]);
    });

    it('should map multiple file details correctly', () => {
      const files = [
        makeFileDetail('src/a.ts', 100),
        makeFileDetail('src/b.ts', 50),
        makeFileDetail('src/c.ts', 0),
      ];
      const report = makeReport({ fileDetails: files });

      const response = service.toResponse(report);

      expect(response.fileDetails).toHaveLength(3);
      expect(response.fileDetails[0].filePath).toBe('src/a.ts');
      expect(response.fileDetails[1].filePath).toBe('src/b.ts');
      expect(response.fileDetails[2].filePath).toBe('src/c.ts');
    });
  });
});
