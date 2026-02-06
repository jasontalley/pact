import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project, DriftPolicies } from '../projects/project.entity';
import { DriftDebtRepository } from './repositories/drift-debt.repository';
import { DriftDebt, DriftDebtSeverity, ExceptionLane } from './entities/drift-debt.entity';

/**
 * Default drift convergence policies
 */
export const DEFAULT_DRIFT_POLICIES: Required<DriftPolicies> = {
  normalConvergenceDays: 14,
  hotfixConvergenceDays: 3,
  spikeConvergenceDays: 7,
  highSeverityDays: 7,
  criticalSeverityDays: 14,
  blockOnOverdueDrift: false,
};

/**
 * Convergence report for a project
 */
export interface ConvergenceReport {
  onTrackCount: number;
  atRiskCount: number; // Within 2 days of due date
  overdueCount: number;
  totalOpen: number;
  convergenceScore: number; // 0-100
  blocking: boolean;
}

/**
 * DriftPolicyService manages convergence policies and deadline calculations
 */
@Injectable()
export class DriftPolicyService {
  private readonly logger = new Logger(DriftPolicyService.name);

  constructor(
    @Inject(forwardRef(() => DriftDebtRepository))
    private readonly driftDebtRepository: DriftDebtRepository,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  /**
   * Get effective convergence policy for a project
   */
  async getConvergencePolicy(projectId?: string): Promise<Required<DriftPolicies>> {
    if (!projectId) {
      return { ...DEFAULT_DRIFT_POLICIES };
    }

    const project = await this.projectRepository.findOne({ where: { id: projectId } });

    if (!project || !project.settings.driftPolicies) {
      return { ...DEFAULT_DRIFT_POLICIES };
    }

    // Merge with defaults
    return {
      normalConvergenceDays:
        project.settings.driftPolicies.normalConvergenceDays ??
        DEFAULT_DRIFT_POLICIES.normalConvergenceDays,
      hotfixConvergenceDays:
        project.settings.driftPolicies.hotfixConvergenceDays ??
        DEFAULT_DRIFT_POLICIES.hotfixConvergenceDays,
      spikeConvergenceDays:
        project.settings.driftPolicies.spikeConvergenceDays ??
        DEFAULT_DRIFT_POLICIES.spikeConvergenceDays,
      highSeverityDays:
        project.settings.driftPolicies.highSeverityDays ?? DEFAULT_DRIFT_POLICIES.highSeverityDays,
      criticalSeverityDays:
        project.settings.driftPolicies.criticalSeverityDays ??
        DEFAULT_DRIFT_POLICIES.criticalSeverityDays,
      blockOnOverdueDrift:
        project.settings.driftPolicies.blockOnOverdueDrift ??
        DEFAULT_DRIFT_POLICIES.blockOnOverdueDrift,
    };
  }

  /**
   * Compute deadline for a drift item based on its exception lane and policy
   */
  computeDeadline(driftDetectedAt: Date, exceptionLane: ExceptionLane | null, policy: Required<DriftPolicies>): Date {
    let convergenceDays: number;

    switch (exceptionLane) {
      case 'hotfix-exception':
        convergenceDays = policy.hotfixConvergenceDays;
        break;
      case 'spike-exception':
        convergenceDays = policy.spikeConvergenceDays;
        break;
      case 'normal':
      default:
        convergenceDays = policy.normalConvergenceDays;
        break;
    }

    const deadline = new Date(driftDetectedAt);
    deadline.setDate(deadline.getDate() + convergenceDays);

    return deadline;
  }

  /**
   * Compute severity based on age and policy thresholds
   *
   * Severity escalation:
   * - 0 to highSeverityDays: medium
   * - highSeverityDays to criticalSeverityDays: high
   * - criticalSeverityDays+: critical
   */
  computeSeverity(ageDays: number, policy: Required<DriftPolicies>): DriftDebtSeverity {
    if (ageDays >= policy.criticalSeverityDays) {
      return 'critical';
    }
    if (ageDays >= policy.highSeverityDays) {
      return 'high';
    }
    return 'medium';
  }

  /**
   * Apply convergence policies to all open drift items
   * Updates due dates and escalates severity based on age
   */
  async applyConvergencePolicies(projectId?: string): Promise<void> {
    const policy = await this.getConvergencePolicy(projectId);
    const { items: openDrift } = await this.driftDebtRepository.listOpenDrift({
      projectId,
      limit: 1000, // Process in batches if needed
    });

    for (const drift of openDrift) {
      // Update due date if not set
      if (!drift.dueAt) {
        const dueAt = this.computeDeadline(
          new Date(drift.detectedAt),
          drift.exceptionLane,
          policy,
        );
        await this.driftDebtRepository.updateDueDate(drift.id, dueAt);
      }

      // Update severity based on age
      const expectedSeverity = this.computeSeverity(drift.ageDays, policy);
      if (drift.severity !== expectedSeverity && expectedSeverity !== 'low') {
        // Only escalate severity, never downgrade
        const severityOrder: DriftDebtSeverity[] = ['low', 'medium', 'high', 'critical'];
        const currentIndex = severityOrder.indexOf(drift.severity);
        const expectedIndex = severityOrder.indexOf(expectedSeverity);

        if (expectedIndex > currentIndex) {
          await this.driftDebtRepository.updateSeverity(drift.id, expectedSeverity);
          this.logger.log(
            `[DriftPolicy] Escalated drift ${drift.id} severity from ${drift.severity} to ${expectedSeverity}`,
          );
        }
      }
    }
  }

  /**
   * Evaluate convergence status for a project
   */
  async evaluateConvergence(projectId?: string): Promise<ConvergenceReport> {
    const now = new Date();
    const { items: openDrift } = await this.driftDebtRepository.listOpenDrift({
      projectId,
      limit: 10000, // Get all for evaluation
    });

    let onTrackCount = 0;
    let atRiskCount = 0;
    let overdueCount = 0;

    for (const drift of openDrift) {
      if (!drift.dueAt) {
        // No due date = on track (will be set on next policy application)
        onTrackCount++;
        continue;
      }

      const dueDate = new Date(drift.dueAt);
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue < 0) {
        overdueCount++;
      } else if (daysUntilDue <= 2) {
        atRiskCount++;
      } else {
        onTrackCount++;
      }
    }

    const totalOpen = openDrift.length;
    const convergenceScore = totalOpen > 0 ? Math.round(((onTrackCount + atRiskCount * 0.5) / totalOpen) * 100) : 100;

    const policy = await this.getConvergencePolicy(projectId);
    const blocking = policy.blockOnOverdueDrift && overdueCount > 0;

    return {
      onTrackCount,
      atRiskCount,
      overdueCount,
      totalOpen,
      convergenceScore,
      blocking,
    };
  }

  /**
   * Check if there is blocking drift (overdue + blockOnOverdueDrift enabled)
   */
  async isBlocking(projectId?: string): Promise<boolean> {
    const report = await this.evaluateConvergence(projectId);
    return report.blocking;
  }
}
