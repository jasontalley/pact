/**
 * Tests for MetricsController
 *
 * The MetricsController provides endpoints for system metrics:
 * - Epistemic metrics (proven/committed/inferred/unknown knowledge levels)
 * - Coupling metrics (atom-test, test-atom, code-atom coverage)
 * - Orphan detection (atoms without tests, tests without atoms)
 * - Metrics trends over time (requires optional MetricsHistoryService)
 * - Snapshot recording (requires optional MetricsHistoryService)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { CouplingMetricsService } from './coupling-metrics.service';
import { EpistemicMetricsService } from './epistemic-metrics.service';
import { MetricsHistoryService, MetricsTrend } from './metrics-history.service';
import {
  CouplingMetrics,
  AtomTestCouplingMetrics,
  TestAtomCouplingMetrics,
} from './dto/coupling-metrics.dto';
import { EpistemicMetrics } from './dto/epistemic-metrics.dto';

describe('MetricsController', () => {
  let controller: MetricsController;
  let couplingMetricsService: jest.Mocked<CouplingMetricsService>;
  let epistemicMetricsService: jest.Mocked<EpistemicMetricsService>;
  let metricsHistoryService: jest.Mocked<MetricsHistoryService>;

  const mockEpistemicMetrics: EpistemicMetrics = {
    proven: { count: 5, percentage: 0.5 },
    committed: { count: 3, percentage: 0.3 },
    inferred: { count: 2, percentage: 0.2 },
    unknown: { orphanTestsCount: 4, uncoveredCodeFilesCount: 1 },
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
    timestamp: new Date('2026-02-03T00:00:00Z'),
  };

  const mockAtomTestCoupling: AtomTestCouplingMetrics = {
    totalAtoms: 10,
    atomsWithTests: 7,
    rate: 0.7,
    orphanAtoms: [
      { id: '1', atomId: 'IA-008', description: 'Uncoupled atom', status: 'committed' },
      { id: '2', atomId: 'IA-009', description: 'Another uncoupled', status: 'committed' },
    ],
    averageCouplingStrength: 0.65,
    strengthDistribution: { strong: 3, moderate: 3, weak: 1 },
  };

  const mockTestAtomCoupling: TestAtomCouplingMetrics = {
    totalTests: 20,
    testsWithAtoms: 16,
    rate: 0.8,
    orphanTests: [
      { id: '10', filePath: 'src/test.spec.ts', testName: 'orphan test', status: 'discovered' },
    ],
  };

  const mockCouplingMetrics: CouplingMetrics = {
    atomTestCoupling: mockAtomTestCoupling,
    testAtomCoupling: mockTestAtomCoupling,
    codeAtomCoverage: {
      totalSourceFiles: 15,
      filesWithAtoms: 12,
      rate: 0.8,
      uncoveredFiles: ['src/uncovered.ts'],
    },
    timestamp: new Date('2026-02-03T00:00:00Z'),
  };

  const mockTrends: MetricsTrend[] = [
    {
      date: '2026-01-15',
      epistemicMetrics: { totalCertainty: 0.7 },
      couplingMetrics: { atomTestCoupling: { rate: 0.6 } },
      additionalMetrics: null,
    },
    {
      date: '2026-02-01',
      epistemicMetrics: { totalCertainty: 0.8 },
      couplingMetrics: { atomTestCoupling: { rate: 0.7 } },
      additionalMetrics: null,
    },
  ];

  const mockSnapshot = {
    id: 1,
    snapshotDate: '2026-02-03',
    epistemicMetrics: { totalCertainty: 0.8 },
    couplingMetrics: { atomTestCoupling: { rate: 0.7 } },
    additionalMetrics: null,
    createdAt: new Date(),
  };

  describe('with MetricsHistoryService available', () => {
    beforeEach(async () => {
      const mockCouplingService = {
        getAll: jest.fn().mockResolvedValue(mockCouplingMetrics),
        getAtomTestCoupling: jest.fn().mockResolvedValue(mockAtomTestCoupling),
        getTestAtomCoupling: jest.fn().mockResolvedValue(mockTestAtomCoupling),
      };

      const mockEpistemicService = {
        getEpistemicMetrics: jest.fn().mockResolvedValue(mockEpistemicMetrics),
      };

      const mockHistoryService = {
        getTrends: jest.fn().mockResolvedValue(mockTrends),
        recordSnapshot: jest.fn().mockResolvedValue(mockSnapshot),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [MetricsController],
        providers: [
          { provide: CouplingMetricsService, useValue: mockCouplingService },
          { provide: EpistemicMetricsService, useValue: mockEpistemicService },
          { provide: MetricsHistoryService, useValue: mockHistoryService },
        ],
      }).compile();

      controller = module.get<MetricsController>(MetricsController);
      couplingMetricsService = module.get(CouplingMetricsService);
      epistemicMetricsService = module.get(EpistemicMetricsService);
      metricsHistoryService = module.get(MetricsHistoryService);
    });

    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    describe('getEpistemicMetrics', () => {
      it('should delegate to epistemicMetricsService.getEpistemicMetrics', async () => {
        const result = await controller.getEpistemicMetrics();

        expect(result).toEqual(mockEpistemicMetrics);
        expect(epistemicMetricsService.getEpistemicMetrics).toHaveBeenCalledTimes(1);
      });
    });

    describe('getCouplingMetrics', () => {
      it('should delegate to couplingMetricsService.getAll', async () => {
        const result = await controller.getCouplingMetrics();

        expect(result).toEqual(mockCouplingMetrics);
        expect(couplingMetricsService.getAll).toHaveBeenCalledTimes(1);
      });
    });

    describe('getAtomTestCoupling', () => {
      it('should delegate to couplingMetricsService.getAtomTestCoupling', async () => {
        const result = await controller.getAtomTestCoupling();

        expect(result).toEqual(mockAtomTestCoupling);
        expect(couplingMetricsService.getAtomTestCoupling).toHaveBeenCalledTimes(1);
      });
    });

    describe('getOrphans', () => {
      it('should combine orphanAtoms and orphanTests from both coupling methods', async () => {
        const result = await controller.getOrphans();

        expect(result).toEqual({
          orphanAtoms: mockAtomTestCoupling.orphanAtoms,
          orphanTests: mockTestAtomCoupling.orphanTests,
        });
      });

      it('should call both getAtomTestCoupling and getTestAtomCoupling', async () => {
        await controller.getOrphans();

        expect(couplingMetricsService.getAtomTestCoupling).toHaveBeenCalledTimes(1);
        expect(couplingMetricsService.getTestAtomCoupling).toHaveBeenCalledTimes(1);
      });

      it('should return empty arrays when there are no orphans', async () => {
        couplingMetricsService.getAtomTestCoupling.mockResolvedValue({
          totalAtoms: 5,
          atomsWithTests: 5,
          rate: 1.0,
          orphanAtoms: [],
          averageCouplingStrength: 0.8,
          strengthDistribution: { strong: 5, moderate: 0, weak: 0 },
        });
        couplingMetricsService.getTestAtomCoupling.mockResolvedValue({
          totalTests: 10,
          testsWithAtoms: 10,
          rate: 1.0,
          orphanTests: [],
        });

        const result = await controller.getOrphans();

        expect(result).toEqual({
          orphanAtoms: [],
          orphanTests: [],
        });
      });
    });

    describe('getTrends', () => {
      it('should delegate to metricsHistoryService.getTrends with the provided period', async () => {
        const result = await controller.getTrends('week');

        expect(result).toEqual(mockTrends);
        expect(metricsHistoryService.getTrends).toHaveBeenCalledWith('week');
      });

      it('should default period to month when not provided', async () => {
        await controller.getTrends();

        expect(metricsHistoryService.getTrends).toHaveBeenCalledWith('month');
      });

      it('should pass quarter period through', async () => {
        await controller.getTrends('quarter');

        expect(metricsHistoryService.getTrends).toHaveBeenCalledWith('quarter');
      });
    });

    describe('recordSnapshot', () => {
      it('should delegate to metricsHistoryService.recordSnapshot', async () => {
        const result = await controller.recordSnapshot();

        expect(result).toEqual(mockSnapshot);
        expect(metricsHistoryService.recordSnapshot).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('without MetricsHistoryService (optional dependency absent)', () => {
    beforeEach(async () => {
      const mockCouplingService = {
        getAll: jest.fn().mockResolvedValue(mockCouplingMetrics),
        getAtomTestCoupling: jest.fn().mockResolvedValue(mockAtomTestCoupling),
        getTestAtomCoupling: jest.fn().mockResolvedValue(mockTestAtomCoupling),
      };

      const mockEpistemicService = {
        getEpistemicMetrics: jest.fn().mockResolvedValue(mockEpistemicMetrics),
      };

      // Create controller manually without MetricsHistoryService
      controller = new MetricsController(
        mockCouplingService as unknown as CouplingMetricsService,
        mockEpistemicService as unknown as EpistemicMetricsService,
        undefined,
      );

      couplingMetricsService =
        mockCouplingService as unknown as jest.Mocked<CouplingMetricsService>;
      epistemicMetricsService =
        mockEpistemicService as unknown as jest.Mocked<EpistemicMetricsService>;
    });

    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    describe('getEpistemicMetrics', () => {
      it('should still work without history service', async () => {
        const result = await controller.getEpistemicMetrics();

        expect(result).toEqual(mockEpistemicMetrics);
      });
    });

    describe('getCouplingMetrics', () => {
      it('should still work without history service', async () => {
        const result = await controller.getCouplingMetrics();

        expect(result).toEqual(mockCouplingMetrics);
      });
    });

    describe('getAtomTestCoupling', () => {
      it('should still work without history service', async () => {
        const result = await controller.getAtomTestCoupling();

        expect(result).toEqual(mockAtomTestCoupling);
      });
    });

    describe('getOrphans', () => {
      it('should still work without history service', async () => {
        const result = await controller.getOrphans();

        expect(result).toEqual({
          orphanAtoms: mockAtomTestCoupling.orphanAtoms,
          orphanTests: mockTestAtomCoupling.orphanTests,
        });
      });
    });

    describe('getTrends', () => {
      it('should return an empty array when history service is not available', async () => {
        const result = await controller.getTrends('month');

        expect(result).toEqual([]);
      });

      it('should return an empty array regardless of period parameter', async () => {
        const result = await controller.getTrends('week');

        expect(result).toEqual([]);
      });

      it('should return an empty array when period is undefined', async () => {
        const result = await controller.getTrends();

        expect(result).toEqual([]);
      });
    });

    describe('recordSnapshot', () => {
      it('should throw an error when history service is not available', async () => {
        await expect(controller.recordSnapshot()).rejects.toThrow(
          'Metrics history service not available',
        );
      });
    });
  });
});
