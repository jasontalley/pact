/**
 * Context Node Tests
 *
 * Tests for the context building node that enriches orphan tests with analysis.
 * Covers tool integration, fallback analysis, documentation indexing, and topological ordering.
 *
 * @see docs/implementation-checklist-phase6.md Section 2.1
 */

import { createContextNode, ContextNodeOptions } from './context.node';
import {
  ReconciliationGraphStateType,
  OrphanTestInfo,
  RepoStructure,
} from '../../types/reconciliation-state';
import { NodeConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');

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
    currentPhase: 'context',
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
    testCode: `it('should do something ${i}', () => { expect(user.login()).toBe(true); })`,
    relatedSourceFiles: [`src/modules/test${i}/test${i}.ts`],
  }));
}

describe('ContextNode', () => {
  let mockConfig: NodeConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = createMockNodeConfig();

    // Default fs mocks
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
  });

  describe('basic context building', () => {
    it('should build context for orphan tests', async () => {
      const orphanTests = createMockOrphanTests(3);
      const state = createMockState({ orphanTests });

      const node = createContextNode({ indexDocs: false })(mockConfig);
      const result = await node(state);

      expect(result.contextPerTest).toBeDefined();
      expect(result.contextPerTest!.size).toBe(3);
      expect(result.currentPhase).toBe('infer');
    });

    it('should return empty context for no orphan tests', async () => {
      const state = createMockState({ orphanTests: [] });
      const node = createContextNode({ indexDocs: false })(mockConfig);
      const result = await node(state);

      expect(result.contextPerTest!.size).toBe(0);
      expect(result.currentPhase).toBe('infer');
    });

    it('should use test key format for context map', async () => {
      const orphanTests = createMockOrphanTests(1);
      const state = createMockState({ orphanTests });

      const node = createContextNode({ indexDocs: false })(mockConfig);
      const result = await node(state);

      const expectedKey = `${orphanTests[0].filePath}:${orphanTests[0].testName}`;
      expect(result.contextPerTest!.has(expectedKey)).toBe(true);
    });
  });

  describe('fallback analysis', () => {
    it('should create fallback analysis when no tool or service available', async () => {
      const orphanTests: OrphanTestInfo[] = [
        {
          filePath: 'src/users/users.spec.ts',
          testName: 'should validate user login',
          lineNumber: 15,
          testCode: `it('should validate user login', () => {
          expect(service.validateLogin('user@test.com')).toBe(true);
        })`,
          relatedSourceFiles: ['src/users/users.ts'],
        },
      ];

      const state = createMockState({ orphanTests });
      const node = createContextNode({ indexDocs: false, useTool: false })(mockConfig);
      const result = await node(state);

      const analysis = result.contextPerTest!.get(
        'src/users/users.spec.ts:should validate user login',
      );
      expect(analysis).toBeDefined();
      expect(analysis!.summary).toContain('should validate user login');
    });

    it('should extract domain concepts from test name', async () => {
      const orphanTests: OrphanTestInfo[] = [
        {
          filePath: 'src/auth/auth.spec.ts',
          testName: 'should create user session after login',
          lineNumber: 15,
          testCode: `it('should create user session', () => { expect(true).toBe(true); })`,
        },
      ];

      const state = createMockState({ orphanTests });
      const node = createContextNode({ indexDocs: false, useTool: false })(mockConfig);
      const result = await node(state);

      const analysis = result.contextPerTest!.get(
        'src/auth/auth.spec.ts:should create user session after login',
      );
      expect(analysis!.domainConcepts).toContain('user');
      expect(analysis!.domainConcepts).toContain('session');
      expect(analysis!.domainConcepts).toContain('login');
      expect(analysis!.domainConcepts).toContain('create');
    });

    it('should include raw test code in analysis', async () => {
      const testCode = `it('test', () => { expect(foo).toBe(bar); })`;
      const orphanTests: OrphanTestInfo[] = [
        {
          filePath: 'src/test.spec.ts',
          testName: 'test',
          lineNumber: 10,
          testCode,
        },
      ];

      const state = createMockState({ orphanTests });
      const node = createContextNode({ indexDocs: false, useTool: false })(mockConfig);
      const result = await node(state);

      const analysis = result.contextPerTest!.get('src/test.spec.ts:test');
      expect(analysis!.rawContext).toBe(testCode);
    });
  });

  describe('tool-based analysis', () => {
    it('should use tool when available', async () => {
      const toolResult = {
        testId: 'test-id',
        summary: 'Tool-generated summary',
        domainConcepts: ['user', 'auth'],
        relatedCode: ['users.ts'],
        relatedDocs: ['auth.md'],
        rawContext: 'raw code',
      };

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(toolResult);

      const orphanTests = createMockOrphanTests(1);
      const state = createMockState({ orphanTests });
      const node = createContextNode({ indexDocs: false, useTool: true })(mockConfig);
      const result = await node(state);

      expect(mockConfig.toolRegistry.executeTool).toHaveBeenCalledWith(
        'get_test_analysis',
        expect.objectContaining({
          test_file_path: orphanTests[0].filePath,
          test_name: orphanTests[0].testName,
        }),
      );

      const analysis = result.contextPerTest!.values().next().value;
      expect(analysis.summary).toBe('Tool-generated summary');
    });

    it('should fall back on tool error', async () => {
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockRejectedValue(new Error('Tool error'));

      const orphanTests = createMockOrphanTests(1);
      const state = createMockState({ orphanTests });
      const node = createContextNode({ indexDocs: false })(mockConfig);
      const result = await node(state);

      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(expect.stringContaining('Tool failed'));
      // Should still have analysis via fallback
      expect(result.contextPerTest!.size).toBe(1);
    });

    it('should skip tool when useTool is false', async () => {
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);

      const orphanTests = createMockOrphanTests(1);
      const state = createMockState({ orphanTests });
      const node = createContextNode({ indexDocs: false, useTool: false })(mockConfig);
      await node(state);

      expect(mockConfig.toolRegistry.executeTool).not.toHaveBeenCalled();
    });
  });

  describe('documentation indexing', () => {
    it('should index documentation when enabled', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'guide.md', isDirectory: () => false, isFile: () => true },
      ]);
      (fs.readFileSync as jest.Mock).mockReturnValue('# Guide\nSome documentation content');

      const state = createMockState({ orphanTests: [] });
      const node = createContextNode({ indexDocs: true, maxDocChunks: 10 })(mockConfig);
      const result = await node(state);

      expect(result.documentationIndex).toBeDefined();
      expect(result.documentationIndex!.length).toBeGreaterThan(0);
    });

    it('should skip documentation indexing when disabled', async () => {
      const state = createMockState({ orphanTests: [] });
      const node = createContextNode({ indexDocs: false })(mockConfig);
      const result = await node(state);

      expect(result.documentationIndex).toBeNull();
    });

    it('should respect maxDocChunks limit', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      const mockFiles = Array.from({ length: 20 }, (_, i) => ({
        name: `doc${i}.md`,
        isDirectory: () => false,
        isFile: () => true,
      }));
      (fs.readdirSync as jest.Mock).mockReturnValue(mockFiles);
      (fs.readFileSync as jest.Mock).mockReturnValue('# Doc\nContent');

      const state = createMockState({ orphanTests: [] });
      const node = createContextNode({ indexDocs: true, maxDocChunks: 5 })(mockConfig);
      const result = await node(state);

      expect(result.documentationIndex!.length).toBeLessThanOrEqual(5);
    });

    it('should extract keywords from documentation', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'auth.md', isDirectory: () => false, isFile: () => true },
      ]);
      (fs.readFileSync as jest.Mock).mockReturnValue(`# Authentication Guide
## User Login
Use the \`loginService\` to authenticate.`);

      const state = createMockState({ orphanTests: [] });
      const node = createContextNode({ indexDocs: true })(mockConfig);
      const result = await node(state);

      const doc = result.documentationIndex![0];
      expect(doc.keywords).toContain('authentication');
      expect(doc.keywords).toContain('loginservice');
    });
  });

  describe('topological ordering', () => {
    it('should sort tests by topological order when available', async () => {
      const orphanTests: OrphanTestInfo[] = [
        {
          filePath: 'src/dependent.spec.ts',
          testName: 'dependent test',
          lineNumber: 10,
          testCode: 'it("dependent test", () => {})',
          relatedSourceFiles: ['src/dependent.ts'],
        },
        {
          filePath: 'src/base.spec.ts',
          testName: 'base test',
          lineNumber: 10,
          testCode: 'it("base test", () => {})',
          relatedSourceFiles: ['src/base.ts'],
        },
      ];

      const repoStructure: RepoStructure = {
        files: ['src/base.ts', 'src/dependent.ts'],
        testFiles: ['src/base.spec.ts', 'src/dependent.spec.ts'],
        topologicalOrder: ['src/base.ts', 'src/dependent.ts'], // base comes first
      };

      const state = createMockState({ orphanTests, repoStructure });
      const node = createContextNode({ indexDocs: false, useTopologicalOrder: true })(mockConfig);
      await node(state);

      // Verify logging indicates topological order was used
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('topologicalOrder=true'),
      );
    });

    it('should preserve original order when no topological order available', async () => {
      const orphanTests = createMockOrphanTests(3);
      const repoStructure: RepoStructure = {
        files: [],
        testFiles: [],
        // No topologicalOrder
      };

      const state = createMockState({ orphanTests, repoStructure });
      const node = createContextNode({ indexDocs: false, useTopologicalOrder: true })(mockConfig);
      await node(state);

      // Should still process all tests
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Building context for 3 orphan tests'),
      );
    });

    it('should skip topological sorting when disabled', async () => {
      const orphanTests = createMockOrphanTests(2);
      const repoStructure: RepoStructure = {
        files: [],
        testFiles: [],
        topologicalOrder: ['file1.ts', 'file2.ts'],
      };

      const state = createMockState({ orphanTests, repoStructure });
      const node = createContextNode({ indexDocs: false, useTopologicalOrder: false })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('topologicalOrder=false'),
      );
    });
  });

  describe('batch processing', () => {
    it('should log progress at batch boundaries', async () => {
      const orphanTests = createMockOrphanTests(25);
      const state = createMockState({ orphanTests });
      const node = createContextNode({ indexDocs: false, batchSize: 10 })(mockConfig);
      await node(state);

      // Should log at 10 and 20
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Processed 10/25'),
      );
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Processed 20/25'),
      );
    });
  });

  describe('error handling', () => {
    it('should add minimal analysis on error', async () => {
      // Create a test that will fail analysis (mock service throws)
      const orphanTests: OrphanTestInfo[] = [
        {
          filePath: 'src/test.spec.ts',
          testName: 'failing test',
          lineNumber: 10,
          testCode: 'it("failing test", () => {})',
        },
      ];

      // Mock an error during processing by making the tool throw
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockRejectedValue(
        new Error('Analysis failed completely'),
      );

      const state = createMockState({ orphanTests });
      const node = createContextNode({ indexDocs: false })(mockConfig);
      const result = await node(state);

      // Should still have an entry with minimal analysis
      const analysis = result.contextPerTest!.get('src/test.spec.ts:failing test');
      expect(analysis).toBeDefined();
      expect(analysis!.summary).toContain('failing test');
    });

    it('should continue processing after individual test error', async () => {
      const orphanTests = createMockOrphanTests(3);
      const state = createMockState({ orphanTests });

      // Make tool fail for one test
      let callCount = 0;
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Single test error');
        }
        return {
          testId: 'id',
          summary: 'summary',
          domainConcepts: [],
        };
      });

      const node = createContextNode({ indexDocs: false })(mockConfig);
      const result = await node(state);

      // Should process all 3 tests despite error on one
      expect(result.contextPerTest!.size).toBe(3);
    });
  });

  describe('logging', () => {
    it('should log test count and tool usage', async () => {
      const orphanTests = createMockOrphanTests(5);
      const state = createMockState({ orphanTests });
      const node = createContextNode({ indexDocs: false, useTool: true })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Building context for 5 orphan tests'),
      );
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(expect.stringContaining('useTool=true'));
    });

    it('should log final context count', async () => {
      const orphanTests = createMockOrphanTests(3);
      const state = createMockState({ orphanTests });
      const node = createContextNode({ indexDocs: false })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Context built for 3 tests'),
      );
    });
  });

  describe('ContextBuilderService integration', () => {
    it('should use injected ContextBuilderService when provided', async () => {
      const mockContextBuilderService = {
        analyzeTest: jest.fn().mockResolvedValue({
          expectedBehavior: 'Service-analyzed behavior',
          domainConcepts: ['service', 'domain'],
          relatedSourceFiles: ['/path/to/source.ts'],
          documentationSnippets: ['Doc snippet'],
          isolatedTestCode: 'test code',
        }),
      };

      const orphanTests = createMockOrphanTests(1);
      const state = createMockState({ orphanTests });
      const node = createContextNode({
        indexDocs: false,
        useTool: false,
        contextBuilderService: mockContextBuilderService as any,
      })(mockConfig);
      const result = await node(state);

      expect(mockContextBuilderService.analyzeTest).toHaveBeenCalled();
      const analysis = result.contextPerTest!.values().next().value;
      expect(analysis.summary).toBe('Service-analyzed behavior');
    });
  });
});
