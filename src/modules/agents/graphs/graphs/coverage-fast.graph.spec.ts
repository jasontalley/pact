/**
 * Coverage Fast-Path Graph Tests
 *
 * Tests for the deterministic coverage graph that bypasses the ReAct loop.
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import {
  createCoverageFastGraph,
  CoverageFastState,
  COVERAGE_FAST_GRAPH_NAME,
  COVERAGE_FAST_GRAPH_CONFIG,
} from './coverage-fast.graph';
import { NodeConfig } from '../nodes/types';
import { LLMService } from '../../../../common/llm/llm.service';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { Logger } from '@nestjs/common';

describe('CoverageFastGraph', () => {
  let mockLLMService: jest.Mocked<LLMService>;
  let mockToolRegistry: jest.Mocked<ToolRegistryService>;
  let mockLogger: jest.Mocked<Logger>;
  let nodeConfig: NodeConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLMService = {
      invoke: jest.fn(),
    } as unknown as jest.Mocked<LLMService>;

    mockToolRegistry = {
      executeTool: jest.fn(),
      getAllTools: jest.fn().mockReturnValue([]),
      getToolsByCategory: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<ToolRegistryService>;

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    nodeConfig = {
      llmService: mockLLMService,
      toolRegistry: mockToolRegistry,
      logger: mockLogger,
    };
  });

  describe('graph configuration', () => {
    it('should have correct graph name', () => {
      expect(COVERAGE_FAST_GRAPH_NAME).toBe('coverage-fast');
    });

    it('should have fast-path pattern', () => {
      expect(COVERAGE_FAST_GRAPH_CONFIG.pattern).toBe('fast-path');
    });

    it('should create a compiled graph', () => {
      const graph = createCoverageFastGraph(nodeConfig);
      expect(graph).toBeDefined();
    });
  });

  describe('discovery phase', () => {
    it('should discover coverage files in test-results directory', async () => {
      mockToolRegistry.executeTool.mockImplementation(async (toolName, args) => {
        if (toolName === 'list_directory') {
          const dir = args.directory_path as string;
          if (dir === 'test-results') {
            return {
              items: [
                { name: 'backend', type: 'directory' },
                { name: 'frontend', type: 'directory' },
              ],
            };
          }
          if (dir === 'test-results/backend/unit/coverage') {
            return {
              items: [{ name: 'coverage-summary.json', type: 'file' }],
            };
          }
        }
        if (toolName === 'read_coverage_report') {
          return {
            metrics: {
              lines: { total: 100, covered: 85, pct: 85 },
              statements: { total: 120, covered: 100, pct: 83.3 },
            },
          };
        }
        return null;
      });

      const graph = createCoverageFastGraph(nodeConfig);
      const result = await graph.invoke({
        input: 'What is the test coverage?',
      });

      expect(result.output).toBeDefined();
      expect(result.output).toContain('Coverage');
    });

    it('should handle missing coverage directories', async () => {
      mockToolRegistry.executeTool.mockRejectedValue(new Error('Directory not found'));

      const graph = createCoverageFastGraph(nodeConfig);
      const result = await graph.invoke({
        input: 'What is the test coverage?',
      });

      expect(result.output).toContain("couldn't find coverage data");
      expect(result.error).toBeDefined();
    });
  });

  describe('metrics extraction', () => {
    it('should extract metrics from coverage-summary.json', async () => {
      mockToolRegistry.executeTool.mockImplementation(async (toolName, args) => {
        if (toolName === 'list_directory') {
          if (args.directory_path === 'coverage') {
            return {
              items: [{ name: 'coverage-summary.json', type: 'file' }],
            };
          }
          throw new Error('Not found');
        }
        if (toolName === 'read_coverage_report') {
          return {
            metrics: {
              lines: { total: 200, covered: 170, pct: 85 },
              branches: { total: 50, covered: 40, pct: 80 },
              functions: { total: 30, covered: 27, pct: 90 },
            },
          };
        }
        return null;
      });

      const graph = createCoverageFastGraph(nodeConfig);
      const result = await graph.invoke({
        input: 'What is the code coverage?',
      });

      expect(result.metrics).toBeDefined();
      expect(result.metrics).toHaveProperty('lines');
      expect(result.output).toContain('85');
    });

    it('should format multiple coverage metrics', async () => {
      mockToolRegistry.executeTool.mockImplementation(async (toolName, args) => {
        if (toolName === 'list_directory') {
          if (args.directory_path === 'test-results') {
            return {
              items: [{ name: 'coverage-summary.json', type: 'file' }],
            };
          }
          throw new Error('Not found');
        }
        if (toolName === 'read_coverage_report') {
          return {
            metrics: {
              lines: { total: 100, covered: 85, pct: 85 },
              statements: { total: 120, covered: 96, pct: 80 },
              branches: { total: 40, covered: 30, pct: 75 },
              functions: { total: 20, covered: 18, pct: 90 },
            },
          };
        }
        return null;
      });

      const graph = createCoverageFastGraph(nodeConfig);
      const result = await graph.invoke({
        input: 'Show me the test coverage',
      });

      expect(result.output).toContain('lines');
      expect(result.output).toContain('statements');
      expect(result.output).toContain('branches');
      expect(result.output).toContain('functions');
    });
  });

  describe('no LLM calls', () => {
    it('should not call LLM service', async () => {
      mockToolRegistry.executeTool.mockImplementation(async (toolName) => {
        if (toolName === 'list_directory') {
          return { items: [{ name: 'coverage.json', type: 'file' }] };
        }
        if (toolName === 'read_coverage_report') {
          return { metrics: { lines: { total: 100, covered: 80, pct: 80 } } };
        }
        return null;
      });

      const graph = createCoverageFastGraph(nodeConfig);
      await graph.invoke({ input: 'What is coverage?' });

      // LLM should never be called - this is a deterministic fast-path
      expect(mockLLMService.invoke).not.toHaveBeenCalled();
    });
  });
});
