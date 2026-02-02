/**
 * Infer Atoms Node Tests
 *
 * Tests for the atom inference node that uses LLM to generate Intent Atoms.
 * Covers tool integration, LLM inference, dependency context, and state shedding.
 *
 * @see docs/implementation-checklist-phase6.md Section 2.1
 */

import { createInferAtomsNode, InferAtomsNodeOptions } from './infer-atoms.node';
import {
  ReconciliationGraphStateType,
  OrphanTestInfo,
  TestAnalysis,
  RepoStructure,
} from '../../types/reconciliation-state';
import { NodeConfig } from '../types';

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
    currentPhase: 'infer',
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
 * Create mock orphan tests
 */
function createMockOrphanTests(count: number): OrphanTestInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    filePath: `src/modules/test${i}/test${i}.spec.ts`,
    testName: `should do something ${i}`,
    lineNumber: 10 + i,
    testCode: `it('should do something ${i}', () => { expect(result).toBe(true); })`,
    relatedSourceFiles: [`src/modules/test${i}/test${i}.ts`],
  }));
}

/**
 * Create mock context map
 */
function createMockContextMap(tests: OrphanTestInfo[]): Map<string, TestAnalysis> {
  const map = new Map<string, TestAnalysis>();
  tests.forEach((test, i) => {
    const key = `${test.filePath}:${test.testName}`;
    map.set(key, {
      testId: key,
      summary: `Summary for test ${i}`,
      domainConcepts: ['user', 'auth'],
      relatedCode: ['source.ts'],
      relatedDocs: ['doc.md'],
      rawContext: 'raw context',
    });
  });
  return map;
}

/**
 * Create mock LLM response for atom inference
 */
function createMockLLMResponse(
  overrides: Partial<{
    description: string;
    category: string;
    observableOutcomes: string[];
    confidence: number;
    reasoning: string;
  }> = {},
): string {
  return JSON.stringify({
    description: overrides.description || 'User can perform action',
    category: overrides.category || 'functional',
    observableOutcomes: overrides.observableOutcomes || ['Action completes successfully'],
    confidence: overrides.confidence ?? 85,
    reasoning: overrides.reasoning || 'Inferred from test assertions',
    ambiguityReasons: [],
  });
}

