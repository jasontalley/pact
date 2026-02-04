import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MetricsHistoryService } from './metrics-history.service';
import { MetricsSnapshot } from './metrics-snapshot.entity';
import { CouplingMetricsService } from './coupling-metrics.service';
import { EpistemicMetricsService } from './epistemic-metrics.service';
import { CoverageReport } from '../coverage/coverage-report.entity';
import { TestRecord } from '../agents/entities/test-record.entity';

describe('MetricsHistoryService', () => {
  let service: MetricsHistoryService;

  const mockSnapshotRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockCoverageReportRepository = {
    findOne: jest.fn(),
  };

  const mockTestRecordRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockCouplingMetricsService = {
    getAll: jest.fn(),
  };

  const mockEpistemicMetricsService = {
    getEpistemicMetrics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsHistoryService,
        { provide: getRepositoryToken(MetricsSnapshot), useValue: mockSnapshotRepository },
        { provide: getRepositoryToken(CoverageReport), useValue: mockCoverageReportRepository },
        { provide: getRepositoryToken(TestRecord), useValue: mockTestRecordRepository },
        { provide: CouplingMetricsService, useValue: mockCouplingMetricsService },
        { provide: EpistemicMetricsService, useValue: mockEpistemicMetricsService },
      ],
    }).compile();

    service = module.get<MetricsHistoryService>(MetricsHistoryService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordSnapshot', () => {
    const mockEpistemic = {
      proven: { count: 5, percentage: 0.5 },
      committed: { count: 3, percentage: 0.3 },
      inferred: { count: 2, percentage: 0.2 },
      unknown: { orphanTestsCount: 1, uncoveredCodeFilesCount: 0 },
      totalCertainty: 0.8,
      qualityWeightedCertainty: 0.72,
      provenBreakdown: {
        highConfidence: { count: 3, percentage: 0.6 },
        mediumConfidence: { count: 1, percentage: 0.2 },
        lowConfidence: { count: 1, percentage: 0.2 },
      },
      coverageDepth: {
        atomsWithCoverage: 4,
        averageCoverageDepth: 75,
        atomsWithoutCoverage: 4,
      },
      timestamp: new Date(),
    };

    const mockCoupling = {
      atomTestCoupling: {
        totalAtoms: 10,
        atomsWithTests: 8,
        rate: 0.8,
        orphanAtoms: [],
        averageCouplingStrength: 0.65,
        strengthDistribution: { strong: 3, moderate: 4, weak: 1 },
      },
      testAtomCoupling: { totalTests: 15, testsWithAtoms: 12, rate: 0.8, orphanTests: [] },
      codeAtomCoverage: { totalSourceFiles: 5, filesWithAtoms: 4, rate: 0.8, uncoveredFiles: [] },
      timestamp: new Date(),
    };

    function setupTestQualityMocks(
      totalAnalyzed: number,
      averageScore: number,
      gradeDistribution?: Record<string, number>,
    ) {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
      };

      let callCount = 0;
      mockTestRecordRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: aggregate (COUNT + AVG)
          qb.getRawOne.mockResolvedValueOnce({ totalAnalyzed, averageScore });
          return qb;
        }
        // Second call: grade distribution
        const dist = gradeDistribution || { A: 0, B: 0, C: 0, D: 0, F: 0 };
        qb.getRawOne.mockResolvedValueOnce(dist);
        return qb;
      });
    }

    beforeEach(() => {
      mockEpistemicMetricsService.getEpistemicMetrics.mockResolvedValue(mockEpistemic);
      mockCouplingMetricsService.getAll.mockResolvedValue(mockCoupling);
      mockCoverageReportRepository.findOne.mockResolvedValue(null);
      setupTestQualityMocks(0, 0);
    });

    it('should create a new snapshot when none exists for today', async () => {
      mockSnapshotRepository.findOne.mockResolvedValue(null);

      const newSnapshot = {
        snapshotDate: new Date().toISOString().split('T')[0],
        epistemicMetrics: mockEpistemic,
        couplingMetrics: mockCoupling,
        additionalMetrics: expect.any(Object),
      };
      mockSnapshotRepository.create.mockReturnValue(newSnapshot);
      mockSnapshotRepository.save.mockResolvedValue({ ...newSnapshot, id: 'uuid-1' });

      const result = await service.recordSnapshot();

      expect(mockEpistemicMetricsService.getEpistemicMetrics).toHaveBeenCalled();
      expect(mockCouplingMetricsService.getAll).toHaveBeenCalled();
      expect(mockSnapshotRepository.findOne).toHaveBeenCalledWith({
        where: { snapshotDate: expect.any(String) },
      });
      expect(mockSnapshotRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshotDate: expect.any(String),
          epistemicMetrics: mockEpistemic,
          couplingMetrics: mockCoupling,
          additionalMetrics: expect.any(Object),
        }),
      );
      expect(mockSnapshotRepository.save).toHaveBeenCalled();
      expect(result.id).toBe('uuid-1');
    });

    it('should update an existing snapshot when one exists for today', async () => {
      const existingSnapshot = {
        id: 'existing-uuid',
        snapshotDate: new Date().toISOString().split('T')[0],
        epistemicMetrics: { old: 'data' },
        couplingMetrics: { old: 'data' },
        additionalMetrics: null,
      };
      mockSnapshotRepository.findOne.mockResolvedValue(existingSnapshot);
      mockSnapshotRepository.save.mockResolvedValue({
        ...existingSnapshot,
        epistemicMetrics: mockEpistemic,
        couplingMetrics: mockCoupling,
        additionalMetrics: expect.any(Object),
      });

      const result = await service.recordSnapshot();

      expect(mockSnapshotRepository.create).not.toHaveBeenCalled();
      expect(mockSnapshotRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'existing-uuid',
          epistemicMetrics: mockEpistemic,
          couplingMetrics: mockCoupling,
          additionalMetrics: expect.any(Object),
        }),
      );
      expect(result.epistemicMetrics).toEqual(mockEpistemic);
    });

    it('should populate additionalMetrics with qualityWeightedCertainty and couplingStrength', async () => {
      mockSnapshotRepository.findOne.mockResolvedValue(null);
      mockSnapshotRepository.create.mockImplementation((data) => data);
      mockSnapshotRepository.save.mockImplementation((data) =>
        Promise.resolve({ ...data, id: 'new-uuid' }),
      );

      await service.recordSnapshot();

      const createArg = mockSnapshotRepository.create.mock.calls[0][0];
      expect(createArg.additionalMetrics).toBeDefined();
      expect(createArg.additionalMetrics.qualityWeightedCertainty).toBe(0.72);
      expect(createArg.additionalMetrics.averageCouplingStrength).toBe(0.65);
    });

    it('should include test quality aggregate in additionalMetrics', async () => {
      setupTestQualityMocks(10, 82.5, { A: 3, B: 4, C: 2, D: 1, F: 0 });
      mockSnapshotRepository.findOne.mockResolvedValue(null);
      mockSnapshotRepository.create.mockImplementation((data) => data);
      mockSnapshotRepository.save.mockImplementation((data) =>
        Promise.resolve({ ...data, id: 'new-uuid' }),
      );

      await service.recordSnapshot();

      const createArg = mockSnapshotRepository.create.mock.calls[0][0];
      const testQuality = createArg.additionalMetrics.testQuality as Record<string, unknown>;
      expect(testQuality.totalAnalyzed).toBe(10);
      expect(testQuality.averageScore).toBe(82.5);
      expect(testQuality.gradeDistribution).toEqual({ A: 3, B: 4, C: 2, D: 1, F: 0 });
    });

    it('should include coverage summary in additionalMetrics when report exists', async () => {
      mockCoverageReportRepository.findOne.mockResolvedValue({
        summary: {
          statements: { total: 100, covered: 80, pct: 80 },
          branches: { total: 50, covered: 35, pct: 70 },
          functions: { total: 30, covered: 27, pct: 90 },
          lines: { total: 200, covered: 170, pct: 85 },
        },
        createdAt: new Date(),
      });
      mockSnapshotRepository.findOne.mockResolvedValue(null);
      mockSnapshotRepository.create.mockImplementation((data) => data);
      mockSnapshotRepository.save.mockImplementation((data) =>
        Promise.resolve({ ...data, id: 'new-uuid' }),
      );

      await service.recordSnapshot();

      const createArg = mockSnapshotRepository.create.mock.calls[0][0];
      const coverage = createArg.additionalMetrics.coverage as Record<string, unknown>;
      expect(coverage).toEqual({
        statements: 80,
        branches: 70,
        functions: 90,
        lines: 85,
      });
    });

    it('should set coverage to null in additionalMetrics when no report exists', async () => {
      mockCoverageReportRepository.findOne.mockResolvedValue(null);
      mockSnapshotRepository.findOne.mockResolvedValue(null);
      mockSnapshotRepository.create.mockImplementation((data) => data);
      mockSnapshotRepository.save.mockImplementation((data) =>
        Promise.resolve({ ...data, id: 'new-uuid' }),
      );

      await service.recordSnapshot();

      const createArg = mockSnapshotRepository.create.mock.calls[0][0];
      expect(createArg.additionalMetrics.coverage).toBeNull();
    });

    it('should handle zero analyzed tests in quality aggregate', async () => {
      setupTestQualityMocks(0, 0);
      mockSnapshotRepository.findOne.mockResolvedValue(null);
      mockSnapshotRepository.create.mockImplementation((data) => data);
      mockSnapshotRepository.save.mockImplementation((data) =>
        Promise.resolve({ ...data, id: 'new-uuid' }),
      );

      await service.recordSnapshot();

      const createArg = mockSnapshotRepository.create.mock.calls[0][0];
      const testQuality = createArg.additionalMetrics.testQuality as Record<string, unknown>;
      expect(testQuality.totalAnalyzed).toBe(0);
      expect(testQuality.averageScore).toBe(0);
      expect(testQuality.gradeDistribution).toEqual({ A: 0, B: 0, C: 0, D: 0, F: 0 });
    });
  });

  describe('getTrends', () => {
    const mockSnapshots = [
      {
        snapshotDate: '2026-01-01',
        epistemicMetrics: { proven: { count: 1 } },
        couplingMetrics: { atomTestCoupling: { rate: 0.5 } },
        additionalMetrics: null,
      },
      {
        snapshotDate: '2026-01-02',
        epistemicMetrics: { proven: { count: 2 } },
        couplingMetrics: { atomTestCoupling: { rate: 0.6 } },
        additionalMetrics: { custom: 'data' },
      },
    ];

    it('should return snapshots in date range for default month period', async () => {
      mockSnapshotRepository.find.mockResolvedValue(mockSnapshots);

      const result = await service.getTrends();

      expect(mockSnapshotRepository.find).toHaveBeenCalledWith({
        where: {
          snapshotDate: expect.anything(),
        },
        order: { snapshotDate: 'ASC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2026-01-01',
        epistemicMetrics: { proven: { count: 1 } },
        couplingMetrics: { atomTestCoupling: { rate: 0.5 } },
        additionalMetrics: null,
      });
      expect(result[1].additionalMetrics).toEqual({ custom: 'data' });
    });

    it('should handle week period', async () => {
      mockSnapshotRepository.find.mockResolvedValue([]);

      const result = await service.getTrends('week');

      expect(mockSnapshotRepository.find).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should handle month period', async () => {
      mockSnapshotRepository.find.mockResolvedValue(mockSnapshots);

      const result = await service.getTrends('month');

      expect(mockSnapshotRepository.find).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should handle quarter period', async () => {
      mockSnapshotRepository.find.mockResolvedValue(mockSnapshots);

      const result = await service.getTrends('quarter');

      expect(mockSnapshotRepository.find).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  describe('getLatest', () => {
    it('should return the most recent snapshot', async () => {
      const latestSnapshot = {
        id: 'latest-uuid',
        snapshotDate: '2026-02-03',
        epistemicMetrics: { proven: { count: 10 } },
        couplingMetrics: { atomTestCoupling: { rate: 0.9 } },
        additionalMetrics: null,
        createdAt: new Date(),
      };
      mockSnapshotRepository.findOne.mockResolvedValue(latestSnapshot);

      const result = await service.getLatest();

      expect(mockSnapshotRepository.findOne).toHaveBeenCalledWith({
        order: { snapshotDate: 'DESC' },
        where: {},
      });
      expect(result).toEqual(latestSnapshot);
    });

    it('should return null when no snapshots exist', async () => {
      mockSnapshotRepository.findOne.mockResolvedValue(null);

      const result = await service.getLatest();

      expect(result).toBeNull();
    });
  });

  describe('handleDailySnapshot', () => {
    it('should call recordSnapshot successfully', async () => {
      const spy = jest.spyOn(service, 'recordSnapshot').mockResolvedValue({
        id: 'snap-uuid',
        snapshotDate: '2026-02-03',
        epistemicMetrics: {},
        couplingMetrics: {},
        additionalMetrics: null,
        createdAt: new Date(),
      });

      await service.handleDailySnapshot();

      expect(spy).toHaveBeenCalled();
    });

    it('should handle errors gracefully without throwing', async () => {
      jest.spyOn(service, 'recordSnapshot').mockRejectedValue(new Error('DB connection failed'));

      // Should not throw
      await expect(service.handleDailySnapshot()).resolves.toBeUndefined();
    });

    it('should handle non-Error objects gracefully', async () => {
      jest.spyOn(service, 'recordSnapshot').mockRejectedValue('string error');

      // Should not throw
      await expect(service.handleDailySnapshot()).resolves.toBeUndefined();
    });
  });
});
