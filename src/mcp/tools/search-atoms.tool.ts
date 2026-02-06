import { searchAtoms } from '../pact-api-client';
import type { ToolDefinition } from './index';

export const searchAtomsTool: ToolDefinition = {
  name: 'search_atoms',
  description:
    'Search atoms by description content, tags, or category. ' +
    'Uses text matching on atom descriptions. ' +
    'Use scope="main" for committed atoms only, or scope="local" to include proposed atoms.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query to match against atom descriptions',
      },
      category: {
        type: 'string',
        description: 'Filter by category: "functional", "performance", "security", etc.',
      },
      status: {
        type: 'string',
        description:
          'Filter by status: "draft", "proposed", "committed", "superseded", or "abandoned"',
        enum: ['draft', 'proposed', 'committed', 'superseded', 'abandoned'],
      },
      scope: {
        type: 'string',
        description:
          'Scope filter: "main" (committed only), "local" (committed + proposed), or "all" (default)',
        enum: ['main', 'local', 'all'],
      },
      includeProposed: {
        type: 'boolean',
        description: 'Include proposed atoms in results (default: false)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 10)',
      },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>) => {
    const query = args.query as string;
    if (!query) {
      return {
        content: [{ type: 'text' as const, text: 'Error: query is required' }],
        isError: true,
      };
    }

    try {
      const scope = (args.scope as string) || 'all';
      const includeProposed = args.includeProposed as boolean | undefined;
      let status = args.status as string | undefined;

      // Apply scope filtering
      if (scope === 'main') {
        status = 'committed';
      }

      const result = await searchAtoms(query, {
        category: args.category as string | undefined,
        status,
        limit: (args.limit as number) || 10,
      });

      // Client-side filtering for scope
      let items = result.items;
      if (scope === 'local') {
        items = items.filter((a) => a.status === 'committed' || a.status === 'proposed');
      } else if (!includeProposed && scope !== 'main') {
        items = items.filter((a) => a.status !== 'proposed');
      }

      const summary = items.map((a) => ({
        id: a.id,
        atomId: a.atomId,
        description: a.description,
        category: a.category,
        status: a.status,
        qualityScore: a.qualityScore,
        tags: a.tags,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ results: summary, total: summary.length }, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};
