import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atom } from '../atoms/atom.entity';
import { TestRecord } from '../agents/entities/test-record.entity';
import { AtomRecommendation } from '../agents/entities/atom-recommendation.entity';
import { CoverageReport } from '../coverage/coverage-report.entity';
import { EpistemicMetrics, ProvenBreakdown, CoverageDepth } from './dto/epistemic-metrics.dto';

@Injectable()
export class EpistemicMetricsService {
  constructor(
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @InjectRepository(TestRecord)
    private readonly testRecordRepository: Repository<TestRecord>,
    @InjectRepository(AtomRecommendation)
    private readonly atomRecommendationRepository: Repository<AtomRecommendation>,
    @InjectRepository(CoverageReport)
    private readonly coverageReportRepository: Repository<CoverageReport>,
  ) {}

  /**
   * Calculate the epistemic metrics for the system.
   *
   * PROVEN: Committed atoms with at least one accepted test linkage
   * COMMITTED: Committed atoms NOT in the proven set
   * INFERRED: AtomRecommendations with status 'pending'
   * UNKNOWN: Orphan tests + uncovered code files
   */
  async getEpistemicMetrics(): Promise<EpistemicMetrics> {
    const [
      provenAtomIds,
      totalCommitted,
      inferredCount,
      orphanTestsCount,
      uncoveredCodeFilesCount,
    ] = await Promise.all([
      this.getProvenAtomIds(),
      this.getTotalCommittedCount(),
      this.getInferredCount(),
      this.getOrphanTestsCount(),
      this.getUncoveredCodeFilesCount(),
    ]);

    const provenCount = provenAtomIds.size;
    const committedCount = totalCommitted - provenCount;

    // Total knowledge base = proven + committed + inferred
    const totalKnown = provenCount + committedCount + inferredCount;

    const proven = {
      count: provenCount,
      percentage: totalKnown > 0 ? provenCount / totalKnown : 0,
    };

    const committed = {
      count: committedCount,
      percentage: totalKnown > 0 ? committedCount / totalKnown : 0,
    };

    const inferred = {
      count: inferredCount,
      percentage: totalKnown > 0 ? inferredCount / totalKnown : 0,
    };

    const totalCertainty = totalKnown > 0 ? (provenCount + committedCount) / totalKnown : 0;

    // Phase 14C: Quality-weighted enhancements
    const [provenBreakdown, coverageDepth, qualityWeightedCertainty] = await Promise.all([
      this.getProvenBreakdown(provenAtomIds),
      this.getCoverageDepth(provenAtomIds, totalCommitted),
      this.calculateQualityWeightedCertainty(provenAtomIds, totalKnown),
    ]);

    return {
      proven,
      committed,
      inferred,
      unknown: {
        orphanTestsCount,
        uncoveredCodeFilesCount,
      },
      totalCertainty,
      qualityWeightedCertainty,
      provenBreakdown,
      coverageDepth,
      timestamp: new Date(),
    };
  }

  /**
   * Get IDs of committed atoms that have at least one accepted test linkage.
   */
  private async getProvenAtomIds(): Promise<Set<string>> {
    const results = await this.atomRecommendationRepository
      .createQueryBuilder('rec')
      .select('DISTINCT rec.atomId', 'atomId')
      .where('rec.atomId IS NOT NULL')
      .andWhere('rec.status = :status', { status: 'accepted' })
      .getRawMany();

    const linkedAtomIds = new Set(results.map((r) => r.atomId));

    if (linkedAtomIds.size === 0) {
      return new Set();
    }

    // Filter to only committed atoms
    const committedAtoms = await this.atomRepository.find({
      where: { status: 'committed' },
      select: ['id'],
    });

    const committedIds = new Set(committedAtoms.map((a) => a.id));
    const provenIds = new Set<string>();

    for (const atomId of linkedAtomIds) {
      if (committedIds.has(atomId)) {
        provenIds.add(atomId);
      }
    }

    return provenIds;
  }

  /**
   * Get count of all committed atoms.
   */
  private async getTotalCommittedCount(): Promise<number> {
    return this.atomRepository.count({ where: { status: 'committed' } });
  }

  /**
   * Get count of pending atom recommendations (inferred, awaiting review).
   */
  private async getInferredCount(): Promise<number> {
    return this.atomRecommendationRepository.count({
      where: { status: 'pending' },
    });
  }

  /**
   * Get count of orphan tests (tests without atom linkage).
   */
  private async getOrphanTestsCount(): Promise<number> {
    const allTests = await this.testRecordRepository.find();
    return allTests.filter((t) => !t.hadAtomAnnotation && !t.atomRecommendationId).length;
  }

  /**
   * Get count of test files without any atom coverage.
   */
  private async getUncoveredCodeFilesCount(): Promise<number> {
    const allFiles = await this.testRecordRepository
      .createQueryBuilder('test')
      .select('DISTINCT test.filePath', 'filePath')
      .getRawMany();

    if (allFiles.length === 0) return 0;

    const coveredFiles = await this.testRecordRepository
      .createQueryBuilder('test')
      .select('DISTINCT test.filePath', 'filePath')
      .where('test.hadAtomAnnotation = true OR test.atomRecommendationId IS NOT NULL')
      .getRawMany();

    const coveredSet = new Set(coveredFiles.map((f) => f.filePath));
    return allFiles.filter((f) => !coveredSet.has(f.filePath)).length;
  }

  // ==========================================================================
  // Phase 14C: Quality-Weighted Epistemic Enhancements
  // ==========================================================================

