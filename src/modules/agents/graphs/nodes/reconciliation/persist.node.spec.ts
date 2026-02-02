/**
 * Persist Node Tests
 *
 * Tests for the persist node that finalizes reconciliation results.
 * Critical tests for the UPDATE vs INSERT logic (prevents duplicate key errors).
 *
 * @see docs/implementation-checklist-phase6.md Section 2.1
 */

import { createPersistNode, PersistNodeOptions } from './persist.node';
import {
  ReconciliationGraphStateType,
  InferredAtom,
  InferredMolecule,
  OrphanTestInfo,
} from '../../types/reconciliation-state';
import { ReconciliationResult } from '../../types/reconciliation-result';
import { NodeConfig } from '../types';
import { ReconciliationRepository } from '../../../repositories/reconciliation.repository';

// Mock the git-utils module
jest.mock('../../../utils/git-utils', () => ({
  getCurrentCommitHash: jest.fn().mockResolvedValue('def456'),
}));

/**
 * Create mock logger
 */
const createMockLogger = () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
  localInstance: undefined,
  options: {},
  registerLocalInstanceRef: jest.fn(),
});

/**
 * Create mock NodeConfig
 */
function createMockNodeConfig(): NodeConfig {
  return {
    llmService: {
      invoke: jest.fn(),
      invokeWithTools: jest.fn(),
    } as any,
    toolRegistry: {
      hasTool: jest.fn().mockReturnValue(true),
      executeTool: jest.fn(),
      getTools: jest.fn().mockReturnValue([]),
    } as any,
    logger: createMockLogger() as any,
  };
}

/**
 * Create mock repository
 */
function createMockRepository(): jest.Mocked<ReconciliationRepository> {
  return {
    createRun: jest.fn().mockResolvedValue({ id: 'new-run-uuid', runId: 'REC-new' }),
    createAtomRecommendations: jest.fn().mockResolvedValue([]),
    createMoleculeRecommendations: jest.fn().mockResolvedValue([]),
    createTestRecords: jest.fn().mockResolvedValue([]),
    findRunByRunId: jest.fn(),
    updateRunStatus: jest.fn().mockResolvedValue(undefined),
    storePatchOps: jest.fn().mockResolvedValue(undefined),
    findAtomRecommendationsByRun: jest.fn(),
    findMoleculeRecommendationsByRun: jest.fn(),
    listRuns: jest.fn(),
    getPatchOps: jest.fn(),
  } as unknown as jest.Mocked<ReconciliationRepository>;
}

/**
 * Create mock state
 */
function createMockState(
  overrides: Partial<ReconciliationGraphStateType> = {},
): ReconciliationGraphStateType {
  return {
    rootDirectory: '/test/project',
    input: {
      rootDirectory: '/test/project',
      reconciliationMode: 'full-scan',
      options: { qualityThreshold: 80 },
    },
    repoStructure: { files: [], testFiles: [] },
    orphanTests: [],
    changedAtomLinkedTests: [],
    deltaSummary: null,
    documentationIndex: null,
    contextPerTest: new Map(),
    inferredAtoms: [],
    inferredMolecules: [],
    currentPhase: 'persist',
    iteration: 0,
    maxIterations: 10,
    errors: [],
    decisions: [],
    pendingHumanReview: false,
    humanReviewInput: null,
    wasResumed: false,
    output: null,
    interimRunId: null,
    interimRunUuid: null,
    startTime: new Date(Date.now() - 60000), // 1 minute ago
    llmCallCount: 5,
    ...overrides,
  };
}

/**
 * Create mock inferred atoms
 */
function createMockAtoms(count: number, qualityScore = 85): InferredAtom[] {
  return Array.from({ length: count }, (_, i) => ({
    tempId: `temp-${i}`,
    description: `Test atom ${i}`,
    category: 'functional',
    confidence: 0.8,
    qualityScore,
    observableOutcomes: ['Outcome 1'],
    reasoning: 'Inferred from test',
    sourceTest: {
      filePath: `/test/file${i}.spec.ts`,
      testName: `should do something ${i}`,
      lineNumber: 10 + i,
    },
  }));
}

