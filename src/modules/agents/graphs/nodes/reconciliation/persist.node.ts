/**
 * Persist Node
 *
 * Builds the reconciliation patch and stores results using the persistence schema.
 * Creates the final ReconciliationResult.
 *
 * **Phase 3.6 Updates**:
 * - Uses ReconciliationRepository for database persistence
 * - Creates ReconciliationRun, AtomRecommendation, MoleculeRecommendation, TestRecord entities
 * - Stores current commit hash for next delta baseline
 *
 * @see docs/implementation-checklist-phase5.md Section 1.11
 * @see docs/implementation-checklist-phase5.md Section 3.6
 */

import { v4 as uuidv4 } from 'uuid';
import { NodeConfig } from '../types';
import {
  ReconciliationGraphStateType,
  InferredAtom,
  InferredMolecule,
} from '../../types/reconciliation-state';
import {
  ReconciliationPatch,
  PatchOp,
  createAtomOp,
  createMoleculeOp,
  attachTestToAtomOp,
} from '../../types/reconciliation-patch';
import { ReconciliationResult, ReconciliationStatus } from '../../types/reconciliation-result';
import { ReconciliationRepository } from '../../../repositories/reconciliation.repository';
import { getCurrentCommitHash } from '../../../utils/git-utils';
import type { DriftDetectionService } from '../../../../drift/drift-detection.service';
import type { DriftDetectionResult } from '../../../../drift/entities/drift-debt.entity';

/**
 * Options for customizing persist node behavior
 */
export interface PersistNodeOptions {
  /** Whether to auto-create atoms (vs storing as recommendations) */
  autoCreateAtoms?: boolean;
  /** Whether to include attach test ops in patch */
  includeAttachTestOps?: boolean;
  /** Optional injected repository (for testing or when not using DI) */
  repository?: ReconciliationRepository;
  /** Whether to persist to database (default: true if repository available) */
  persistToDatabase?: boolean;
  /** Optional drift detection service for Phase 16 integration */
  driftDetectionService?: DriftDetectionService;
}

/**
 * Build patch ops from inferred atoms
 */
function buildAtomOps(atoms: InferredAtom[], qualityThreshold: number): PatchOp[] {
  const ops: PatchOp[] = [];

  for (const atom of atoms) {
    // Only include atoms that meet quality threshold
    if ((atom.qualityScore || atom.confidence) >= qualityThreshold) {
      ops.push(
        createAtomOp({
          tempId: atom.tempId,
          description: atom.description,
          category: atom.category,
          sourceTest: atom.sourceTest,
          observableOutcomes: atom.observableOutcomes,
          confidence: atom.confidence,
          ambiguityReasons: atom.ambiguityReasons,
          qualityScore: atom.qualityScore,
        }),
      );
    }
  }

  return ops;
}

/**
 * Build patch ops from inferred molecules
 */
function buildMoleculeOps(molecules: InferredMolecule[], validAtomTempIds: Set<string>): PatchOp[] {
  const ops: PatchOp[] = [];

  for (const molecule of molecules) {
    // Only include atoms that are in the patch
    const validAtomIds = molecule.atomTempIds.filter((id) => validAtomTempIds.has(id));

    if (validAtomIds.length > 0) {
      ops.push(
        createMoleculeOp({
          tempId: molecule.tempId,
          name: molecule.name,
          description: molecule.description,
          atomTempIds: validAtomIds,
          confidence: molecule.confidence,
        }),
      );
    }
  }

  return ops;
}

/**
 * Build attach test to atom ops
 */
function buildAttachTestOps(atoms: InferredAtom[], validAtomTempIds: Set<string>): PatchOp[] {
  const ops: PatchOp[] = [];

  for (const atom of atoms) {
    if (validAtomTempIds.has(atom.tempId)) {
      ops.push(
        attachTestToAtomOp({
          testFilePath: atom.sourceTest.filePath,
          testName: atom.sourceTest.testName,
          testLineNumber: atom.sourceTest.lineNumber,
          atomTempId: atom.tempId,
          injectAnnotation: false, // Don't inject by default
        }),
      );
    }
  }

  return ops;
}