  /**
   * Calculate quality-weighted certainty.
   *
   * Formula per proven atom:
   *   avgTestQuality = mean(test.qualityScore for linked tests) || 50
   *   coverageForSource = coverage pct for test source files || 50
   *   atomCertainty = (avgTestQuality * 0.7 + coverageForSource * 0.3) / 100
   *
   * qualityWeightedCertainty = sum(atomCertainty) / totalKnownAtoms
   *
   * Graceful degradation: without quality/coverage data, defaults to 50 (midpoint).
   */
  private async calculateQualityWeightedCertainty(
    provenAtomIds: Set<string>,
    totalKnown: number,
  ): Promise<number> {
    if (totalKnown === 0 || provenAtomIds.size === 0) return 0;

    // Get test quality scores for proven atoms
    const testRecordsWithQuality = await this.testRecordRepository
      .createQueryBuilder('tr')
      .innerJoin('tr.atomRecommendation', 'rec')
      .select(['tr.qualityScore', 'rec.atomId'])
      .where('rec.atomId IN (:...atomIds)', { atomIds: [...provenAtomIds] })
      .andWhere('rec.status = :status', { status: 'accepted' })
      .getRawMany();

    // Get latest coverage report for coverage depth
    const latestCoverage = await this.coverageReportRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });
    const avgCoveragePct = latestCoverage ? latestCoverage.summary.lines.pct : 50; // Default midpoint

    // Group test quality scores by atom
    const atomQualityMap = new Map<string, number[]>();
    for (const record of testRecordsWithQuality) {
      const atomId = record.rec_atomId || record.atomId;
      const score = record.tr_qualityScore != null ? Number(record.tr_qualityScore) : 50;
      if (!atomQualityMap.has(atomId)) {
        atomQualityMap.set(atomId, []);
      }
      atomQualityMap.get(atomId)!.push(score);
    }

    // Calculate per-atom certainty
    let totalAtomCertainty = 0;
    for (const atomId of provenAtomIds) {
      const scores = atomQualityMap.get(atomId) || [];
      const avgTestQuality =
        scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 50; // Default midpoint

      const atomCertainty = (avgTestQuality * 0.7 + avgCoveragePct * 0.3) / 100;
      totalAtomCertainty += atomCertainty;
    }

    return totalAtomCertainty / totalKnown;
  }

  /**
   * Break down proven atoms by test quality confidence level.
   */
  private async getProvenBreakdown(provenAtomIds: Set<string>): Promise<ProvenBreakdown> {
    if (provenAtomIds.size === 0) {
      return {
        highConfidence: { count: 0, percentage: 0 },
        mediumConfidence: { count: 0, percentage: 0 },
        lowConfidence: { count: 0, percentage: 0 },
      };
    }

    // Get average quality score per proven atom
    const results = await this.testRecordRepository
      .createQueryBuilder('tr')
      .innerJoin('tr.atomRecommendation', 'rec')
      .select('rec.atomId', 'atomId')
      .addSelect('AVG(tr.qualityScore)', 'avgScore')
      .where('rec.atomId IN (:...atomIds)', { atomIds: [...provenAtomIds] })
      .andWhere('rec.status = :status', { status: 'accepted' })
      .andWhere('tr.qualityScore IS NOT NULL')
      .groupBy('rec.atomId')
      .getRawMany();

    const scoredAtoms = new Map<string, number>();
    for (const r of results) {
      scoredAtoms.set(r.atomId, Number(r.avgScore));
    }

    let high = 0,
      medium = 0,
      low = 0;
    for (const atomId of provenAtomIds) {
      const score = scoredAtoms.get(atomId);
      if (score === undefined || score === null) {
        // No quality data — treat as medium confidence
        medium++;
      } else if (score >= 80) {
        high++;
      } else if (score >= 50) {
        medium++;
      } else {
        low++;
      }
    }

    const total = provenAtomIds.size;
    return {
      highConfidence: { count: high, percentage: total > 0 ? high / total : 0 },
      mediumConfidence: { count: medium, percentage: total > 0 ? medium / total : 0 },
      lowConfidence: { count: low, percentage: total > 0 ? low / total : 0 },
    };
  }

  /**
   * Calculate coverage depth metrics.
   */
  private async getCoverageDepth(
    provenAtomIds: Set<string>,
    totalCommitted: number,
  ): Promise<CoverageDepth> {
    const latestCoverage = await this.coverageReportRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (!latestCoverage || provenAtomIds.size === 0) {
      return {
        atomsWithCoverage: 0,
        averageCoverageDepth: 0,
        atomsWithoutCoverage: totalCommitted,
      };
    }

    // Get file paths for proven atoms' tests
    const testFiles = await this.testRecordRepository
      .createQueryBuilder('tr')
      .innerJoin('tr.atomRecommendation', 'rec')
      .select('DISTINCT tr.filePath', 'filePath')
      .addSelect('rec.atomId', 'atomId')
      .where('rec.atomId IN (:...atomIds)', { atomIds: [...provenAtomIds] })
      .andWhere('rec.status = :status', { status: 'accepted' })
      .getRawMany();

    // Map file details from coverage report for quick lookup
    const coverageByFile = new Map<string, number>();
    for (const fd of latestCoverage.fileDetails) {
      coverageByFile.set(fd.filePath, fd.lines.pct);
    }

    // Check which atoms have coverage data
    const atomsWithCoverage = new Set<string>();
    const coverageValues: number[] = [];

    for (const { filePath, atomId } of testFiles) {
      // Try matching test file path to coverage file paths
      const coverage = coverageByFile.get(filePath);
      if (coverage !== undefined) {
        atomsWithCoverage.add(atomId);
        coverageValues.push(coverage);
      }
    }

    const avgCoverage =
      coverageValues.length > 0
        ? coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length
        : 0;

    return {
      atomsWithCoverage: atomsWithCoverage.size,
      averageCoverageDepth: avgCoverage,
      atomsWithoutCoverage: totalCommitted - atomsWithCoverage.size,
    };
  }
}
