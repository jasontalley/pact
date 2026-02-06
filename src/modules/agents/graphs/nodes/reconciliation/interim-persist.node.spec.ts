/**
 * Interim Persist Node Tests
 *
 * Tests for the interim persist node that saves results before verification.
 * Critical tests for runId consistency (the bug that caused duplicate key errors).
 *
 * @see docs/implementation-checklist-phase6.md Section 2.1
 */

import { createInterimPersistNode, InterimPersistNodeOptions } from './interim-persist.node';
import {
  ReconciliationGraphStateType,
  InferredAtom,
  InferredMolecule,
  OrphanTestInfo,
} from '../../types/reconciliation-state';
import { NodeConfig } from '../types';
import { ReconciliationRepository } from '../../../repositories/reconciliation.repository';

// Mock the git-utils module
jest.mock('../../../utils/git-utils', () => ({
  getCurrentCommitHash: jest.fn().mockResolvedValue('abc123'),
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
    createRun: jest.fn().mockResolvedValue({ id: 'run-uuid-123', runId: 'REC-test123' }),
    createAtomRecommendations: jest.fn().mockResolvedValue([
      { id: 'atom-rec-1', tempId: 'temp-1' },
      { id: 'atom-rec-2', tempId: 'temp-2' },
    ]),
    createMoleculeRecommendations: jest.fn().mockResolvedValue([]),
    createTestRecords: jest.fn().mockResolvedValue([]),
    findRunByRunId: jest.fn(),
    updateRunStatus: jest.fn(),
    storePatchOps: jest.fn(),
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
    currentPhase: 'synthesize',
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
    startTime: new Date(),
    llmCallCount: 0,
    ...overrides,
  };
}

/**
 * Create mock inferred atoms
 */
function createMockAtoms(count: number): InferredAtom[] {
  return Array.from({ length: count }, (_, i) => ({
    tempId: `temp-${i}`,
    description: `Test atom ${i}`,
    category: 'functional',
    confidence: 0.8,
    qualityScore: 75,
    observableOutcomes: ['Outcome 1'],
    reasoning: 'Inferred from test',
    sourceTest: {
      filePath: `/test/file${i}.spec.ts`,
      testName: `should do something ${i}`,
      lineNumber: 10 + i,
    },
  }));
}

/**
 * Create mock inferred molecules
 */
function createMockMolecules(count: number): InferredMolecule[] {
  return Array.from({ length: count }, (_, i) => ({
    tempId: `mol-temp-${i}`,
    name: `Test Molecule ${i}`,
    description: `A molecule for testing ${i}`,
    atomTempIds: ['temp-0', 'temp-1'],
    confidence: 0.7,
    reasoning: 'Grouped related atoms',
  }));
}

/**
 * Create mock orphan tests
 */
function createMockOrphanTests(count: number): OrphanTestInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    filePath: `/test/file${i}.spec.ts`,
    testName: `should do something ${i}`,
    lineNumber: 10 + i,
    testCode: `it('should do something ${i}', () => { expect(true).toBe(true); })`,
  }));
}

