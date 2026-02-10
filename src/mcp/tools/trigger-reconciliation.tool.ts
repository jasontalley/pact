import { triggerReconciliation } from '../pact-api-client';
import type { ToolDefinition } from './index';

/**
 * MCP tool to trigger reconciliation from GitHub.
 *
 * Clones the configured GitHub repository at the specified branch/commit
 * and runs the reconciliation agent against it. Returns a runId that can
 * be used with get_reconciliation_status to monitor progress.
 */
export const triggerReconciliationTool: ToolDefinition = {
  name: 'trigger_reconciliation',
  description:
    'Trigger a reconciliation run against the configured GitHub repository. ' +
    'Pact will clone the repo at the specified branch/commit and analyze test files ' +
    'to infer intent atoms. Returns a runId for tracking progress. ' +
    'Requires GitHub PAT to be configured in Pact settings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      branch: {
        type: 'string',
        description:
          'Branch to reconcile (defaults to the configured default branch, usually "main")',
      },
      commitSha: {
        type: 'string',
        description: 'Specific commit SHA to reconcile. If omitted, uses the branch HEAD.',
      },
    },
    required: ['branch', 'commitSha'],
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const branch = args.branch as string;
      const commitSha = args.commitSha as string;

      if (!branch || !commitSha) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: Both "branch" and "commitSha" are required.',
            },
          ],
          isError: true,
        };
      }

      const result = await triggerReconciliation({ branch, commitSha });

      const response = {
        success: true,
        runId: result.runId,
        threadId: result.threadId,
        completed: result.completed,
        message: result.completed
          ? 'Reconciliation completed immediately.'
          : `Reconciliation started. Use get_reconciliation_status with runId "${result.runId}" to monitor progress.`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `Error triggering reconciliation: ${message}` }],
        isError: true,
      };
    }
  },
};
