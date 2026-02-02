/**
 * Structure Node Tests
 *
 * Tests for the structure node that scans the repository for files.
 * Covers file system scanning, pattern matching, tool integration, and dependency analysis.
 *
 * @see docs/implementation-checklist-phase6.md Section 2.1
 */

import { createStructureNode, StructureNodeOptions } from './structure.node';
import { ReconciliationGraphStateType } from '../../types/reconciliation-state';
import { NodeConfig } from '../types';
import * as fs from 'fs';

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
 * Create mock file system structure
 */
function setupMockFileSystem(files: string[]): void {
  const fileSet = new Set(files);
  const dirContents = new Map<string, string[]>();

  // Build directory contents map
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 0; i < parts.length; i++) {
      const dir = i === 0 ? '' : parts.slice(0, i).join('/');
      const name = parts[i];
      const existing = dirContents.get(dir) || [];
      if (!existing.includes(name)) {
        existing.push(name);
      }
      dirContents.set(dir, existing);
    }
  }

  (fs.readdirSync as jest.Mock).mockImplementation((dir: string, options?: any) => {
    // Remove leading /test/project/ from dir
    const normalizedDir = dir.replace('/test/project/', '').replace('/test/project', '');
    const contents = dirContents.get(normalizedDir) || [];

    if (options?.withFileTypes) {
      return contents.map((name) => {
        const fullPath = normalizedDir ? `${normalizedDir}/${name}` : name;
        const isFile = fileSet.has(fullPath);
        const isDir = !isFile && Array.from(dirContents.keys()).some((d) => d.startsWith(fullPath));
        return {
          name,
          isFile: () => isFile,
          isDirectory: () => isDir,
        };
      });
    }

    return contents;
  });
}