describe('InferAtomsNode', () => {
  let mockConfig: NodeConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = createMockNodeConfig();
  });

  describe('basic atom inference', () => {
    it('should infer atoms from orphan tests', async () => {
      const orphanTests = createMockOrphanTests(2);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms).toBeDefined();
      expect(result.inferredAtoms!.length).toBe(2);
      expect(result.currentPhase).toBe('synthesize');
    });

    it('should return empty atoms for no orphan tests', async () => {
      const state = createMockState({ orphanTests: [], contextPerTest: new Map() });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms).toEqual([]);
    });

    it('should assign tempId to each atom', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms![0].tempId).toMatch(/^temp-/);
    });

    it('should include sourceTest reference in atom', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms![0].sourceTest).toEqual({
        filePath: orphanTests[0].filePath,
        testName: orphanTests[0].testName,
        lineNumber: orphanTests[0].lineNumber,
      });
    });
  });

  describe('LLM response parsing', () => {
    it('should parse valid JSON response', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse({
          description: 'Specific description',
          category: 'security',
          confidence: 90,
        }),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms![0].description).toBe('Specific description');
      expect(result.inferredAtoms![0].category).toBe('security');
      expect(result.inferredAtoms![0].confidence).toBe(90);
    });

    it('should handle JSON embedded in text', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: `Here is my analysis:\n${createMockLLMResponse()}\nEnd of response.`,
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms!.length).toBe(1);
    });

    it('should normalize confidence from 0-1 scale', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse({ confidence: 0.85 }),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms![0].confidence).toBe(85);
    });

    it('should use fallback atom on invalid JSON', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: 'This is not valid JSON at all',
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms![0].description).toContain('Behavior verified by test');
      expect(result.inferredAtoms![0].confidence).toBe(30);
      expect(result.inferredAtoms![0].ambiguityReasons).toContain(
        'LLM inference failed, using fallback',
      );
    });

    it('should use fallback atom on missing required fields', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: JSON.stringify({ description: 'Only description, missing others' }),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms![0].confidence).toBe(30); // Fallback
    });
  });

  describe('confidence threshold', () => {
    it('should filter atoms below minConfidence', async () => {
      const orphanTests = createMockOrphanTests(2);
      const contextPerTest = createMockContextMap(orphanTests);

      let callCount = 0;
      (mockConfig.llmService.invoke as jest.Mock).mockImplementation(async () => {
        callCount++;
        return {
          content: createMockLLMResponse({ confidence: callCount === 1 ? 90 : 30 }),
        };
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false, minConfidence: 50 })(mockConfig);
      const result = await node(state);

      // Only first atom should be included (90 > 50)
      expect(result.inferredAtoms!.length).toBe(1);
      expect(result.inferredAtoms![0].confidence).toBe(90);
    });

    it('should include all atoms when minConfidence is 0', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse({ confidence: 10 }),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false, minConfidence: 0 })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms!.length).toBe(1);
    });
  });

  describe('tool-based inference', () => {
    it('should use tool when available', async () => {
      const toolResult = {
        temp_id: 'tool-atom-1',
        description: 'Tool inferred atom',
        category: 'functional',
        observable_outcomes: ['Outcome from tool'],
        confidence: 85,
        reasoning: 'Tool reasoning',
      };

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(toolResult);

      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);
      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: true })(mockConfig);
      const result = await node(state);

      expect(mockConfig.toolRegistry.executeTool).toHaveBeenCalledWith(
        'infer_atom_from_test',
        expect.objectContaining({
          test_file_path: orphanTests[0].filePath,
          test_name: orphanTests[0].testName,
        }),
      );
      expect(result.inferredAtoms![0].description).toBe('Tool inferred atom');
    });

    it('should fall back to LLM on tool error', async () => {
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockRejectedValue(
        new Error('Tool failed'),
      );
      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse({ description: 'LLM fallback atom' }),
      });

      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);
      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: true })(mockConfig);
      const result = await node(state);

      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(expect.stringContaining('Tool failed'));
      expect(result.inferredAtoms![0].description).toBe('LLM fallback atom');
    });

    it('should skip tool when useTool is false', async () => {
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);
      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      await node(state);

      expect(mockConfig.toolRegistry.executeTool).not.toHaveBeenCalled();
    });
  });

  describe('dependency context (Phase 3.4)', () => {
    it('should build dependency context when available', async () => {
      const orphanTests: OrphanTestInfo[] = [
        {
          filePath: 'src/utils/utils.spec.ts',
          testName: 'test',
          lineNumber: 10,
          testCode: 'it("test", () => {})',
          relatedSourceFiles: ['src/utils/utils.ts'],
        },
      ];
      const contextPerTest = createMockContextMap(orphanTests);

      const repoStructure: RepoStructure = {
        files: ['src/utils/utils.ts', 'src/service.ts', 'src/controller.ts'],
        testFiles: ['src/utils/utils.spec.ts'],
        dependencyEdges: [
          { from: 'src/service.ts', to: 'src/utils/utils.ts' },
          { from: 'src/controller.ts', to: 'src/utils/utils.ts' },
          { from: 'src/controller.ts', to: 'src/service.ts' },
        ],
      };

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const state = createMockState({ orphanTests, contextPerTest, repoStructure });
      const node = createInferAtomsNode({ useTool: false, useDependencyContext: true })(mockConfig);
      await node(state);

      // Check that prompt includes dependency analysis
      const invokeCall = (mockConfig.llmService.invoke as jest.Mock).mock.calls[0][0];
      expect(invokeCall.messages[0].content).toContain('Dependency Analysis');
    });

    it('should apply foundational boost for core modules', async () => {
      const orphanTests: OrphanTestInfo[] = [
        {
          filePath: 'src/core/utils.spec.ts',
          testName: 'test',
          lineNumber: 10,
          testCode: 'it("test", () => {})',
          relatedSourceFiles: ['src/core/utils.ts'],
        },
      ];
      const contextPerTest = createMockContextMap(orphanTests);

      // Utils is a foundational module (many dependents, few dependencies)
      const repoStructure: RepoStructure = {
        files: ['src/core/utils.ts'],
        testFiles: [],
        dependencyEdges: [
          { from: 'src/a.ts', to: 'src/core/utils.ts' },
          { from: 'src/b.ts', to: 'src/core/utils.ts' },
          { from: 'src/c.ts', to: 'src/core/utils.ts' },
        ],
      };

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse({ confidence: 80 }),
      });

      const state = createMockState({ orphanTests, contextPerTest, repoStructure });
      const node = createInferAtomsNode({
        useTool: false,
        useDependencyContext: true,
        foundationalBoost: 10,
      })(mockConfig);
      const result = await node(state);

      // Confidence should be boosted from 80 to 90
      expect(result.inferredAtoms![0].confidence).toBe(90);
    });

    it('should cap boosted confidence at 100', async () => {
      const orphanTests: OrphanTestInfo[] = [
        {
          filePath: 'src/core/utils.spec.ts',
          testName: 'test',
          lineNumber: 10,
          testCode: 'it("test", () => {})',
          relatedSourceFiles: ['src/core/utils.ts'],
        },
      ];
      const contextPerTest = createMockContextMap(orphanTests);

      const repoStructure: RepoStructure = {
        files: [],
        testFiles: [],
        dependencyEdges: [
          { from: 'src/a.ts', to: 'src/core/utils.ts' },
          { from: 'src/b.ts', to: 'src/core/utils.ts' },
          { from: 'src/c.ts', to: 'src/core/utils.ts' },
        ],
      };

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse({ confidence: 95 }),
      });

      const state = createMockState({ orphanTests, contextPerTest, repoStructure });
      const node = createInferAtomsNode({
        useTool: false,
        useDependencyContext: true,
        foundationalBoost: 10,
      })(mockConfig);
      const result = await node(state);

      // Should cap at 100, not 105
      expect(result.inferredAtoms![0].confidence).toBe(100);
    });

    it('should skip dependency context when disabled', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      const repoStructure: RepoStructure = {
        files: [],
        testFiles: [],
        dependencyEdges: [{ from: 'a.ts', to: 'b.ts' }],
      };

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const state = createMockState({ orphanTests, contextPerTest, repoStructure });
      const node = createInferAtomsNode({
        useTool: false,
        useDependencyContext: false,
      })(mockConfig);
      await node(state);

      const invokeCall = (mockConfig.llmService.invoke as jest.Mock).mock.calls[0][0];
      expect(invokeCall.messages[0].content).not.toContain('Dependency Analysis');
    });
  });

  describe('batch processing', () => {
    it('should process tests in batches', async () => {
      const orphanTests = createMockOrphanTests(7);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false, batchSize: 3 })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms!.length).toBe(7);
      // Should log progress for each batch
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(expect.stringContaining('Processed 3/7'));
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(expect.stringContaining('Processed 6/7'));
    });
  });

  describe('state shedding (INV-R005)', () => {
    it('should transition to synthesize phase', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.currentPhase).toBe('synthesize');
    });

    it('should track LLM call count', async () => {
      const orphanTests = createMockOrphanTests(3);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.llmCallCount).toBe(3);
    });
  });

  describe('error handling', () => {
    it('should use fallback atom on LLM error', async () => {
      const orphanTests = createMockOrphanTests(1);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockRejectedValue(new Error('LLM unavailable'));

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.inferredAtoms![0].confidence).toBe(30);
      expect(result.inferredAtoms![0].description).toContain('Behavior verified by test');
      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('Inference failed'),
      );
    });

    it('should continue processing after individual test error', async () => {
      const orphanTests = createMockOrphanTests(3);
      const contextPerTest = createMockContextMap(orphanTests);

      let callCount = 0;
      (mockConfig.llmService.invoke as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Single test error');
        }
        return { content: createMockLLMResponse() };
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      const result = await node(state);

      // Should process all 3 tests
      expect(result.inferredAtoms!.length).toBe(3);
    });
  });

  describe('logging', () => {
    it('should log test count and options', async () => {
      const orphanTests = createMockOrphanTests(5);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Inferring atoms for 5 tests'),
      );
    });

    it('should log final inference summary', async () => {
      const orphanTests = createMockOrphanTests(3);
      const contextPerTest = createMockContextMap(orphanTests);

      (mockConfig.llmService.invoke as jest.Mock).mockResolvedValue({
        content: createMockLLMResponse(),
      });

      const state = createMockState({ orphanTests, contextPerTest });
      const node = createInferAtomsNode({ useTool: false })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Inference complete: 3 atoms from 3 tests'),
      );
    });
  });
});
