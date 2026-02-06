import { getCouplingMetrics } from '../pact-api-client';
import type { ToolDefinition } from './index';

export const getCouplingStatusTool: ToolDefinition = {
  name: 'get_coupling_status',
  description:
    'Get atom-test-code coupling metrics and identify coverage gaps. ' +
    'Shows how well atoms, tests, and code are connected, plus orphan counts.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
  handler: async () => {
    try {
      const metrics = await getCouplingMetrics();

      const summary = {
        atomTestCoupling: {
          rate: `${Math.round(metrics.atomTestCoupling.rate * 100)}%`,
          atomsWithTests: metrics.atomTestCoupling.atomsWithTests,
          totalAtoms: metrics.atomTestCoupling.totalAtoms,
          orphanAtomCount: metrics.atomTestCoupling.orphanAtoms.length,
        },
        testAtomCoupling: {
          rate: `${Math.round(metrics.testAtomCoupling.rate * 100)}%`,
          testsWithAtoms: metrics.testAtomCoupling.testsWithAtoms,
          totalTests: metrics.testAtomCoupling.totalTests,
          orphanTestCount: metrics.testAtomCoupling.orphanTests.length,
        },
        codeAtomCoverage: {
          rate: `${Math.round(metrics.codeAtomCoverage.rate * 100)}%`,
          filesWithAtoms: metrics.codeAtomCoverage.filesWithAtoms,
          totalSourceFiles: metrics.codeAtomCoverage.totalSourceFiles,
          uncoveredFileCount: metrics.codeAtomCoverage.uncoveredFiles.length,
        },
        timestamp: metrics.timestamp,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};
