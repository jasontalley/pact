import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReconciliationRun } from '../agents/entities/reconciliation-run.entity';
import { TestRecord } from '../agents/entities/test-record.entity';
import { Atom } from '../atoms/atom.entity';
import { AtomRecommendation } from '../agents/entities/atom-recommendation.entity';
import { DriftDebtRepository } from './repositories/drift-debt.repository';
import {
  DriftDebt,
  DriftType,
  DriftDetectionResult,
  ExceptionLane,
} from './entities/drift-debt.entity';
import { DriftPolicyService } from './drift-policy.service';

/**
 * Information about an orphan test for drift detection
 */
export interface OrphanTestInput {
  filePath: string;
  testName: string;
  lineNumber?: number;
}

/**
 * Information about a changed test that has an atom link
 */
export interface ChangedLinkedTestInput {
  filePath: string;
  testName: string;
  linkedAtomId: string;
  changeType: 'added' | 'modified' | 'deleted';
}

/**
 * DriftDetectionService detects and manages drift debt from reconciliation runs.
 *
 * Core truth model: Local = plausible, Canonical = true.
 * Only CI-attested reconciliation runs create or update drift debt records.
 * Local runs produce advisory reports but do not affect drift tracking.
 */
@Injectable()
export class DriftDetectionService {
  private readonly logger = new Logger(DriftDetectionService.name);

  constructor(
    private readonly driftDebtRepository: DriftDebtRepository,
    @InjectRepository(ReconciliationRun)
    private readonly runRepository: Repository<ReconciliationRun>,
    @InjectRepository(TestRecord)
    private readonly testRecordRepository: Repository<TestRecord>,
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @InjectRepository(AtomRecommendation)
    private readonly atomRecRepository: Repository<AtomRecommendation>,
    @Inject(forwardRef(() => DriftPolicyService))
    private readonly driftPolicyService: DriftPolicyService,
  ) {}

  /**
   * Main entry point: detect drift from a reconciliation run.
   *
   * Gate: Only CI-attested runs create/update drift records.
   * Local runs return advisory-only results (no DB writes).
   */
  async detectDriftFromRun(runId: string): Promise<DriftDetectionResult> {
    const run = await this.runRepository.findOne({ where: { id: runId } });

    if (!run) {
      this.logger.warn(`[DriftDetection] Run not found: ${runId}`);
      return this.buildEmptyResult('local');
    }

    // Check attestation type - default to 'local' if not set
    const attestationType = (run as ReconciliationRun & { attestationType?: string })
      .attestationType as 'local' | 'ci-attested' | undefined;

    if (attestationType !== 'ci-attested') {
      this.logger.log(
        `[DriftDetection] Skipping drift creation for local run ${run.runId} (advisory only)`,
      );
      return this.buildEmptyResult('local');
    }

    this.logger.log(`[DriftDetection] Processing CI-attested run: ${run.runId}`);

    let newDriftCount = 0;
    let confirmedDriftCount = 0;
    let resolvedDriftCount = 0;

    // Get test records for this run
    const testRecords = await this.testRecordRepository.find({
      where: { runId: run.id },
    });

    // 1. Detect orphan test drift (tests without @atom annotation)
    const orphanTests = testRecords.filter((tr) => !tr.hadAtomAnnotation && !tr.atomRecommendationId);

    for (const test of orphanTests) {
      const result = await this.detectOrUpdateOrphanTestDrift(run.id, test, run.projectId);
      if (result.isNew) newDriftCount++;
      else confirmedDriftCount++;
    }

    // 2. Detect commitment backlog (committed atoms without test evidence)
    const backlogResult = await this.detectCommitmentBacklog(run.id, run.projectId);
    newDriftCount += backlogResult.newCount;
    confirmedDriftCount += backlogResult.confirmedCount;

    // 3. Detect stale coupling (changed tests that have atom links)
    // This is based on changedAtomLinkedTests from delta mode
    // We don't have direct access to state here, so we detect from test records
    // that have both an annotation AND recent changes
    // For now, this is handled by detectChangedLinkedTestDrift if called explicitly

    // 4. Resolve matched drift (items that are now resolved)
    resolvedDriftCount = await this.resolveMatchedDrift(run.id);

    // 5. Apply convergence policies (update due dates and severities)
    await this.driftPolicyService.applyConvergencePolicies(run.projectId || undefined);

    // Build final result
    const [totalOpen, byType, overdueCount] = await Promise.all([
      this.driftDebtRepository.getTotalOpenCount(run.projectId || undefined),
      this.driftDebtRepository.getCountsByType(run.projectId || undefined),
      this.driftDebtRepository.getOverdueCount(run.projectId || undefined),
    ]);

    const result: DriftDetectionResult = {
      newDriftCount,
      confirmedDriftCount,
      resolvedDriftCount,
      totalOpenDrift: totalOpen,
      byType,
      overdueDrift: overdueCount,
      attestationType: 'ci-attested',
    };

    this.logger.log(
      `[DriftDetection] Complete: new=${newDriftCount}, confirmed=${confirmedDriftCount}, ` +
        `resolved=${resolvedDriftCount}, totalOpen=${totalOpen}`,
    );

    return result;
  }

