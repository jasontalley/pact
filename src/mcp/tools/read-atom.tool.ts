import { getAtom, listAtoms } from '../pact-api-client';
import type { ToolDefinition } from './index';

export const readAtomTool: ToolDefinition = {
  name: 'read_atom',
  description:
    'Get the full description, acceptance criteria, and status for an intent atom. ' +
    'Accepts either a UUID or a human-readable atom ID (e.g., "IA-042").',
  inputSchema: {
    type: 'object' as const,
    properties: {
      atomId: {
        type: 'string',
        description: 'The atom UUID or human-readable ID (e.g., "IA-042")',
      },
    },
    required: ['atomId'],
  },
  handler: async (args: Record<string, unknown>) => {
    const atomId = args.atomId as string;
    if (!atomId) {
      return {
        content: [{ type: 'text' as const, text: 'Error: atomId is required' }],
        isError: true,
      };
    }

    try {
      // UUID format: direct lookup via GET /atoms/:id
      const isUuid = atomId.includes('-') && atomId.length > 20;
      if (isUuid) {
        const atom = await getAtom(atomId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(atom, null, 2) }] };
      }

      // Human-readable ID (e.g., "IA-001"): list atoms and match by atomId field
      const result = await listAtoms({ limit: 100 });
      const match = result.items.find((a) => a.atomId === atomId);
      if (match) {
        const atom = await getAtom(match.id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(atom, null, 2) }] };
      }

      return {
        content: [{ type: 'text' as const, text: `Error: No atom found with ID "${atomId}"` }],
        isError: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};
