import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AtomInferenceService } from './atom-inference.service';
import { Atom } from '../atoms/atom.entity';
import { ReconciliationPolicy } from './entities/reconciliation-policy.entity';
import { OrphanTestInfo } from './graphs/types/reconciliation-state';

/**
 * Result of inferring atoms from orphan tests during reconciliation
 */
export interface OrphanInferenceResult {
  /** Total orphan tests analyzed */
  totalOrphans: number;
  /** Proposed atoms created */
  proposedAtoms: Array<{
    atomId: string;
    testFile: string;
    testName: string;
    description: string;
    confidence: number;
    reviewUrl: string;
  }>;
  /** Orphans skipped (low confidence or policy disabled) */
  skippedOrphans: number;
}

/**
 * Service for inferring and creating proposed atoms from orphan tests
 * during reconciliation runs.
 *
 * Phase 18: Integrates AtomInferenceService with reconciliation workflow
 */
@Injectable()
export class ReconciliationAtomInferenceService {
  private readonly logger = new Logger(ReconciliationAtomInferenceService.name);

  constructor(
    private readonly atomInferenceService: AtomInferenceService,
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @InjectRepository(ReconciliationPolicy)
    private readonly policyRepository: Repository<ReconciliationPolicy>,
  ) {}

  /**
   * Infer and create proposed atoms for orphan tests
   *
   * Checks reconciliation policy, infers atoms using LLM,
   * and creates proposed atoms in database for HITL review.
   *
   * @param projectId - Project ID for policy lookup
   * @param orphanTests - List of orphan tests from reconciliation
   * @param runId - Reconciliation run ID for traceability
   * @returns Results including proposed atoms created
   */
  async inferAtomsForOrphans(
    projectId: string,
    orphanTests: OrphanTestInfo[],
    runId: string,
  ): Promise<OrphanInferenceResult> {
    this.logger.log(
      `[ReconciliationAtomInference] Processing ${orphanTests.length} orphan tests for project ${projectId}`,
    );

    // Check policy: is reconciliation inference enabled?
    const policy = await this.policyRepository.findOne({
      where: { projectId },
    });

    if (!policy || !policy.reconciliationInfersAtoms) {
      this.logger.log('[ReconciliationAtomInference] Policy disabled, skipping inference');
      return {
        totalOrphans: orphanTests.length,
        proposedAtoms: [],
        skippedOrphans: orphanTests.length,
      };
    }

    const minConfidence = policy.minConfidenceForSuggestion || 0.75;
    const proposedAtoms: OrphanInferenceResult['proposedAtoms'] = [];
    let skippedCount = 0;

    // Infer atoms for each orphan test
    for (const orphan of orphanTests) {
      try {
        // Get test code (simplified - in real implementation would read from file)
        const testCode = orphan.testCode || `// Test: ${orphan.testName}`;

        // Infer atom from test
        const inferred = await this.atomInferenceService.inferAtomFromTest(
          orphan.filePath,
          orphan.testName,
          testCode,
        );

        // Check confidence threshold
        if (inferred.confidence < minConfidence) {
          this.logger.debug(
            `[ReconciliationAtomInference] Skipping ${orphan.testName}: confidence ${inferred.confidence} < ${minConfidence}`,
          );
          skippedCount++;
          continue;
        }

        // Create proposed atom
        const proposedAtomId = await this.generateProposedAtomId();
        const atom = this.atomRepository.create({
          atomId: proposedAtomId,
          description: inferred.description,
          category: inferred.category,
          status: 'proposed',
          source: 'reconciliation_inference',
          confidence: inferred.confidence,
          rationale: inferred.rationale,
          observableOutcomes: inferred.validators.map((v) => ({
            description: v,
            measurementCriteria: undefined,
          })),
          proposedBy: `reconciliation-${runId}`,
          intentIdentity: undefined,
          intentVersion: 1,
          metadata: {
            inferenceEvidence: inferred.evidence,
            sourceOrphanTest: {
              filePath: orphan.filePath,
              testName: orphan.testName,
              runId,
            },
          },
        });

        const savedAtom = await this.atomRepository.save(atom);

        proposedAtoms.push({
          atomId: savedAtom.atomId,
          testFile: orphan.filePath,
          testName: orphan.testName,
          description: savedAtom.description,
          confidence: savedAtom.confidence!,
          reviewUrl: `/atoms/${savedAtom.id}/review`,
        });

        this.logger.log(
          `[ReconciliationAtomInference] Created proposed atom ${savedAtom.atomId} for ${orphan.testName} (confidence: ${inferred.confidence})`,
        );
      } catch (error) {
        this.logger.error(
          `[ReconciliationAtomInference] Failed to infer atom for ${orphan.testName}:`,
          error,
        );
        skippedCount++;
      }
    }

    this.logger.log(
      `[ReconciliationAtomInference] Completed: ${proposedAtoms.length} atoms proposed, ${skippedCount} skipped`,
    );

    return {
      totalOrphans: orphanTests.length,
      proposedAtoms,
      skippedOrphans: skippedCount,
    };
  }

  /**
   * Generate a proposed atom ID (IA-NEW-xxx format)
   */
  private async generateProposedAtomId(): Promise<string> {
    // Find the highest IA-NEW-xxx ID
    const latestProposed = await this.atomRepository
      .createQueryBuilder('atom')
      .where("atom.atomId LIKE 'IA-NEW-%'")
      .orderBy('CAST(SUBSTRING(atom.atomId, 8) AS INTEGER)', 'DESC')
      .getOne();

    if (latestProposed) {
      const match = latestProposed.atomId.match(/IA-NEW-(\d+)/);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        return `IA-NEW-${String(nextNum).padStart(3, '0')}`;
      }
    }

    return 'IA-NEW-001';
  }
}
