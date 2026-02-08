import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

/**
 * Socket.io client for the /reconciliation namespace.
 * Receives real-time progress, completion, interruption, and failure events.
 */
export const reconciliationSocket: Socket = io(`${SOCKET_URL}/reconciliation`, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 10000,
});

reconciliationSocket.on('connect', () => {
  console.debug('[ReconciliationSocket] Connected:', reconciliationSocket.id);
});

reconciliationSocket.on('disconnect', (reason) => {
  console.debug('[ReconciliationSocket] Disconnected:', reason);
});

reconciliationSocket.on('connect_error', (error) => {
  console.warn('[ReconciliationSocket] Connection error:', error.message);
});

export function connectReconciliationSocket(): void {
  if (!reconciliationSocket.connected) {
    reconciliationSocket.connect();
  }
}

export function disconnectReconciliationSocket(): void {
  if (reconciliationSocket.connected) {
    reconciliationSocket.disconnect();
  }
}

/**
 * Event names emitted by the ReconciliationGateway
 */
export const RECONCILIATION_EVENTS = {
  PROGRESS: 'reconciliation:progress',
  STARTED: 'reconciliation:started',
  COMPLETED: 'reconciliation:completed',
  FAILED: 'reconciliation:failed',
  INTERRUPTED: 'reconciliation:interrupted',
  CANCELLED: 'reconciliation:cancelled',
} as const;

/**
 * Progress event payload
 */
export interface ReconciliationProgressEvent {
  runId: string;
  phase: string;
  progress: number;
  message: string;
  details?: {
    totalTests?: number;
    processedTests?: number;
    atomsInferred?: number;
    moleculesSynthesized?: number;
    qualityPassCount?: number;
    qualityFailCount?: number;
  };
  timestamp: string;
}

/**
 * Completed event payload
 */
export interface ReconciliationCompletedEvent {
  runId: string;
  status: string;
  summary: {
    totalOrphanTests: number;
    inferredAtomsCount: number;
    inferredMoleculesCount: number;
    qualityPassCount: number;
    qualityFailCount: number;
    duration: number;
  };
  timestamp: string;
}

/**
 * Failed event payload
 */
export interface ReconciliationFailedEvent {
  runId: string;
  error: string;
  phase: string;
  timestamp: string;
}

/**
 * Interrupted event payload
 */
export interface ReconciliationInterruptedEvent {
  runId: string;
  reason: string;
  pendingAtomCount: number;
  pendingMoleculeCount: number;
  timestamp: string;
}

/**
 * Cancelled event payload
 */
export interface ReconciliationCancelledEvent {
  runId: string;
  reason: string;
  timestamp: string;
}
