import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EpistemicMetricsService } from './epistemic-metrics.service';
import { Atom } from '../atoms/atom.entity';
import { TestRecord } from '../agents/entities/test-record.entity';
import { AtomRecommendation } from '../agents/entities/atom-recommendation.entity';
import { CoverageReport } from '../coverage/coverage-report.entity';

describe('EpistemicMetricsService', () => {
  let service: EpistemicMetricsService;

  const mockAtomRepository = {
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockTestRecordRepository = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAtomRecommendationRepository = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockCoverageReportRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EpistemicMetricsService,
        { provide: getRepositoryToken(Atom), useValue: mockAtomRepository },
        { provide: getRepositoryToken(TestRecord), useValue: mockTestRecordRepository },
        {
          provide: getRepositoryToken(AtomRecommendation),
          useValue: mockAtomRecommendationRepository,
        },
        { provide: getRepositoryToken(CoverageReport), useValue: mockCoverageReportRepository },
      ],
    }).compile();

    service = module.get<EpistemicMetricsService>(EpistemicMetricsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * Helper to set up mocks for the full getEpistemicMetrics flow.
   * Uses a queue-based approach for testRecordRepository.createQueryBuilder
   * to handle the varying number and order of calls depending on data.
   */
  function setupMocks(opts: {
    provenAtomIds?: string[];
    committedAtomIds?: string[];
    totalCommitted?: number;
    inferred?: number;
    tests?: Array<{ id: string; hadAtomAnnotation: boolean; atomRecommendationId: string | null }>;
    allTestFiles?: string[];
    coveredTestFiles?: string[];
    testQualityRecords?: Array<{ atomId: string; qualityScore: number | null }>;
    provenBreakdownRecords?: Array<{ atomId: string; avgScore: number }>;
    coverageReport?: {
      summary: { lines: { pct: number } };
      fileDetails: Array<{ filePath: string; lines: { pct: number } }>;
    } | null;
    coverageTestFiles?: Array<{ filePath: string; atomId: string }>;
  }) {
    const proven = opts.provenAtomIds || [];
    const committed = opts.committedAtomIds || proven;
    const totalCommitted = opts.totalCommitted ?? committed.length;
    const hasProvenAtoms = proven.length > 0;
    const hasCoverage = opts.coverageReport !== undefined && opts.coverageReport !== null;
    const allTestFiles = opts.allTestFiles ?? [];
    const totalKnown = totalCommitted + (opts.inferred ?? 0);

    // Recommendation query builder (for getProvenAtomIds)
    const recQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(proven.map((id) => ({ atomId: id }))),
    };
    mockAtomRecommendationRepository.createQueryBuilder.mockReturnValue(recQb);

    // Committed atoms (for getProvenAtomIds filtering)
    mockAtomRepository.find.mockResolvedValue(committed.map((id) => ({ id })));
    mockAtomRepository.count.mockResolvedValue(totalCommitted);

    // Inferred count
    mockAtomRecommendationRepository.count.mockResolvedValue(opts.inferred ?? 0);

    // Orphan tests
    mockTestRecordRepository.find.mockResolvedValue(opts.tests ?? []);

    // Coverage report (used by both qualityWeightedCertainty and coverageDepth)
    mockCoverageReportRepository.findOne.mockResolvedValue(opts.coverageReport ?? null);

    // Build the queue of results for testRecordRepository.createQueryBuilder calls
    // Order of calls depends on data:
    // 1. getUncoveredCodeFilesCount: allFiles (always)
    // 2. getUncoveredCodeFilesCount: coveredFiles (only if allFiles was non-empty)
    // 3. getProvenBreakdown (only if provenAtomIds non-empty)
    // 4. calculateQualityWeightedCertainty (only if totalKnown > 0 AND provenAtomIds non-empty)
    // 5. getCoverageDepth (only if coverage exists AND provenAtomIds non-empty)
    const resultQueue: unknown[][] = [];

    // Call 1: allFiles
    resultQueue.push(allTestFiles.map((fp) => ({ filePath: fp })));

    // Call 2: coveredFiles (only if allFiles non-empty)
    if (allTestFiles.length > 0) {
      resultQueue.push((opts.coveredTestFiles ?? []).map((fp) => ({ filePath: fp })));
    }

    // Phase 14C calls (only if provenAtomIds non-empty)
    if (hasProvenAtoms) {
      // getProvenBreakdown
      resultQueue.push(
        (opts.provenBreakdownRecords ?? []).map((r) => ({
          atomId: r.atomId,
          avgScore: r.avgScore,
        })),
      );

      // calculateQualityWeightedCertainty (only if totalKnown > 0)
      if (totalKnown > 0) {
        resultQueue.push(
          (opts.testQualityRecords ?? []).map((r) => ({
            rec_atomId: r.atomId,
            tr_qualityScore: r.qualityScore,
          })),
        );
      }

      // getCoverageDepth (only if coverage report exists)
      if (hasCoverage) {
        resultQueue.push(
          (opts.coverageTestFiles ?? []).map((r) => ({
            filePath: r.filePath,
            atomId: r.atomId,
          })),
        );
      }
    }

    mockTestRecordRepository.createQueryBuilder.mockImplementation(() => {
      const result = resultQueue.shift() ?? [];
      return {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(result),
      };
    });
  }

  describe('getEpistemicMetrics', () => {
    it('should return all zeros for empty database', async () => {
      setupMocks({});

      const result = await service.getEpistemicMetrics();

      expect(result.proven.count).toBe(0);
      expect(result.proven.percentage).toBe(0);
      expect(result.committed.count).toBe(0);
      expect(result.committed.percentage).toBe(0);
      expect(result.inferred.count).toBe(0);
      expect(result.inferred.percentage).toBe(0);
      expect(result.unknown.orphanTestsCount).toBe(0);
      expect(result.unknown.uncoveredCodeFilesCount).toBe(0);
      expect(result.totalCertainty).toBe(0);
      expect(result.qualityWeightedCertainty).toBe(0);
      expect(result.provenBreakdown).toBeDefined();
      expect(result.coverageDepth).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should correctly calculate proven atoms', async () => {
      setupMocks({
        provenAtomIds: ['atom-1', 'atom-2'],
        committedAtomIds: ['atom-1', 'atom-2'],
        totalCommitted: 3,
      });

      const result = await service.getEpistemicMetrics();

      expect(result.proven.count).toBe(2);
      expect(result.committed.count).toBe(1); // 3 total - 2 proven = 1
      expect(result.totalCertainty).toBe(1); // (2+1)/(2+1+0) = 1
    });

    it('should correctly calculate all four levels', async () => {
      setupMocks({
        provenAtomIds: ['atom-1', 'atom-2'],
        committedAtomIds: ['atom-1', 'atom-2'],
        totalCommitted: 5,
        inferred: 3,
        tests: [
          { id: 't1', hadAtomAnnotation: false, atomRecommendationId: null },
          { id: 't2', hadAtomAnnotation: false, atomRecommendationId: null },
          { id: 't3', hadAtomAnnotation: true, atomRecommendationId: null },
        ],
        allTestFiles: ['a.spec.ts', 'b.spec.ts'],
        coveredTestFiles: ['a.spec.ts'],
      });

      const result = await service.getEpistemicMetrics();

      expect(result.proven.count).toBe(2);
      expect(result.committed.count).toBe(3); // 5 total - 2 proven = 3
      expect(result.inferred.count).toBe(3);
      expect(result.unknown.orphanTestsCount).toBe(2);
      expect(result.unknown.uncoveredCodeFilesCount).toBe(1);

      // Total known = 2 + 3 + 3 = 8
      expect(result.totalCertainty).toBeCloseTo(0.625);
      expect(result.proven.percentage).toBeCloseTo(2 / 8);
      expect(result.committed.percentage).toBeCloseTo(3 / 8);
      expect(result.inferred.percentage).toBeCloseTo(3 / 8);
    });

    it('should not double-count proven and committed', async () => {
      setupMocks({
        provenAtomIds: ['atom-1'],
        committedAtomIds: ['atom-1'],
        totalCommitted: 1,
      });

      const result = await service.getEpistemicMetrics();

      expect(result.proven.count).toBe(1);
      expect(result.committed.count).toBe(0);
      expect(result.proven.count + result.committed.count).toBe(1);
    });

    it('should handle 100% certainty', async () => {
      setupMocks({
        provenAtomIds: ['atom-1', 'atom-2'],
        committedAtomIds: ['atom-1', 'atom-2'],
        totalCommitted: 2,
      });

      const result = await service.getEpistemicMetrics();

      expect(result.totalCertainty).toBe(1);
      expect(result.proven.percentage).toBe(1);
    });

    it('should handle only inferred items (0% certainty)', async () => {
      setupMocks({
        inferred: 5,
      });

      const result = await service.getEpistemicMetrics();

      expect(result.proven.count).toBe(0);
      expect(result.committed.count).toBe(0);
      expect(result.inferred.count).toBe(5);
      expect(result.totalCertainty).toBe(0);
      expect(result.inferred.percentage).toBe(1);
    });
  });

  describe('qualityWeightedCertainty', () => {
    it('should return 0 when totalKnown is 0', async () => {
      setupMocks({});

      const result = await service.getEpistemicMetrics();
      expect(result.qualityWeightedCertainty).toBe(0);
    });

    it('should default to midpoint (50) when no quality scores available', async () => {
      setupMocks({
        provenAtomIds: ['atom-1'],
        committedAtomIds: ['atom-1'],
        totalCommitted: 1,
        testQualityRecords: [],
      });

      const result = await service.getEpistemicMetrics();

      // avgTestQuality=50 (default), avgCoverage=50 (no report)
      // atomCertainty = (50 * 0.7 + 50 * 0.3) / 100 = 0.5
      expect(result.qualityWeightedCertainty).toBeCloseTo(0.5);
    });

    it('should use actual quality scores when available', async () => {
      setupMocks({
        provenAtomIds: ['atom-1'],
        committedAtomIds: ['atom-1'],
        totalCommitted: 1,
        testQualityRecords: [{ atomId: 'atom-1', qualityScore: 90 }],
      });

      const result = await service.getEpistemicMetrics();

      // avgTestQuality=90, avgCoverage=50 (no report)
      // atomCertainty = (90 * 0.7 + 50 * 0.3) / 100 = 0.78
      expect(result.qualityWeightedCertainty).toBeCloseTo(0.78);
    });

    it('should use coverage data when available', async () => {
      setupMocks({
        provenAtomIds: ['atom-1'],
        committedAtomIds: ['atom-1'],
        totalCommitted: 1,
        testQualityRecords: [{ atomId: 'atom-1', qualityScore: 80 }],
        coverageReport: {
          summary: { lines: { pct: 90 } },
          fileDetails: [],
        },
      });

      const result = await service.getEpistemicMetrics();

      // avgTestQuality=80, avgCoverage=90
      // atomCertainty = (80 * 0.7 + 90 * 0.3) / 100 = 0.83
      expect(result.qualityWeightedCertainty).toBeCloseTo(0.83);
    });

    it('should average quality scores across multiple tests for same atom', async () => {
      setupMocks({
        provenAtomIds: ['atom-1'],
        committedAtomIds: ['atom-1'],
        totalCommitted: 1,
        testQualityRecords: [
          { atomId: 'atom-1', qualityScore: 80 },
          { atomId: 'atom-1', qualityScore: 60 },
        ],
      });

      const result = await service.getEpistemicMetrics();

      // avgTestQuality = (80+60)/2 = 70, avgCoverage=50
      // atomCertainty = (70 * 0.7 + 50 * 0.3) / 100 = 0.64
      expect(result.qualityWeightedCertainty).toBeCloseTo(0.64);
    });
  });

  describe('provenBreakdown', () => {
    it('should return zeros when no proven atoms', async () => {
      setupMocks({});

      const result = await service.getEpistemicMetrics();

      expect(result.provenBreakdown.highConfidence.count).toBe(0);
      expect(result.provenBreakdown.mediumConfidence.count).toBe(0);
      expect(result.provenBreakdown.lowConfidence.count).toBe(0);
    });

    it('should classify atoms by quality score threshold', async () => {
      setupMocks({
        provenAtomIds: ['atom-1', 'atom-2', 'atom-3'],
        committedAtomIds: ['atom-1', 'atom-2', 'atom-3'],
        totalCommitted: 3,
        provenBreakdownRecords: [
          { atomId: 'atom-1', avgScore: 92 }, // high (>=80)
          { atomId: 'atom-2', avgScore: 65 }, // medium (50-79)
          { atomId: 'atom-3', avgScore: 30 }, // low (<50)
        ],
      });

      const result = await service.getEpistemicMetrics();

      expect(result.provenBreakdown.highConfidence.count).toBe(1);
      expect(result.provenBreakdown.mediumConfidence.count).toBe(1);
      expect(result.provenBreakdown.lowConfidence.count).toBe(1);
      expect(result.provenBreakdown.highConfidence.percentage).toBeCloseTo(1 / 3);
    });

    it('should treat atoms without quality data as medium confidence', async () => {
      setupMocks({
        provenAtomIds: ['atom-1', 'atom-2'],
        committedAtomIds: ['atom-1', 'atom-2'],
        totalCommitted: 2,
        provenBreakdownRecords: [
          { atomId: 'atom-1', avgScore: 85 },
          // atom-2 has no quality data → defaults to medium
        ],
      });

      const result = await service.getEpistemicMetrics();

      expect(result.provenBreakdown.highConfidence.count).toBe(1);
      expect(result.provenBreakdown.mediumConfidence.count).toBe(1);
      expect(result.provenBreakdown.lowConfidence.count).toBe(0);
    });
  });

  describe('coverageDepth', () => {
    it('should return zeros when no coverage report exists', async () => {
      setupMocks({
        provenAtomIds: ['atom-1'],
        committedAtomIds: ['atom-1'],
        totalCommitted: 2,
      });

      const result = await service.getEpistemicMetrics();

      expect(result.coverageDepth.atomsWithCoverage).toBe(0);
      expect(result.coverageDepth.averageCoverageDepth).toBe(0);
      expect(result.coverageDepth.atomsWithoutCoverage).toBe(2);
    });

    it('should calculate coverage depth when coverage data exists', async () => {
      setupMocks({
        provenAtomIds: ['atom-1', 'atom-2'],
        committedAtomIds: ['atom-1', 'atom-2'],
        totalCommitted: 3,
        coverageReport: {
          summary: { lines: { pct: 80 } },
          fileDetails: [
            { filePath: 'test/auth.spec.ts', lines: { pct: 95 } },
            { filePath: 'test/payment.spec.ts', lines: { pct: 70 } },
          ],
        },
        coverageTestFiles: [
          { filePath: 'test/auth.spec.ts', atomId: 'atom-1' },
          { filePath: 'test/payment.spec.ts', atomId: 'atom-2' },
        ],
      });

      const result = await service.getEpistemicMetrics();

      expect(result.coverageDepth.atomsWithCoverage).toBe(2);
      expect(result.coverageDepth.averageCoverageDepth).toBeCloseTo(82.5);
      expect(result.coverageDepth.atomsWithoutCoverage).toBe(1);
    });

    it('should handle atoms with test files not in coverage report', async () => {
      setupMocks({
        provenAtomIds: ['atom-1'],
        committedAtomIds: ['atom-1'],
        totalCommitted: 1,
        coverageReport: {
          summary: { lines: { pct: 80 } },
          fileDetails: [{ filePath: 'other/file.spec.ts', lines: { pct: 90 } }],
        },
        coverageTestFiles: [{ filePath: 'test/auth.spec.ts', atomId: 'atom-1' }],
      });

      const result = await service.getEpistemicMetrics();

      expect(result.coverageDepth.atomsWithCoverage).toBe(0);
      expect(result.coverageDepth.averageCoverageDepth).toBe(0);
      expect(result.coverageDepth.atomsWithoutCoverage).toBe(1);
    });
  });
});
