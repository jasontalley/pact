/**
 * Discover Fullscan Node Tests
 *
 * Tests for path/file filtering logic in the discover fullscan node.
 *
 * @see docs/implementation-checklist-phase6.md Section 3.1
 */

import { createDiscoverFullscanNode } from './discover-fullscan.node';
import { ReconciliationGraphStateType, RepoStructure } from '../../types/reconciliation-state';
import { NodeConfig } from '../types';

/**
 * Create a minimal state for testing
 */
function createMockState(overrides: Partial<ReconciliationGraphStateType> = {}): ReconciliationGraphStateType {
  return {
    rootDirectory: '/test',
    input: {
      rootDirectory: '/test',
      reconciliationMode: 'full-scan',
      options: {},
    },
    repoStructure: {
      files: [],
      testFiles: [],
    },
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
  } as ReconciliationGraphStateType;
}

/**
 * Create a mock config for testing
 */
function createMockConfig(): NodeConfig {
  return {
    logger: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    toolRegistry: {
      hasTool: jest.fn().mockReturnValue(false), // Force fallback to direct implementation
      executeTool: jest.fn(),
    },
  } as unknown as NodeConfig;
}

describe('DiscoverFullscanNode', () => {
  describe('Path Filtering', () => {
    describe('includePaths', () => {
      it('should only include files under specified paths', async () => {
        const testFiles = [
          'src/modules/atoms/atoms.service.spec.ts',
          'src/modules/atoms/atoms.controller.spec.ts',
          'src/modules/validators/validators.service.spec.ts',
          'src/modules/agents/agent.service.spec.ts',
          'test/e2e/atoms.e2e-spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              includePaths: ['src/modules/atoms'],
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should log that it filtered from 5 to 2 test files
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Filtered test files: 5 -> 2'),
        );
      });

      it('should support multiple includePaths', async () => {
        const testFiles = [
          'src/modules/atoms/atoms.service.spec.ts',
          'src/modules/validators/validators.service.spec.ts',
          'src/modules/agents/agent.service.spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              includePaths: ['src/modules/atoms', 'src/modules/validators'],
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should include atoms and validators, exclude agents
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Filtered test files: 3 -> 2'),
        );
      });
    });

    describe('excludePaths', () => {
      it('should exclude files under specified paths', async () => {
        const testFiles = [
          'src/modules/atoms/atoms.service.spec.ts',
          'src/modules/validators/validators.service.spec.ts',
          'test/e2e/atoms.e2e-spec.ts',
          'test/e2e/validators.e2e-spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              excludePaths: ['test/e2e'],
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should exclude e2e tests
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Filtered test files: 4 -> 2'),
        );
      });

      it('should support combining includePaths and excludePaths', async () => {
        const testFiles = [
          'src/modules/atoms/atoms.service.spec.ts',
          'src/modules/atoms/atoms.controller.spec.ts',
          'src/modules/atoms/dto/create-atom.dto.spec.ts',
          'src/modules/validators/validators.service.spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              includePaths: ['src/modules/atoms'],
              excludePaths: ['src/modules/atoms/dto'],
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should include atoms but exclude dto subfolder
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Filtered test files: 4 -> 2'),
        );
      });
    });

    describe('includeFilePatterns', () => {
      it('should only include files matching patterns', async () => {
        const testFiles = [
          'src/modules/atoms/atoms.service.spec.ts',
          'src/modules/atoms/atoms.controller.spec.ts',
          'src/modules/validators/validators.service.spec.ts',
          'test/atoms.e2e-spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              includeFilePatterns: ['*.service.spec.ts'],
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should only include service specs
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Filtered test files: 4 -> 2'),
        );
      });

      it('should support multiple file patterns', async () => {
        const testFiles = [
          'src/modules/atoms/atoms.service.spec.ts',
          'src/modules/atoms/atoms.controller.spec.ts',
          'src/modules/atoms/atoms.repository.spec.ts',
          'src/modules/atoms/atoms.entity.spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              includeFilePatterns: ['*.service.spec.ts', '*.controller.spec.ts'],
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should include service and controller specs
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Filtered test files: 4 -> 2'),
        );
      });
    });

    describe('excludeFilePatterns', () => {
      it('should exclude files matching patterns', async () => {
        const testFiles = [
          'src/modules/atoms/atoms.service.spec.ts',
          'src/modules/atoms/atoms.controller.spec.ts',
          'test/atoms.e2e-spec.ts',
          'test/validators.e2e-spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              excludeFilePatterns: ['*.e2e-spec.ts'],
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should exclude e2e specs
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Filtered test files: 4 -> 2'),
        );
      });
    });

    describe('Combined Filters', () => {
      it('should apply all filters together', async () => {
        const testFiles = [
          // These should be included (atoms + service pattern)
          'src/modules/atoms/atoms.service.spec.ts',
          // These should be excluded (atoms but controller pattern not in include)
          'src/modules/atoms/atoms.controller.spec.ts',
          // These should be excluded (not in includePaths)
          'src/modules/validators/validators.service.spec.ts',
          // These should be excluded (e2e pattern)
          'src/modules/atoms/atoms.e2e-spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              includePaths: ['src/modules/atoms'],
              includeFilePatterns: ['*.service.spec.ts'],
              excludeFilePatterns: ['*.e2e-spec.ts'],
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should only include atoms.service.spec.ts
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Filtered test files: 4 -> 1'),
        );
      });

      it('should log filter configuration', async () => {
        const testFiles = ['src/test.spec.ts'];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              includePaths: ['src'],
              excludePaths: ['test'],
              includeFilePatterns: ['*.spec.ts'],
              excludeFilePatterns: ['*.e2e-spec.ts'],
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should log filter configuration
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('includePaths=["src"]'),
        );
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('excludePaths=["test"]'),
        );
      });
    });

    describe('No Filters', () => {
      it('should process all test files when no filters specified', async () => {
        const testFiles = [
          'src/modules/atoms/atoms.service.spec.ts',
          'src/modules/validators/validators.service.spec.ts',
          'test/e2e/atoms.e2e-spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {}, // No filters
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should not log any filtering
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('hasFilters=false'),
        );
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Scanning 3 test files'),
        );
      });
    });

    describe('maxTests Limit', () => {
      it('should apply maxTests limit AFTER path filtering', async () => {
        const testFiles = [
          'src/modules/atoms/test1.spec.ts',
          'src/modules/atoms/test2.spec.ts',
          'src/modules/atoms/test3.spec.ts',
          'src/modules/validators/test1.spec.ts',
          'src/modules/validators/test2.spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              includePaths: ['src/modules/atoms'],
              maxTests: 2, // Limit to 2 after filtering
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false, maxTests: 2 });
        const node = nodeFactory(config);

        await node(state);

        // Should first filter to 3 (atoms only), then limit would apply during processing
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Filtered test files: 5 -> 3'),
        );
      });
    });

    describe('Windows Path Normalization', () => {
      it('should handle Windows-style paths', async () => {
        const testFiles = [
          'src\\modules\\atoms\\atoms.service.spec.ts',
          'src\\modules\\validators\\validators.service.spec.ts',
        ];

        const state = createMockState({
          rootDirectory: '/test',
          repoStructure: { files: testFiles, testFiles },
          input: {
            rootDirectory: '/test',
            reconciliationMode: 'full-scan',
            options: {
              includePaths: ['src/modules/atoms'], // Unix-style in options
            },
          },
        });

        const config = createMockConfig();
        const nodeFactory = createDiscoverFullscanNode({ useTool: false });
        const node = nodeFactory(config);

        await node(state);

        // Should handle both path styles
        expect(config.logger?.log).toHaveBeenCalledWith(
          expect.stringContaining('Filtered test files: 2 -> 1'),
        );
      });
    });
  });
});
