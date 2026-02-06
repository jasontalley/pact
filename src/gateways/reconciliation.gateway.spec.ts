import { Test, TestingModule } from '@nestjs/testing';
import { Server, Socket } from 'socket.io';
import {
  ReconciliationGateway,
  ReconciliationPhase,
  ReconciliationProgressEvent,
  ReconciliationStartedEvent,
  ReconciliationCompletedEvent,
  ReconciliationFailedEvent,
  ReconciliationInterruptedEvent,
} from './reconciliation.gateway';

/**
 * Tests for WebSocket gateway for real-time reconciliation progress updates
 *
 * Related Phase 6 tasks:
 * - Part 4: Progress Reporting (WebSocket Progress Events)
 */
describe('ReconciliationGateway', () => {
  let gateway: ReconciliationGateway;
  let mockServer: jest.Mocked<Server>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReconciliationGateway],
    }).compile();

    gateway = module.get<ReconciliationGateway>(ReconciliationGateway);

    // Create mock server
    mockServer = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<Server>;

    // Inject mock server
    gateway.server = mockServer;
  });

  /**
   * Gateway must be properly instantiated by NestJS DI
   */
  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('lifecycle hooks', () => {
    /**
     * Gateway must log initialization for debugging/monitoring
     */
    it('should log on init', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      gateway.afterInit(mockServer);
      expect(logSpy).toHaveBeenCalledWith('ReconciliationGateway initialized');
    });

    /**
     * Gateway must track client connections for debugging/monitoring
     */
    it('should log on client connect', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      const mockClient = { id: 'test-client-123' } as Socket;
      gateway.handleConnection(mockClient);
      expect(logSpy).toHaveBeenCalledWith('Client connected: test-client-123');
    });

    /**
     * Gateway must track client disconnections for debugging/monitoring
     */
    it('should log on client disconnect', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      const mockClient = { id: 'test-client-123' } as Socket;
      gateway.handleDisconnect(mockClient);
      expect(logSpy).toHaveBeenCalledWith('Client disconnected: test-client-123');
    });

    /**
     * Gateway must clean up subscriptions when client disconnects
     */
    it('should remove client from subscriptions on disconnect', () => {
      const mockClient = { id: 'test-client-123' } as Socket;
      const runId = 'run-456';

      // Subscribe client to a run
      gateway.handleSubscribe(mockClient, runId);

      // Verify subscription exists
      expect(gateway['runSubscriptions'].get(runId)?.has(mockClient.id)).toBe(true);

      // Disconnect client
      gateway.handleDisconnect(mockClient);

      // Verify subscription is removed
      expect(gateway['runSubscriptions'].has(runId)).toBe(false);
    });

    /**
     * Gateway must handle disconnect when client has multiple subscriptions
     */
    it('should remove client from all subscriptions on disconnect', () => {
      const mockClient = { id: 'test-client-123' } as Socket;
      const runId1 = 'run-111';
      const runId2 = 'run-222';

      // Subscribe client to multiple runs
      gateway.handleSubscribe(mockClient, runId1);
      gateway.handleSubscribe(mockClient, runId2);

      // Disconnect client
      gateway.handleDisconnect(mockClient);

      // Verify all subscriptions are removed
      expect(gateway['runSubscriptions'].has(runId1)).toBe(false);
      expect(gateway['runSubscriptions'].has(runId2)).toBe(false);
    });
  });

  describe('handleSubscribe', () => {
    /**
     * Client can subscribe to progress events for a specific run
     */
    it('should add client to run subscription', () => {
      const mockClient = { id: 'test-client-123' } as Socket;
      const runId = 'run-456';

      const result = gateway.handleSubscribe(mockClient, runId);

      expect(result).toEqual({
        event: 'subscribed',
        data: { subscribed: true, runId },
      });
      expect(gateway['runSubscriptions'].get(runId)?.has(mockClient.id)).toBe(true);
    });

    /**
     * Multiple clients can subscribe to the same run
     */
    it('should allow multiple clients to subscribe to same run', () => {
      const client1 = { id: 'client-1' } as Socket;
      const client2 = { id: 'client-2' } as Socket;
      const runId = 'run-456';

      gateway.handleSubscribe(client1, runId);
      gateway.handleSubscribe(client2, runId);

      expect(gateway['runSubscriptions'].get(runId)?.size).toBe(2);
      expect(gateway['runSubscriptions'].get(runId)?.has(client1.id)).toBe(true);
      expect(gateway['runSubscriptions'].get(runId)?.has(client2.id)).toBe(true);
    });
  });

  describe('handleUnsubscribe', () => {
    /**
     * Client can unsubscribe from progress events for a specific run
     */
    it('should remove client from run subscription', () => {
      const mockClient = { id: 'test-client-123' } as Socket;
      const runId = 'run-456';

      // First subscribe
      gateway.handleSubscribe(mockClient, runId);
      expect(gateway['runSubscriptions'].get(runId)?.has(mockClient.id)).toBe(true);

      // Then unsubscribe
      const result = gateway.handleUnsubscribe(mockClient, runId);

      expect(result).toEqual({
        event: 'unsubscribed',
        data: { unsubscribed: true, runId },
      });
      expect(gateway['runSubscriptions'].has(runId)).toBe(false);
    });

    /**
     * Unsubscribing when not subscribed should not throw
     */
    it('should handle unsubscribe when not subscribed', () => {
      const mockClient = { id: 'test-client-123' } as Socket;
      const runId = 'run-456';

      const result = gateway.handleUnsubscribe(mockClient, runId);

      expect(result).toEqual({
        event: 'unsubscribed',
        data: { unsubscribed: true, runId },
      });
    });

    /**
     * Unsubscribing one client should not affect other clients
     */
    it('should not affect other clients subscriptions', () => {
      const client1 = { id: 'client-1' } as Socket;
      const client2 = { id: 'client-2' } as Socket;
      const runId = 'run-456';

      gateway.handleSubscribe(client1, runId);
      gateway.handleSubscribe(client2, runId);

      gateway.handleUnsubscribe(client1, runId);

      expect(gateway['runSubscriptions'].get(runId)?.has(client1.id)).toBe(false);
      expect(gateway['runSubscriptions'].get(runId)?.has(client2.id)).toBe(true);
    });
  });

  describe('emitProgress', () => {
    /**
     * Gateway must emit progress events with correct structure
     */
    it('should emit reconciliation:progress event with correct payload', () => {
      const runId = 'run-123';
      const phase: ReconciliationPhase = 'infer';
      const progress = 50;
      const message = 'Processing test files';
      const details = {
        totalTests: 100,
        processedTests: 50,
        atomsInferred: 25,
      };

      gateway.emitProgress(runId, phase, progress, message, details);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'reconciliation:progress',
        expect.objectContaining({
          type: 'reconciliation:progress',
          runId,
          phase,
          progress,
          message,
          details,
          timestamp: expect.any(Date),
        }),
      );
    });

    /**
     * Progress events should work without details
     */
    it('should emit progress event without details', () => {
      const runId = 'run-123';
      const phase: ReconciliationPhase = 'structure';
      const progress = 10;
      const message = 'Analyzing project structure';

      gateway.emitProgress(runId, phase, progress, message);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'reconciliation:progress',
        expect.objectContaining({
          type: 'reconciliation:progress',
          runId,
          phase,
          progress,
          message,
          details: undefined,
        }),
      );
    });

    /**
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      expect(() => gateway.emitProgress('run-123', 'infer', 50, 'Test')).not.toThrow();
    });
  });

  describe('emitStarted', () => {
    /**
     * Gateway must emit started event when reconciliation begins
     */
    it('should emit reconciliation:started event with correct payload', () => {
      const runId = 'run-123';
      const rootDirectory = '/path/to/project';
      const mode = 'full-scan' as const;

      gateway.emitStarted(runId, rootDirectory, mode);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'reconciliation:started',
        expect.objectContaining({
          type: 'reconciliation:started',
          runId,
          rootDirectory,
          mode,
          timestamp: expect.any(Date),
        }),
      );
    });

    /**
     * Gateway must handle both full-scan and delta modes
     */
    it('should emit started event for delta mode', () => {
      gateway.emitStarted('run-123', '/path', 'delta');

      expect(mockServer.emit).toHaveBeenCalledWith(
        'reconciliation:started',
        expect.objectContaining({
          mode: 'delta',
        }),
      );
    });

    /**
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      expect(() => gateway.emitStarted('run-123', '/path', 'full-scan')).not.toThrow();
    });
  });

  describe('emitCompleted', () => {
    /**
     * Gateway must emit completed event with summary data
     */
    it('should emit reconciliation:completed event with correct payload', () => {
      const runId = 'run-123';
      const status = 'completed' as const;
      const summary = {
        totalOrphanTests: 100,
        inferredAtomsCount: 50,
        inferredMoleculesCount: 10,
        qualityPassCount: 45,
        qualityFailCount: 5,
        duration: 30000,
      };

      gateway.emitCompleted(runId, status, summary);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'reconciliation:completed',
        expect.objectContaining({
          type: 'reconciliation:completed',
          runId,
          status,
          summary,
          timestamp: expect.any(Date),
        }),
      );
    });

    /**
     * Gateway must emit completed event with pending_review status
     */
    it('should emit completed event with pending_review status', () => {
      const summary = {
        totalOrphanTests: 100,
        inferredAtomsCount: 50,
        inferredMoleculesCount: 10,
        qualityPassCount: 20,
        qualityFailCount: 30,
        duration: 30000,
      };

      gateway.emitCompleted('run-123', 'pending_review', summary);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'reconciliation:completed',
        expect.objectContaining({
          status: 'pending_review',
        }),
      );
    });

    /**
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      const summary = {
        totalOrphanTests: 0,
        inferredAtomsCount: 0,
        inferredMoleculesCount: 0,
        qualityPassCount: 0,
        qualityFailCount: 0,
        duration: 0,
      };
      expect(() => gateway.emitCompleted('run-123', 'completed', summary)).not.toThrow();
    });
  });

  describe('emitFailed', () => {
    /**
     * Gateway must emit failed event with error details
     */
    it('should emit reconciliation:failed event with correct payload', () => {
      const runId = 'run-123';
      const error = 'Database connection failed';
      const phase: ReconciliationPhase = 'persist';

      gateway.emitFailed(runId, error, phase);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'reconciliation:failed',
        expect.objectContaining({
          type: 'reconciliation:failed',
          runId,
          error,
          phase,
          timestamp: expect.any(Date),
        }),
      );
    });

    /**
     * Gateway must emit failed event at any phase
     */
    it('should emit failed event at discover phase', () => {
      gateway.emitFailed('run-123', 'No test files found', 'discover');

      expect(mockServer.emit).toHaveBeenCalledWith(
        'reconciliation:failed',
        expect.objectContaining({
          phase: 'discover',
        }),
      );
    });

    /**
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      expect(() => gateway.emitFailed('run-123', 'Error', 'infer')).not.toThrow();
    });
  });

  describe('emitInterrupted', () => {
    /**
     * Gateway must emit interrupted event when review is required
     */
    it('should emit reconciliation:interrupted event with correct payload', () => {
      const runId = 'run-123';
      const reason = 'Quality check failed: too many low-scoring atoms';
      const pendingAtomCount = 50;
      const pendingMoleculeCount = 10;

      gateway.emitInterrupted(runId, reason, pendingAtomCount, pendingMoleculeCount);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'reconciliation:interrupted',
        expect.objectContaining({
          type: 'reconciliation:interrupted',
          runId,
          reason,
          pendingAtomCount,
          pendingMoleculeCount,
          timestamp: expect.any(Date),
        }),
      );
    });

    /**
     * Gateway must handle zero pending items
     */
    it('should emit interrupted event with zero pending items', () => {
      gateway.emitInterrupted('run-123', 'Manual review requested', 0, 0);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'reconciliation:interrupted',
        expect.objectContaining({
          pendingAtomCount: 0,
          pendingMoleculeCount: 0,
        }),
      );
    });

    /**
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      expect(() => gateway.emitInterrupted('run-123', 'Review', 10, 5)).not.toThrow();
    });
  });

  describe('event timestamp accuracy', () => {
    /**
     * All events must include accurate timestamps
     */
    it('should include current timestamp in all events', () => {
      const before = new Date();

      gateway.emitProgress('run-123', 'infer', 50, 'Test');
      gateway.emitStarted('run-123', '/path', 'full-scan');
      gateway.emitCompleted('run-123', 'completed', {
        totalOrphanTests: 0,
        inferredAtomsCount: 0,
        inferredMoleculesCount: 0,
        qualityPassCount: 0,
        qualityFailCount: 0,
        duration: 0,
      });
      gateway.emitFailed('run-123', 'Error', 'infer');
      gateway.emitInterrupted('run-123', 'Review', 0, 0);

      const after = new Date();

      // Verify all emitted events have timestamps within the test window
      const calls = mockServer.emit.mock.calls;
      calls.forEach(([, event]) => {
        const eventTimestamp = (event as { timestamp: Date }).timestamp;
        expect(eventTimestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(eventTimestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      });
    });
  });
});
