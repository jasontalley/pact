import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atom } from '../atoms/atom.entity';
import { TestRecord } from '../agents/entities/test-record.entity';
import { AtomRecommendation } from '../agents/entities/atom-recommendation.entity';
import {
  CouplingMetrics,
  AtomTestCouplingMetrics,
  TestAtomCouplingMetrics,
  CodeAtomCoverageMetrics,
  AtomSummary,
  TestSummary,
  CouplingStrengthDistribution,
} from './dto/coupling-metrics.dto';

@Injectable()
export class CouplingMetricsService {
  constructor(
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @InjectRepository(TestRecord)
    private readonly testRecordRepository: Repository<TestRecord>,
    @InjectRepository(AtomRecommendation)
    private readonly atomRecommendationRepository: Repository<AtomRecommendation>,
  ) {}

  /**
   * Calculate atom→test coupling.
   * A committed atom is "coupled" if at least one test record references it
   * (via accepted atom recommendation that links to a real atom).
   */
  async getAtomTestCoupling(): Promise<AtomTestCouplingMetrics> {
    const committedAtoms = await this.atomRepository.find({
      where: { status: 'committed' },
    });

    const totalAtoms = committedAtoms.length;

    if (totalAtoms === 0) {
      return {
        totalAtoms: 0,
        atomsWithTests: 0,
        rate: 0,
        orphanAtoms: [],
        averageCouplingStrength: 0,
        strengthDistribution: { strong: 0, moderate: 0, weak: 0 },
      };
    }

    // Find atoms that have linked test records (via accepted recommendations)
    const atomsWithTestsResult = await this.atomRecommendationRepository
      .createQueryBuilder('rec')
      .select('DISTINCT rec.atomId', 'atomId')
      .where('rec.atomId IS NOT NULL')
      .andWhere('rec.status = :status', { status: 'accepted' })
      .getRawMany();

    const linkedAtomIds = new Set(atomsWithTestsResult.map((r) => r.atomId));

    const orphanAtoms: AtomSummary[] = [];
    let atomsWithTests = 0;

    for (const atom of committedAtoms) {
      if (linkedAtomIds.has(atom.id)) {
        atomsWithTests++;
      } else {
        orphanAtoms.push({
          id: atom.id,
          atomId: atom.atomId,
          description: atom.description,
          status: atom.status,
        });
      }
    }

    const rate = totalAtoms > 0 ? atomsWithTests / totalAtoms : 0;

    // Phase 14C: Calculate coupling strength
    const { averageCouplingStrength, strengthDistribution } =
      await this.calculateCouplingStrength(linkedAtomIds);

    return {
      totalAtoms,
      atomsWithTests,
      rate,
      orphanAtoms,
      averageCouplingStrength,
      strengthDistribution,
    };
  }

  /**
   * Calculate test→atom coupling.
   * A test is "coupled" if it has a linked atom (via accepted recommendation or @atom annotation).
   */
  async getTestAtomCoupling(): Promise<TestAtomCouplingMetrics> {
    const allTests = await this.testRecordRepository.find();

    const totalTests = allTests.length;

    if (totalTests === 0) {
      return { totalTests: 0, testsWithAtoms: 0, rate: 0, orphanTests: [] };
    }

    const orphanTests: TestSummary[] = [];
    let testsWithAtoms = 0;

    for (const test of allTests) {
      if (test.hadAtomAnnotation || test.atomRecommendationId) {
        testsWithAtoms++;
      } else {
        orphanTests.push({
          id: test.id,
          filePath: test.filePath,
          testName: test.testName,
          status: test.status,
        });
      }
    }

    const rate = totalTests > 0 ? testsWithAtoms / totalTests : 0;

    return { totalTests, testsWithAtoms, rate, orphanTests };
  }