  /**
   * Detect or update orphan test drift
   */
  private async detectOrUpdateOrphanTestDrift(
    runId: string,
    test: TestRecord,
    projectId: string | null,
  ): Promise<{ isNew: boolean }> {
    // Check for existing open drift for this test
    const existing = await this.driftDebtRepository.findByFilePath(
      test.filePath,
      test.testName,
      'orphan_test',
    );

    if (existing) {
      // Update confirmation
      await this.driftDebtRepository.updateConfirmation(existing.id, runId);
      return { isNew: false };
    }

    // Create new drift
    await this.driftDebtRepository.createDriftDebt({
      driftType: 'orphan_test',
      description: `Test "${test.testName}" in ${test.filePath} has no @atom annotation`,
      detectedByRunId: runId,
      projectId,
      filePath: test.filePath,
      testName: test.testName,
      severity: 'medium',
    });

    return { isNew: true };
  }

  /**
   * Detect commitment backlog (committed atoms without test evidence)
   */
  private async detectCommitmentBacklog(
    runId: string,
    projectId: string | null,
  ): Promise<{ newCount: number; confirmedCount: number }> {
    // Find committed atoms that have no accepted atom recommendations linking to tests
    // This reuses logic from CouplingMetricsService.getAtomTestCoupling()

    const committedAtoms = await this.atomRepository.find({
      where: { status: 'committed' },
    });

    if (committedAtoms.length === 0) {
      return { newCount: 0, confirmedCount: 0 };
    }

    // Get atoms that have linked test records (via accepted recommendations)
    const linkedResult = await this.atomRecRepository
      .createQueryBuilder('rec')
      .select('DISTINCT rec.atomId', 'atomId')
      .where('rec.atomId IS NOT NULL')
      .andWhere('rec.status = :status', { status: 'accepted' })
      .getRawMany();

    const linkedAtomIds = new Set(linkedResult.map((r) => r.atomId));

    let newCount = 0;
    let confirmedCount = 0;

    for (const atom of committedAtoms) {
      if (linkedAtomIds.has(atom.id)) {
        // Atom has test evidence - skip
        continue;
      }

      // Check for existing drift
      const existing = await this.driftDebtRepository.findByAtomId(atom.id, 'commitment_backlog');

      if (existing) {
        await this.driftDebtRepository.updateConfirmation(existing.id, runId);
        confirmedCount++;
      } else {
        await this.driftDebtRepository.createDriftDebt({
          driftType: 'commitment_backlog',
          description: `Committed atom "${atom.atomId}" has no linked test evidence`,
          detectedByRunId: runId,
          projectId,
          atomId: atom.id,
          atomDisplayId: atom.atomId,
          severity: 'medium',
        });
        newCount++;
      }
    }

    return { newCount, confirmedCount };
  }

  /**
   * Detect stale coupling drift from changed linked tests (delta mode)
   *
   * This should be called by the persist node when changedAtomLinkedTests data is available.
   */
  async detectStaleCouplingDrift(
    runId: string,
    changedLinkedTests: ChangedLinkedTestInput[],
    projectId: string | null,
  ): Promise<{ newCount: number; confirmedCount: number }> {
    let newCount = 0;
    let confirmedCount = 0;

    for (const test of changedLinkedTests) {
      // Only treat modified tests as potential stale coupling
      if (test.changeType !== 'modified') continue;

      const existing = await this.driftDebtRepository.findByFilePath(
        test.filePath,
        test.testName,
        'stale_coupling',
      );

      if (existing) {
        await this.driftDebtRepository.updateConfirmation(existing.id, runId);
        confirmedCount++;
      } else {
        // Look up the atom display ID
        const atom = await this.atomRepository.findOne({ where: { id: test.linkedAtomId } });

        await this.driftDebtRepository.createDriftDebt({
          driftType: 'stale_coupling',
          description: `Test "${test.testName}" was modified but links to atom ${atom?.atomId || test.linkedAtomId}. Review if coupling is still accurate.`,
          detectedByRunId: runId,
          projectId,
          filePath: test.filePath,
          testName: test.testName,
          atomId: test.linkedAtomId,
          atomDisplayId: atom?.atomId || null,
          severity: 'low',
        });
        newCount++;
      }
    }

    return { newCount, confirmedCount };
  }

