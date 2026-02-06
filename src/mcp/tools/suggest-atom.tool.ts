import { suggestAtom } from '../pact-api-client';
import type { ToolDefinition } from './index';

/**
 * MCP tool for agents to suggest new intent atoms
 *
 * Allows coding agents (Claude Code, Cursor, etc.) to propose atoms
 * when they discover epistemic gaps during implementation.
 *
 * Created atoms have status='proposed' and require HITL approval.
 */
export const suggestAtomTool: ToolDefinition = {
  name: 'suggest_atom',
  description:
    'Suggest a new intent atom when you discover an epistemic gap during implementation. ' +
    'The atom will be created with status="proposed" and require human approval before being committed. ' +
    'Use this when implementing code that requires behavior not covered by existing atoms.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string',
        description:
          'Clear, testable description of the intended behavior. ' +
          'Should be observable and falsifiable. ' +
          'Example: "Rate limiting blocks requests after 100 requests per minute"',
      },
      category: {
        type: 'string',
        description: 'Category of the atom',
        enum: ['functional', 'security', 'performance', 'ux', 'operational'],
      },
      rationale: {
        type: 'string',
        description:
          'Why this atom is needed. Explain the gap you discovered and why this behavior is important. ' +
          'Example: "Implementing password reset endpoint, but no atom exists for rate limiting to prevent abuse"',
      },
      relatedAtomId: {
        type: 'string',
        description:
          'Optional atomId (e.g., "IA-042") of a related or parent atom. ' +
          'Use this when the suggested atom extends or relates to an existing atom.',
      },
      validators: {
        type: 'array',
        description:
          'Optional array of observable outcomes that can be verified. ' +
          'Example: ["Blocks after 100 requests", "Returns 429 status code", "Resets after 60 seconds"]',
        items: {
          type: 'string',
        },
      },
    },
    required: ['description', 'category', 'rationale'],
  },
  handler: async (args: Record<string, unknown>) => {
    const description = args.description as string;
    const category = args.category as string;
    const rationale = args.rationale as string;
    const relatedAtomId = args.relatedAtomId as string | undefined;
    const validators = args.validators as string[] | undefined;

    if (!description) {
      return {
        content: [{ type: 'text' as const, text: 'Error: description is required' }],
        isError: true,
      };
    }

    if (!category) {
      return {
        content: [{ type: 'text' as const, text: 'Error: category is required' }],
        isError: true,
      };
    }

    if (!rationale) {
      return {
        content: [{ type: 'text' as const, text: 'Error: rationale is required' }],
        isError: true,
      };
    }

    if (!['functional', 'security', 'performance', 'ux', 'operational'].includes(category)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: invalid category "${category}". Must be one of: functional, security, performance, ux, operational`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await suggestAtom({
        description,
        category: category as any,
        rationale,
        relatedAtomId,
        validators,
      });

      const response = {
        success: true,
        atomId: result.atomId,
        status: result.status,
        scope: result.scope,
        message: result.message,
        reviewUrl: result.reviewUrl,
        nextSteps: [
          `1. Implement tests with annotation: // @atom ${result.atomId}`,
          '2. Human reviews the proposed atom in the dashboard',
          '3. If approved, atom is committed and CI will pass',
          '4. If rejected, tests become orphans and need different atom',
        ],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};
