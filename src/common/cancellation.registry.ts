/**
 * Cancellation Registry
 *
 * Singleton service for cooperative cancellation of long-running operations.
 * Graph nodes check this registry between iterations to detect cancellation
 * requests from the service layer.
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * Error thrown by nodes when they detect a cancellation request.
 * wrapWithErrorHandling re-throws this (like NodeInterrupt) to propagate
 * cancellation up to the service layer.
 */
export class CancellationError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} cancelled by user`);
    this.name = 'CancellationError';
  }
}

@Injectable()
export class CancellationRegistry {
  private readonly logger = new Logger(CancellationRegistry.name);
  private readonly cancelledRuns = new Set<string>();

  /**
   * Mark a run as cancelled. Nodes will detect this on their next check.
   */
  cancel(runId: string): void {
    this.cancelledRuns.add(runId);
    this.logger.log(`Cancellation requested for run: ${runId}`);
  }

  /**
   * Check if a run has been cancelled.
   */
  isCancelled(runId: string): boolean {
    return this.cancelledRuns.has(runId);
  }

  /**
   * Clear cancellation state for a run (cleanup after completion/failure/cancellation).
   */
  clear(runId: string): void {
    this.cancelledRuns.delete(runId);
  }
}
