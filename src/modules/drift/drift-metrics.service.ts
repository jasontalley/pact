import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { DriftDebtRepository } from './repositories/drift-debt.repository';
import { DriftPolicyService } from './drift-policy.service';
import { DriftDebt, DriftType, DriftDebtSeverity } from './entities/drift-debt.entity';
import { Atom } from '../atoms/atom.entity';
import { AtomRecommendation } from '../agents/entities/atom-recommendation.entity';
import { DriftSummaryResponse, DriftTrendResponse, DriftTrendPoint } from './dto/drift.dto';

/**
 * DriftMetricsService provides dashboard-ready drift metrics
 */
@Injectable()
export class DriftMetricsService {
  private readonly logger = new Logger(DriftMetricsService.name);

  constructor(
    private readonly driftDebtRepository: DriftDebtRepository,
    private readonly driftPolicyService: DriftPolicyService,
    @InjectRepository(DriftDebt)
    private readonly driftRepository: Repository<DriftDebt>,
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @InjectRepository(AtomRecommendation)
    private readonly atomRecRepository: Repository<AtomRecommendation>,
  ) {}

  /**
   * Get commitment backlog (committed atoms without test evidence)
   */
  async getCommitmentBacklog(): Promise<{
    count: number;
    atoms: Array<{ id: string; atomId: string; description: string }>;
  }> {
    // Find committed atoms without accepted recommendations
    const committedAtoms = await this.atomRepository.find({
      where: { status: 'committed' },
    });

    if (committedAtoms.length === 0) {
      return { count: 0, atoms: [] };
    }

    // Get atoms that have linked test records
    const linkedResult = await this.atomRecRepository
      .createQueryBuilder('rec')
      .select('DISTINCT rec.atomId', 'atomId')
      .where('rec.atomId IS NOT NULL')
      .andWhere('rec.status = :status', { status: 'accepted' })
      .getRawMany();

    const linkedAtomIds = new Set(linkedResult.map((r) => r.atomId));

    const backlogAtoms = committedAtoms
      .filter((a) => !linkedAtomIds.has(a.id))
      .slice(0, 10) // Limit for dashboard display
      .map((a) => ({
        id: a.id,
        atomId: a.atomId,
        description: a.description,
      }));

    return {
      count: committedAtoms.length - linkedAtomIds.size,
      atoms: backlogAtoms,
    };
  }

  /**
   * Get drift debt summary
   */
  async getDriftDebtSummary(projectId?: string): Promise<DriftSummaryResponse> {
    const [totalOpen, byType, bySeverity, overdueCount, convergenceReport] = await Promise.all([
      this.driftDebtRepository.getTotalOpenCount(projectId),
      this.driftDebtRepository.getCountsByType(projectId),
      this.driftDebtRepository.getCountsBySeverity(projectId),
      this.driftDebtRepository.getOverdueCount(projectId),
      this.driftPolicyService.evaluateConvergence(projectId),
    ]);

    return {
      totalOpen,
      byType,
      bySeverity,
      overdueCount,
      convergenceScore: convergenceReport.convergenceScore,
    };
  }

  /**
   * Get convergence score (percentage of drift on-track)
   */
  async getConvergenceScore(projectId?: string): Promise<number> {
    const report = await this.driftPolicyService.evaluateConvergence(projectId);
    return report.convergenceScore;
  }

  /**
   * Get drift trend over time
   */
  async getDriftTrend(
    period: 'week' | 'month' | 'quarter' = 'month',
    projectId?: string,
  ): Promise<DriftTrendResponse> {
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

    // Query drift records to build trend
    // Group by date for new, resolved, and running total
    const allDrift = await this.driftRepository.find({
      where: projectId
        ? { projectId, detectedAt: MoreThanOrEqual(startDate) }
        : { detectedAt: MoreThanOrEqual(startDate) },
      order: { detectedAt: 'ASC' },
    });

    // Build daily buckets
    const dayMap = new Map<string, { newCount: number; resolvedCount: number }>();

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dayMap.set(d.toISOString().split('T')[0], { newCount: 0, resolvedCount: 0 });
    }

    // Count new detections by day
    for (const drift of allDrift) {
      const dayKey = new Date(drift.detectedAt).toISOString().split('T')[0];
      const bucket = dayMap.get(dayKey);
      if (bucket) {
        bucket.newCount++;
      }

      // Count resolutions by day
      if (drift.resolvedAt) {
        const resolvedKey = new Date(drift.resolvedAt).toISOString().split('T')[0];
        const resolvedBucket = dayMap.get(resolvedKey);
        if (resolvedBucket) {
          resolvedBucket.resolvedCount++;
        }
      }
    }

    // Convert to trend points with running total
    const data: DriftTrendPoint[] = [];
    let runningTotal = 0;

    // Get count of open drift before start date
    const beforeStart = await this.driftRepository.count({
      where: {
        detectedAt: MoreThanOrEqual(new Date(0)), // All time
        status: 'open',
        ...(projectId && { projectId }),
      },
    });
    runningTotal = beforeStart - allDrift.length; // Approximate starting point

    for (const [date, counts] of dayMap.entries()) {
      runningTotal += counts.newCount - counts.resolvedCount;
      data.push({
        date,
        newCount: counts.newCount,
        resolvedCount: counts.resolvedCount,
        netCount: counts.newCount - counts.resolvedCount,
        totalOpen: Math.max(0, runningTotal),
      });
    }

    return { period, data };
  }

  /**
   * Get metrics snapshot data for drift (to be included in MetricsSnapshot)
   */
  async getDriftMetricsSnapshot(projectId?: string): Promise<{
    totalOpen: number;
    byType: Record<DriftType, number>;
    bySeverity: Record<DriftDebtSeverity, number>;
    overdueCount: number;
    convergenceScore: number;
  }> {
    return this.getDriftDebtSummary(projectId);
  }
}
