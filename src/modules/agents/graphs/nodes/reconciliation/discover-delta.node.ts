/**
 * Discover Delta Node
 *
 * Discovers orphan tests that changed since a baseline commit.
 * This is used for delta mode (incremental reconciliation).
 *
 * Uses the `discover_orphans_delta` tool via ToolRegistryService.
 *
 * **Critical Invariants Enforced**:
 * - INV-R001: Changed atom-linked tests MUST NOT flow to infer_atoms
 * - INV-R002: Tests with terminal status (accepted/rejected) are excluded
 *
 * @see docs/implementation-checklist-phase5.md Section 1.6 (stub)
 * @see docs/implementation-checklist-phase5.md Section 3.2 (full implementation)
 */

import { NodeConfig } from '../types';
import {
  ReconciliationGraphStateType,
  OrphanTestInfo,
  ChangedAtomLinkedTest,
} from '../../types/reconciliation-state';
import {
  DeltaDiscoveryResult,
  AtomLinkedTestInfo,
} from '../../../tools/reconciliation-tools.service';
import { createDiscoverFullscanNode } from './discover-fullscan.node';

/**
 * Options for customizing discover delta node behavior
 */
export interface DiscoverDeltaNodeOptions {
  /** Maximum tests to process (for large repos) */
  maxTests?: number;
  /** Lines before test to look for @atom annotation */
  annotationLookback?: number;
  /** Use tool-based discovery (default: true) */
  useTool?: boolean;
  /** Whether to query TestRecord for closed tests (INV-R002) */
  enforceClosureRule?: boolean;
}

/**
 * Convert AtomLinkedTestInfo to ChangedAtomLinkedTest format for state
 */
function convertAtomLinkedTests(tests: AtomLinkedTestInfo[]): ChangedAtomLinkedTest[] {
  return tests.map((t) => ({
    filePath: t.filePath,
    testName: t.testName,
    lineNumber: t.lineNumber,
    linkedAtomId: t.atomId,
    changeType: 'modified' as const,
  }));
}

