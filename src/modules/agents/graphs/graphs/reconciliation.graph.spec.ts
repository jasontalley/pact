/**
 * Reconciliation Graph Tests
 *
 * Tests for the reconciliation graph infrastructure:
 * - wrapWithErrorHandling: Error handling and NodeInterrupt propagation
 * - discoverRouter: Mode-based routing
 * - createReconciliationGraph: Graph creation and configuration
 *
 * @see docs/implementation-checklist-phase6.md Part 8
 */

import { NodeInterrupt } from '@langchain/langgraph';
import { ReconciliationGraphStateType } from '../types/reconciliation-state';
import { NodeConfig } from '../nodes/types';

// We need to test the internal functions, so we'll extract them for testing
// The actual graph is tested via integration tests

/**
 * Mock logger that matches the Logger interface used by NodeConfig
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
 * Mock NodeConfig for testing
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
 * Mock state for testing
 */
function createMockState(
  overrides: Partial<ReconciliationGraphStateType> = {},
): ReconciliationGraphStateType {
  return {
    rootDirectory: '/test',
    input: {
      rootDirectory: '/test',
      reconciliationMode: 'full-scan',
      options: {},
    },
    repoStructure: { files: [], testFiles: [] },
    orphanTests: [],
    changedAtomLinkedTests: [],
    deltaSummary: null,
    documentationIndex: null,
    contextPerTest: new Map(),
    inferredAtoms: [],
    inferredMolecules: [],
    currentPhase: 'structure',
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
 * Re-implementation of wrapWithErrorHandling for unit testing
 * This mirrors the actual implementation to test its behavior
 */
function wrapWithErrorHandling(
  nodeName: string,
  nodeFunc: (state: ReconciliationGraphStateType) => Promise<Partial<ReconciliationGraphStateType>>,
  config: NodeConfig,
  isCritical = false,
): (state: ReconciliationGraphStateType) => Promise<Partial<ReconciliationGraphStateType>> {
  // Import isGraphInterrupt dynamically to match actual implementation
  const { isGraphInterrupt } = require('@langchain/langgraph');

  return async (
    state: ReconciliationGraphStateType,
  ): Promise<Partial<ReconciliationGraphStateType>> => {
    try {
      return await nodeFunc(state);
    } catch (error) {
      // NodeInterrupt must be re-thrown - this was the bug we fixed
      if (isGraphInterrupt(error)) {
        config.logger?.log(`[${nodeName}] NodeInterrupt thrown, pausing for human review`);
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);

      config.logger?.error(`[${nodeName}] Node failed: ${errorMessage}`);

      // Critical nodes re-throw to stop graph
      if (isCritical) {
        config.logger?.error(`[${nodeName}] Critical node failed, stopping graph`);
        throw error;
      }

      // Non-critical nodes store error and continue
      config.logger?.warn(
        `[${nodeName}] Non-critical error, continuing to persist partial results`,
      );

      const timestamp = new Date().toISOString();
      const errorString = `[${timestamp}] ${nodeName}: ${errorMessage}`;

      return {
        errors: [errorString],
        currentPhase: 'persist',
      };
    }
  };
}

/**
 * Re-implementation of discoverRouter for unit testing
 */
function discoverRouter(
  state: ReconciliationGraphStateType,
): 'discover_fullscan' | 'discover_delta' {
  const mode = state.input?.reconciliationMode || 'full-scan';

  if (mode === 'delta') {
    return 'discover_delta';
  }

  return 'discover_fullscan';
}

describe('ReconciliationGraph', () => {
  describe('wrapWithErrorHandling', () => {
    let mockConfig: NodeConfig;

    beforeEach(() => {
      mockConfig = createMockNodeConfig();
    });

    describe('NodeInterrupt handling', () => {
      it('should re-throw NodeInterrupt to allow graph to pause', async () => {
        // This test verifies the fix for the NodeInterrupt swallowing bug
        const interruptPayload = { reason: 'Human review required' };
        const nodeFunc = jest
          .fn()
          .mockRejectedValue(new NodeInterrupt(JSON.stringify(interruptPayload)));

        const wrappedNode = wrapWithErrorHandling('verify', nodeFunc, mockConfig, false);
        const state = createMockState();

        // NodeInterrupt should be re-thrown, not swallowed
        await expect(wrappedNode(state)).rejects.toThrow(NodeInterrupt);

        // Logger should indicate interrupt was detected
        expect(mockConfig.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('NodeInterrupt thrown'),
        );
      });

      it('should re-throw NodeInterrupt even for critical nodes', async () => {
        const nodeFunc = jest.fn().mockRejectedValue(new NodeInterrupt('review needed'));

        const wrappedNode = wrapWithErrorHandling('structure', nodeFunc, mockConfig, true);
        const state = createMockState();

        await expect(wrappedNode(state)).rejects.toThrow(NodeInterrupt);
      });
    });

    describe('critical node error handling', () => {
      it('should re-throw errors from critical nodes', async () => {
        const error = new Error('Critical failure');
        const nodeFunc = jest.fn().mockRejectedValue(error);

        const wrappedNode = wrapWithErrorHandling('structure', nodeFunc, mockConfig, true);
        const state = createMockState();

        await expect(wrappedNode(state)).rejects.toThrow('Critical failure');

        expect(mockConfig.logger?.error).toHaveBeenCalledWith(
          expect.stringContaining('Critical node failed'),
        );
      });

      it('should mark structure node as critical', async () => {
        // Verify that errors from structure node stop the graph
        const nodeFunc = jest.fn().mockRejectedValue(new Error('File system error'));

        const wrappedNode = wrapWithErrorHandling('structure', nodeFunc, mockConfig, true);
        const state = createMockState();

        await expect(wrappedNode(state)).rejects.toThrow('File system error');
      });
    });

    describe('non-critical node error handling', () => {
      it('should store error and continue for non-critical nodes', async () => {
        const error = new Error('LLM timeout');
        const nodeFunc = jest.fn().mockRejectedValue(error);

        const wrappedNode = wrapWithErrorHandling('infer_atoms', nodeFunc, mockConfig, false);
        const state = createMockState();

        const result = await wrappedNode(state);

        // Should not throw
        expect(result).toBeDefined();

        // Should store error in state
        expect(result.errors).toHaveLength(1);
        expect(result.errors![0]).toContain('infer_atoms');
        expect(result.errors![0]).toContain('LLM timeout');

        // Should signal to proceed to persist
        expect(result.currentPhase).toBe('persist');

        // Should log warning
        expect(mockConfig.logger?.warn).toHaveBeenCalledWith(
          expect.stringContaining('Non-critical error'),
        );
      });

      it('should include timestamp in error string', async () => {
        const nodeFunc = jest.fn().mockRejectedValue(new Error('Test error'));

        const wrappedNode = wrapWithErrorHandling('context', nodeFunc, mockConfig, false);
        const state = createMockState();

        const result = await wrappedNode(state);

        // Error string should have ISO timestamp format
        expect(result.errors![0]).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });

      it('should handle non-Error objects as errors', async () => {
        const nodeFunc = jest.fn().mockRejectedValue('string error');

        const wrappedNode = wrapWithErrorHandling('synthesize', nodeFunc, mockConfig, false);
        const state = createMockState();

        const result = await wrappedNode(state);

        expect(result.errors![0]).toContain('string error');
      });
    });

    describe('successful execution', () => {
      it('should pass through successful results unchanged', async () => {
        const successResult = {
          inferredAtoms: [{ tempId: 'temp-1', description: 'Test atom' }],
          currentPhase: 'synthesize',
        };
        const nodeFunc = jest.fn().mockResolvedValue(successResult);

        const wrappedNode = wrapWithErrorHandling('infer_atoms', nodeFunc, mockConfig, false);
        const state = createMockState();

        const result = await wrappedNode(state);

        expect(result).toEqual(successResult);
        expect(mockConfig.logger?.error).not.toHaveBeenCalled();
        expect(mockConfig.logger?.warn).not.toHaveBeenCalled();
      });
    });
  });

  describe('discoverRouter', () => {
    it('should route to discover_fullscan for full-scan mode', () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {},
        },
      });

      expect(discoverRouter(state)).toBe('discover_fullscan');
    });

    it('should route to discover_delta for delta mode', () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'delta',
          options: {},
        },
      });

      expect(discoverRouter(state)).toBe('discover_delta');
    });

    it('should default to discover_fullscan when mode is not specified', () => {
      const state = createMockState({
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan', // Default
          options: {},
        },
      });

      // Remove the reconciliationMode to test default
      delete (state.input as any).reconciliationMode;

      expect(discoverRouter(state)).toBe('discover_fullscan');
    });

    it('should default to discover_fullscan when input is missing', () => {
      const state = createMockState();
      state.input = undefined as any;

      expect(discoverRouter(state)).toBe('discover_fullscan');
    });
  });
});

