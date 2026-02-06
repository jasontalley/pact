import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { Atom } from '../modules/atoms/atom.entity';

/**
 * WebSocket event types for atom operations
 */
export interface AtomCreatedEvent {
  type: 'atom:created';
  data: Atom;
}

export interface AtomCommittedEvent {
  type: 'atom:committed';
  atomId: string;
  data: Atom;
}

export interface AtomProposedEvent {
  type: 'atom:proposed';
  atomId: string;
  changeSetId: string;
  data: Atom;
}

export interface AtomPromotedToMainEvent {
  type: 'atom:promotedToMain';
  atomId: string;
  data: Atom;
}

export interface AtomSupersededEvent {
  type: 'atom:superseded';
  atomId: string;
  newAtomId: string;
}

export interface AtomUpdatedEvent {
  type: 'atom:updated';
  atomId: string;
  data: Atom;
}

export interface AtomDeletedEvent {
  type: 'atom:deleted';
  atomId: string;
}

export type AtomEvent =
  | AtomCreatedEvent
  | AtomCommittedEvent
  | AtomProposedEvent
  | AtomPromotedToMainEvent
  | AtomSupersededEvent
  | AtomUpdatedEvent
  | AtomDeletedEvent;

/**
 * WebSocket Gateway for real-time atom updates
 *
 * Emits events when atoms are created, committed, superseded, updated, or deleted.
 * Frontend clients can subscribe to these events to update their UI in real-time.
 */
@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/atoms',
})
export class AtomsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AtomsGateway.name);

  afterInit(_server: Server): void {
    this.logger.log('AtomsGateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Emit event when a new atom is created
   */
  emitAtomCreated(atom: Atom): void {
    const event: AtomCreatedEvent = {
      type: 'atom:created',
      data: atom,
    };
    this.server?.emit('atom:created', event);
    this.logger.debug(`Emitted atom:created for ${atom.atomId}`);
  }

  /**
   * Emit event when an atom is committed
   */
  emitAtomCommitted(atom: Atom): void {
    const event: AtomCommittedEvent = {
      type: 'atom:committed',
      atomId: atom.id,
      data: atom,
    };
    this.server?.emit('atom:committed', event);
    this.logger.debug(`Emitted atom:committed for ${atom.atomId}`);
  }

  /**
   * Emit event when an atom is created as proposed (in a change set)
   */
  emitAtomProposed(atom: Atom, changeSetId: string): void {
    const event: AtomProposedEvent = {
      type: 'atom:proposed',
      atomId: atom.id,
      changeSetId,
      data: atom,
    };
    this.server?.emit('atom:proposed', event);
    this.logger.debug(`Emitted atom:proposed for ${atom.atomId} in change set ${changeSetId}`);
  }

  /**
   * Emit event when an atom is promoted to Main
   */
  emitAtomPromotedToMain(atom: Atom): void {
    const event: AtomPromotedToMainEvent = {
      type: 'atom:promotedToMain',
      atomId: atom.id,
      data: atom,
    };
    this.server?.emit('atom:promotedToMain', event);
    this.logger.debug(`Emitted atom:promotedToMain for ${atom.atomId}`);
  }

  /**
   * Emit event when an atom is superseded
   */
  emitAtomSuperseded(atomId: string, newAtomId: string): void {
    const event: AtomSupersededEvent = {
      type: 'atom:superseded',
      atomId,
      newAtomId,
    };
    this.server?.emit('atom:superseded', event);
    this.logger.debug(`Emitted atom:superseded for ${atomId} -> ${newAtomId}`);
  }

  /**
   * Emit event when an atom is updated
   */
  emitAtomUpdated(atom: Atom): void {
    const event: AtomUpdatedEvent = {
      type: 'atom:updated',
      atomId: atom.id,
      data: atom,
    };
    this.server?.emit('atom:updated', event);
    this.logger.debug(`Emitted atom:updated for ${atom.atomId}`);
  }

  /**
   * Emit event when an atom is deleted
   */
  emitAtomDeleted(atomId: string): void {
    const event: AtomDeletedEvent = {
      type: 'atom:deleted',
      atomId,
    };
    this.server?.emit('atom:deleted', event);
    this.logger.debug(`Emitted atom:deleted for ${atomId}`);
  }
}
