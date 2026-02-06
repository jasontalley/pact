import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CouplingMetricsService } from './coupling-metrics.service';
import { Atom } from '../atoms/atom.entity';
import { TestRecord } from '../agents/entities/test-record.entity';
import { AtomRecommendation } from '../agents/entities/atom-recommendation.entity';

describe('CouplingMetricsService', () => {
  let service: CouplingMetricsService;

  const mockAtomRepository = {
    find: jest.fn(),
  };

  const mockTestRecordRepository = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAtomRecommendationRepository = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouplingMetricsService,
        { provide: getRepositoryToken(Atom), useValue: mockAtomRepository },
        { provide: getRepositoryToken(TestRecord), useValue: mockTestRecordRepository },
        {
          provide: getRepositoryToken(AtomRecommendation),
          useValue: mockAtomRecommendationRepository,
        },
      ],
    }).compile();

    service = module.get<CouplingMetricsService>(CouplingMetricsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAtomTestCoupling', () => {
    it('should return zero metrics for empty database', async () => {
      mockAtomRepository.find.mockResolvedValue([]);

      const result = await service.getAtomTestCoupling();

      expect(result.totalAtoms).toBe(0);
      expect(result.atomsWithTests).toBe(0);
      expect(result.rate).toBe(0);
      expect(result.orphanAtoms).toEqual([]);
    });

    it('should calculate 100% coupling when all atoms have tests', async () => {
      const atoms = [
        { id: 'atom-1', atomId: 'IA-001', description: 'desc 1', status: 'committed' },
        { id: 'atom-2', atomId: 'IA-002', description: 'desc 2', status: 'committed' },
      ];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Recommendation query for linked atoms
      const recQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ atomId: 'atom-1' }, { atomId: 'atom-2' }]),
      };
      mockAtomRecommendationRepository.createQueryBuilder.mockReturnValue(recQb);

      // Coupling strength query
      const testRecordQb = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockTestRecordRepository.createQueryBuilder.mockReturnValue(testRecordQb);

      const result = await service.getAtomTestCoupling();

      expect(result.totalAtoms).toBe(2);
      expect(result.atomsWithTests).toBe(2);
      expect(result.rate).toBe(1);
      expect(result.orphanAtoms).toEqual([]);
    });

    it('should correctly identify orphan atoms', async () => {
      const atoms = [
        { id: 'atom-1', atomId: 'IA-001', description: 'desc 1', status: 'committed' },
        { id: 'atom-2', atomId: 'IA-002', description: 'orphan', status: 'committed' },
        { id: 'atom-3', atomId: 'IA-003', description: 'desc 3', status: 'committed' },
      ];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const recQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ atomId: 'atom-1' }]),
      };
      mockAtomRecommendationRepository.createQueryBuilder.mockReturnValue(recQb);

      // Coupling strength query
      const testRecordQb = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockTestRecordRepository.createQueryBuilder.mockReturnValue(testRecordQb);

      const result = await service.getAtomTestCoupling();

      expect(result.totalAtoms).toBe(3);
      expect(result.atomsWithTests).toBe(1);
      expect(result.rate).toBeCloseTo(1 / 3);
      expect(result.orphanAtoms).toHaveLength(2);
      expect(result.orphanAtoms.map((a) => a.atomId)).toContain('IA-002');
      expect(result.orphanAtoms.map((a) => a.atomId)).toContain('IA-003');
    });

    describe('coupling strength', () => {
      it('should return zero coupling strength when no linked atoms', async () => {
        mockAtomRepository.find.mockResolvedValue([]);

        const result = await service.getAtomTestCoupling();

        expect(result.averageCouplingStrength).toBe(0);
        expect(result.strengthDistribution).toEqual({ strong: 0, moderate: 0, weak: 0 });
      });

      it('should calculate coupling strength with annotation accuracy', async () => {
        const atoms = [
          { id: 'atom-1', atomId: 'IA-001', description: 'desc', status: 'committed' },
        ];
        mockAtomRepository.find.mockResolvedValue(atoms);

        const recQb = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([{ atomId: 'atom-1' }]),
        };
        mockAtomRecommendationRepository.createQueryBuilder.mockReturnValue(recQb);

        // Test record with explicit @atom annotation
        const testRecordQb = {
          leftJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([
            {
              atomId: 'atom-1',
              qualityScore: 90,
              hadAtomAnnotation: true,
              confidence: null,
            },
          ]),
        };
        mockTestRecordRepository.createQueryBuilder.mockReturnValue(testRecordQb);

        const result = await service.getAtomTestCoupling();

        // strength = (90 * 0.5 + 50 * 0.3 + 100 * 0.2) / 100 = (45 + 15 + 20) / 100 = 0.8
        expect(result.averageCouplingStrength).toBeCloseTo(0.8);
        expect(result.strengthDistribution.strong).toBe(1);
      });

      it('should use confidence-based annotation accuracy for recommendations', async () => {
        const atoms = [
          { id: 'atom-1', atomId: 'IA-001', description: 'desc', status: 'committed' },
        ];
        mockAtomRepository.find.mockResolvedValue(atoms);

        const recQb = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([{ atomId: 'atom-1' }]),
        };
        mockAtomRecommendationRepository.createQueryBuilder.mockReturnValue(recQb);

        // High confidence recommendation (>= 80)
        const testRecordQb = {
          leftJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([
            {
              atomId: 'atom-1',
              qualityScore: 70,
              hadAtomAnnotation: false,
              confidence: 85,
            },
          ]),
        };
        mockTestRecordRepository.createQueryBuilder.mockReturnValue(testRecordQb);

        const result = await service.getAtomTestCoupling();

        // strength = (70 * 0.5 + 50 * 0.3 + 70 * 0.2) / 100 = (35 + 15 + 14) / 100 = 0.64
        expect(result.averageCouplingStrength).toBeCloseTo(0.64);
        expect(result.strengthDistribution.moderate).toBe(1);
      });

      it('should default quality score to 50 when null', async () => {
        const atoms = [
          { id: 'atom-1', atomId: 'IA-001', description: 'desc', status: 'committed' },
        ];
        mockAtomRepository.find.mockResolvedValue(atoms);

        const recQb = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([{ atomId: 'atom-1' }]),
        };
        mockAtomRecommendationRepository.createQueryBuilder.mockReturnValue(recQb);

        // No quality score, low confidence, no annotation
        const testRecordQb = {
          leftJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([
            {
              atomId: 'atom-1',
              qualityScore: null,
              hadAtomAnnotation: false,
              confidence: 50,
            },
          ]),
        };
        mockTestRecordRepository.createQueryBuilder.mockReturnValue(testRecordQb);

        const result = await service.getAtomTestCoupling();

        // strength = (50 * 0.5 + 50 * 0.3 + 50 * 0.2) / 100 = 0.5
        expect(result.averageCouplingStrength).toBeCloseTo(0.5);
        expect(result.strengthDistribution.moderate).toBe(1);
      });

      it('should classify strength distribution correctly', async () => {
        const atoms = [
          { id: 'atom-1', atomId: 'IA-001', description: 'strong', status: 'committed' },
          { id: 'atom-2', atomId: 'IA-002', description: 'moderate', status: 'committed' },
          { id: 'atom-3', atomId: 'IA-003', description: 'weak', status: 'committed' },
        ];
        mockAtomRepository.find.mockResolvedValue(atoms);

        const recQb = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest
            .fn()
            .mockResolvedValue([{ atomId: 'atom-1' }, { atomId: 'atom-2' }, { atomId: 'atom-3' }]),
        };
        mockAtomRecommendationRepository.createQueryBuilder.mockReturnValue(recQb);

        const testRecordQb = {
          leftJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([
            { atomId: 'atom-1', qualityScore: 95, hadAtomAnnotation: true, confidence: null }, // strong
            { atomId: 'atom-2', qualityScore: 60, hadAtomAnnotation: false, confidence: 85 }, // moderate
            { atomId: 'atom-3', qualityScore: 20, hadAtomAnnotation: false, confidence: 30 }, // weak
          ]),
        };
        mockTestRecordRepository.createQueryBuilder.mockReturnValue(testRecordQb);

        const result = await service.getAtomTestCoupling();

        expect(result.strengthDistribution.strong).toBe(1);
        expect(result.strengthDistribution.moderate).toBe(1);
        expect(result.strengthDistribution.weak).toBe(1);
      });

      it('should default to midpoint strength for linked atoms without test records', async () => {
        const atoms = [
          { id: 'atom-1', atomId: 'IA-001', description: 'desc', status: 'committed' },
        ];
        mockAtomRepository.find.mockResolvedValue(atoms);

        const recQb = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([{ atomId: 'atom-1' }]),
        };
        mockAtomRecommendationRepository.createQueryBuilder.mockReturnValue(recQb);

        // No test records for this atom
        const testRecordQb = {
          leftJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([]),
        };
        mockTestRecordRepository.createQueryBuilder.mockReturnValue(testRecordQb);

        const result = await service.getAtomTestCoupling();

        // Default midpoint: 0.5
        expect(result.averageCouplingStrength).toBeCloseTo(0.5);
        expect(result.strengthDistribution.moderate).toBe(1);
      });
    });
  });

  describe('getTestAtomCoupling', () => {
    it('should return zero metrics for empty database', async () => {
      mockTestRecordRepository.find.mockResolvedValue([]);

      const result = await service.getTestAtomCoupling();

      expect(result.totalTests).toBe(0);
      expect(result.testsWithAtoms).toBe(0);
      expect(result.rate).toBe(0);
      expect(result.orphanTests).toEqual([]);
    });

    it('should detect tests with atom annotations as coupled', async () => {
      const tests = [
        {
          id: 't1',
          filePath: 'a.spec.ts',
          testName: 'test 1',
          status: 'accepted',
          hadAtomAnnotation: true,
          atomRecommendationId: null,
        },
        {
          id: 't2',
          filePath: 'b.spec.ts',
          testName: 'test 2',
          status: 'pending',
          hadAtomAnnotation: false,
          atomRecommendationId: 'rec-1',
        },
        {
          id: 't3',
          filePath: 'c.spec.ts',
          testName: 'test 3',
          status: 'pending',
          hadAtomAnnotation: false,
          atomRecommendationId: null,
        },
      ];
      mockTestRecordRepository.find.mockResolvedValue(tests);

      const result = await service.getTestAtomCoupling();

      expect(result.totalTests).toBe(3);
      expect(result.testsWithAtoms).toBe(2);
      expect(result.rate).toBeCloseTo(2 / 3);
      expect(result.orphanTests).toHaveLength(1);
      expect(result.orphanTests[0].filePath).toBe('c.spec.ts');
    });
  });

  describe('getCodeAtomCoverage', () => {
    it('should return zero metrics for empty database', async () => {
      const emptyQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockTestRecordRepository.createQueryBuilder.mockReturnValue(emptyQb);

      const result = await service.getCodeAtomCoverage();

      expect(result.totalSourceFiles).toBe(0);
      expect(result.filesWithAtoms).toBe(0);
      expect(result.rate).toBe(0);
      expect(result.uncoveredFiles).toEqual([]);
    });

    it('should identify uncovered files', async () => {
      const allFilesQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([
            { filePath: 'a.spec.ts' },
            { filePath: 'b.spec.ts' },
            { filePath: 'c.spec.ts' },
          ]),
      };
      const coveredQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ filePath: 'a.spec.ts' }]),
      };

      let callCount = 0;
      mockTestRecordRepository.createQueryBuilder.mockImplementation(() => {
        return callCount++ === 0 ? allFilesQb : coveredQb;
      });

      const result = await service.getCodeAtomCoverage();

      expect(result.totalSourceFiles).toBe(3);
      expect(result.filesWithAtoms).toBe(1);
      expect(result.rate).toBeCloseTo(1 / 3);
      expect(result.uncoveredFiles).toContain('b.spec.ts');
      expect(result.uncoveredFiles).toContain('c.spec.ts');
    });
  });

  describe('getAll', () => {
    it('should aggregate all metrics', async () => {
      // Setup atom test coupling
      mockAtomRepository.find.mockResolvedValue([]);
      const recQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockAtomRecommendationRepository.createQueryBuilder.mockReturnValue(recQb);

      // Setup test atom coupling
      mockTestRecordRepository.find.mockResolvedValue([]);

      // Setup code atom coverage
      const emptyQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockTestRecordRepository.createQueryBuilder.mockReturnValue(emptyQb);

      const result = await service.getAll();

      expect(result.atomTestCoupling).toBeDefined();
      expect(result.testAtomCoupling).toBeDefined();
      expect(result.codeAtomCoverage).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);

      // Verify Phase 14C fields present
      expect(result.atomTestCoupling.averageCouplingStrength).toBeDefined();
      expect(result.atomTestCoupling.strengthDistribution).toBeDefined();
    });
  });
});
