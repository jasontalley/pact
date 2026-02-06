import { getImplementableAtoms } from '../pact-api-client';
import type { ToolDefinition } from './index';

/**
 * MCP tool to find atoms ready to implement
 *
 * Returns committed atoms that need test coverage, sorted by priority.
 * Use this when you want to find atoms that need implementation.
 */
export const getImplementableAtomsTool: ToolDefinition = {
  name: 'get_implementable_atoms',
  description:
    'Get intent atoms that are ready to implement (committed but lacking test coverage). ' +
    'Returns atoms sorted by priority (quality score descending). ' +
    'Use this to find atoms that need tests and code implementation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 10)',
      },
      category: {
        type: 'string',
        description: 'Filter by category: "functional", "performance", "security", etc.',
      },
      minCoverage: {
        type: 'number',
        description:
          'Minimum coverage percentage threshold (default: 80). ' +
          'Atoms below this threshold are considered implementable.',
      },
      includeProposed: {
        type: 'boolean',
        description: 'Include proposed atoms (not recommended, default: false)',
      },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const limit = (args.limit as number) || 10;
      const category = args.category as string | undefined;
      const minCoverage = (args.minCoverage as number) || 80;
      const includeProposed = args.includeProposed as boolean | undefined;

      const atoms = await getImplementableAtoms({
        limit,
        category,
        minCoverage,
        includeProposed,
      });

      // Sort by quality score descending (higher quality = higher priority)
      const sortedAtoms = atoms.sort((a, b) => {
        const scoreA = a.qualityScore ?? 0;
        const scoreB = b.qualityScore ?? 0;
        return scoreB - scoreA;
      });

      const results = sortedAtoms.slice(0, limit).map((atom) => ({
        id: atom.id,
        atomId: atom.atomId,
        description: atom.description,
        category: atom.category,
        coverage: 'unknown', // Note: Coverage would need backend support
        validators: atom.observableOutcomes.map((o) => o),
        priority:
          (atom.qualityScore ?? 0) >= 90
            ? 'high'
            : (atom.qualityScore ?? 0) >= 80
              ? 'medium'
              : 'low',
        status: atom.status,
        qualityScore: atom.qualityScore,
      }));

      const message =
        results.length > 0
          ? `Found ${results.length} implementable atoms. Start by implementing tests with @atom annotations.`
          : 'No implementable atoms found matching your criteria.';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ atoms: results, message }, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};
