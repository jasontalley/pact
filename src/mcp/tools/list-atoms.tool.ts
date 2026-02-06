import { listAtoms } from '../pact-api-client';
import type { ToolDefinition } from './index';

export const listAtomsTool: ToolDefinition = {
  name: 'list_atoms',
  description:
    'List intent atoms with optional filtering by status, category, or tags. ' +
    'Returns a paginated list of atom summaries. ' +
    'Use scope="main" for committed atoms only (canonical truth), or scope="local" to include proposed atoms.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        description:
          'Filter by status: "draft", "proposed", "committed", "superseded", or "abandoned"',
        enum: ['draft', 'proposed', 'committed', 'superseded', 'abandoned'],
      },
      category: {
        type: 'string',
        description: 'Filter by category: "functional", "performance", "security", etc.',
      },
      search: {
        type: 'string',
        description: 'Search atoms by description text',
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
        description: 'Maximum number of results (default: 20)',
      },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const scope = (args.scope as string) || 'all';
      const includeProposed = args.includeProposed as boolean | undefined;
      let status = args.status as string | undefined;

      // Apply scope filtering
      if (scope === 'main') {
        status = 'committed';
      } else if (scope === 'local' && !status) {
        // Local scope: committed + proposed
        // Note: Backend API doesn't support multiple statuses yet,
        // so we'll just not filter by status and filter client-side
        status = undefined;
      }

      const result = await listAtoms({
        status,
        category: args.category as string | undefined,
        search: args.search as string | undefined,
        limit: (args.limit as number) || 20,
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
            text: JSON.stringify({ atoms: summary, total: summary.length }, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};