  /**
   * Detect uncovered code drift (source files without any atom coverage)
   *
   * This requires file analysis beyond test records. For now, this is
   * detected from test record file paths that have no atom linkage.
   */
  async detectUncoveredCodeDrift(
    runId: string,
    uncoveredFilePaths: string[],
    projectId: string | null,
  ): Promise<{ newCount: number; confirmedCount: number }> {
    let newCount = 0;
    let confirmedCount = 0;

    for (const filePath of uncoveredFilePaths) {
      const existing = await this.driftDebtRepository.findByFilePath(
        filePath,
        null,
        'uncovered_code',
      );

      if (existing) {
        await this.driftDebtRepository.updateConfirmation(existing.id, runId);
        confirmedCount++;
      } else {
        await this.driftDebtRepository.createDriftDebt({
          driftType: 'uncovered_code',
          description: `Source file "${filePath}" has no test coverage linked to atoms`,
          detectedByRunId: runId,
          projectId,
          filePath,
          severity: 'low',
        });
        newCount++;
      }
    }

    return { newCount, confirmedCount };
  }

  /**
   * Resolve drift items that are now addressed
   */
  private async resolveMatchedDrift(runId: string): Promise<number> {
    const openDrift = await this.driftDebtRepository.getAllOpenDrift();
    const toResolve: string[] = [];

    for (const drift of openDrift) {
      const shouldResolve = await this.checkIfDriftResolved(drift);
      if (shouldResolve) {
        toResolve.push(drift.id);
      }
    }

    if (toResolve.length > 0) {
      await this.driftDebtRepository.bulkResolveDrift(toResolve, runId);
    }

    return toResolve.length;
  }

  /**
   * Check if a specific drift item is resolved
   */
  private async checkIfDriftResolved(drift: DriftDebt): Promise<boolean> {
    switch (drift.driftType) {
      case 'orphan_test':
        // Check if test now has atom annotation or accepted recommendation
        if (drift.filePath && drift.testName) {
          const testRecord = await this.testRecordRepository.findOne({
            where: { filePath: drift.filePath, testName: drift.testName },
            order: { createdAt: 'DESC' },
          });

          if (testRecord && (testRecord.hadAtomAnnotation || testRecord.atomRecommendationId)) {
            return true;
          }
        }
        break;

      case 'commitment_backlog':
        // Check if atom now has accepted test evidence
        if (drift.atomId) {
          const linkedRec = await this.atomRecRepository.findOne({
            where: { atomId: drift.atomId, status: 'accepted' },
          });

          if (linkedRec) {
            return true;
          }
        }
        break;

      case 'stale_coupling':
        // Stale coupling resolves when test is re-reconciled without changes
        // For now, keep open until manually resolved or test passes re-analysis
        // Future: track test content hash and resolve when unchanged
        break;

      case 'uncovered_code':
        // Check if file now has tests with atom linkage
        if (drift.filePath) {
          const linkedTest = await this.testRecordRepository.findOne({
            where: { filePath: drift.filePath },
          });

          if (linkedTest && (linkedTest.hadAtomAnnotation || linkedTest.atomRecommendationId)) {
            return true;
          }
        }
        break;
    }

    return false;
  }

  /**
   * Build an empty result for non-CI-attested runs
   */
  private buildEmptyResult(attestationType: 'local' | 'ci-attested'): DriftDetectionResult {
    return {
      newDriftCount: 0,
      confirmedDriftCount: 0,
      resolvedDriftCount: 0,
      totalOpenDrift: 0,
      byType: {
        orphan_test: 0,
        commitment_backlog: 0,
        stale_coupling: 0,
        uncovered_code: 0,
      },
      overdueDrift: 0,
      attestationType,
    };
  }

  /**
   * Manually trigger drift detection for a specific run
   */
  async triggerDetection(runId: string): Promise<DriftDetectionResult> {
    return this.detectDriftFromRun(runId);
  }
}
