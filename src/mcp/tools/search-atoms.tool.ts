import { searchAtoms } from '../pact-api-client';
import type { ToolDefinition } from './index';

export const searchAtomsTool: ToolDefinition = {
  name: 'search_atoms',
  description:
    'Search atoms by description content, tags, or category. ' +
    'Uses text matching on atom descriptions.',
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
        description: 'Filter by status: "draft", "committed", or "superseded"',
        enum: ['draft', 'committed', 'superseded'],
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
      const result = await searchAtoms(query, {
        category: args.category as string | undefined,
        status: args.status as string | undefined,
        limit: (args.limit as number) || 10,
      });

      const summary = result.items.map((a) => ({
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
            text: JSON.stringify({ results: summary, total: result.total }, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};
