import { getIntentHistory, getAtomVersionHistory } from '../pact-api-client';
import type { ToolDefinition } from './index';

export const getIntentHistoryTool: ToolDefinition = {
  name: 'get_intent_history',
  description:
    'Get the version history of an intent, showing how it evolved through supersessions. ' +
    'Provide either an intentIdentity UUID or an atomId to look up.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      intentIdentity: {
        type: 'string',
        description: 'The intent identity UUID (shared across superseded versions)',
      },
      atomId: {
        type: 'string',
        description: 'An atom UUID — will look up its intent identity and return full history',
      },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const intentIdentity = args.intentIdentity as string | undefined;
    const atomId = args.atomId as string | undefined;

    if (!intentIdentity && !atomId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: either intentIdentity or atomId is required',
          },
        ],
        isError: true,
      };
    }

    try {
      if (atomId) {
        const history = await getAtomVersionHistory(atomId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(history, null, 2) }],
        };
      }

      const versions = await getIntentHistory(intentIdentity!);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                intentIdentity,
                versions,
                totalVersions: versions.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};