describe('InterimPersistNode', () => {
  let mockConfig: NodeConfig;
  let mockRepository: jest.Mocked<ReconciliationRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = createMockNodeConfig();
    mockRepository = createMockRepository();
  });

  describe('runId consistency (critical bug fix)', () => {
    it('should use runId from input when provided', async () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-from-service', // Service-generated runId
          options: {},
        },
        inferredAtoms: createMockAtoms(2),
      });

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      const result = await node(state);

      // Must use the runId from input for consistency across nodes
      expect(result.interimRunId).toBe('REC-from-service');
      expect(mockRepository.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'REC-from-service',
        }),
      );
    });

    it('should generate runId if not provided in input', async () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {},
          // No runId provided
        },
        inferredAtoms: createMockAtoms(2),
      });

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      const result = await node(state);

      // Should generate a runId in REC-XXXXXXXX format
      expect(result.interimRunId).toMatch(/^REC-[a-f0-9]{8}$/);
    });

    it('should return both interimRunId and interimRunUuid for persist node', async () => {
      mockRepository.createRun.mockResolvedValue({
        id: 'uuid-for-persist',
        runId: 'REC-test',
      } as any);

      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test',
          options: {},
        },
        inferredAtoms: createMockAtoms(2),
      });

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      const result = await node(state);

      // Both values are needed for persist node to UPDATE instead of INSERT
      expect(result.interimRunId).toBe('REC-test');
      expect(result.interimRunUuid).toBe('uuid-for-persist');
    });
  });

  describe('database persistence', () => {
    it('should create run with correct parameters', async () => {
      const state = createMockState({
        rootDirectory: '/my/project', // Must set both rootDirectory and input.rootDirectory
        input: {
          rootDirectory: '/my/project',
          reconciliationMode: 'delta',
          runId: 'REC-test123',
          deltaBaseline: { runId: 'prev-run', commitHash: 'abc' },
          options: { qualityThreshold: 90, maxTests: 100 },
        },
        inferredAtoms: createMockAtoms(3),
      });

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockRepository.createRun).toHaveBeenCalledWith({
        runId: 'REC-test123',
        rootDirectory: '/my/project',
        reconciliationMode: 'delta',
        deltaBaselineRunId: 'prev-run',
        deltaBaselineCommitHash: 'abc',
        currentCommitHash: 'abc123', // From mocked git-utils
        options: { qualityThreshold: 90, maxTests: 100 },
      });
    });

    it('should create atom recommendations for all inferred atoms', async () => {
      const atoms = createMockAtoms(5);
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test',
          options: {},
        },
        inferredAtoms: atoms,
      });

      mockRepository.createRun.mockResolvedValue({ id: 'run-123' } as any);

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockRepository.createAtomRecommendations).toHaveBeenCalledWith('run-123', atoms);
    });

    it('should create molecule recommendations with atom cross-references', async () => {
      const atoms = createMockAtoms(2);
      const molecules = createMockMolecules(1);
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test',
          options: {},
        },
        inferredAtoms: atoms,
        inferredMolecules: molecules,
      });

      mockRepository.createRun.mockResolvedValue({ id: 'run-123' } as any);
      mockRepository.createAtomRecommendations.mockResolvedValue([
        { id: 'atom-uuid-1', tempId: 'temp-0' },
        { id: 'atom-uuid-2', tempId: 'temp-1' },
      ] as any);

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      // Should pass the tempId-to-UUID mapping
      expect(mockRepository.createMoleculeRecommendations).toHaveBeenCalledWith(
        'run-123',
        molecules,
        expect.any(Map),
      );

      const passedMap = mockRepository.createMoleculeRecommendations.mock.calls[0][2];
      expect(passedMap.get('temp-0')).toBe('atom-uuid-1');
      expect(passedMap.get('temp-1')).toBe('atom-uuid-2');
    });

    it('should create test records with atom cross-references', async () => {
      const atoms = createMockAtoms(2);
      const orphanTests = createMockOrphanTests(2);
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test',
          options: {},
        },
        inferredAtoms: atoms,
        orphanTests,
      });

      mockRepository.createRun.mockResolvedValue({ id: 'run-123' } as any);
      mockRepository.createAtomRecommendations.mockResolvedValue([
        { id: 'atom-uuid-1', tempId: 'temp-0' },
        { id: 'atom-uuid-2', tempId: 'temp-1' },
      ] as any);

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockRepository.createTestRecords).toHaveBeenCalledWith(
        'run-123',
        orphanTests,
        expect.any(Map),
      );
    });
  });

  describe('skip conditions', () => {
    it('should skip database but return runId when no atoms or molecules', async () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-empty',
          options: {},
        },
        inferredAtoms: [],
        inferredMolecules: [],
      });

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      const result = await node(state);

      // Should still return runId for consistency
      expect(result.interimRunId).toBe('REC-empty');
      // Should NOT have UUID since no database write
      expect(result.interimRunUuid).toBeUndefined();
      // Should NOT call repository
      expect(mockRepository.createRun).not.toHaveBeenCalled();
      // Should log skip message
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('No atoms or molecules to save'),
      );
    });

    it('should skip database when persistToDatabase is false', async () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test',
          options: {},
        },
        inferredAtoms: createMockAtoms(2),
      });

      const node = createInterimPersistNode({
        repository: mockRepository,
        persistToDatabase: false,
      })(mockConfig);
      const result = await node(state);

      expect(result.interimRunId).toBe('REC-test');
      expect(mockRepository.createRun).not.toHaveBeenCalled();
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Skipping database persistence'),
      );
    });

    it('should skip database when no repository provided', async () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test',
          options: {},
        },
        inferredAtoms: createMockAtoms(2),
      });

      const node = createInterimPersistNode({})(mockConfig); // No repository
      const result = await node(state);

      expect(result.interimRunId).toBe('REC-test');
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Skipping database persistence'),
      );
    });
  });

  describe('error handling', () => {
    it('should not fail graph on database error', async () => {
      mockRepository.createRun.mockRejectedValue(new Error('Database connection failed'));

      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test',
          options: {},
        },
        inferredAtoms: createMockAtoms(2),
      });

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);

      // Should not throw
      const result = await node(state);

      // Should return empty object (no runId) on error
      expect(result).toEqual({});

      // Should log error
      expect(mockConfig.logger?.error).toHaveBeenCalledWith(
        expect.stringContaining('Database persistence failed'),
      );
    });

    it('should handle git hash retrieval failure gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentCommitHash } = require('../../../utils/git-utils');
      getCurrentCommitHash.mockRejectedValueOnce(new Error('Not a git repo'));

      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test',
          options: {},
        },
        inferredAtoms: createMockAtoms(2),
      });

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      // Should continue even if git hash fails
      expect(mockRepository.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          currentCommitHash: undefined,
        }),
      );
      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not get current commit hash'),
      );
    });
  });

  describe('logging', () => {
    it('should log run creation with UUID', async () => {
      mockRepository.createRun.mockResolvedValue({
        id: 'generated-uuid',
        runId: 'REC-test',
      } as any);

      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test',
          options: {},
        },
        inferredAtoms: createMockAtoms(2),
      });

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Created run REC-test (UUID: generated-uuid)'),
      );
    });

    it('should log atom recommendation count', async () => {
      mockRepository.createAtomRecommendations.mockResolvedValue([
        { id: '1', tempId: 'temp-1' },
        { id: '2', tempId: 'temp-2' },
        { id: '3', tempId: 'temp-3' },
      ] as any);

      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test',
          options: {},
        },
        inferredAtoms: createMockAtoms(3),
      });

      const node = createInterimPersistNode({ repository: mockRepository })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Saved 3 atom recommendations'),
      );
    });
  });
});
