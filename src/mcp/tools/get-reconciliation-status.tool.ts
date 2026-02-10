import { getReconciliationRunStatus, listReconciliationRuns } from '../pact-api-client';
import type { ToolDefinition } from './index';

/**
 * MCP tool to check reconciliation run status.
 *
 * Either checks a specific run by runId, or lists all active runs.
 * Use after trigger_reconciliation to monitor progress.
 */
export const getReconciliationStatusTool: ToolDefinition = {
  name: 'get_reconciliation_status',
  description:
    'Check the status of a reconciliation run. ' +
    'Pass a runId to check a specific run, or omit it to list all active runs. ' +
    'Use after trigger_reconciliation to monitor progress.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      runId: {
        type: 'string',
        description:
          'The run ID to check. If omitted, lists all active reconciliation runs.',
      },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const runId = args.runId as string | undefined;

      if (runId) {
        const result = await getReconciliationRunStatus(runId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  runId: result.runId,
                  status: result.status ?? 'unknown',
                  message: describeStatus(result.status),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // No runId — list all active runs
      const runs = await listReconciliationRuns();

      if (runs.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { runs: [], message: 'No active reconciliation runs.' },
                null,
                2,
              ),
            },
          ],
        };
      }

      const summary = runs.map((r) => ({
        runId: r.runId,
        status: r.status,
        startTime: r.startTime,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { runs: summary, total: summary.length },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
};

function describeStatus(status: string | null): string {
  switch (status) {
    case 'running':
      return 'Reconciliation is in progress.';
    case 'review':
      return 'Reconciliation is paused, waiting for human review of recommendations.';
    case 'complete':
      return 'Reconciliation has completed. Check recommendations via the dashboard.';
    case 'failed':
      return 'Reconciliation failed. Check the dashboard for error details.';
    case 'cancelled':
      return 'Reconciliation was cancelled.';
    default:
      return 'Status unknown — the run may have completed or expired.';
  }
}
