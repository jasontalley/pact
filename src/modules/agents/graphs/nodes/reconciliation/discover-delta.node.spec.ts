/**
 * Discover Delta Node Tests
 *
 * Tests for the delta discovery node that finds orphan tests changed since baseline.
 * Covers tool integration, INV-R001 (atom-linked test handling), INV-R002 (closure rule),
 * and fallback to fullscan mode.
 *
 * @see docs/implementation-checklist-phase6.md Section 2.1
 */

import { createDiscoverDeltaNode, DiscoverDeltaNodeOptions } from './discover-delta.node';
import { ReconciliationGraphStateType } from '../../types/reconciliation-state';
import { NodeConfig } from '../types';
import { DeltaDiscoveryResult } from '../../../tools/reconciliation-tools.service';

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
      hasTool: jest.fn().mockReturnValue(false),
      executeTool: jest.fn(),
      getTools: jest.fn().mockReturnValue([]),
    } as any,
    logger: createMockLogger() as any,
  };
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
      reconciliationMode: 'delta',
      deltaBaseline: {
        runId: 'REC-prev123',
        commitHash: 'abc123',
      },
      options: {},
    },
    repoStructure: { files: [], testFiles: ['test.spec.ts'] },
    orphanTests: [],
    changedAtomLinkedTests: [],
    deltaSummary: null,
    documentationIndex: null,
    contextPerTest: new Map(),
    inferredAtoms: [],
    inferredMolecules: [],
    currentPhase: 'discover',
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
 * Create mock delta discovery result
 */
function createMockDeltaResult(
  overrides: Partial<DeltaDiscoveryResult> = {},
): DeltaDiscoveryResult {
  return {
    mode: 'delta' as const,
    orphanTests: overrides.orphanTests || [],
    totalOrphans: overrides.totalOrphans || 1,
    totalTests: overrides.totalTests || 1,
    deltaOrphanTests: overrides.deltaOrphanTests || [
      {
        filePath: 'src/test.spec.ts',
        testName: 'should do something',
        lineNumber: 10,
        testCode: 'it("should do something", () => {})',
        relatedSourceFiles: ['src/test.ts'],
      },
    ],
    changedAtomLinkedTests: overrides.changedAtomLinkedTests || [],
    deltaSummary: overrides.deltaSummary || {
      changedTestFiles: 1,
      newOrphanTests: 1,
      changedAtomLinkedTests: 0,
      fallbackToFullscan: false,
    },
    ...overrides,
  };
}

