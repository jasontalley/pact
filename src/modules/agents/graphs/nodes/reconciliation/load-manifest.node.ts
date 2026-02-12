/**
 * Load Manifest Node
 *
 * Loads a RepoManifest from the database and hydrates the reconciliation
 * graph state with its pre-computed snapshots. This allows the graph to
 * skip the deterministic phases (structure, discover, test_quality, context)
 * and jump directly to LLM inference (infer_atoms).
 *
 * The node converts JSONB-serialized Records back into Maps where the
 * graph state expects them.
 */

import { Logger } from '@nestjs/common';
import { NodeConfig } from '../types';
import { ReconciliationGraphStateType } from '../../types/reconciliation-state';
import type { ManifestRepository } from '../../../repositories/manifest.repository';

export interface LoadManifestNodeOptions {
  /** Manifest repository for DB lookups */
  manifestRepository?: ManifestRepository;
}

/**
 * Creates the load_manifest node.
 *
 * When the graph receives a `manifestId` in its input options, this node
 * loads the manifest and converts its snapshots into graph state fields,
 * effectively replacing what structure/discover/test_quality/context would
 * have produced.
 */
export function createLoadManifestNode(options?: LoadManifestNodeOptions) {
  return (config: NodeConfig) =>
    async (
      state: ReconciliationGraphStateType,
    ): Promise<Partial<ReconciliationGraphStateType>> => {
      const logger = config.logger || new Logger('LoadManifestNode');
      const manifestId = state.input?.options?.manifestId;

      if (!manifestId) {
        throw new Error('load_manifest node invoked but no manifestId in input options');
      }

      const manifestRepository = options?.manifestRepository;
      if (!manifestRepository) {
        throw new Error('load_manifest node requires manifestRepository in options');
      }

      logger.log(`Loading manifest: ${manifestId}`);

      const manifest = await manifestRepository.findById(manifestId);
      if (!manifest) {
        throw new Error(`Manifest not found: ${manifestId}`);
      }

      if (manifest.status !== 'complete') {
        throw new Error(
          `Manifest ${manifestId} is not complete (status: ${manifest.status})`,
        );
      }

      // Hydrate graph state from manifest snapshots
      const repoStructure = manifest.repoStructureSnapshot || null;
      const orphanTests = manifest.orphanTestsSnapshot || [];
      const evidenceItems = manifest.evidenceItemsSnapshot || [];
      const coverageData = manifest.coverageDataSnapshot || null;

      // Reconstitute Maps from serialized Records
      const testQualityScores = manifest.testQualitySnapshot
        ? new Map(Object.entries(manifest.testQualitySnapshot))
        : new Map();

      const contextPerTest = manifest.contextSnapshot?.contextPerTest
        ? new Map(Object.entries(manifest.contextSnapshot.contextPerTest))
        : new Map();

      const evidenceAnalysis = manifest.contextSnapshot?.evidenceAnalysis
        ? new Map(Object.entries(manifest.contextSnapshot.evidenceAnalysis))
        : new Map();

      const documentationIndex = manifest.contextSnapshot?.documentationIndex || null;

      logger.log(
        `Manifest loaded: ${orphanTests.length} orphan tests, ` +
          `${evidenceItems.length} evidence items, ` +
          `${testQualityScores.size} quality scores`,
      );

      // Emit progress via gateway (if available through state)
      const runId = state.input?.runId || state.runId;
      if (runId) {
        logger.log(`[${runId}] Manifest ${manifestId} hydrated into graph state`);
      }

      return {
        repoStructure,
        orphanTests,
        evidenceItems,
        coverageData,
        testQualityScores,
        contextPerTest,
        evidenceAnalysis,
        documentationIndex,
        currentPhase: 'infer',
      };
    };
}