/**
 * Creates the persist node for the reconciliation graph.
 *
 * This node:
 * 1. Creates ReconciliationRun record in database
 * 2. Creates AtomRecommendation records for each inferred atom
 * 3. Creates MoleculeRecommendation records for each inferred molecule
 * 4. Creates TestRecord records for each analyzed test
 * 5. Builds ReconciliationPatch from ops
 * 6. Calculates summary statistics
 * 7. Builds final ReconciliationResult
 * 8. Stores current commit hash for next delta baseline
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createPersistNode(options: PersistNodeOptions = {}) {
  const includeAttachTestOps = options.includeAttachTestOps ?? true;
  const persistToDatabase = options.persistToDatabase ?? true;

  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const inferredAtoms = state.inferredAtoms || [];
      const inferredMolecules = state.inferredMolecules || [];
      const orphanTests = state.orphanTests || [];
      const startTime = state.startTime || new Date();
      const mode = state.input?.reconciliationMode || 'full-scan';
      const qualityThreshold = state.input?.options?.qualityThreshold || 80;
      const rootDirectory = state.rootDirectory;

      config.logger?.log(
        `[PersistNode] Building reconciliation patch (${inferredAtoms.length} atoms, ${inferredMolecules.length} molecules)`,
      );

      // Use interim run ID if available, then input runId, otherwise generate new one
      // This ensures consistency: service → interim-persist → persist all use the same ID
      const runId = state.interimRunId || state.input?.runId || `REC-${uuidv4().substring(0, 8)}`;
      const hasInterimRun = !!state.interimRunUuid; // Check for UUID, not just ID

      if (hasInterimRun) {
        config.logger?.log(`[PersistNode] Using interim run ${runId}`);
      }

      // Get current commit hash for baseline tracking
      let currentCommitHash: string | undefined;
      try {
        currentCommitHash = (await getCurrentCommitHash(rootDirectory)) || undefined;
        config.logger?.log(`[PersistNode] Current commit: ${currentCommitHash}`);
      } catch {
        config.logger?.warn('[PersistNode] Could not get current commit hash');
      }

      // Build patch ops
      const atomOps = buildAtomOps(inferredAtoms, qualityThreshold);
      const validAtomTempIds = new Set(
        atomOps
          .filter((op) => op.type === 'createAtom')
          .map((op) => (op as { tempId: string }).tempId),
      );

      const moleculeOps = buildMoleculeOps(inferredMolecules, validAtomTempIds);
      const attachTestOps = includeAttachTestOps
        ? buildAttachTestOps(inferredAtoms, validAtomTempIds)
        : [];

      // Combine all ops
      const allOps: PatchOp[] = [...atomOps, ...moleculeOps, ...attachTestOps];

      // Build patch
      const patch: ReconciliationPatch = {
        ops: allOps,
        metadata: {
          runId,
          createdAt: new Date(),
          mode,
          commitHash: currentCommitHash,
          baselineCommitHash: state.input?.deltaBaseline?.commitHash,
        },
      };

      // Calculate summary
      const qualityPassCount = inferredAtoms.filter(
        (a) => (a.qualityScore || a.confidence) >= qualityThreshold,
      ).length;
      const qualityFailCount = inferredAtoms.length - qualityPassCount;

      // Calculate duration
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Determine status
      let status: ReconciliationStatus = 'completed';
      if (state.errors && state.errors.length > 0) {
        status = 'failed';
      } else if (state.pendingHumanReview) {
        status = 'pending_review';
      }

      // Persist to database if repository is available
      let runUuid: string | undefined = state.interimRunUuid || undefined;
      const repository = options.repository;

      if (persistToDatabase && repository) {
        try {
          config.logger?.log('[PersistNode] Persisting to database...');

          // If we have an interim run, just update it; otherwise create new records
          if (hasInterimRun && runUuid) {
            config.logger?.log(`[PersistNode] Updating interim run ${runId}`);

            // Store patch ops
            await repository.storePatchOps(runId, allOps as unknown as Record<string, unknown>[]);

            // Update run status and summary
            await repository.updateRunStatus(runId, status, {
              totalOrphanTests: orphanTests.length,
              inferredAtomsCount: inferredAtoms.length,
              inferredMoleculesCount: inferredMolecules.length,
              qualityPassCount,
              qualityFailCount,
              changedAtomLinkedTestCount: state.changedAtomLinkedTests?.length,
              duration,
              llmCalls: state.llmCallCount || 0,
            });

            config.logger?.log(`[PersistNode] Updated run ${runId} status to ${status}`);
          } else {
            // No interim run - create full records (fallback path)
            config.logger?.log('[PersistNode] No interim run, creating full records');

            // Create reconciliation run
            const run = await repository.createRun({
              runId,
              rootDirectory,
              reconciliationMode: mode,
              deltaBaselineRunId: state.input?.deltaBaseline?.runId,
              deltaBaselineCommitHash: state.input?.deltaBaseline?.commitHash,
              currentCommitHash,
              options: (state.input?.options as Record<string, unknown>) || {},
            });
            runUuid = run.id;

            // Create atom recommendations
            const atomRecommendations = await repository.createAtomRecommendations(
              runUuid,
              inferredAtoms,
            );

            // Build mapping from tempId to UUID for molecule cross-references
            const atomTempIdToUuid = new Map<string, string>();
            for (const rec of atomRecommendations) {
              atomTempIdToUuid.set(rec.tempId, rec.id);
            }

            // Create molecule recommendations
            await repository.createMoleculeRecommendations(
              runUuid,
              inferredMolecules,
              atomTempIdToUuid,
            );

            // Create test records
            const testKeyToAtomRecId = new Map<string, string>();
            for (const atom of inferredAtoms) {
              const testKey = `${atom.sourceTest.filePath}:${atom.sourceTest.testName}`;
              const atomRecId = atomTempIdToUuid.get(atom.tempId);
              if (atomRecId) {
                testKeyToAtomRecId.set(testKey, atomRecId);
              }
            }

            await repository.createTestRecords(runUuid, orphanTests, testKeyToAtomRecId);

            // Store patch ops
            await repository.storePatchOps(runId, allOps as unknown as Record<string, unknown>[]);

            // Update run status and summary
            await repository.updateRunStatus(runId, status, {
              totalOrphanTests: orphanTests.length,
              inferredAtomsCount: inferredAtoms.length,
              inferredMoleculesCount: inferredMolecules.length,
              qualityPassCount,
              qualityFailCount,
              changedAtomLinkedTestCount: state.changedAtomLinkedTests?.length,
              duration,
              llmCalls: state.llmCallCount || 0,
            });

            config.logger?.log(
              `[PersistNode] Persisted run ${runId} with ${atomRecommendations.length} atom recommendations`,
            );
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          config.logger?.error(`[PersistNode] Database persistence failed: ${errorMessage}`);
          // Continue to build result even if persistence fails
        }
      } else {
        config.logger?.log('[PersistNode] Skipping database persistence (no repository)');
      }

      // Phase 16: Drift detection (after persistence)
      let driftDetectionResult: DriftDetectionResult | undefined;
      if (options.driftDetectionService && runUuid) {
        try {
          config.logger?.log('[PersistNode] Running drift detection...');
          driftDetectionResult = await options.driftDetectionService.detectDriftFromRun(runUuid);
          config.logger?.log(
            `[PersistNode] Drift detection complete: ` +
              `new=${driftDetectionResult.newDriftCount}, ` +
              `confirmed=${driftDetectionResult.confirmedDriftCount}, ` +
              `resolved=${driftDetectionResult.resolvedDriftCount}, ` +
              `totalOpen=${driftDetectionResult.totalOpenDrift}`,
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          config.logger?.warn(`[PersistNode] Drift detection failed: ${errorMessage}`);
          // Continue even if drift detection fails
        }
      }

      // Build result
      const result: ReconciliationResult = {
        runId,
        runUuid,
        status,
        patch,
        summary: {
          totalOrphanTests: orphanTests.length,
          inferredAtomsCount: inferredAtoms.length,
          inferredMoleculesCount: inferredMolecules.length,
          qualityPassCount,
          qualityFailCount,
          changedLinkedTestsCount: state.changedAtomLinkedTests?.length,
        },
        invariantFindings: [], // Will be populated when we add invariant checking
        metadata: {
          duration,
          llmCalls: state.llmCallCount || 0,
          mode,
          commitHash: currentCommitHash,
          baselineCommitHash: state.input?.deltaBaseline?.commitHash,
          reviewRequired: state.pendingHumanReview || false,
          phasesCompleted: [
            'structure',
            'discover',
            'context',
            'infer',
            'synthesize',
            'interim_persist',
            'verify',
            'persist',
          ],
        },
        errors: state.errors || [],
      };

      config.logger?.log(`[PersistNode] Reconciliation complete: ${runId}`);
      config.logger?.log(
        `[PersistNode] Summary: ${result.summary.totalOrphanTests} orphan tests -> ` +
          `${result.summary.inferredAtomsCount} atoms (${qualityPassCount} pass, ${qualityFailCount} fail) -> ` +
          `${result.summary.inferredMoleculesCount} molecules`,
      );
      config.logger?.log(
        `[PersistNode] Duration: ${duration}ms, LLM calls: ${result.metadata.llmCalls}`,
      );

      return {
        output: result,
      };
    };
}
