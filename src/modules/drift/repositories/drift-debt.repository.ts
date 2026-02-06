import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindOptionsWhere, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import {
  DriftDebt,
  DriftType,
  DriftDebtStatus,
  DriftDebtSeverity,
  ExceptionLane,
} from '../entities/drift-debt.entity';

/**
 * Params for creating a new drift debt record
 */
export interface CreateDriftDebtParams {
  driftType: DriftType;
  description: string;
  detectedByRunId: string;
  projectId?: string | null;
  filePath?: string | null;
  testName?: string | null;
  atomId?: string | null;
  atomDisplayId?: string | null;
  exceptionLane?: ExceptionLane | null;
  exceptionJustification?: string | null;
  severity?: DriftDebtSeverity;
  dueAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Filters for listing drift items
 */
export interface DriftListFilters {
  projectId?: string;
  driftType?: DriftType | DriftType[];
  status?: DriftDebtStatus | DriftDebtStatus[];
  severity?: DriftDebtSeverity | DriftDebtSeverity[];
  overdueOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Aging summary by time buckets
 */
export interface AgingSummary {
  bucket0to3Days: number;
  bucket3to7Days: number;
  bucket7to14Days: number;
  bucket14PlusDays: number;
  total: number;
}

@Injectable()
export class DriftDebtRepository {
  constructor(
    @InjectRepository(DriftDebt)
    private readonly repository: Repository<DriftDebt>,
  ) {}

  /**
   * Create a new drift debt record
   */
  async createDriftDebt(params: CreateDriftDebtParams): Promise<DriftDebt> {
    const now = new Date();
    const drift = this.repository.create({
      ...params,
      lastConfirmedByRunId: params.detectedByRunId,
      lastConfirmedAt: now,
      ageDays: 0,
      confirmationCount: 1,
    });
    return this.repository.save(drift);
  }

  /**
   * Find existing open drift by file path, test name, and type
   * Used for deduplication
   */
  async findByFilePath(
    filePath: string,
    testName: string | null,
    driftType: DriftType,
  ): Promise<DriftDebt | null> {
    const where: FindOptionsWhere<DriftDebt> = {
      filePath,
      driftType,
      status: In(['open', 'acknowledged']),
    };

    if (testName !== null) {
      where.testName = testName;
    }

    return this.repository.findOne({ where });
  }

  /**
   * Find existing open drift by atom ID and type
   * Used for commitment backlog deduplication
   */
  async findByAtomId(atomId: string, driftType: DriftType): Promise<DriftDebt | null> {
    return this.repository.findOne({
      where: {
        atomId,
        driftType,
        status: In(['open', 'acknowledged']),
      },
    });
  }

  /**
   * Update confirmation (last seen by a CI-attested run)
   */
  async updateConfirmation(id: string, runId: string): Promise<void> {
    const drift = await this.repository.findOne({ where: { id } });
    if (!drift) return;

    const now = new Date();
    const detectedDate = new Date(drift.detectedAt);
    const ageDays = Math.floor((now.getTime() - detectedDate.getTime()) / (1000 * 60 * 60 * 24));

    await this.repository.update(id, {
      lastConfirmedByRunId: runId,
      lastConfirmedAt: now,
      confirmationCount: drift.confirmationCount + 1,
      ageDays,
    });
  }

  /**
   * Mark drift as resolved
   */
  async resolveDrift(id: string, runId: string): Promise<void> {
    await this.repository.update(id, {
      status: 'resolved' as const,
      resolvedByRunId: runId,
      resolvedAt: new Date(),
    });
  }

  /**
   * Bulk resolve multiple drift items
   */
  async bulkResolveDrift(ids: string[], runId: string): Promise<void> {
    if (ids.length === 0) return;

    await this.repository.update(
      { id: In(ids) },
      {
        status: 'resolved' as const,
        resolvedByRunId: runId,
        resolvedAt: new Date(),
      },
    );
  }

  /**
   * List open drift items with filtering and pagination
   */
  async listOpenDrift(
    filters: DriftListFilters = {},
  ): Promise<{ items: DriftDebt[]; total: number }> {
    const where: FindOptionsWhere<DriftDebt> = {};

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    if (filters.driftType) {
      where.driftType = Array.isArray(filters.driftType)
        ? In(filters.driftType)
        : filters.driftType;
    }

    if (filters.status) {
      where.status = Array.isArray(filters.status) ? In(filters.status) : filters.status;
    } else {
      // Default to open and acknowledged
      where.status = In(['open', 'acknowledged']);
    }

    if (filters.severity) {
      where.severity = Array.isArray(filters.severity) ? In(filters.severity) : filters.severity;
    }

    if (filters.overdueOnly) {
      where.dueAt = LessThanOrEqual(new Date());
    }

    const [items, total] = await this.repository.findAndCount({
      where,
      order: { severity: 'ASC', ageDays: 'DESC' }, // Critical first, oldest first
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });

    return { items, total };
  }

