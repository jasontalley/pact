/**
 * Search Node Tests
 *
 * Tests for the search/exploration node that executes tool calls.
 * Key behaviors tested:
 * - Discovery-first pattern (automatically lists target directories)
 * - Plan adherence (uses plan's file patterns)
 * - Tool execution and finding extraction
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { createSearchNode, SearchNodeState, SearchNodeOptions } from './search.node';
import { NodeConfig } from './types';
import { Plan } from '../types/schemas';
import { LLMService, LLMResponse } from '../../../../common/llm/llm.service';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { ToolCall } from '../../../../common/llm/providers/types';
import { Logger } from '@nestjs/common';

/**
 * Create a complete mock LLM response with all required fields
 */
function createMockLLMResponse(
  overrides: Partial<LLMResponse> & { toolCalls?: ToolCall[] } = {},
): LLMResponse {
  return {
    requestId: 'test-request-id',
    content: 'Mock response',
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    cost: 0.001,
    latencyMs: 500,
    cacheHit: false,
    retryCount: 0,
    modelUsed: 'gpt-5-nano',
    providerUsed: 'openai',
    toolCalls: [],
    ...overrides,
  };
}

describe('createSearchNode', () => {
  let mockLLMService: jest.Mocked<LLMService>;
  let mockToolRegistry: jest.Mocked<ToolRegistryService>;
  let mockLogger: jest.Mocked<Logger>;
  let nodeConfig: NodeConfig;

  const createMockState = (overrides: Partial<SearchNodeState> = {}): SearchNodeState => ({
    input: 'Analyze test coverage',
    findings: [],
    toolHistory: [],
    messages: [],
    iteration: 0,
    maxIterations: 5,
    isComplete: false,
    output: null,
    errors: [],
    plan: null,
    evidenceLevel: 0 as const,
    limitations: [],
    ...overrides,
  });

  const createMockPlan = (overrides: Partial<Plan> = {}): Plan => ({
    strategy: 'Explore test-results directory',
    targetDirectories: ['test-results'],
    filePatterns: ['coverage-summary.json', 'coverage-final.json'],
    searchTerms: ['coverage', 'lines'],
    actions: ['List directory', 'Read coverage files'],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLMService = {
      invoke: jest.fn().mockResolvedValue(
        createMockLLMResponse({
          content: 'Executing search',
          toolCalls: [],
        }),
      ),
    } as unknown as jest.Mocked<LLMService>;

    mockToolRegistry = {
      getAllTools: jest.fn().mockReturnValue([
        { name: 'list_directory', description: 'List directory contents' },
        { name: 'read_file', description: 'Read file contents' },
        { name: 'grep', description: 'Search file contents' },
      ]),
      getToolsByCategory: jest.fn().mockReturnValue([]),
      executeTool: jest.fn(),
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

  describe('discovery-first pattern', () => {
    // @atom IA-008
    it('should execute list_directory on first iteration when plan has targetDirectories', async () => {
      const plan = createMockPlan({ targetDirectories: ['test-results', 'coverage'] });
      const state = createMockState({ iteration: 0, plan });

      // Mock successful directory listing
      mockToolRegistry.executeTool.mockImplementation(async (tool, args) => {
        if (tool === 'list_directory') {
          return {
            path: args.path,
            items: [
              { name: 'coverage-final.json', type: 'file' },
              { name: 'lcov.info', type: 'file' },
            ],
          };
        }
        return {};
      });

      const searchNode = createSearchNode()(nodeConfig);
      const result = await searchNode(state);

      // Should have called list_directory for each target directory
      expect(mockToolRegistry.executeTool).toHaveBeenCalledWith('list_directory', {
        path: 'test-results',
      });
      expect(mockToolRegistry.executeTool).toHaveBeenCalledWith('list_directory', {
        path: 'coverage',
      });

      // Should have logged discovery execution
      expect(mockLogger.log).toHaveBeenCalledWith('Search node: Executing discovery-first pattern');

      // Should have findings from directory listings
      expect(result.findings).toHaveLength(2);
      expect(result.findings![0].relevance).toBe('Directory listing (discovery phase)');
    });

    // @atom IA-008
    it('should NOT execute discovery on iteration > 0', async () => {
      const plan = createMockPlan({ targetDirectories: ['test-results'] });
      const state = createMockState({ iteration: 1, plan }); // Second iteration

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      // Should NOT have called list_directory for discovery
      // (only LLM-requested tool calls would happen)
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        'Search node: Executing discovery-first pattern',
      );
    });

    // @atom IA-008
    it('should NOT execute discovery when plan has no targetDirectories', async () => {
      const plan = createMockPlan({ targetDirectories: [] });
      const state = createMockState({ iteration: 0, plan });

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      // Should NOT have called list_directory since there are no target directories
      // (executeDiscoveryFirst returns null when targetDirectories is empty)
      expect(mockToolRegistry.executeTool).not.toHaveBeenCalledWith(
        'list_directory',
        expect.anything(),
      );
    });

    // @atom IA-008
    it('should NOT execute discovery when no plan exists', async () => {
      const state = createMockState({ iteration: 0, plan: null });

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      // Should NOT have executed discovery
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        'Search node: Executing discovery-first pattern',
      );
    });

    // @atom IA-008
    it('should be disabled when enableDiscoveryFirst is false', async () => {
      const plan = createMockPlan({ targetDirectories: ['test-results'] });
      const state = createMockState({ iteration: 0, plan });

      const options: SearchNodeOptions = { enableDiscoveryFirst: false };
      const searchNode = createSearchNode(options)(nodeConfig);
      await searchNode(state);

      // Should NOT have executed discovery
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        'Search node: Executing discovery-first pattern',
      );
    });

    // @atom IA-008
    it('should handle discovery errors gracefully', async () => {
      const plan = createMockPlan({ targetDirectories: ['nonexistent-dir'] });
      const state = createMockState({ iteration: 0, plan });

      // Mock directory listing error
      mockToolRegistry.executeTool.mockRejectedValue(new Error('Directory not found'));

      const searchNode = createSearchNode()(nodeConfig);
      const result = await searchNode(state);

      // Should have logged warning
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Discovery failed'));

      // Should have recorded error in tool history
      expect(result.toolHistory).toHaveLength(1);
      expect(result.toolHistory![0].result).toContain('Error:');
    });
  });

  describe('discovery-only mode', () => {
    // @atom IA-008
    it('should skip LLM call when discoveryOnlyFirstIteration is true and discovery succeeds', async () => {
      const plan = createMockPlan({ targetDirectories: ['test-results'] });
      const state = createMockState({ iteration: 0, plan });

      // Mock successful directory listing
      mockToolRegistry.executeTool.mockResolvedValue({
        path: 'test-results',
        items: [{ name: 'coverage.json', type: 'file' }],
      });

      const options: SearchNodeOptions = { discoveryOnlyFirstIteration: true };
      const searchNode = createSearchNode(options)(nodeConfig);
      const result = await searchNode(state);

      // Should NOT have called LLM
      expect(mockLLMService.invoke).not.toHaveBeenCalled();

      // Should have logged discovery-only mode
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Discovery-only mode'));

      // Should still have findings
      expect(result.findings).toHaveLength(1);
    });
  });

  describe('tool execution', () => {
    // @atom IA-008
    it('should execute tool calls returned by LLM', async () => {
      const state = createMockState({ iteration: 1, plan: null });

      // Mock LLM returning tool calls
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: 'Reading file',
          toolCalls: [
            {
              id: 'call-1',
              name: 'read_file',
              arguments: { file_path: 'test-results/coverage.json' },
            },
          ],
        }),
      );

      // Mock file read
      mockToolRegistry.executeTool.mockResolvedValue({
        content: '{"lines": 85}',
      });

      const searchNode = createSearchNode()(nodeConfig);
      const result = await searchNode(state);

      // Should have executed the tool
      expect(mockToolRegistry.executeTool).toHaveBeenCalledWith('read_file', {
        file_path: 'test-results/coverage.json',
      });

      // Should have extracted finding
      expect(result.findings).toHaveLength(1);
      expect(result.findings![0].source).toBe('test-results/coverage.json');
    });

    // @atom IA-008
    it('should extract findings from grep results', async () => {
      const state = createMockState({ iteration: 1, plan: null });

      // Mock LLM returning grep tool call
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: 'Searching',
          toolCalls: [
            {
              id: 'call-1',
              name: 'grep',
              arguments: { pattern: 'coverage', file_pattern: '*.json' },
            },
          ],
        }),
      );

      // Mock grep results
      mockToolRegistry.executeTool.mockResolvedValue({
        results: [
          { file: 'test.json', line: 10, content: 'coverage: 85%' },
          { file: 'other.json', line: 5, content: 'coverage: 90%' },
        ],
      });

      const searchNode = createSearchNode()(nodeConfig);
      const result = await searchNode(state);

      // Should have extracted findings from grep
      expect(result.findings).toHaveLength(1);
      expect(result.findings![0].source).toContain('grep:');
      expect(result.findings![0].relevance).toBe('Search results');
    });

    // @atom IA-008
    it('should handle tool execution errors', async () => {
      const state = createMockState({ iteration: 1, plan: null });

      // Mock LLM returning tool call
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: 'Reading file',
          toolCalls: [
            {
              id: 'call-1',
              name: 'read_file',
              arguments: { file_path: 'nonexistent.json' },
            },
          ],
        }),
      );

      // Mock tool error
      mockToolRegistry.executeTool.mockRejectedValue(new Error('File not found'));

      const searchNode = createSearchNode()(nodeConfig);
      const result = await searchNode(state);

      // Should have logged warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Tool read_file failed'),
      );

      // Should have recorded error in tool history
      expect(result.toolHistory![0].result).toContain('Error:');
    });

    // @atom IA-008
    it('should respect maxToolsPerIteration limit', async () => {
      const state = createMockState({ iteration: 1, plan: null });

      // Mock LLM returning multiple tool calls
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: 'Executing',
          toolCalls: [
            { id: 'call-1', name: 'read_file', arguments: { file_path: 'a.json' } },
            { id: 'call-2', name: 'read_file', arguments: { file_path: 'b.json' } },
            { id: 'call-3', name: 'read_file', arguments: { file_path: 'c.json' } },
          ],
        }),
      );

      mockToolRegistry.executeTool.mockResolvedValue({ content: '{}' });

      const options: SearchNodeOptions = { maxToolsPerIteration: 2 };
      const searchNode = createSearchNode(options)(nodeConfig);
      await searchNode(state);

      // Should have only executed 2 tools
      expect(mockToolRegistry.executeTool).toHaveBeenCalledTimes(2);
    });
  });

  describe('prompt generation', () => {
    // @atom IA-008
    it('should include plan file patterns in prompt on first iteration', async () => {
      const plan = createMockPlan({
        filePatterns: ['coverage-summary.json', 'coverage-final.json'],
      });
      const state = createMockState({ iteration: 0, plan });

      // Mock empty discovery (no targetDirectories)
      const searchNode = createSearchNode()(nodeConfig);
      await searchNode({ ...state, plan: { ...plan, targetDirectories: [] } });

      // Check that LLM was called with prompt containing file patterns
      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const promptContent = invokeCall.messages.find(
        (m: { role: string }) => m.role === 'user',
      )?.content;

      expect(promptContent).toContain('coverage-summary.json');
      expect(promptContent).toContain('coverage-final.json');
      expect(promptContent).toContain('FOLLOW THIS');
    });

    // @atom IA-008
    it('should include critical rules for first iteration', async () => {
      const plan = createMockPlan({ targetDirectories: [] });
      const state = createMockState({ iteration: 0, plan });

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const promptContent = invokeCall.messages.find(
        (m: { role: string }) => m.role === 'user',
      )?.content;

      expect(promptContent).toContain('CRITICAL RULES FOR FIRST ITERATION');
      expect(promptContent).toContain('Do NOT guess file names');
    });

    // @atom IA-008
    it('should include different rules for subsequent iterations', async () => {
      const state = createMockState({ iteration: 2, plan: null });

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const promptContent = invokeCall.messages.find(
        (m: { role: string }) => m.role === 'user',
      )?.content;

      expect(promptContent).not.toContain('CRITICAL RULES FOR FIRST ITERATION');
      expect(promptContent).toContain('RULES:');
      expect(promptContent).toContain("don't re-read files already read");
    });
  });

  describe('iteration tracking', () => {
    // @atom IA-008
    it('should increment iteration count', async () => {
      const state = createMockState({ iteration: 2, plan: null });

      const searchNode = createSearchNode()(nodeConfig);
      const result = await searchNode(state);

      expect(result.iteration).toBe(3);
    });
  });

  describe('truncation', () => {
    // @atom IA-008
    it('should truncate large tool results', async () => {
      const state = createMockState({ iteration: 1, plan: null });

      // Mock LLM returning tool call
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: 'Reading',
          toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { file_path: 'large.json' } }],
        }),
      );

      // Mock large file content
      const largeContent = 'x'.repeat(20000); // 20KB
      mockToolRegistry.executeTool.mockResolvedValue({ content: largeContent });

      const options: SearchNodeOptions = { maxToolResultChars: 1000 };
      const searchNode = createSearchNode(options)(nodeConfig);
      const result = await searchNode(state);

      // Tool history should have truncated result
      expect(result.toolHistory![0].result.length).toBeLessThan(largeContent.length);
      expect(result.toolHistory![0].result).toContain('truncated');
    });
  });

  describe('knowledge chaining - path extraction', () => {
    // @atom IA-008
    it('should include paths from config files in prompt for subsequent iterations', async () => {
      // State with a config file finding that contains a path reference
      const state = createMockState({
        iteration: 1, // Not first iteration
        plan: null,
        findings: [
          {
            source: 'jest.config.js',
            content: `module.exports = {
              coverageDirectory: './test-results/backend/unit/coverage',
              testEnvironment: 'node',
            }`,
            relevance: 'Config file',
          },
        ],
      });

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      // Check that the prompt includes the discovered path
      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const promptContent = invokeCall.messages.find(
        (m: { role: string }) => m.role === 'user',
      )?.content;

      expect(promptContent).toContain('Paths Discovered in File Contents');
      expect(promptContent).toContain('./test-results/backend/unit/coverage');
      expect(promptContent).toContain('ACTION REQUIRED');
    });

    // @atom IA-008
    it('should include multiple discovered paths from different findings', async () => {
      const state = createMockState({
        iteration: 2,
        plan: null,
        findings: [
          {
            source: 'jest.config.js',
            content: `coverageDirectory: './coverage/unit'`,
            relevance: 'Config',
          },
          {
            source: 'tsconfig.json',
            content: `"outDir": "./dist/build"`,
            relevance: 'Config',
          },
        ],
      });

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const promptContent = invokeCall.messages.find(
        (m: { role: string }) => m.role === 'user',
      )?.content;

      expect(promptContent).toContain('./coverage/unit');
      expect(promptContent).toContain('./dist/build');
    });

    // @atom IA-008
    it('should include path-following rules when paths are discovered', async () => {
      const state = createMockState({
        iteration: 1,
        plan: null,
        findings: [
          {
            source: 'config.js',
            content: `dataDir: './data/reports'`,
            relevance: 'Config',
          },
        ],
      });

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const promptContent = invokeCall.messages.find(
        (m: { role: string }) => m.role === 'user',
      )?.content;

      expect(promptContent).toContain('FOLLOW DISCOVERED PATHS');
      expect(promptContent).toContain('list_directory');
    });
  });

  describe('knowledge chaining - tool suggestions', () => {
    // @atom IA-008
    it('should suggest read_json for JSON files in directory listings', async () => {
      const state = createMockState({
        iteration: 1,
        plan: null,
        findings: [
          {
            source: 'test-results',
            content: `file: coverage-summary.json
file: lcov.info
file: results.json`,
            relevance: 'Directory listing',
          },
        ],
      });

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const promptContent = invokeCall.messages.find(
        (m: { role: string }) => m.role === 'user',
      )?.content;

      expect(promptContent).toContain('Tool Suggestion');
      expect(promptContent).toContain('read_coverage_report');
      expect(promptContent).toContain('coverage-summary.json');
    });

    // @atom IA-008
    it('should suggest read_coverage_report for coverage files', async () => {
      const state = createMockState({
        iteration: 1,
        plan: null,
        findings: [
          {
            source: './coverage',
            content: `file: coverage-final.json
file: coverage-summary.json`,
            relevance: 'Directory listing',
          },
        ],
      });

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const promptContent = invokeCall.messages.find(
        (m: { role: string }) => m.role === 'user',
      )?.content;

      expect(promptContent).toContain('Coverage Files Found');
      expect(promptContent).toContain('read_coverage_report');
    });

    // @atom IA-008
    it('should suggest read_json for non-coverage JSON files', async () => {
      const state = createMockState({
        iteration: 1,
        plan: null,
        findings: [
          {
            source: './config',
            content: `file: settings.json
file: package.json`,
            relevance: 'Directory listing',
          },
        ],
      });

      const searchNode = createSearchNode()(nodeConfig);
      await searchNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const promptContent = invokeCall.messages.find(
        (m: { role: string }) => m.role === 'user',
      )?.content;

      expect(promptContent).toContain('JSON Files Found');
      expect(promptContent).toContain('read_json');
      expect(promptContent).toContain('settings.json');
    });
  });
});