describe('StructureNode', () => {
  let mockConfig: NodeConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = createMockNodeConfig();
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
  });

  describe('basic file scanning', () => {
    it('should scan repository and find files', async () => {
      setupMockFileSystem(['src/main.ts', 'src/app.service.ts', 'src/app.service.spec.ts']);

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.repoStructure).toBeDefined();
      expect(result.repoStructure!.files.length).toBeGreaterThan(0);
      expect(result.currentPhase).toBe('discover');
    });

    it('should categorize files as source or test', async () => {
      setupMockFileSystem([
        'src/service.ts',
        'src/service.spec.ts',
        'src/component.tsx',
        'src/component.test.ts',
      ]);

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.repoStructure!.testFiles).toContain('src/service.spec.ts');
      expect(result.repoStructure!.testFiles).toContain('src/component.test.ts');
    });

    it('should set startTime if not already set', async () => {
      setupMockFileSystem(['src/main.ts']);

      const state = createMockState({ startTime: undefined as any });
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.startTime).toBeInstanceOf(Date);
    });

    it('should preserve existing startTime', async () => {
      setupMockFileSystem(['src/main.ts']);

      const existingStartTime = new Date('2024-01-01');
      const state = createMockState({ startTime: existingStartTime });
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.startTime).toEqual(existingStartTime);
    });
  });

  describe('pattern matching', () => {
    it('should match spec.ts files as tests', async () => {
      setupMockFileSystem(['src/users/users.spec.ts', 'src/auth/auth.service.spec.ts']);

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.repoStructure!.testFiles).toContain('src/users/users.spec.ts');
      expect(result.repoStructure!.testFiles).toContain('src/auth/auth.service.spec.ts');
    });

    it('should match test.ts files as tests', async () => {
      setupMockFileSystem(['src/components/Button.test.ts', 'src/utils/helpers.test.ts']);

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.repoStructure!.testFiles).toContain('src/components/Button.test.ts');
    });

    it('should match e2e-spec.ts files as tests', async () => {
      setupMockFileSystem(['test/app.e2e-spec.ts', 'test/users.e2e-spec.ts']);

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.repoStructure!.testFiles).toContain('test/app.e2e-spec.ts');
    });

    it('should support custom test patterns', async () => {
      setupMockFileSystem(['src/service.ts', 'src/service.test.js', 'src/service.spec.ts']);

      const state = createMockState();
      const node = createStructureNode({
        useTool: false,
        testPatterns: ['**/*.test.js'],
      })(mockConfig);
      const result = await node(state);

      expect(result.repoStructure!.testFiles).toContain('src/service.test.js');
      expect(result.repoStructure!.testFiles).not.toContain('src/service.spec.ts');
    });

    it('should support custom source patterns', async () => {
      setupMockFileSystem(['src/main.ts', 'src/app.tsx', 'src/styles.css']);

      const state = createMockState();
      const node = createStructureNode({
        useTool: false,
        sourcePatterns: ['**/*.tsx'],
      })(mockConfig);
      const result = await node(state);

      expect(result.repoStructure!.files).toContain('src/app.tsx');
      expect(result.repoStructure!.files).not.toContain('src/main.ts');
    });
  });

  describe('exclusion patterns', () => {
    it('should exclude node_modules by default', async () => {
      setupMockFileSystem(['src/main.ts', 'node_modules/package/index.ts']);

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      const hasNodeModules = result.repoStructure!.files.some((f) => f.includes('node_modules'));
      expect(hasNodeModules).toBe(false);
    });

    it('should exclude dist by default', async () => {
      setupMockFileSystem(['src/main.ts', 'dist/main.js']);

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      const hasDist = result.repoStructure!.files.some((f) => f.includes('dist'));
      expect(hasDist).toBe(false);
    });

    it('should exclude .git by default', async () => {
      setupMockFileSystem(['src/main.ts', '.git/config']);

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      const hasGit = result.repoStructure!.files.some((f) => f.includes('.git'));
      expect(hasGit).toBe(false);
    });

    it('should support custom exclude patterns', async () => {
      setupMockFileSystem(['src/main.ts', 'temp/cache.ts', 'build/output.ts']);

      const state = createMockState();
      const node = createStructureNode({
        useTool: false,
        excludePatterns: ['temp', 'build'],
      })(mockConfig);
      const result = await node(state);

      const hasExcluded = result.repoStructure!.files.some(
        (f) => f.includes('temp') || f.includes('build'),
      );
      expect(hasExcluded).toBe(false);
    });
  });

  describe('maxFiles limit', () => {
    it('should respect maxFiles limit', async () => {
      const manyFiles = Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`);
      setupMockFileSystem(manyFiles);

      const state = createMockState();
      const node = createStructureNode({ useTool: false, maxFiles: 10 })(mockConfig);
      const result = await node(state);

      expect(result.repoStructure!.files.length).toBeLessThanOrEqual(10);
    });
  });

  describe('tool-based scanning', () => {
    it('should use tool when available', async () => {
      const toolResult = {
        files: ['src/main.ts', 'src/app.spec.ts'],
        sourceFiles: ['src/main.ts'],
        testFiles: ['src/app.spec.ts'],
        totalFiles: 2,
        dependencyEdges: [],
        topologicalOrder: ['src/main.ts', 'src/app.spec.ts'],
      };

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(toolResult);

      const state = createMockState();
      const node = createStructureNode({ useTool: true })(mockConfig);
      const result = await node(state);

      expect(mockConfig.toolRegistry.executeTool).toHaveBeenCalledWith(
        'get_repo_structure',
        expect.any(Object),
      );
      expect(result.repoStructure!.files).toEqual(toolResult.files);
      expect(result.repoStructure!.testFiles).toEqual(toolResult.testFiles);
    });

    it('should pass options to tool', async () => {
      const toolResult = {
        files: [],
        sourceFiles: [],
        testFiles: [],
        totalFiles: 0,
      };

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(toolResult);

      const state = createMockState();
      const node = createStructureNode({
        useTool: true,
        maxFiles: 500,
        excludePatterns: ['temp', 'cache'],
        includeDependencies: true,
      })(mockConfig);
      await node(state);

      expect(mockConfig.toolRegistry.executeTool).toHaveBeenCalledWith(
        'get_repo_structure',
        expect.objectContaining({
          max_files: 500,
          exclude_patterns: 'temp,cache',
        }),
      );
    });

    it('should fall back to direct implementation on tool error', async () => {
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockRejectedValue(
        new Error('Tool failed'),
      );

      setupMockFileSystem(['src/main.ts']);

      const state = createMockState();
      const node = createStructureNode({ useTool: true })(mockConfig);
      const result = await node(state);

      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(expect.stringContaining('Tool failed'));
      expect(result.repoStructure).toBeDefined();
    });

    it('should skip tool when useTool is false', async () => {
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      setupMockFileSystem(['src/main.ts']);

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      await node(state);

      expect(mockConfig.toolRegistry.executeTool).not.toHaveBeenCalled();
    });
  });

  describe('dependency analysis', () => {
    it('should include dependency edges when tool provides them', async () => {
      const toolResult = {
        files: ['src/a.ts', 'src/b.ts'],
        sourceFiles: ['src/a.ts', 'src/b.ts'],
        testFiles: [],
        totalFiles: 2,
        dependencyEdges: [{ from: 'src/a.ts', to: 'src/b.ts' }],
        hasCycles: false,
      };

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(toolResult);

      const state = createMockState();
      const node = createStructureNode({ useTool: true, includeDependencies: true })(mockConfig);
      const result = await node(state);

      expect(result.repoStructure!.dependencyEdges).toHaveLength(1);
      expect(result.repoStructure!.dependencyEdges![0]).toEqual({
        from: 'src/a.ts',
        to: 'src/b.ts',
      });
    });

    it('should include topological order when tool provides it', async () => {
      const toolResult = {
        files: ['src/utils.ts', 'src/service.ts', 'src/controller.ts'],
        sourceFiles: ['src/utils.ts', 'src/service.ts', 'src/controller.ts'],
        testFiles: [],
        totalFiles: 3,
        topologicalOrder: ['src/utils.ts', 'src/service.ts', 'src/controller.ts'],
      };

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(toolResult);

      const state = createMockState();
      const node = createStructureNode({ useTool: true })(mockConfig);
      const result = await node(state);

      expect(result.repoStructure!.topologicalOrder).toEqual(toolResult.topologicalOrder);
    });

    it('should log dependency analysis info', async () => {
      const toolResult = {
        files: [],
        sourceFiles: [],
        testFiles: [],
        totalFiles: 0,
        dependencyEdges: [{ from: 'a.ts', to: 'b.ts' }],
        hasCycles: true,
      };

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(toolResult);

      const state = createMockState();
      const node = createStructureNode({ useTool: true })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Dependency analysis: 1 edges'),
      );
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(expect.stringContaining('cycles: true'));
    });
  });

  describe('error handling', () => {
    it('should handle directory read errors gracefully', async () => {
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      // walkDirectory catches errors internally and returns empty array
      expect(result.repoStructure!.files).toEqual([]);
      expect(result.currentPhase).toBe('discover');
    });

    it('should continue scanning after unreadable subdirectory', async () => {
      let callCount = 0;
      (fs.readdirSync as jest.Mock).mockImplementation((dir: string, options?: any) => {
        callCount++;
        if (dir.includes('unreadable')) {
          throw new Error('Permission denied');
        }
        if (dir === '/test/project') {
          return options?.withFileTypes
            ? [
                { name: 'src', isFile: () => false, isDirectory: () => true },
                { name: 'unreadable', isFile: () => false, isDirectory: () => true },
              ]
            : ['src', 'unreadable'];
        }
        if (dir.includes('src')) {
          return options?.withFileTypes
            ? [{ name: 'main.ts', isFile: () => true, isDirectory: () => false }]
            : ['main.ts'];
        }
        return [];
      });

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      // Should still find files in readable directories
      expect(result.repoStructure!.files).toContain('src/main.ts');
    });
  });

  describe('root directory handling', () => {
    it('should use state rootDirectory', async () => {
      setupMockFileSystem(['src/main.ts']);

      const state = createMockState({ rootDirectory: '/custom/path' });
      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.rootDirectory).toBe('/custom/path');
    });

    it('should fall back to input rootDirectory', async () => {
      setupMockFileSystem(['src/main.ts']);

      const state = createMockState({
        rootDirectory: undefined as any,
        input: {
          rootDirectory: '/input/path',
          reconciliationMode: 'full-scan',
          options: {},
        },
      });

      const node = createStructureNode({ useTool: false })(mockConfig);
      const result = await node(state);

      expect(result.rootDirectory).toBe('/input/path');
    });
  });

  describe('logging', () => {
    it('should log scanning start with options', async () => {
      setupMockFileSystem(['src/main.ts']);

      const state = createMockState();
      const node = createStructureNode({ useTool: false, includeDependencies: true })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Scanning repository'),
      );
    });

    it('should log file counts', async () => {
      setupMockFileSystem(['src/service.ts', 'src/service.spec.ts', 'src/controller.ts']);

      const state = createMockState();
      const node = createStructureNode({ useTool: false })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringMatching(/Found \d+ files: \d+ source, \d+ test/),
      );
    });
  });
});
