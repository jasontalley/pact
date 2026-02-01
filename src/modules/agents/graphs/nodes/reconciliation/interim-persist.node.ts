/**
 * Interim Persist Node
 *
 * Saves interim results (inferred atoms and molecules) to database before verification.
 * This ensures that if the verify step fails or the process crashes, we don't lose
 * the expensive LLM inference work.
 *
 * Results are saved with status='pending_verification' and can be recovered via
 * the recovery endpoint.
 *
 * @see docs/implementation-checklist-phase6.md Section 2.1
 */

import { v4 as uuidv4 } from 'uuid';
import { NodeConfig } from '../types';
import { ReconciliationGraphStateType } from '../../types/reconciliation-state';
import { ReconciliationRepository } from '../../../repositories/reconciliation.repository';
import { getCurrentCommitHash } from '../../../utils/git-utils';

/**
 * Options for customizing interim persist node behavior
 */
export interface InterimPersistNodeOptions {
  /** Optional injected repository (for testing or when not using DI) */
  repository?: ReconciliationRepository;
  /** Whether to persist to database (default: true if repository available) */
  persistToDatabase?: boolean;
}

/**
 * Creates the interim persist node for the reconciliation graph.
 *
 * This node:
 * 1. Creates a ReconciliationRun record with status 'running'
 * 2. Creates AtomRecommendation records for each inferred atom
 * 3. Creates MoleculeRecommendation records for each inferred molecule
 * 4. Stores the run ID in state for the final persist node
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createInterimPersistNode(options: InterimPersistNodeOptions = {}) {
  const persistToDatabase = options.persistToDatabase ?? true;

  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const inferredAtoms = state.inferredAtoms || [];
      const inferredMolecules = state.inferredMolecules || [];
      const orphanTests = state.orphanTests || [];
      const mode = state.input?.reconciliationMode || 'full-scan';
      const rootDirectory = state.rootDirectory;

      config.logger?.log(
        `[InterimPersistNode] Saving interim results (${inferredAtoms.length} atoms, ${inferredMolecules.length} molecules)`,
      );

      // Skip if no atoms or molecules to save
      if (inferredAtoms.length === 0 && inferredMolecules.length === 0) {
        config.logger?.log('[InterimPersistNode] No atoms or molecules to save, skipping');
        return {};
      }

      const repository = options.repository;

      if (!persistToDatabase || !repository) {
        config.logger?.log('[InterimPersistNode] Skipping database persistence (no repository)');
        return {};
      }

      try {
        // Generate run ID
        const runId = `REC-${uuidv4().substring(0, 8)}`;

        // Get current commit hash
        let currentCommitHash: string | undefined;
        try {
          currentCommitHash = (await getCurrentCommitHash(rootDirectory)) || undefined;
        } catch {
          config.logger?.warn('[InterimPersistNode] Could not get current commit hash');
        }

        // Create reconciliation run with 'running' status
        const run = await repository.createRun({
          runId,
          rootDirectory,
          reconciliationMode: mode,
          deltaBaselineRunId: state.input?.deltaBaseline?.runId,
          deltaBaselineCommitHash: state.input?.deltaBaseline?.commitHash,
          currentCommitHash,
          options: (state.input?.options as Record<string, unknown>) || {},
        });

        config.logger?.log(`[InterimPersistNode] Created run ${runId} (UUID: ${run.id})`);

        // Create atom recommendations
        const atomRecommendations = await repository.createAtomRecommendations(
          run.id,
          inferredAtoms,
        );

        // Build mapping from tempId to UUID for molecule cross-references
        const atomTempIdToUuid = new Map<string, string>();
        for (const rec of atomRecommendations) {
          atomTempIdToUuid.set(rec.tempId, rec.id);
        }

        // Create molecule recommendations
        await repository.createMoleculeRecommendations(run.id, inferredMolecules, atomTempIdToUuid);

        // Create test records
        const testKeyToAtomRecId = new Map<string, string>();
        for (const atom of inferredAtoms) {
          const testKey = `${atom.sourceTest.filePath}:${atom.sourceTest.testName}`;
          const atomRecId = atomTempIdToUuid.get(atom.tempId);
          if (atomRecId) {
            testKeyToAtomRecId.set(testKey, atomRecId);
          }
        }

        await repository.createTestRecords(run.id, orphanTests, testKeyToAtomRecId);

        config.logger?.log(
          `[InterimPersistNode] Saved ${atomRecommendations.length} atom recommendations, ` +
            `ready for verification`,
        );

        // Return run info for final persist node
        return {
          interimRunId: runId,
          interimRunUuid: run.id,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        config.logger?.error(`[InterimPersistNode] Database persistence failed: ${errorMessage}`);
        // Don't fail the graph - just log and continue without interim persistence
        return {};
      }
    };
}
