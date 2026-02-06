import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { CommitmentArtifact } from '../modules/commitments/commitment.entity';
import { CommitmentPreviewDto } from '../modules/commitments/dto/commitment-preview.dto';
import { ProposedAtom } from '../modules/agents/commitment-agent.service';

/**
 * WebSocket event types for commitment operations
 */
export interface CommitmentProposedEvent {
  type: 'commitment:proposed';
  proposedAtoms: ProposedAtom[];
  analysis: string;
  confidence: number;
  requestedBy: string;
}

export interface CommitmentPreviewEvent {
  type: 'commitment:preview';
  atomIds: string[];
  preview: CommitmentPreviewDto;
  summary: string;
  canCommit: boolean;
}

export interface CommitmentCreatedEvent {
  type: 'commitment:created';
  data: CommitmentArtifact;
  atomCount: number;
}

export interface CommitmentFailedEvent {
  type: 'commitment:failed';
  atomIds: string[];
  reason: string;
  blockingIssues: string[];
}

export interface CommitmentSupersededEvent {
  type: 'commitment:superseded';
  originalCommitmentId: string;
  newCommitmentId: string;
  reason?: string;
}

export interface InvariantCheckProgressEvent {
  type: 'invariant:checking';
  atomIds: string[];
  currentInvariant: string;
  progress: number; // 0-100
}

export type CommitmentEvent =
  | CommitmentProposedEvent
  | CommitmentPreviewEvent
  | CommitmentCreatedEvent
  | CommitmentFailedEvent
  | CommitmentSupersededEvent
  | InvariantCheckProgressEvent;

/**
 * WebSocket Gateway for real-time commitment updates
 *
 * Emits events during the commitment flow:
 * - commitment:proposed - Agent proposes atoms from molecular intent
 * - commitment:preview - Invariant preview completed
 * - commitment:created - Commitment successfully created
 * - commitment:failed - Commitment blocked by invariant violations
 * - commitment:superseded - Commitment was superseded
 * - invariant:checking - Progress during invariant checks
 *
 * @atom IA-PHASE3-001 Real-time commitment events via WebSocket
 */
@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/commitments',
})
export class CommitmentsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CommitmentsGateway.name);

  afterInit(_server: Server): void {
    this.logger.log('CommitmentsGateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Emit event when atoms are proposed from molecular intent
   */
  emitCommitmentProposed(
    proposedAtoms: ProposedAtom[],
    analysis: string,
    confidence: number,
    requestedBy: string,
  ): void {
    const event: CommitmentProposedEvent = {
      type: 'commitment:proposed',
      proposedAtoms,
      analysis,
      confidence,
      requestedBy,
    };
    this.server?.emit('commitment:proposed', event);
    this.logger.debug(`Emitted commitment:proposed with ${proposedAtoms.length} atoms`);
  }

  /**
   * Emit event when commitment preview is ready
   */
  emitCommitmentPreview(atomIds: string[], preview: CommitmentPreviewDto, summary: string): void {
    const event: CommitmentPreviewEvent = {
      type: 'commitment:preview',
      atomIds,
      preview,
      summary,
      canCommit: preview.canCommit,
    };
    this.server?.emit('commitment:preview', event);
    this.logger.debug(
      `Emitted commitment:preview for ${atomIds.length} atoms, canCommit: ${preview.canCommit}`,
    );
  }

  /**
   * Emit event when commitment is successfully created
   */
  emitCommitmentCreated(commitment: CommitmentArtifact): void {
    const event: CommitmentCreatedEvent = {
      type: 'commitment:created',
      data: commitment,
      atomCount: commitment.canonicalJson?.length || 0,
    };
    this.server?.emit('commitment:created', event);
    this.logger.debug(`Emitted commitment:created for ${commitment.commitmentId}`);
  }

  /**
   * Emit event when commitment fails due to invariant violations
   */
  emitCommitmentFailed(atomIds: string[], reason: string, blockingIssues: string[]): void {
    const event: CommitmentFailedEvent = {
      type: 'commitment:failed',
      atomIds,
      reason,
      blockingIssues,
    };
    this.server?.emit('commitment:failed', event);
    this.logger.debug(`Emitted commitment:failed: ${reason}`);
  }

  /**
   * Emit event when a commitment is superseded
   */
  emitCommitmentSuperseded(
    originalCommitmentId: string,
    newCommitmentId: string,
    reason?: string,
  ): void {
    const event: CommitmentSupersededEvent = {
      type: 'commitment:superseded',
      originalCommitmentId,
      newCommitmentId,
      reason,
    };
    this.server?.emit('commitment:superseded', event);
    this.logger.debug(
      `Emitted commitment:superseded: ${originalCommitmentId} -> ${newCommitmentId}`,
    );
  }

  /**
   * Emit progress event during invariant checking
   */
  emitInvariantCheckProgress(atomIds: string[], currentInvariant: string, progress: number): void {
    const event: InvariantCheckProgressEvent = {
      type: 'invariant:checking',
      atomIds,
      currentInvariant,
      progress,
    };
    this.server?.emit('invariant:checking', event);
    this.logger.debug(`Emitted invariant:checking: ${currentInvariant} (${progress}%)`);
  }
}
