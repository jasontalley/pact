import { getEpistemicMetrics } from '../pact-api-client';
import type { ToolDefinition } from './index';

export const getEpistemicStatusTool: ToolDefinition = {
  name: 'get_epistemic_status',
  description:
    "Get the system's epistemic certainty levels: what is PROVEN (atoms with passing tests), " +
    'COMMITTED (atoms without test evidence), INFERRED (pending recommendations), ' +
    'and UNKNOWN (orphan tests + uncovered code). ' +
    'Use this before implementing to check what Pact knows about an area.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
  handler: async () => {
    try {
      const metrics = await getEpistemicMetrics();

      const summary = {
        totalCertainty: `${Math.round(metrics.totalCertainty * 100)}%`,
        proven: {
          count: metrics.proven.count,
          percentage: `${Math.round(metrics.proven.percentage * 100)}%`,
          meaning: 'Atoms with linked, accepted tests (empirical evidence)',
        },
        committed: {
          count: metrics.committed.count,
          percentage: `${Math.round(metrics.committed.percentage * 100)}%`,
          meaning: 'Committed atoms without test evidence',
        },
        inferred: {
          count: metrics.inferred.count,
          percentage: `${Math.round(metrics.inferred.percentage * 100)}%`,
          meaning: 'Atom recommendations pending human review',
        },
        unknown: {
          orphanTestsCount: metrics.unknown.orphanTestsCount,
          uncoveredCodeFilesCount: metrics.unknown.uncoveredCodeFilesCount,
          meaning: 'Gaps in knowledge (tests without atoms, code without coverage)',
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