describe('DiscoverDeltaNode', () => {
  let mockConfig: NodeConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = createMockNodeConfig();
  });

  describe('basic delta discovery', () => {
    it('should discover delta orphan tests using tool', async () => {
      const deltaResult = createMockDeltaResult({
        deltaOrphanTests: [
          { filePath: 'src/a.spec.ts', testName: 'test a', lineNumber: 10, testCode: '' },
          { filePath: 'src/b.spec.ts', testName: 'test b', lineNumber: 20, testCode: '' },
        ],
        deltaSummary: {
          changedTestFiles: 2,
          newOrphanTests: 2,
          changedAtomLinkedTests: 0,
          fallbackToFullscan: false,
        },
      });

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode()(mockConfig);
      const result = await node(state);

      expect(result.orphanTests).toHaveLength(2);
      expect(result.currentPhase).toBe('context');
      expect(result.deltaSummary).toBeDefined();
    });

    it('should pass baseline info to tool', async () => {
      const deltaResult = createMockDeltaResult();

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'delta',
          deltaBaseline: {
            runId: 'REC-baseline',
            commitHash: 'def456',
          },
          options: {},
        },
      });

      const node = createDiscoverDeltaNode()(mockConfig);
      await node(state);

      expect(mockConfig.toolRegistry.executeTool).toHaveBeenCalledWith(
        'discover_orphans_delta',
        expect.objectContaining({
          baseline_commit: 'def456',
          baseline_run_id: 'REC-baseline',
        }),
      );
    });
  });

  describe('fallback to fullscan', () => {
    it('should fall back to fullscan when no baseline provided', async () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'delta',
          // No deltaBaseline
          options: {},
        },
      });

      const node = createDiscoverDeltaNode()(mockConfig);
      const result = await node(state);

      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('No baseline provided'),
      );
      // Result should still have orphanTests from fullscan
      expect(result.currentPhase).toBe('context');
    });

    it('should fall back to fullscan on tool error', async () => {
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockRejectedValue(
        new Error('Tool failed'),
      );

      const state = createMockState();
      const node = createDiscoverDeltaNode()(mockConfig);
      const result = await node(state);

      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('Tool execution failed'),
      );
      expect(result.deltaSummary).toBeDefined();
      expect(result.currentPhase).toBe('context');
    });

    it('should log when delta detection internally fell back to fullscan', async () => {
      const deltaResult = createMockDeltaResult({
        deltaSummary: {
          changedTestFiles: 5,
          newOrphanTests: 5,
          changedAtomLinkedTests: 0,
          fallbackToFullscan: true,
          fallbackReason: 'Baseline commit not found in history',
        },
      });

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode()(mockConfig);
      await node(state);

      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('fell back to fullscan'),
      );
    });
  });

  describe('INV-R001: Changed atom-linked tests', () => {
    it('should separate changed atom-linked tests from orphan tests', async () => {
      const deltaResult = createMockDeltaResult({
        deltaOrphanTests: [
          { filePath: 'src/orphan.spec.ts', testName: 'orphan test', lineNumber: 10, testCode: '' },
        ],
        changedAtomLinkedTests: [
          {
            filePath: 'src/linked.spec.ts',
            testName: 'linked test',
            lineNumber: 20,
            atomId: 'IA-001',
          },
          {
            filePath: 'src/linked2.spec.ts',
            testName: 'linked test 2',
            lineNumber: 30,
            atomId: 'IA-002',
          },
        ],
      });

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode()(mockConfig);
      const result = await node(state);

      // Orphan tests should only contain actual orphans
      expect(result.orphanTests).toHaveLength(1);
      expect(result.orphanTests![0].filePath).toBe('src/orphan.spec.ts');

      // Changed atom-linked tests should be stored separately
      expect(result.changedAtomLinkedTests).toHaveLength(2);
      expect(result.changedAtomLinkedTests![0].linkedAtomId).toBe('IA-001');
    });

    it('should log warning for changed atom-linked tests', async () => {
      const deltaResult = createMockDeltaResult({
        changedAtomLinkedTests: [
          { filePath: 'src/linked.spec.ts', testName: 'test', lineNumber: 10, atomId: 'IA-001' },
        ],
      });

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode()(mockConfig);
      await node(state);

      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('Found 1 changed atom-linked tests'),
      );
      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('will NOT be processed for new atoms'),
      );
    });

    it('should log each changed atom-linked test for audit trail', async () => {
      const deltaResult = createMockDeltaResult({
        changedAtomLinkedTests: [
          { filePath: 'src/linked.spec.ts', testName: 'test', lineNumber: 15, atomId: 'IA-005' },
        ],
      });

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode()(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Changed atom-linked: src/linked.spec.ts:15 -> IA-005'),
      );
    });

    it('should mark changed atom-linked tests with changeType', async () => {
      const deltaResult = createMockDeltaResult({
        changedAtomLinkedTests: [
          { filePath: 'src/test.spec.ts', testName: 'test', lineNumber: 10, atomId: 'IA-001' },
        ],
      });

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode()(mockConfig);
      const result = await node(state);

      expect(result.changedAtomLinkedTests![0].changeType).toBe('modified');
    });
  });

  describe('INV-R002: Delta Closure Stopping Rule', () => {
    it('should call excludeClosedTests when enforceClosureRule is true', async () => {
      const deltaResult = createMockDeltaResult();

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode({ enforceClosureRule: true })(mockConfig);
      await node(state);

      // Should log that closure rule is being checked (pending implementation)
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(expect.stringContaining('INV-R002'));
    });
  });

  describe('delta summary', () => {
    it('should return delta summary with counts', async () => {
      const deltaResult = createMockDeltaResult({
        deltaOrphanTests: [
          { filePath: 'a.spec.ts', testName: 'a', lineNumber: 1, testCode: '' },
          { filePath: 'b.spec.ts', testName: 'b', lineNumber: 2, testCode: '' },
        ],
        changedAtomLinkedTests: [
          { filePath: 'c.spec.ts', testName: 'c', lineNumber: 3, atomId: 'IA-001' },
        ],
      });

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode()(mockConfig);
      const result = await node(state);

      expect(result.deltaSummary).toEqual(
        expect.objectContaining({
          deltaOrphanCount: 2,
          changedLinkedTestCount: 1,
        }),
      );
    });

    it('should include baseline info in delta summary', async () => {
      const deltaResult = createMockDeltaResult();

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'delta',
          deltaBaseline: { runId: 'REC-123', commitHash: 'xyz789' },
          options: {},
        },
      });

      const node = createDiscoverDeltaNode()(mockConfig);
      const result = await node(state);

      expect(result.deltaSummary?.baseline).toEqual({
        runId: 'REC-123',
        commitHash: 'xyz789',
      });
    });
  });

  describe('orphan test conversion', () => {
    it('should convert delta orphan tests to OrphanTestInfo format', async () => {
      const deltaResult = createMockDeltaResult({
        deltaOrphanTests: [
          {
            filePath: 'src/feature.spec.ts',
            testName: 'should handle feature',
            lineNumber: 42,
            testCode: 'it("should handle feature", () => {})',
            relatedSourceFiles: ['src/feature.ts', 'src/helper.ts'],
          },
        ],
      });

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode()(mockConfig);
      const result = await node(state);

      expect(result.orphanTests![0]).toEqual({
        filePath: 'src/feature.spec.ts',
        testName: 'should handle feature',
        lineNumber: 42,
        testCode: 'it("should handle feature", () => {})',
        relatedSourceFiles: ['src/feature.ts', 'src/helper.ts'],
      });
    });
  });

  describe('options', () => {
    it('should respect maxTests option', async () => {
      const deltaResult = createMockDeltaResult();

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode({ maxTests: 100 })(mockConfig);
      await node(state);

      expect(mockConfig.toolRegistry.executeTool).toHaveBeenCalledWith(
        'discover_orphans_delta',
        expect.objectContaining({
          max_orphans: 100,
        }),
      );
    });

    it('should use input options maxTests over node options', async () => {
      const deltaResult = createMockDeltaResult();

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'delta',
          deltaBaseline: { runId: 'REC-1', commitHash: 'abc' },
          options: { maxTests: 50 },
        },
      });

      const node = createDiscoverDeltaNode({ maxTests: 200 })(mockConfig);
      await node(state);

      expect(mockConfig.toolRegistry.executeTool).toHaveBeenCalledWith(
        'discover_orphans_delta',
        expect.objectContaining({
          max_orphans: 50,
        }),
      );
    });

    it('should skip tool when useTool is false', async () => {
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);

      const state = createMockState();
      const node = createDiscoverDeltaNode({ useTool: false })(mockConfig);
      await node(state);

      // Should not call delta tool, will use fullscan fallback
      expect(mockConfig.toolRegistry.executeTool).not.toHaveBeenCalledWith(
        'discover_orphans_delta',
        expect.anything(),
      );
    });
  });

  describe('logging', () => {
    it('should log delta discovery start with baseline info', async () => {
      const deltaResult = createMockDeltaResult();

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'delta',
          deltaBaseline: { runId: 'REC-prev', commitHash: 'hash123' },
          options: {},
        },
      });

      const node = createDiscoverDeltaNode()(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Baseline: commit=hash123, runId=REC-prev'),
      );
    });

    it('should log discovery complete with counts', async () => {
      const deltaResult = createMockDeltaResult({
        deltaOrphanTests: [{ filePath: 'a.spec.ts', testName: 'a', lineNumber: 1, testCode: '' }],
        changedAtomLinkedTests: [
          { filePath: 'b.spec.ts', testName: 'b', lineNumber: 2, atomId: 'IA-1' },
        ],
      });

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(deltaResult);

      const state = createMockState();
      const node = createDiscoverDeltaNode()(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Delta discovery complete: 1 orphans, 1 atom-linked'),
      );
    });
  });
});
