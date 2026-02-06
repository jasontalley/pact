import { getConflicts } from '../pact-api-client';
import type { ToolDefinition } from './index';

export const getConflictsTool: ToolDefinition = {
  name: 'get_conflicts',
  description:
    'Get open intent conflicts that need resolution. ' +
    'Check for conflicts before creating new atoms to avoid overlaps.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        description: 'Filter by status: "open", "resolved", or "escalated"',
        enum: ['open', 'resolved', 'escalated'],
      },
      type: {
        type: 'string',
        description: 'Filter by conflict type',
        enum: ['same_test', 'semantic_overlap', 'contradiction', 'cross_boundary'],
      },
      atomId: {
        type: 'string',
        description: 'Filter conflicts involving a specific atom UUID',
      },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const conflicts = await getConflicts({
        status: args.status as string | undefined,
        type: args.type as string | undefined,
        atomId: args.atomId as string | undefined,
      });

      const summary = conflicts.map((c) => ({
        id: c.id,
        type: c.conflictType,
        status: c.status,
        atomIdA: c.atomIdA,
        atomIdB: c.atomIdB,
        description: c.description,
        similarityScore: c.similarityScore,
        createdAt: c.createdAt,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ conflicts: summary, total: conflicts.length }, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};