  /**
   * Get aging summary (counts by age buckets)
   */
  async getAgingSummary(projectId?: string): Promise<AgingSummary> {
    const baseWhere: FindOptionsWhere<DriftDebt> = {
      status: In(['open', 'acknowledged']),
    };

    if (projectId) {
      baseWhere.projectId = projectId;
    }

    const result = await this.repository
      .createQueryBuilder('dd')
      .select([
        'SUM(CASE WHEN dd."ageDays" < 3 THEN 1 ELSE 0 END) AS "bucket0to3Days"',
        'SUM(CASE WHEN dd."ageDays" >= 3 AND dd."ageDays" < 7 THEN 1 ELSE 0 END) AS "bucket3to7Days"',
        'SUM(CASE WHEN dd."ageDays" >= 7 AND dd."ageDays" < 14 THEN 1 ELSE 0 END) AS "bucket7to14Days"',
        'SUM(CASE WHEN dd."ageDays" >= 14 THEN 1 ELSE 0 END) AS "bucket14PlusDays"',
        'COUNT(*) AS "total"',
      ])
      .where('dd.status IN (:...statuses)', { statuses: ['open', 'acknowledged'] })
      .andWhere(projectId ? 'dd."projectId" = :projectId' : '1=1', { projectId })
      .getRawOne();

    return {
      bucket0to3Days: Number(result?.bucket0to3Days ?? 0),
      bucket3to7Days: Number(result?.bucket3to7Days ?? 0),
      bucket7to14Days: Number(result?.bucket7to14Days ?? 0),
      bucket14PlusDays: Number(result?.bucket14PlusDays ?? 0),
      total: Number(result?.total ?? 0),
    };
  }

  /**
   * Get overdue drift items (past dueAt)
   */
  async getOverdueDrift(projectId?: string): Promise<DriftDebt[]> {
    const where: FindOptionsWhere<DriftDebt> = {
      status: In(['open', 'acknowledged']),
      dueAt: LessThanOrEqual(new Date()),
    };

    if (projectId) {
      where.projectId = projectId;
    }

    return this.repository.find({
      where,
      order: { dueAt: 'ASC', severity: 'ASC' },
    });
  }

  /**
   * Find by ID
   */
  async findById(id: string): Promise<DriftDebt | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * Acknowledge drift item (mark as acknowledged with optional comment)
   */
  async acknowledgeDrift(id: string, comment?: string): Promise<void> {
    if (comment) {
      const drift = await this.findById(id);
      if (drift) {
        await this.repository.update(id, {
          status: 'acknowledged' as const,
          metadata: {
            ...drift.metadata,
            acknowledgeComment: comment,
            acknowledgedAt: new Date().toISOString(),
          },
        });
        return;
      }
    }

    await this.repository.update(id, {
      status: 'acknowledged' as const,
    });
  }

  /**
   * Waive drift item (with required justification)
   */
  async waiveDrift(id: string, justification: string): Promise<void> {
    await this.repository.update(id, {
      status: 'waived' as const,
      exceptionJustification: justification,
      metadata: {
        waivedAt: new Date().toISOString(),
        waiverJustification: justification,
      },
    });
  }

  /**
   * Update severity based on age
   */
  async updateSeverity(id: string, severity: DriftDebtSeverity): Promise<void> {
    await this.repository.update(id, { severity });
  }

  /**
   * Update due date
   */
  async updateDueDate(id: string, dueAt: Date): Promise<void> {
    await this.repository.update(id, { dueAt });
  }

  /**
   * Get counts by type for open drift
   */
  async getCountsByType(projectId?: string): Promise<Record<DriftType, number>> {
    const queryBuilder = this.repository
      .createQueryBuilder('dd')
      .select('dd."driftType"', 'driftType')
      .addSelect('COUNT(*)', 'count')
      .where('dd.status IN (:...statuses)', { statuses: ['open', 'acknowledged'] })
      .groupBy('dd."driftType"');

    if (projectId) {
      queryBuilder.andWhere('dd."projectId" = :projectId', { projectId });
    }

    const results = await queryBuilder.getRawMany();

    const counts: Record<DriftType, number> = {
      orphan_test: 0,
      commitment_backlog: 0,
      stale_coupling: 0,
      uncovered_code: 0,
    };

    for (const row of results) {
      counts[row.driftType as DriftType] = Number(row.count);
    }

    return counts;
  }

  /**
   * Get counts by severity for open drift
   */
  async getCountsBySeverity(projectId?: string): Promise<Record<DriftDebtSeverity, number>> {
    const queryBuilder = this.repository
      .createQueryBuilder('dd')
      .select('dd."severity"', 'severity')
      .addSelect('COUNT(*)', 'count')
      .where('dd.status IN (:...statuses)', { statuses: ['open', 'acknowledged'] })
      .groupBy('dd."severity"');

    if (projectId) {
      queryBuilder.andWhere('dd."projectId" = :projectId', { projectId });
    }

    const results = await queryBuilder.getRawMany();

    const counts: Record<DriftDebtSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const row of results) {
      counts[row.severity as DriftDebtSeverity] = Number(row.count);
    }

    return counts;
  }

  /**
   * Get all open drift items for resolution checking
   */
  async getAllOpenDrift(): Promise<DriftDebt[]> {
    return this.repository.find({
      where: { status: In(['open', 'acknowledged']) },
    });
  }

  /**
   * Get total count of open drift
   */
  async getTotalOpenCount(projectId?: string): Promise<number> {
    const where: FindOptionsWhere<DriftDebt> = {
      status: In(['open', 'acknowledged']),
    };

    if (projectId) {
      where.projectId = projectId;
    }

    return this.repository.count({ where });
  }

  /**
   * Get count of overdue drift items
   */
  async getOverdueCount(projectId?: string): Promise<number> {
    const where: FindOptionsWhere<DriftDebt> = {
      status: In(['open', 'acknowledged']),
      dueAt: LessThanOrEqual(new Date()),
    };

    if (projectId) {
      where.projectId = projectId;
    }

    return this.repository.count({ where });
  }
}
