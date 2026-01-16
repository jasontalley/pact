import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'socket.io';
import { AtomsGateway } from './atoms.gateway';
import { Atom } from '../modules/atoms/atom.entity';

/**
 * Tests for WebSocket gateway for real-time atom updates
 *
 * Related atoms:
 * - IA-039: WebSocket gateway emits real-time events for atom operations
 */
describe('AtomsGateway', () => {
  let gateway: AtomsGateway;
  let mockServer: jest.Mocked<Server>;

  const mockAtom: Partial<Atom> = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    atomId: 'IA-001',
    description: 'Test atom description for WebSocket events',
    category: 'functional',
    status: 'draft',
    qualityScore: 85,
    tags: ['test'],
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AtomsGateway],
    }).compile();

    gateway = module.get<AtomsGateway>(AtomsGateway);

    // Create mock server
    mockServer = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<Server>;

    // Inject mock server
    gateway.server = mockServer;
  });

  /**
   * @atom IA-042
   * Gateway must be properly instantiated by NestJS DI
   */
  it('should be defined', () => {
    // Verifies gateway is created by dependency injection
    expect(gateway).toBeDefined();
  });

  describe('lifecycle hooks', () => {
    /**
     * @atom IA-042
     * Gateway must log initialization for debugging/monitoring
     */
    it('should log on init', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      gateway.afterInit(mockServer);
      // Verifies initialization is logged with correct message
      expect(logSpy).toHaveBeenCalledWith('AtomsGateway initialized');
    });

    /**
     * @atom IA-042
     * Gateway must track client connections for debugging/monitoring
     */
    it('should log on client connect', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      const mockClient = { id: 'test-client-123' } as any;
      gateway.handleConnection(mockClient);
      // Verifies client connection is logged with client ID
      expect(logSpy).toHaveBeenCalledWith('Client connected: test-client-123');
    });

    /**
     * @atom IA-042
     * Gateway must track client disconnections for debugging/monitoring
     */
    it('should log on client disconnect', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      const mockClient = { id: 'test-client-123' } as any;
      gateway.handleDisconnect(mockClient);
      // Verifies client disconnection is logged with client ID
      expect(logSpy).toHaveBeenCalledWith(
        'Client disconnected: test-client-123',
      );
    });
  });

  describe('emitAtomCreated', () => {
    /**
     * @atom IA-042
     * When an atom is created, gateway must emit atom:created event with full atom data
     */
    it('should emit atom:created event with correct payload', () => {
      gateway.emitAtomCreated(mockAtom as Atom);

      // Verifies event is emitted with correct event name and payload structure
      expect(mockServer.emit).toHaveBeenCalledWith('atom:created', {
        type: 'atom:created',
        data: mockAtom,
      });
    });

    /**
     * @atom IA-042
     * Gateway must handle undefined server gracefully (e.g., during tests or initialization)
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Verifies graceful handling when server is not yet initialized
      expect(() => gateway.emitAtomCreated(mockAtom as Atom)).not.toThrow();
    });
  });

  describe('emitAtomCommitted', () => {
    /**
     * @atom IA-042
     * When an atom is committed, gateway must emit atom:committed event with atom data
     */
    it('should emit atom:committed event with correct payload', () => {
      const committedAtom = {
        ...mockAtom,
        status: 'committed',
        committedAt: new Date(),
      };

      gateway.emitAtomCommitted(committedAtom as Atom);

      // Verifies commit event includes atom ID and full atom data
      expect(mockServer.emit).toHaveBeenCalledWith('atom:committed', {
        type: 'atom:committed',
        atomId: committedAtom.id,
        data: committedAtom,
      });
    });

    /**
     * @atom IA-042
     * Gateway must handle undefined server gracefully during commit events
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Verifies graceful handling when server is not yet initialized
      expect(() => gateway.emitAtomCommitted(mockAtom as Atom)).not.toThrow();
    });
  });

  describe('emitAtomSuperseded', () => {
    /**
     * @atom IA-042
     * When an atom is superseded, gateway must emit atom:superseded with both old and new IDs
     */
    it('should emit atom:superseded event with correct payload', () => {
      const oldAtomId = '550e8400-e29b-41d4-a716-446655440000';
      const newAtomId = '550e8400-e29b-41d4-a716-446655440001';

      gateway.emitAtomSuperseded(oldAtomId, newAtomId);

      // Verifies supersede event includes both old and new atom IDs
      expect(mockServer.emit).toHaveBeenCalledWith('atom:superseded', {
        type: 'atom:superseded',
        atomId: oldAtomId,
        newAtomId: newAtomId,
      });
    });

    /**
     * @atom IA-042
     * Gateway must handle undefined server gracefully during supersede events
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Verifies graceful handling when server is not yet initialized
      expect(() =>
        gateway.emitAtomSuperseded('old-id', 'new-id'),
      ).not.toThrow();
    });
  });

  describe('emitAtomUpdated', () => {
    /**
     * @atom IA-042
     * When a draft atom is updated, gateway must emit atom:updated with updated data
     */
    it('should emit atom:updated event with correct payload', () => {
      const updatedAtom = {
        ...mockAtom,
        description: 'Updated description',
      };

      gateway.emitAtomUpdated(updatedAtom as Atom);

      // Verifies update event includes atom ID and full updated atom data
      expect(mockServer.emit).toHaveBeenCalledWith('atom:updated', {
        type: 'atom:updated',
        atomId: updatedAtom.id,
        data: updatedAtom,
      });
    });

    /**
     * @atom IA-042
     * Gateway must handle undefined server gracefully during update events
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Verifies graceful handling when server is not yet initialized
      expect(() => gateway.emitAtomUpdated(mockAtom as Atom)).not.toThrow();
    });
  });

  describe('emitAtomDeleted', () => {
    /**
     * @atom IA-042
     * When a draft atom is deleted, gateway must emit atom:deleted with the atom ID
     */
    it('should emit atom:deleted event with correct payload', () => {
      const atomId = '550e8400-e29b-41d4-a716-446655440000';

      gateway.emitAtomDeleted(atomId);

      // Verifies delete event includes the deleted atom's ID
      expect(mockServer.emit).toHaveBeenCalledWith('atom:deleted', {
        type: 'atom:deleted',
        atomId: atomId,
      });
    });

    /**
     * @atom IA-042
     * Gateway must handle undefined server gracefully during delete events
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Verifies graceful handling when server is not yet initialized
      expect(() => gateway.emitAtomDeleted('test-id')).not.toThrow();
    });
  });
});
