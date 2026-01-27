import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'socket.io';
import { ValidatorsGateway } from './validators.gateway';
import { Validator, ValidatorType, ValidatorFormat } from '../modules/validators/validator.entity';

/**
 * Tests for WebSocket gateway for real-time validator updates
 *
 * @atom IA-PHASE2-008 Real-time validator events via WebSocket
 */
describe('ValidatorsGateway', () => {
  let gateway: ValidatorsGateway;
  let mockServer: jest.Mocked<Server>;

  const mockValidator: Partial<Validator> = {
    id: 'validator-uuid-123',
    atomId: 'atom-uuid-456',
    name: 'Test Validator',
    description: 'A test validator for WebSocket events',
    validatorType: 'gherkin' as ValidatorType,
    content: 'Given a test\nWhen executed\nThen it passes',
    format: 'gherkin' as ValidatorFormat,
    originalFormat: 'gherkin' as ValidatorFormat,
    isActive: true,
    executionCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ValidatorsGateway],
    }).compile();

    gateway = module.get<ValidatorsGateway>(ValidatorsGateway);

    // Create mock server
    mockServer = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<Server>;

    // Inject mock server
    gateway.server = mockServer;
  });

  /**
   * @atom IA-PHASE2-008
   * Gateway must be properly instantiated by NestJS DI
   */
  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('lifecycle hooks', () => {
    /**
     * @atom IA-PHASE2-008
     * Gateway must log initialization for debugging/monitoring
     */
    it('should log on init', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      gateway.afterInit(mockServer);
      expect(logSpy).toHaveBeenCalledWith('ValidatorsGateway initialized');
    });

    /**
     * @atom IA-PHASE2-008
     * Gateway must track client connections for debugging/monitoring
     */
    it('should log on client connect', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      const mockClient = { id: 'test-client-123' } as any;
      gateway.handleConnection(mockClient);
      expect(logSpy).toHaveBeenCalledWith('Client connected: test-client-123');
    });

    /**
     * @atom IA-PHASE2-008
     * Gateway must track client disconnections for debugging/monitoring
     */
    it('should log on client disconnect', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      const mockClient = { id: 'test-client-123' } as any;
      gateway.handleDisconnect(mockClient);
      expect(logSpy).toHaveBeenCalledWith('Client disconnected: test-client-123');
    });
  });

  describe('emitValidatorCreated', () => {
    /**
     * @atom IA-PHASE2-008
     * When a validator is created, gateway must emit validator:created event with full data
     */
    it('should emit validator:created event with correct payload', () => {
      gateway.emitValidatorCreated(mockValidator as Validator);

      expect(mockServer.emit).toHaveBeenCalledWith('validator:created', {
        type: 'validator:created',
        data: mockValidator,
        atomId: mockValidator.atomId,
      });
    });

    /**
     * @atom IA-PHASE2-008
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      expect(() => gateway.emitValidatorCreated(mockValidator as Validator)).not.toThrow();
    });
  });

  describe('emitValidatorUpdated', () => {
    /**
     * @atom IA-PHASE2-008
     * When a validator is updated, gateway must emit validator:updated event
     */
    it('should emit validator:updated event with correct payload', () => {
      const updatedValidator = {
        ...mockValidator,
        description: 'Updated description',
      };

      gateway.emitValidatorUpdated(updatedValidator as Validator);

      expect(mockServer.emit).toHaveBeenCalledWith('validator:updated', {
        type: 'validator:updated',
        validatorId: updatedValidator.id,
        data: updatedValidator,
        atomId: updatedValidator.atomId,
      });
    });

    /**
     * @atom IA-PHASE2-008
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      expect(() => gateway.emitValidatorUpdated(mockValidator as Validator)).not.toThrow();
    });
  });

  describe('emitValidatorActivated', () => {
    /**
     * @atom IA-PHASE2-008
     * When a validator is activated, gateway must emit validator:activated event
     */
    it('should emit validator:activated event with correct payload', () => {
      gateway.emitValidatorActivated(mockValidator as Validator);

      expect(mockServer.emit).toHaveBeenCalledWith('validator:activated', {
        type: 'validator:activated',
        validatorId: mockValidator.id,
        atomId: mockValidator.atomId,
      });
    });

    /**
     * @atom IA-PHASE2-008
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      expect(() => gateway.emitValidatorActivated(mockValidator as Validator)).not.toThrow();
    });
  });

  describe('emitValidatorDeactivated', () => {
    /**
     * @atom IA-PHASE2-008
     * When a validator is deactivated, gateway must emit validator:deactivated event
     */
    it('should emit validator:deactivated event with correct payload', () => {
      gateway.emitValidatorDeactivated(mockValidator as Validator);

      expect(mockServer.emit).toHaveBeenCalledWith('validator:deactivated', {
        type: 'validator:deactivated',
        validatorId: mockValidator.id,
        atomId: mockValidator.atomId,
      });
    });

    /**
     * @atom IA-PHASE2-008
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      expect(() => gateway.emitValidatorDeactivated(mockValidator as Validator)).not.toThrow();
    });
  });

  describe('emitValidatorDeleted', () => {
    /**
     * @atom IA-PHASE2-008
     * When a validator is hard deleted, gateway must emit validator:deleted event
     */
    it('should emit validator:deleted event with correct payload', () => {
      const validatorId = 'validator-uuid-123';
      const atomId = 'atom-uuid-456';

      gateway.emitValidatorDeleted(validatorId, atomId);

      expect(mockServer.emit).toHaveBeenCalledWith('validator:deleted', {
        type: 'validator:deleted',
        validatorId,
        atomId,
      });
    });

    /**
     * @atom IA-PHASE2-008
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      expect(() => gateway.emitValidatorDeleted('test-id', 'atom-id')).not.toThrow();
    });
  });

  describe('emitValidatorTranslated', () => {
    /**
     * @atom IA-PHASE2-008
     * When a validator is translated, gateway must emit validator:translated event
     */
    it('should emit validator:translated event with correct payload', () => {
      gateway.emitValidatorTranslated(mockValidator as Validator, 'natural_language');

      expect(mockServer.emit).toHaveBeenCalledWith('validator:translated', {
        type: 'validator:translated',
        validatorId: mockValidator.id,
        targetFormat: 'natural_language',
        atomId: mockValidator.atomId,
      });
    });

    /**
     * @atom IA-PHASE2-008
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      expect(() =>
        gateway.emitValidatorTranslated(mockValidator as Validator, 'typescript'),
      ).not.toThrow();
    });
  });
});
