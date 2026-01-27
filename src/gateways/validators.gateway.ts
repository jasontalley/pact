import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { Validator } from '../modules/validators/validator.entity';

/**
 * WebSocket event types for validator operations
 */
export interface ValidatorCreatedEvent {
  type: 'validator:created';
  data: Validator;
  atomId: string;
}

export interface ValidatorUpdatedEvent {
  type: 'validator:updated';
  validatorId: string;
  data: Validator;
  atomId: string;
}

export interface ValidatorActivatedEvent {
  type: 'validator:activated';
  validatorId: string;
  atomId: string;
}

export interface ValidatorDeactivatedEvent {
  type: 'validator:deactivated';
  validatorId: string;
  atomId: string;
}

export interface ValidatorDeletedEvent {
  type: 'validator:deleted';
  validatorId: string;
  atomId: string;
}

export interface ValidatorTranslatedEvent {
  type: 'validator:translated';
  validatorId: string;
  targetFormat: string;
  atomId: string;
}

export type ValidatorEvent =
  | ValidatorCreatedEvent
  | ValidatorUpdatedEvent
  | ValidatorActivatedEvent
  | ValidatorDeactivatedEvent
  | ValidatorDeletedEvent
  | ValidatorTranslatedEvent;

/**
 * WebSocket Gateway for real-time validator updates
 *
 * Emits events when validators are created, updated, activated, deactivated,
 * deleted, or translated. Frontend clients can subscribe to these events
 * to update their UI in real-time.
 *
 * @atom IA-PHASE2-008 Real-time validator events via WebSocket
 */
@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/validators',
})
export class ValidatorsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ValidatorsGateway.name);

  afterInit(_server: Server): void {
    this.logger.log('ValidatorsGateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Emit event when a new validator is created
   */
  emitValidatorCreated(validator: Validator): void {
    const event: ValidatorCreatedEvent = {
      type: 'validator:created',
      data: validator,
      atomId: validator.atomId,
    };
    this.server?.emit('validator:created', event);
    this.logger.debug(`Emitted validator:created for ${validator.id} (atom: ${validator.atomId})`);
  }

  /**
   * Emit event when a validator is updated
   */
  emitValidatorUpdated(validator: Validator): void {
    const event: ValidatorUpdatedEvent = {
      type: 'validator:updated',
      validatorId: validator.id,
      data: validator,
      atomId: validator.atomId,
    };
    this.server?.emit('validator:updated', event);
    this.logger.debug(`Emitted validator:updated for ${validator.id}`);
  }

  /**
   * Emit event when a validator is activated
   */
  emitValidatorActivated(validator: Validator): void {
    const event: ValidatorActivatedEvent = {
      type: 'validator:activated',
      validatorId: validator.id,
      atomId: validator.atomId,
    };
    this.server?.emit('validator:activated', event);
    this.logger.debug(`Emitted validator:activated for ${validator.id}`);
  }

  /**
   * Emit event when a validator is deactivated
   */
  emitValidatorDeactivated(validator: Validator): void {
    const event: ValidatorDeactivatedEvent = {
      type: 'validator:deactivated',
      validatorId: validator.id,
      atomId: validator.atomId,
    };
    this.server?.emit('validator:deactivated', event);
    this.logger.debug(`Emitted validator:deactivated for ${validator.id}`);
  }

  /**
   * Emit event when a validator is deleted (hard delete)
   */
  emitValidatorDeleted(validatorId: string, atomId: string): void {
    const event: ValidatorDeletedEvent = {
      type: 'validator:deleted',
      validatorId,
      atomId,
    };
    this.server?.emit('validator:deleted', event);
    this.logger.debug(`Emitted validator:deleted for ${validatorId}`);
  }

  /**
   * Emit event when a validator is translated to a new format
   */
  emitValidatorTranslated(validator: Validator, targetFormat: string): void {
    const event: ValidatorTranslatedEvent = {
      type: 'validator:translated',
      validatorId: validator.id,
      targetFormat,
      atomId: validator.atomId,
    };
    this.server?.emit('validator:translated', event);
    this.logger.debug(`Emitted validator:translated for ${validator.id} to ${targetFormat}`);
  }
}
