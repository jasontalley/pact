import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetricsSnapshot } from './metrics-snapshot.entity';
import { CouplingMetricsService } from './coupling-metrics.service';
import { EpistemicMetricsService } from './epistemic-metrics.service';
import { EpistemicMetrics } from './dto/epistemic-metrics.dto';
import { CouplingMetrics } from './dto/coupling-metrics.dto';
import { CoverageReport } from '../coverage/coverage-report.entity';
import { TestRecord } from '../agents/entities/test-record.entity';
import { DriftMetricsService } from '../drift/drift-metrics.service';

export interface MetricsTrend {
  date: string;
  epistemicMetrics: Record<string, unknown>;
  couplingMetrics: Record<string, unknown>;
  additionalMetrics: Record<string, unknown> | null;
}

@Injectable()
export class MetricsHistoryService {
  private readonly logger = new Logger(MetricsHistoryService.name);

  constructor(
    @InjectRepository(MetricsSnapshot)
    private readonly snapshotRepository: Repository<MetricsSnapshot>,
    @InjectRepository(CoverageReport)
    private readonly coverageReportRepository: Repository<CoverageReport>,
    @InjectRepository(TestRecord)
    private readonly testRecordRepository: Repository<TestRecord>,
    private readonly couplingMetricsService: CouplingMetricsService,
    private readonly epistemicMetricsService: EpistemicMetricsService,
    @Optional() @Inject(DriftMetricsService)
    private readonly driftMetricsService?: DriftMetricsService,
  ) {}

  /**
   * Record a daily metrics snapshot. Captures current epistemic, coupling,
   * test quality, and coverage metrics.
   * If a snapshot for today already exists, it's updated.
   */
  async recordSnapshot(): Promise<MetricsSnapshot> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Get current metrics
    const [epistemicMetrics, couplingMetrics] = await Promise.all([
      this.epistemicMetricsService.getEpistemicMetrics(),
      this.couplingMetricsService.getAll(),
    ]);

    const additionalMetrics = await this.buildAdditionalMetrics(epistemicMetrics, couplingMetrics);

    // Check for existing snapshot today
    let snapshot = await this.snapshotRepository.findOne({
      where: { snapshotDate: today },
    });

    if (snapshot) {
      // Update existing
      snapshot.epistemicMetrics = epistemicMetrics as unknown as Record<string, unknown>;
      snapshot.couplingMetrics = couplingMetrics as unknown as Record<string, unknown>;
      snapshot.additionalMetrics = additionalMetrics;
    } else {
      // Create new
      snapshot = this.snapshotRepository.create({
        snapshotDate: today,
        epistemicMetrics: epistemicMetrics as unknown as Record<string, unknown>,
        couplingMetrics: couplingMetrics as unknown as Record<string, unknown>,
        additionalMetrics,
      });
    }