describe('PersistNode', () => {
  let mockConfig: NodeConfig;
  let mockRepository: jest.Mocked<ReconciliationRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = createMockNodeConfig();
    mockRepository = createMockRepository();
  });

  describe('UPDATE vs INSERT logic (critical - prevents duplicate key)', () => {
    it('should UPDATE existing run when interimRunUuid is present', async () => {
      // This is the expected path after interim-persist saves the run
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-from-service',
          options: { qualityThreshold: 80 },
        },
        interimRunId: 'REC-from-service',
        interimRunUuid: 'interim-uuid-123', // This triggers UPDATE path
        inferredAtoms: createMockAtoms(3),
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      // Should UPDATE, not INSERT
      expect(mockRepository.updateRunStatus).toHaveBeenCalledWith(
        'REC-from-service',
        'completed',
        expect.any(Object),
      );
      expect(mockRepository.storePatchOps).toHaveBeenCalled();

      // Should NOT call createRun (which would cause duplicate key)
      expect(mockRepository.createRun).not.toHaveBeenCalled();
    });

    it('should INSERT new run when interimRunUuid is NOT present', async () => {
      // Fallback path when interim-persist was skipped or failed
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-new-run',
          options: { qualityThreshold: 80 },
        },
        interimRunId: null, // No interim run
        interimRunUuid: null, // No interim run UUID
        inferredAtoms: createMockAtoms(3),
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      // Should INSERT new run
      expect(mockRepository.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'REC-new-run',
        }),
      );

      // Should also update status after creation
      expect(mockRepository.updateRunStatus).toHaveBeenCalled();
    });

    it('should use interimRunId for runId consistency', async () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-service-generated',
          options: {},
        },
        interimRunId: 'REC-from-interim', // Should prefer this
        interimRunUuid: 'interim-uuid',
        inferredAtoms: createMockAtoms(2),
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      const result = await node(state);

      // Result should use interimRunId
      const output = result.output as ReconciliationResult;
      expect(output.runId).toBe('REC-from-interim');

      // Database operations should use interimRunId
      expect(mockRepository.storePatchOps).toHaveBeenCalledWith(
        'REC-from-interim',
        expect.any(Array),
      );
    });

    it('should handle missing interimRunId but present input.runId', async () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-input-run',
          options: {},
        },
        interimRunId: null,
        interimRunUuid: null,
        inferredAtoms: createMockAtoms(2),
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      const result = await node(state);

      // Should fall back to input.runId
      const output = result.output as ReconciliationResult;
      expect(output.runId).toBe('REC-input-run');
    });

    it('should generate runId when none provided', async () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {},
        },
        interimRunId: null,
        interimRunUuid: null,
        inferredAtoms: createMockAtoms(2),
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      const result = await node(state);

      // Should generate a runId
      const output = result.output as ReconciliationResult;
      expect(output.runId).toMatch(/^REC-[a-f0-9]{8}$/);
    });
  });

  describe('status determination', () => {
    it('should set status to completed when no errors', async () => {
      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: createMockAtoms(2),
        errors: [],
        pendingHumanReview: false,
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockRepository.updateRunStatus).toHaveBeenCalledWith(
        'REC-test',
        'completed',
        expect.any(Object),
      );
    });

    it('should set status to failed when errors present', async () => {
      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: createMockAtoms(2),
        errors: ['[timestamp] context: LLM timeout'],
        pendingHumanReview: false,
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockRepository.updateRunStatus).toHaveBeenCalledWith(
        'REC-test',
        'failed',
        expect.any(Object),
      );
    });

    it('should set status to pending_review when human review needed', async () => {
      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: createMockAtoms(2),
        errors: [],
        pendingHumanReview: true,
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockRepository.updateRunStatus).toHaveBeenCalledWith(
        'REC-test',
        'pending_review',
        expect.any(Object),
      );
    });
  });

  describe('summary calculation', () => {
    it('should calculate quality pass/fail counts correctly', async () => {
      const passingAtoms = createMockAtoms(3, 85); // qualityScore >= 80
      const failingAtoms = createMockAtoms(2, 60); // qualityScore < 80
      // Set different tempIds for failing atoms
      failingAtoms.forEach((a, i) => (a.tempId = `fail-${i}`));

      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: [...passingAtoms, ...failingAtoms],
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: { qualityThreshold: 80 },
        },
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockRepository.updateRunStatus).toHaveBeenCalledWith(
        'REC-test',
        'completed',
        expect.objectContaining({
          qualityPassCount: 3,
          qualityFailCount: 2,
          inferredAtomsCount: 5,
        }),
      );
    });

    it('should include duration in summary', async () => {
      const startTime = new Date(Date.now() - 120000); // 2 minutes ago
      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: createMockAtoms(2),
        startTime,
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      // Duration should be approximately 120000ms (2 minutes)
      const summaryArg = mockRepository.updateRunStatus.mock.calls[0][2] as { duration: number };
      expect(summaryArg.duration).toBeGreaterThanOrEqual(119000);
      expect(summaryArg.duration).toBeLessThanOrEqual(125000);
    });

    it('should include llmCallCount in summary', async () => {
      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: createMockAtoms(2),
        llmCallCount: 42,
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockRepository.updateRunStatus).toHaveBeenCalledWith(
        'REC-test',
        'completed',
        expect.objectContaining({
          llmCalls: 42,
        }),
      );
    });
  });

  describe('patch operations', () => {
    it('should store patch ops when updating existing run', async () => {
      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: createMockAtoms(3, 90), // All pass quality
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockRepository.storePatchOps).toHaveBeenCalledWith(
        'REC-test',
        expect.arrayContaining([expect.objectContaining({ type: 'createAtom' })]),
      );
    });

    it('should generate attachTest ops when includeAttachTestOps is true and atoms pass quality', async () => {
      // Create atoms that pass quality threshold (90 >= 80)
      const atoms = createMockAtoms(2, 90);
      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: { qualityThreshold: 80 },
        },
      });

      const node = createPersistNode({
        repository: mockRepository,
        includeAttachTestOps: true,
      })(mockConfig);
      const result = await node(state);

      // Check the output patch - type is 'attachTestToAtom'
      const output = result.output as ReconciliationResult;
      const attachOps = output.patch.ops.filter((op: any) => op.type === 'attachTestToAtom');
      expect(attachOps.length).toBe(2); // One for each atom that passed quality
    });

    it('should skip attachTest ops when includeAttachTestOps is false', async () => {
      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: createMockAtoms(2, 90),
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: { qualityThreshold: 80 },
        },
      });

      const node = createPersistNode({
        repository: mockRepository,
        includeAttachTestOps: false,
      })(mockConfig);
      const result = await node(state);

      const output = result.output as ReconciliationResult;
      const attachOps = output.patch.ops.filter((op: any) => op.type === 'attachTestToAtom');
      expect(attachOps.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should log error but not fail when database update fails', async () => {
      mockRepository.updateRunStatus.mockRejectedValue(new Error('DB connection lost'));

      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: createMockAtoms(2),
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);

      // Should not throw
      const result = await node(state);

      // Should still return output
      expect(result.output).toBeDefined();
      const output = result.output as ReconciliationResult;
      expect(output.runId).toBe('REC-test');

      // Should log the error
      expect(mockConfig.logger?.error).toHaveBeenCalledWith(
        expect.stringContaining('Database persistence failed'),
      );
    });

    it('should work without repository', async () => {
      const state = createMockState({
        interimRunId: 'REC-test',
        inferredAtoms: createMockAtoms(2),
      });

      const node = createPersistNode({})(mockConfig); // No repository
      const result = await node(state);

      // Should still produce output
      expect(result.output).toBeDefined();
      const output = result.output as ReconciliationResult;
      expect(output.runId).toBe('REC-test');
      expect(output.patch).toBeDefined();
    });
  });

  describe('output result structure', () => {
    it('should include all required fields in output', async () => {
      const state = createMockState({
        interimRunId: 'REC-test',
        interimRunUuid: 'uuid',
        inferredAtoms: createMockAtoms(3, 85),
        inferredMolecules: [],
        orphanTests: [
          { filePath: '/test.spec.ts', testName: 'test1', lineNumber: 10, testCode: 'code' },
        ],
      });

      const node = createPersistNode({ repository: mockRepository })(mockConfig);
      const result = await node(state);

      expect(result.output).toMatchObject({
        runId: 'REC-test',
        status: 'completed',
        patch: expect.objectContaining({
          ops: expect.any(Array),
          metadata: expect.objectContaining({
            runId: 'REC-test',
            mode: 'full-scan',
          }),
        }),
        summary: expect.objectContaining({
          totalOrphanTests: 1,
          inferredAtomsCount: 3,
          inferredMoleculesCount: 0,
        }),
        metadata: expect.objectContaining({
          duration: expect.any(Number),
          llmCalls: expect.any(Number),
        }),
      });
    });

    it('should return output without currentPhase (terminal node)', async () => {
      // Persist is the final node, so it only returns output
      const state = createMockState({
        interimRunId: 'REC-test',
        inferredAtoms: createMockAtoms(2),
      });

      const node = createPersistNode({})(mockConfig);
      const result = await node(state);

      // Persist node returns only output, not currentPhase
      expect(result.output).toBeDefined();
      expect(result.currentPhase).toBeUndefined();
    });
  });
});
