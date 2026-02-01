import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'socket.io';
import { CommitmentsGateway } from './commitments.gateway';
import { ProposedAtom } from '../modules/agents/commitment-agent.service';
import { CommitmentArtifact, CommitmentStatus } from '../modules/commitments/commitment.entity';
import { CommitmentPreviewDto } from '../modules/commitments/dto/commitment-preview.dto';

/**
 * Tests for WebSocket gateway for real-time commitment updates
 *
 * Related atoms:
 * - IA-PHASE3-001: WebSocket gateway emits real-time events for commitment operations
 */
describe('CommitmentsGateway', () => {
  let gateway: CommitmentsGateway;
  let mockServer: jest.Mocked<Server>;

  const mockCommitment: Partial<CommitmentArtifact> = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    commitmentId: 'COM-001',
    projectId: null,
    moleculeId: null,
    canonicalJson: [
      {
        atomId: 'IA-001',
        description: 'Test atom',
        category: 'functional',
        qualityScore: 85,
        observableOutcomes: [],
        falsifiabilityCriteria: [],
        tags: [],
      },
    ],
    committedBy: 'jane.doe@company.com',
    committedAt: new Date(),
    invariantChecks: [],
    status: 'active' as CommitmentStatus,
    metadata: {},
  };

  const mockProposedAtoms: ProposedAtom[] = [
    {
      tempId: 'TEMP-1',
      description: 'User can login with valid credentials',
      category: 'functional',
      qualityScore: 85,
    },
    {
      tempId: 'TEMP-2',
      description: 'User sees error message with invalid credentials',
      category: 'functional',
      qualityScore: 80,
    },
  ];

  const mockPreview: CommitmentPreviewDto = {
    canCommit: true,
    hasBlockingIssues: false,
    hasWarnings: false,
    atoms: [],
    invariantChecks: [],
    atomCount: 2,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommitmentsGateway],
    }).compile();

    gateway = module.get<CommitmentsGateway>(CommitmentsGateway);

    // Create mock server
    mockServer = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<Server>;

    // Inject mock server
    gateway.server = mockServer;
  });

  /**
   * @atom IA-PHASE3-001
   * Gateway must be properly instantiated by NestJS DI
   */
  it('should be defined', () => {
    // Gateway instance should be successfully created by DI
    expect(gateway).toBeDefined();
  });

  describe('lifecycle hooks', () => {
    /**
     * @atom IA-PHASE3-001
     * Gateway must log initialization for debugging/monitoring
     */
    it('should log on init', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      gateway.afterInit(mockServer);
      // Logger should record gateway initialization message
      expect(logSpy).toHaveBeenCalledWith('CommitmentsGateway initialized');
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must track client connections for debugging/monitoring
     */
    it('should log on client connect', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      const mockClient = { id: 'test-client-123' } as any;
      gateway.handleConnection(mockClient);
      // Logger should record client connection with client ID
      expect(logSpy).toHaveBeenCalledWith('Client connected: test-client-123');
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must track client disconnections for debugging/monitoring
     */
    it('should log on client disconnect', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      const mockClient = { id: 'test-client-123' } as any;
      gateway.handleDisconnect(mockClient);
      // Logger should record client disconnection with client ID
      expect(logSpy).toHaveBeenCalledWith('Client disconnected: test-client-123');
    });
  });

  describe('emitCommitmentProposed', () => {
    /**
     * @atom IA-PHASE3-001
     * When atoms are proposed from molecular intent, gateway must emit commitment:proposed event
     */
    it('should emit commitment:proposed event with correct payload', () => {
      gateway.emitCommitmentProposed(
        mockProposedAtoms,
        'Decomposed into 2 atomic intents',
        0.85,
        'jane.doe@company.com',
      );

      // Server should emit commitment:proposed event with atoms, analysis, confidence, and requestedBy
      expect(mockServer.emit).toHaveBeenCalledWith('commitment:proposed', {
        type: 'commitment:proposed',
        proposedAtoms: mockProposedAtoms,
        analysis: 'Decomposed into 2 atomic intents',
        confidence: 0.85,
        requestedBy: 'jane.doe@company.com',
      });
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Method should handle undefined server gracefully without throwing
      expect(() =>
        gateway.emitCommitmentProposed(mockProposedAtoms, 'Analysis', 0.85, 'user'),
      ).not.toThrow();
    });
  });

  describe('emitCommitmentPreview', () => {
    /**
     * @atom IA-PHASE3-001
     * When commitment preview is ready, gateway must emit commitment:preview event
     */
    it('should emit commitment:preview event with correct payload', () => {
      const atomIds = ['atom-1', 'atom-2'];
      const summary = 'All invariant checks passed';

      gateway.emitCommitmentPreview(atomIds, mockPreview, summary);

      // Server should emit commitment:preview event with atomIds, preview, summary, and canCommit
      expect(mockServer.emit).toHaveBeenCalledWith('commitment:preview', {
        type: 'commitment:preview',
        atomIds,
        preview: mockPreview,
        summary,
        canCommit: true,
      });
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must correctly report canCommit status from preview
     */
    it('should include canCommit status from preview', () => {
      const atomIds = ['atom-1'];
      const failingPreview: CommitmentPreviewDto = {
        ...mockPreview,
        canCommit: false,
        hasBlockingIssues: true,
        blockingIssues: ['INV-006 violation'],
      };

      gateway.emitCommitmentPreview(atomIds, failingPreview, 'Invariant violations detected');

      // Server should emit commitment:preview event with canCommit=false for failing preview
      expect(mockServer.emit).toHaveBeenCalledWith('commitment:preview', {
        type: 'commitment:preview',
        atomIds,
        preview: failingPreview,
        summary: 'Invariant violations detected',
        canCommit: false,
      });
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Method should handle undefined server gracefully without throwing
      expect(() => gateway.emitCommitmentPreview(['atom-1'], mockPreview, 'summary')).not.toThrow();
    });
  });

  describe('emitCommitmentCreated', () => {
    /**
     * @atom IA-PHASE3-001
     * When commitment is successfully created, gateway must emit commitment:created event
     */
    it('should emit commitment:created event with correct payload', () => {
      gateway.emitCommitmentCreated(mockCommitment as CommitmentArtifact);

      // Server should emit commitment:created event with commitment data and atom count
      expect(mockServer.emit).toHaveBeenCalledWith('commitment:created', {
        type: 'commitment:created',
        data: mockCommitment,
        atomCount: 1,
      });
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Method should handle undefined server gracefully without throwing
      expect(() =>
        gateway.emitCommitmentCreated(mockCommitment as CommitmentArtifact),
      ).not.toThrow();
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must handle missing canonicalJson gracefully
     */
    it('should handle missing canonicalJson', () => {
      const commitmentWithoutJson = {
        ...mockCommitment,
        canonicalJson: undefined,
      } as unknown as CommitmentArtifact;

      gateway.emitCommitmentCreated(commitmentWithoutJson);

      // Server should emit with atomCount of 0 when canonicalJson is undefined
      expect(mockServer.emit).toHaveBeenCalledWith('commitment:created', {
        type: 'commitment:created',
        data: commitmentWithoutJson,
        atomCount: 0,
      });
    });
  });

  describe('emitCommitmentFailed', () => {
    /**
     * @atom IA-PHASE3-001
     * When commitment fails due to invariant violations, gateway must emit commitment:failed event
     */
    it('should emit commitment:failed event with correct payload', () => {
      const atomIds = ['atom-1', 'atom-2'];
      const reason = 'Invariant violations detected';
      const blockingIssues = [
        'INV-006: Agent commit not allowed',
        'INV-004: Atom already committed',
      ];

      gateway.emitCommitmentFailed(atomIds, reason, blockingIssues);

      // Server should emit commitment:failed event with atomIds, reason, and blockingIssues
      expect(mockServer.emit).toHaveBeenCalledWith('commitment:failed', {
        type: 'commitment:failed',
        atomIds,
        reason,
        blockingIssues,
      });
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Method should handle undefined server gracefully without throwing
      expect(() => gateway.emitCommitmentFailed(['atom-1'], 'Failed', [])).not.toThrow();
    });
  });

  describe('emitCommitmentSuperseded', () => {
    /**
     * @atom IA-PHASE3-001
     * When a commitment is superseded, gateway must emit commitment:superseded event
     */
    it('should emit commitment:superseded event with correct payload', () => {
      gateway.emitCommitmentSuperseded('COM-001', 'COM-002', 'Updated requirements');

      // Server should emit commitment:superseded event with original and new commitment IDs
      expect(mockServer.emit).toHaveBeenCalledWith('commitment:superseded', {
        type: 'commitment:superseded',
        originalCommitmentId: 'COM-001',
        newCommitmentId: 'COM-002',
        reason: 'Updated requirements',
      });
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must handle optional reason parameter
     */
    it('should emit without reason if not provided', () => {
      gateway.emitCommitmentSuperseded('COM-001', 'COM-002');

      // Server should emit with undefined reason when not provided
      expect(mockServer.emit).toHaveBeenCalledWith('commitment:superseded', {
        type: 'commitment:superseded',
        originalCommitmentId: 'COM-001',
        newCommitmentId: 'COM-002',
        reason: undefined,
      });
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Method should handle undefined server gracefully without throwing
      expect(() => gateway.emitCommitmentSuperseded('COM-001', 'COM-002')).not.toThrow();
    });
  });

  describe('emitInvariantCheckProgress', () => {
    /**
     * @atom IA-PHASE3-001
     * During invariant checking, gateway must emit progress events
     */
    it('should emit invariant:checking event with correct payload', () => {
      const atomIds = ['atom-1', 'atom-2'];

      gateway.emitInvariantCheckProgress(atomIds, 'INV-004', 50);

      // Server should emit invariant:checking event with atomIds, currentInvariant, and progress
      expect(mockServer.emit).toHaveBeenCalledWith('invariant:checking', {
        type: 'invariant:checking',
        atomIds,
        currentInvariant: 'INV-004',
        progress: 50,
      });
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must handle 0% and 100% progress values
     */
    it('should handle boundary progress values', () => {
      gateway.emitInvariantCheckProgress(['atom-1'], 'INV-001', 0);
      // Progress of 0 should be correctly reported as the starting point
      expect(mockServer.emit).toHaveBeenCalledWith(
        'invariant:checking',
        expect.objectContaining({ progress: 0 }),
      );

      gateway.emitInvariantCheckProgress(['atom-1'], 'INV-009', 100);
      // Progress of 100 should be correctly reported as completion
      expect(mockServer.emit).toHaveBeenCalledWith(
        'invariant:checking',
        expect.objectContaining({ progress: 100 }),
      );
    });

    /**
     * @atom IA-PHASE3-001
     * Gateway must handle undefined server gracefully
     */
    it('should not throw if server is undefined', () => {
      gateway.server = undefined as unknown as Server;
      // Method should handle undefined server gracefully without throwing
      expect(() => gateway.emitInvariantCheckProgress(['atom-1'], 'INV-001', 50)).not.toThrow();
    });
  });
});