/**
 * Creates the discover delta node for the reconciliation graph.
 *
 * This node:
 * 1. Calls the `discover_orphans_delta` tool with baseline info
 * 2. Enforces INV-R002: Excludes tests with terminal status from prior runs
 * 3. Enforces INV-R001: Separates changedAtomLinkedTests (for warnings only)
 * 4. Falls back to fullscan if delta detection fails
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createDiscoverDeltaNode(options: DiscoverDeltaNodeOptions = {}) {
  const maxTests = options.maxTests || 5000;
  const useTool = options.useTool ?? true;
  const enforceClosureRule = options.enforceClosureRule ?? true;

  // Keep fullscan node as fallback
  const fullscanNode = createDiscoverFullscanNode({
    maxTests: options.maxTests,
    annotationLookback: options.annotationLookback,
    useTool,
  });

  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const rootDirectory = state.rootDirectory;
      const baseline = state.input?.deltaBaseline;
      const inputMaxTests = state.input?.options?.maxTests || maxTests;

      config.logger?.log(`[DiscoverDeltaNode] Discovering delta orphan tests (useTool=${useTool})`);
      config.logger?.log(
        `[DiscoverDeltaNode] Baseline: commit=${baseline?.commitHash}, runId=${baseline?.runId}`,
      );

      // Check if tool is available and we have baseline info
      const hasDeltaTool = useTool && config.toolRegistry.hasTool('discover_orphans_delta');
      const hasBaseline = baseline?.commitHash || baseline?.runId;

      if (!hasBaseline) {
        config.logger?.warn('[DiscoverDeltaNode] No baseline provided, falling back to fullscan');
        return fullscanNode(config)(state);
      }

      // Try tool-based delta discovery
      if (hasDeltaTool) {
        try {
          config.logger?.log('[DiscoverDeltaNode] Using discover_orphans_delta tool');

          const result = (await config.toolRegistry.executeTool('discover_orphans_delta', {
            root_directory: rootDirectory,
            baseline_commit: baseline.commitHash,
            baseline_run_id: baseline.runId,
            max_orphans: inputMaxTests,
          })) as DeltaDiscoveryResult;

          // Check if delta fell back to fullscan
          if (result.deltaSummary.fallbackToFullscan) {
            config.logger?.warn(
              `[DiscoverDeltaNode] Delta detection fell back to fullscan: ${result.deltaSummary.fallbackReason}`,
            );
          }

          // Convert delta orphan tests to OrphanTestInfo format
          let orphanTests: OrphanTestInfo[] = result.deltaOrphanTests.map((test) => ({
            filePath: test.filePath,
            testName: test.testName,
            lineNumber: test.lineNumber,
            testCode: test.testCode || '',
            relatedSourceFiles: test.relatedSourceFiles,
          }));

          // INV-R002: Delta Closure Stopping Rule
          // Exclude tests that have terminal status (accepted/rejected) from prior runs
          if (enforceClosureRule) {
            orphanTests = await excludeClosedTests(orphanTests, rootDirectory, config);
          }

          // INV-R001: Handle changed atom-linked tests
          // These MUST NOT flow to infer_atoms - they can only generate warnings
          const changedAtomLinkedTests = convertAtomLinkedTests(result.changedAtomLinkedTests);

          if (changedAtomLinkedTests.length > 0) {
            config.logger?.warn(
              `[DiscoverDeltaNode] Found ${changedAtomLinkedTests.length} changed atom-linked tests. ` +
                'Per INV-R001, these will NOT be processed for new atoms.',
            );

            // Log each one for audit trail
            for (const test of changedAtomLinkedTests) {
              config.logger?.log(
                `[DiscoverDeltaNode] Changed atom-linked: ${test.filePath}:${test.lineNumber} -> ${test.linkedAtomId}`,
              );
            }
          }

          config.logger?.log(
            `[DiscoverDeltaNode] Delta discovery complete: ${orphanTests.length} orphans, ` +
              `${changedAtomLinkedTests.length} atom-linked (excluded from inference)`,
          );

          return {
            orphanTests,
            changedAtomLinkedTests,
            deltaSummary: {
              deltaOrphanCount: orphanTests.length,
              changedLinkedTestCount: changedAtomLinkedTests.length,
              modifiedFiles: [], // Could extract from result if needed
              baseline: {
                runId: baseline.runId,
                commitHash: baseline.commitHash,
              },
            },
            currentPhase: 'context',
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          config.logger?.warn(
            `[DiscoverDeltaNode] Tool execution failed, falling back to fullscan: ${errorMessage}`,
          );
        }
      }

      // Fallback: Use fullscan
      config.logger?.log('[DiscoverDeltaNode] Falling back to fullscan mode');
      const fullscanResult = await fullscanNode(config)(state);

      return {
        ...fullscanResult,
        deltaSummary: {
          deltaOrphanCount: fullscanResult.orphanTests?.length || 0,
          changedLinkedTestCount: 0,
          modifiedFiles: [],
          baseline: {
            runId: baseline?.runId,
            commitHash: baseline?.commitHash,
          },
        },
        changedAtomLinkedTests: [],
      };
    };
}

/**
 * Exclude tests that have terminal status (accepted/rejected) from prior runs
 *
 * Per INV-R002: A test is considered "closed" if it has:
 * 1. An accepted AtomRecommendation from a prior run
 * 2. An explicitly rejected status with reason from a prior run
 *
 * @param tests - The orphan tests to filter
 * @param rootDirectory - The repository root directory
 * @param config - The node configuration
 * @returns Filtered tests with closed tests removed
 */
async function excludeClosedTests(
  tests: OrphanTestInfo[],
  rootDirectory: string,
  config: NodeConfig,
): Promise<OrphanTestInfo[]> {
  // TODO: Query TestRecord entity for tests with terminal status
  // For now, return all tests (full implementation needs TestRecord entity from 3.5)
  //
  // When TestRecord is available, the logic will be:
  // 1. Query TestRecord for filePath/testName combinations
  // 2. Filter out tests where status is 'accepted' or 'rejected'
  // 3. Log excluded tests for audit trail

  config.logger?.log(
    '[DiscoverDeltaNode] INV-R002: TestRecord query not yet implemented (pending Phase 3.5)',
  );

  return tests;
}
