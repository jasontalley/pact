/**
 * Test Quality Node
 *
 * Runs static quality analysis on each orphan test discovered by the discover node.
 * Uses the shared test-quality-analyzer (regex-based, no LLM needed).
 *
 * Inserted between discover and context nodes in the reconciliation graph.
 * Produces testQualityScores map keyed by "filePath:testName".
 *
 * @see src/modules/quality/test-quality-analyzer.ts
 */

import { NodeConfig } from '../types';
import {
  ReconciliationGraphStateType,
  TestQualityScore,
} from '../../types/reconciliation-state';
import {
  analyzeTestQuality,
  TestQualityResult,
} from '../../../../quality/test-quality-analyzer';

export function createTestQualityNode() {
  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const orphanTests = state.orphanTests || [];

      if (orphanTests.length === 0) {
        config.logger?.log('[TestQualityNode] No orphan tests to analyze');
        return { testQualityScores: new Map() };
      }

      config.logger?.log(
        `[TestQualityNode] Analyzing quality of ${orphanTests.length} orphan tests`,
      );

      const scores = new Map<string, TestQualityScore>();

      // Group tests by file to avoid re-analyzing the same file multiple times
      const testsByFile = new Map<string, typeof orphanTests>();
      for (const test of orphanTests) {
        const existing = testsByFile.get(test.filePath) || [];
        existing.push(test);
        testsByFile.set(test.filePath, existing);
      }

      let filesAnalyzed = 0;
      let testsScored = 0;

      for (const [filePath, tests] of testsByFile) {
        // Use the full test source code if available, otherwise fall back to test code snippet
        const sourceCode = tests[0].testSourceCode || tests[0].testCode;
        if (!sourceCode) {
          config.logger?.warn(`[TestQualityNode] No source code for ${filePath}, skipping`);
          continue;
        }

        let result: TestQualityResult;
        try {
          result = analyzeTestQuality(sourceCode, { filePath });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          config.logger?.warn(`[TestQualityNode] Analysis failed for ${filePath}: ${msg}`);
          continue;
        }

        filesAnalyzed++;

        // Create a score entry for each test in this file
        for (const test of tests) {
          const key = `${test.filePath}:${test.testName}`;
          const issues = Object.values(result.dimensions)
            .flatMap((d) => d.issues)
            .map((i) => i.message);

          scores.set(key, {
            overallScore: result.overallScore,
            passed: result.passed,
            dimensions: {
              intentFidelity: result.dimensions.intentFidelity?.score ?? 1,
              noVacuousTests: result.dimensions.noVacuousTests?.score ?? 1,
              noBrittleTests: result.dimensions.noBrittleTests?.score ?? 1,
              determinism: result.dimensions.determinism?.score ?? 1,
              failureSignalQuality: result.dimensions.failureSignalQuality?.score ?? 1,
              integrationAuthenticity: result.dimensions.integrationTestAuthenticity?.score ?? 1,
              boundaryAndNegativeCoverage: result.dimensions.boundaryAndNegativeCoverage?.score ?? 1,
            },
            issues,
          });
          testsScored++;
        }
      }

      // Log aggregate stats
      const allScores = Array.from(scores.values());
      const avgScore = allScores.length > 0
        ? allScores.reduce((sum, s) => sum + s.overallScore, 0) / allScores.length
        : 0;
      const passCount = allScores.filter((s) => s.passed).length;

      config.logger?.log(
        `[TestQualityNode] Analyzed ${filesAnalyzed} files, scored ${testsScored} tests. ` +
        `Avg score: ${avgScore.toFixed(1)}, Pass: ${passCount}/${testsScored}`,
      );

      return { testQualityScores: scores };
    };
}
