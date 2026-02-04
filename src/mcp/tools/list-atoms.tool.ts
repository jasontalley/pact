import { listAtoms } from '../pact-api-client';
import type { ToolDefinition } from './index';

export const listAtomsTool: ToolDefinition = {
  name: 'list_atoms',
  description:
    'List intent atoms with optional filtering by status, category, or tags. ' +
    'Returns a paginated list of atom summaries.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        description: 'Filter by status: "draft", "committed", or "superseded"',
        enum: ['draft', 'committed', 'superseded'],
      },
      category: {
        type: 'string',
        description: 'Filter by category: "functional", "performance", "security", etc.',
      },
      search: {
        type: 'string',
        description: 'Search atoms by description text',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 20)',
      },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const result = await listAtoms({
        status: args.status as string | undefined,
        category: args.category as string | undefined,
        search: args.search as string | undefined,
        limit: (args.limit as number) || 20,
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
            text: JSON.stringify({ atoms: summary, total: result.total }, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};