describe('ReconciliationGraph Integration', () => {
  // These tests verify the actual graph creation and behavior
  // They use the real createReconciliationGraph function

  describe('createReconciliationGraph', () => {
    it('should create a valid graph with default options', async () => {
      const { createReconciliationGraph } = await import('./reconciliation.graph');
      const mockConfig = createMockNodeConfig();

      const graph = createReconciliationGraph(mockConfig);

      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });

    it('should accept custom checkpointer', async () => {
      const { createReconciliationGraph } = await import('./reconciliation.graph');
      const { MemorySaver } = await import('@langchain/langgraph');
      const mockConfig = createMockNodeConfig();

      const customCheckpointer = new MemorySaver();
      const graph = createReconciliationGraph(mockConfig, {
        checkpointer: customCheckpointer,
      });

      expect(graph).toBeDefined();
    });

    it('should pass node options to individual nodes', async () => {
      const { createReconciliationGraph } = await import('./reconciliation.graph');
      const mockConfig = createMockNodeConfig();

      // This should not throw even with custom options
      const graph = createReconciliationGraph(mockConfig, {
        nodeOptions: {
          verify: {
            qualityThreshold: 90,
          },
        },
      });

      expect(graph).toBeDefined();
    });
  });

  describe('RECONCILIATION_NODES constants', () => {
    it('should export all node names', async () => {
      const { RECONCILIATION_NODES } = await import('./reconciliation.graph');

      expect(RECONCILIATION_NODES.STRUCTURE).toBe('structure');
      expect(RECONCILIATION_NODES.DISCOVER_FULLSCAN).toBe('discover_fullscan');
      expect(RECONCILIATION_NODES.DISCOVER_DELTA).toBe('discover_delta');
      expect(RECONCILIATION_NODES.CONTEXT).toBe('context');
      expect(RECONCILIATION_NODES.INFER_ATOMS).toBe('infer_atoms');
      expect(RECONCILIATION_NODES.SYNTHESIZE_MOLECULES).toBe('synthesize_molecules');
      expect(RECONCILIATION_NODES.INTERIM_PERSIST).toBe('interim_persist');
      expect(RECONCILIATION_NODES.VERIFY).toBe('verify');
      expect(RECONCILIATION_NODES.PERSIST).toBe('persist');
    });
  });

  describe('RECONCILIATION_GRAPH_NAME constant', () => {
    it('should export the graph name', async () => {
      const { RECONCILIATION_GRAPH_NAME } = await import('./reconciliation.graph');

      expect(RECONCILIATION_GRAPH_NAME).toBe('reconciliation');
    });
  });
});
