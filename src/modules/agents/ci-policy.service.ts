import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atom } from '../atoms/atom.entity';
import { ReconciliationPolicy } from './entities/reconciliation-policy.entity';

export interface CIPolicyCheckResult {
  passed: boolean;
  blocked: boolean;
  reason?: string;
  proposedAtomsCount?: number;
  reviewUrl?: string;
}

/**
 * CI Policy Enforcement Service (Phase 18)
 *
 * Enforces CI/CD pipeline policies around proposed atoms:
 * - Block builds if proposed atoms require approval
 * - Enforce quality gates based on reconciliation policies
 */
@Injectable()
export class CIPolicyService {
  private readonly logger = new Logger(CIPolicyService.name);

  constructor(
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @InjectRepository(ReconciliationPolicy)
    private readonly policyRepository: Repository<ReconciliationPolicy>,
  ) {}

  /**
   * Check if CI should be blocked due to pending proposed atoms
   */
  async checkProposedAtomsPolicy(projectId: string): Promise<CIPolicyCheckResult> {
    this.logger.log(`[CIPolicyService] Checking proposed atoms policy for project ${projectId}`);

    // Get reconciliation policy for project
    const policy = await this.policyRepository.findOne({
      where: { projectId },
    });

    if (!policy) {
      this.logger.warn(`[CIPolicyService] No policy found for project ${projectId}, allowing CI`);
      return {
        passed: true,
        blocked: false,
      };
    }

    // If CI blocking is not enabled, allow
    if (!policy.ciBlockOnProposedAtoms) {
      this.logger.log(`[CIPolicyService] CI blocking disabled for project ${projectId}`);
      return {
        passed: true,
        blocked: false,
      };
    }

    // Count proposed atoms for this project
    const proposedCount = await this.atomRepository.count({
      where: {
        status: 'proposed',
        // Note: Atoms don't have projectId, so we rely on scope filtering at application level
        // For now, count all proposed atoms (can be enhanced with project filtering later)
      },
    });

    if (proposedCount === 0) {
      this.logger.log(`[CIPolicyService] No proposed atoms, allowing CI`);
      return {
        passed: true,
        blocked: false,
        proposedAtomsCount: 0,
      };
    }

    // Block CI
    const baseUrl = process.env.PACT_BASE_URL || 'http://localhost:3000';
    const reviewUrl = `${baseUrl}/atoms/pending`;

    this.logger.warn(
      `[CIPolicyService] Blocking CI: ${proposedCount} proposed atoms require approval`,
    );

    return {
      passed: false,
      blocked: true,
      reason: `CI blocked: ${proposedCount} proposed atom${proposedCount > 1 ? 's' : ''} require human approval. Review at: ${reviewUrl}`,
      proposedAtomsCount: proposedCount,
      reviewUrl,
    };
  }

  /**
   * Full CI policy check (can be extended with additional checks)
   */
  async checkCIPolicy(projectId: string): Promise<CIPolicyCheckResult> {
    // For now, only check proposed atoms policy
    // Can be extended with other checks (quality thresholds, drift limits, etc.)
    return this.checkProposedAtomsPolicy(projectId);
  }

  /**
   * Get policy status for a project
   */
  async getPolicyStatus(projectId: string): Promise<{
    ciBlockOnProposedAtoms: boolean;
    currentProposedCount: number;
    wouldBlock: boolean;
  }> {
    const policy = await this.policyRepository.findOne({
      where: { projectId },
    });

    const proposedCount = await this.atomRepository.count({
      where: { status: 'proposed' },
    });

    return {
      ciBlockOnProposedAtoms: policy?.ciBlockOnProposedAtoms ?? false,
      currentProposedCount: proposedCount,
      wouldBlock: (policy?.ciBlockOnProposedAtoms ?? false) && proposedCount > 0,
    };
  }
}