    return this.snapshotRepository.save(snapshot);
  }

  /**
   * Build additional metrics: test quality aggregate, coverage summary,
   * quality-weighted certainty, coupling strength, and drift metrics.
   */
  private async buildAdditionalMetrics(
    epistemicMetrics: EpistemicMetrics,
    couplingMetrics: CouplingMetrics,
  ): Promise<Record<string, unknown>> {
    const [testQuality, coverage, drift] = await Promise.all([
      this.getTestQualityAggregate(),
      this.getLatestCoverageSummary(),
      this.getDriftMetrics(),
    ]);

    return {
      testQuality,
      coverage,
      qualityWeightedCertainty: epistemicMetrics.qualityWeightedCertainty,
      averageCouplingStrength: couplingMetrics.atomTestCoupling.averageCouplingStrength,
      drift,
    };
  }

  /**
   * Get drift metrics for snapshot (Phase 16).
   */
  private async getDriftMetrics(): Promise<Record<string, unknown> | null> {
    if (!this.driftMetricsService) {
      return null;
    }

    try {
      const summary = await this.driftMetricsService.getDriftMetricsSnapshot();
      return {
        totalOpen: summary.totalOpen,
        byType: summary.byType,
        bySeverity: summary.bySeverity,
        overdueCount: summary.overdueCount,
        convergenceScore: summary.convergenceScore,
      };
    } catch {
      return null;
    }
  }

  /**
   * Aggregate test quality scores across all analyzed test records.
   */
  private async getTestQualityAggregate(): Promise<Record<string, unknown>> {
    const analyzed = await this.testRecordRepository
      .createQueryBuilder('tr')
      .select([
        'COUNT(tr.qualityScore) AS "totalAnalyzed"',
        'AVG(tr.qualityScore) AS "averageScore"',
      ])
      .where('tr.qualityScore IS NOT NULL')
      .getRawOne();

    const totalAnalyzed = Number(analyzed?.totalAnalyzed ?? 0);
    const averageScore = totalAnalyzed > 0 ? Number(Number(analyzed?.averageScore).toFixed(1)) : 0;

    // Grade distribution: A (90-100), B (80-89), C (70-79), D (60-69), F (<60)
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    if (totalAnalyzed > 0) {
      const grades = await this.testRecordRepository
        .createQueryBuilder('tr')
        .select([
          'SUM(CASE WHEN tr.qualityScore >= 90 THEN 1 ELSE 0 END) AS "A"',
          'SUM(CASE WHEN tr.qualityScore >= 80 AND tr.qualityScore < 90 THEN 1 ELSE 0 END) AS "B"',
          'SUM(CASE WHEN tr.qualityScore >= 70 AND tr.qualityScore < 80 THEN 1 ELSE 0 END) AS "C"',
          'SUM(CASE WHEN tr.qualityScore >= 60 AND tr.qualityScore < 70 THEN 1 ELSE 0 END) AS "D"',
          'SUM(CASE WHEN tr.qualityScore < 60 THEN 1 ELSE 0 END) AS "F"',
        ])
        .where('tr.qualityScore IS NOT NULL')
        .getRawOne();

      gradeDistribution.A = Number(grades?.A ?? 0);
      gradeDistribution.B = Number(grades?.B ?? 0);
      gradeDistribution.C = Number(grades?.C ?? 0);
      gradeDistribution.D = Number(grades?.D ?? 0);
      gradeDistribution.F = Number(grades?.F ?? 0);
    }

    return { averageScore, totalAnalyzed, gradeDistribution };
  }

  /**
   * Get the latest coverage report summary, or null if none exists.
   */
  private async getLatestCoverageSummary(): Promise<Record<string, unknown> | null> {
    const latestReport = await this.coverageReportRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (!latestReport) return null;

    return {
      statements: latestReport.summary.statements.pct,
      branches: latestReport.summary.branches.pct,
      functions: latestReport.summary.functions.pct,
      lines: latestReport.summary.lines.pct,
    };
  }

  /**
   * Get metrics trends over a time period.
   */
  async getTrends(period: 'week' | 'month' | 'quarter' = 'month'): Promise<MetricsTrend[]> {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'quarter':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const snapshots = await this.snapshotRepository.find({
      where: {
        snapshotDate: Between(startStr, endStr),
      },
      order: { snapshotDate: 'ASC' },
    });

    return snapshots.map((s) => ({
      date: s.snapshotDate,
      epistemicMetrics: s.epistemicMetrics,
      couplingMetrics: s.couplingMetrics,
      additionalMetrics: s.additionalMetrics,
    }));
  }

  /**
   * Get the latest snapshot.
   */
  async getLatest(): Promise<MetricsSnapshot | null> {
    return this.snapshotRepository.findOne({
      order: { snapshotDate: 'DESC' },
      where: {},
    });
  }

  /**
   * Scheduled daily snapshot at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySnapshot(): Promise<void> {
    this.logger.log('Recording daily metrics snapshot...');
    try {
      await this.recordSnapshot();
      this.logger.log('Daily metrics snapshot recorded successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to record daily metrics snapshot: ${message}`);
    }
  }
}