  /**
   * Calculate code→atom coverage.
   * Scans test records for unique file paths and checks which have atom linkage.
   * Note: This is an approximation based on test records, not a full source file scan.
   */
  async getCodeAtomCoverage(): Promise<CodeAtomCoverageMetrics> {
    // Get unique test file paths
    const allTestFiles = await this.testRecordRepository
      .createQueryBuilder('test')
      .select('DISTINCT test.filePath', 'filePath')
      .getRawMany();

    const totalSourceFiles = allTestFiles.length;

    if (totalSourceFiles === 0) {
      return { totalSourceFiles: 0, filesWithAtoms: 0, rate: 0, uncoveredFiles: [] };
    }

    // Get files that have at least one test with atom linkage
    const coveredFiles = await this.testRecordRepository
      .createQueryBuilder('test')
      .select('DISTINCT test.filePath', 'filePath')
      .where('test.hadAtomAnnotation = true OR test.atomRecommendationId IS NOT NULL')
      .getRawMany();

    const coveredSet = new Set(coveredFiles.map((f) => f.filePath));
    const uncoveredFiles = allTestFiles
      .map((f) => f.filePath)
      .filter((path) => !coveredSet.has(path));

    const filesWithAtoms = coveredSet.size;
    const rate = totalSourceFiles > 0 ? filesWithAtoms / totalSourceFiles : 0;

    return { totalSourceFiles, filesWithAtoms, rate, uncoveredFiles };
  }

  // ==========================================================================
  // Phase 14C: Coupling Strength
  // ==========================================================================

  /**
   * Calculate coupling strength for linked atoms.
   *
   * strength = (testQuality * 0.5 + coverageDepth * 0.3 + annotationAccuracy * 0.2) / 100
   *
   * annotationAccuracy:
   *   100 = explicit @atom annotation (hadAtomAnnotation=true)
   *   70  = accepted recommendation, confidence >= 80
   *   50  = accepted recommendation, confidence < 80
   */
  private async calculateCouplingStrength(linkedAtomIds: Set<string>): Promise<{
    averageCouplingStrength: number;
    strengthDistribution: CouplingStrengthDistribution;
  }> {
    if (linkedAtomIds.size === 0) {
      return {
        averageCouplingStrength: 0,
        strengthDistribution: { strong: 0, moderate: 0, weak: 0 },
      };
    }

    // Get test records and recommendations for linked atoms
    const records = await this.testRecordRepository
      .createQueryBuilder('tr')
      .leftJoin('tr.atomRecommendation', 'rec')
      .select([
        'rec.atomId AS "atomId"',
        'tr.qualityScore AS "qualityScore"',
        'tr.hadAtomAnnotation AS "hadAtomAnnotation"',
        'rec.confidence AS "confidence"',
      ])
      .where('rec.atomId IN (:...atomIds)', { atomIds: [...linkedAtomIds] })
      .andWhere('rec.status = :status', { status: 'accepted' })
      .getRawMany();

    // Group by atom
    const atomStrengths = new Map<string, number[]>();

    for (const r of records) {
      const atomId = r.atomId;
      const testQuality = r.qualityScore != null ? Number(r.qualityScore) : 50;
      const coverageDepth = 50; // Default when no per-file coverage data
      let annotationAccuracy = 50;

      if (r.hadAtomAnnotation) {
        annotationAccuracy = 100;
      } else if (r.confidence != null && Number(r.confidence) >= 80) {
        annotationAccuracy = 70;
      }

      const strength = (testQuality * 0.5 + coverageDepth * 0.3 + annotationAccuracy * 0.2) / 100;

      if (!atomStrengths.has(atomId)) {
        atomStrengths.set(atomId, []);
      }
      atomStrengths.get(atomId)!.push(strength);
    }

    // Calculate distribution
    let totalStrength = 0;
    let strong = 0,
      moderate = 0,
      weak = 0;

    for (const atomId of linkedAtomIds) {
      const strengths = atomStrengths.get(atomId) || [];
      const avgStrength =
        strengths.length > 0 ? strengths.reduce((a, b) => a + b, 0) / strengths.length : 0.5; // Default midpoint

      totalStrength += avgStrength;

      if (avgStrength >= 0.8) strong++;
      else if (avgStrength >= 0.5) moderate++;
      else weak++;
    }

    return {
      averageCouplingStrength: linkedAtomIds.size > 0 ? totalStrength / linkedAtomIds.size : 0,
      strengthDistribution: { strong, moderate, weak },
    };
  }

  /**
   * Get all coupling metrics aggregated.
   */
  async getAll(): Promise<CouplingMetrics> {
    const [atomTestCoupling, testAtomCoupling, codeAtomCoverage] = await Promise.all([
      this.getAtomTestCoupling(),
      this.getTestAtomCoupling(),
      this.getCodeAtomCoverage(),
    ]);

    return {
      atomTestCoupling,
      testAtomCoupling,
      codeAtomCoverage,
      timestamp: new Date(),
    };
  }
}
