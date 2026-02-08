'use client';

import { useEffect, useCallback, useRef } from 'react';
import {
  reconciliationSocket,
  connectReconciliationSocket,
  disconnectReconciliationSocket,
  RECONCILIATION_EVENTS,
  type ReconciliationProgressEvent,
  type ReconciliationCompletedEvent,
  type ReconciliationFailedEvent,
  type ReconciliationInterruptedEvent,
} from '@/lib/socket/reconciliation-client';

export interface ReconciliationEventHandlers {
  onProgress?: (event: ReconciliationProgressEvent) => void;
  onCompleted?: (event: ReconciliationCompletedEvent) => void;
  onFailed?: (event: ReconciliationFailedEvent) => void;
  onInterrupted?: (event: ReconciliationInterruptedEvent) => void;
}

/**
 * Hook to subscribe to real-time reconciliation WebSocket events for a specific run.
 *
 * Connects to the /reconciliation namespace and filters events by runId.
 * Automatically connects on mount and disconnects on unmount.
 *
 * @param runId - The run ID to listen for (null = don't subscribe)
 * @param handlers - Callbacks for each event type
 */
export function useReconciliationEvents(
  runId: string | null,
  handlers: ReconciliationEventHandlers,
): void {
  // Use refs to avoid re-subscribing when handler functions change
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const handleProgress = useCallback((event: ReconciliationProgressEvent) => {
    if (event.runId === runId) {
      handlersRef.current.onProgress?.(event);
    }
  }, [runId]);

  const handleCompleted = useCallback((event: ReconciliationCompletedEvent) => {
    if (event.runId === runId) {
      handlersRef.current.onCompleted?.(event);
    }
  }, [runId]);

  const handleFailed = useCallback((event: ReconciliationFailedEvent) => {
    if (event.runId === runId) {
      handlersRef.current.onFailed?.(event);
    }
  }, [runId]);

  const handleInterrupted = useCallback((event: ReconciliationInterruptedEvent) => {
    if (event.runId === runId) {
      handlersRef.current.onInterrupted?.(event);
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) return;

    connectReconciliationSocket();

    reconciliationSocket.on(RECONCILIATION_EVENTS.PROGRESS, handleProgress);
    reconciliationSocket.on(RECONCILIATION_EVENTS.COMPLETED, handleCompleted);
    reconciliationSocket.on(RECONCILIATION_EVENTS.FAILED, handleFailed);
    reconciliationSocket.on(RECONCILIATION_EVENTS.INTERRUPTED, handleInterrupted);

    return () => {
      reconciliationSocket.off(RECONCILIATION_EVENTS.PROGRESS, handleProgress);
      reconciliationSocket.off(RECONCILIATION_EVENTS.COMPLETED, handleCompleted);
      reconciliationSocket.off(RECONCILIATION_EVENTS.FAILED, handleFailed);
      reconciliationSocket.off(RECONCILIATION_EVENTS.INTERRUPTED, handleInterrupted);
      disconnectReconciliationSocket();
    };
  }, [runId, handleProgress, handleCompleted, handleFailed, handleInterrupted]);
}
