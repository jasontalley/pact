/**
 * Reconciliation Gateway
 *
 * WebSocket gateway for real-time reconciliation progress events.
 * Emits progress updates as the reconciliation graph executes.
 *
 * @see docs/implementation-checklist-phase6.md Part 4
 */

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';

/**
 * Reconciliation progress phases
 */
export type ReconciliationPhase =
  | 'starting'
  | 'structure'
  | 'discover'
  | 'context'
  | 'infer'
  | 'synthesize'
  | 'interim_persist'
  | 'verify'
  | 'persist'
  | 'completed'
  | 'failed';

/**
 * Progress event emitted during reconciliation
 */
export interface ReconciliationProgressEvent {
  type: 'reconciliation:progress';
  runId: string;
  phase: ReconciliationPhase;
  progress: number; // 0-100
  message: string;
  details?: {
    totalTests?: number;
    processedTests?: number;
    atomsInferred?: number;
    moleculesSynthesized?: number;
    qualityPassCount?: number;
    qualityFailCount?: number;
  };
  timestamp: Date;
}

/**
 * Event emitted when reconciliation starts
 */
export interface ReconciliationStartedEvent {
  type: 'reconciliation:started';
  runId: string;
  rootDirectory: string;
  mode: 'full-scan' | 'delta';
  timestamp: Date;
}

/**
 * Event emitted when reconciliation completes
 */
export interface ReconciliationCompletedEvent {
  type: 'reconciliation:completed';
  runId: string;
  status: 'completed' | 'pending_review' | 'failed';
  summary: {
    totalOrphanTests: number;
    inferredAtomsCount: number;
    inferredMoleculesCount: number;
    qualityPassCount: number;
    qualityFailCount: number;
    duration: number;
  };
  timestamp: Date;
}

/**
 * Event emitted when reconciliation fails
 */
export interface ReconciliationFailedEvent {
  type: 'reconciliation:failed';
  runId: string;
  error: string;
  phase: ReconciliationPhase;
  timestamp: Date;
}

/**
 * Event emitted when reconciliation is interrupted for review
 */
export interface ReconciliationInterruptedEvent {
  type: 'reconciliation:interrupted';
  runId: string;
  reason: string;
  pendingAtomCount: number;
  pendingMoleculeCount: number;
  timestamp: Date;
}

export type ReconciliationEvent =
  | ReconciliationProgressEvent
  | ReconciliationStartedEvent
  | ReconciliationCompletedEvent
  | ReconciliationFailedEvent
  | ReconciliationInterruptedEvent;

/**
 * WebSocket Gateway for real-time reconciliation progress updates
 *
 * Clients can connect to receive progress events during reconciliation.
 * Events include phase transitions, completion status, and error notifications.
 */
@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/reconciliation',
})
export class ReconciliationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ReconciliationGateway.name);

  // Track clients subscribed to specific runs
  private runSubscriptions = new Map<string, Set<string>>(); // runId -> Set<clientId>

  afterInit(_server: Server): void {
    this.logger.log('ReconciliationGateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Remove client from all run subscriptions
    for (const [runId, clients] of this.runSubscriptions.entries()) {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.runSubscriptions.delete(runId);
      }
    }
  }

  /**
   * Subscribe to progress events for a specific run
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, runId: string): { event: string; data: { subscribed: boolean; runId: string } } {
    if (!this.runSubscriptions.has(runId)) {
      this.runSubscriptions.set(runId, new Set());
    }
    this.runSubscriptions.get(runId)!.add(client.id);
    this.logger.debug(`Client ${client.id} subscribed to run ${runId}`);
    return { event: 'subscribed', data: { subscribed: true, runId } };
  }

  /**
   * Unsubscribe from progress events for a specific run
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, runId: string): { event: string; data: { unsubscribed: boolean; runId: string } } {
    const clients = this.runSubscriptions.get(runId);
    if (clients) {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.runSubscriptions.delete(runId);
      }
    }
    this.logger.debug(`Client ${client.id} unsubscribed from run ${runId}`);
    return { event: 'unsubscribed', data: { unsubscribed: true, runId } };
  }

  /**
   * Emit progress event for a run
   */
  emitProgress(
    runId: string,
    phase: ReconciliationPhase,
    progress: number,
    message: string,
    details?: ReconciliationProgressEvent['details'],
  ): void {
    const event: ReconciliationProgressEvent = {
      type: 'reconciliation:progress',
      runId,
      phase,
      progress,
      message,
      details,
      timestamp: new Date(),
    };

    // Emit to all clients (they can filter by runId)
    this.server?.emit('reconciliation:progress', event);
    this.logger.debug(`[${runId}] Progress: ${phase} (${progress}%) - ${message}`);
  }

  /**
   * Emit event when reconciliation starts
   */
  emitStarted(runId: string, rootDirectory: string, mode: 'full-scan' | 'delta'): void {
    const event: ReconciliationStartedEvent = {
      type: 'reconciliation:started',
      runId,
      rootDirectory,
      mode,
      timestamp: new Date(),
    };
    this.server?.emit('reconciliation:started', event);
    this.logger.log(`[${runId}] Reconciliation started (${mode})`);
  }

  /**
   * Emit event when reconciliation completes
   */
  emitCompleted(
    runId: string,
    status: 'completed' | 'pending_review' | 'failed',
    summary: ReconciliationCompletedEvent['summary'],
  ): void {
    const event: ReconciliationCompletedEvent = {
      type: 'reconciliation:completed',
      runId,
      status,
      summary,
      timestamp: new Date(),
    };
    this.server?.emit('reconciliation:completed', event);
    this.logger.log(`[${runId}] Reconciliation completed with status: ${status}`);
  }

  /**
   * Emit event when reconciliation fails
   */
  emitFailed(runId: string, error: string, phase: ReconciliationPhase): void {
    const event: ReconciliationFailedEvent = {
      type: 'reconciliation:failed',
      runId,
      error,
      phase,
      timestamp: new Date(),
    };
    this.server?.emit('reconciliation:failed', event);
    this.logger.error(`[${runId}] Reconciliation failed at ${phase}: ${error}`);
  }

  /**
   * Emit event when reconciliation is interrupted for review
   */
  emitInterrupted(runId: string, reason: string, pendingAtomCount: number, pendingMoleculeCount: number): void {
    const event: ReconciliationInterruptedEvent = {
      type: 'reconciliation:interrupted',
      runId,
      reason,
      pendingAtomCount,
      pendingMoleculeCount,
      timestamp: new Date(),
    };
    this.server?.emit('reconciliation:interrupted', event);
    this.logger.log(`[${runId}] Reconciliation interrupted: ${reason}`);
  }
}
