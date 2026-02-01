/**
 * Chat Exploration Graph Integration Tests
 *
 * Tests the full graph trajectory: planning -> search -> analyze -> synthesize
 * Uses mocked LLM responses to verify deterministic behavior.
 *
 * Key scenarios tested:
 * - Happy path: immediate success after first search
 * - Iteration loop: need_more_search triggers additional searches
 * - Max iterations: ensures graph terminates even if analyze never says ready
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { createChatExplorationGraph } from './chat-exploration.graph';
import { NodeConfig } from '../nodes/types';
import { LLMService, LLMResponse } from '../../../../common/llm/llm.service';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { Logger } from '@nestjs/common';
import { ChatExplorationStateType } from '../types/exploration-state';
import { Plan, AnalyzeResult } from '../types/schemas';
import { ToolCall } from '../../../../common/llm/providers/types';

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

describe('ChatExplorationGraph Integration', () => {
  let mockLLMService: jest.Mocked<LLMService>;
  let mockToolRegistry: jest.Mocked<ToolRegistryService>;
  let mockLogger: jest.Mocked<Logger>;
  let nodeConfig: NodeConfig;

  // Mock responses
  const validPlan: Plan = {
    strategy: 'Find test coverage files',
    targetDirectories: ['test-results', 'coverage'],
    filePatterns: ['coverage-summary.json', 'lcov.info'],
    searchTerms: ['coverage', 'lines'],
    actions: ['List directories', 'Read coverage files'],
  };

  const analyzeReadyResult: AnalyzeResult = {
    decision: 'ready_to_answer',
    reasoning: 'Found sufficient coverage data',
    missingInfo: [],
    confidence: 0.9,
  };

  const analyzeNeedMoreResult: AnalyzeResult = {
    decision: 'need_more_search',
    reasoning: 'Only found directory listing, need file contents',
    missingInfo: ['actual coverage numbers'],
    confidence: 0.3,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLMService = {
      invoke: jest.fn(),
    } as unknown as jest.Mocked<LLMService>;

    mockToolRegistry = {
      getAllTools: jest.fn().mockReturnValue([
        { name: 'list_directory', description: 'List directory contents' },
        { name: 'read_file', description: 'Read file contents' },
        { name: 'grep', description: 'Search files for patterns' },
      ]),
      getToolsByCategory: jest.fn().mockReturnValue([
        { name: 'list_directory', description: 'List directory contents' },
        { name: 'read_file', description: 'Read file contents' },
      ]),
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

  const createInitialState = (
    overrides: Partial<ChatExplorationStateType> = {},
  ): ChatExplorationStateType => ({
    input: 'What is the test coverage for this project?',
    findings: [],
    toolHistory: [],
    messages: [],
    iteration: 0,
    maxIterations: 5,
    isComplete: false,
    output: null,
    errors: [],
    plan: null,
    analysisDecision: null,
    clarificationNeeded: null,
    evidenceLevel: 0 as const,
    limitations: [],
    ...overrides,
  });

  describe('happy path trajectory', () => {
    // @atom IA-008
    it('should complete in minimal iterations: plan -> search -> analyze (ready) -> synthesize', async () => {
      // Setup LLM responses for each node
      let invokeCount = 0;
      mockLLMService.invoke.mockImplementation(async (params) => {
        invokeCount++;
        const agentName = params.agentName;

        if (agentName === 'plan-node') {
          return createMockLLMResponse({
            content: JSON.stringify(validPlan),
          });
        }

        if (agentName === 'search-node') {
          // Return tool calls to read a file
          return createMockLLMResponse({
            content: 'I will read the coverage file',
            toolCalls: [
              {
                id: 'tool-1',
                name: 'read_file',
                arguments: { file_path: 'test-results/coverage-summary.json' },
              },
            ],
          });
        }

        if (agentName === 'analyze-node') {
          // Ready to answer immediately
          return createMockLLMResponse({
            content: JSON.stringify(analyzeReadyResult),
          });
        }

        if (agentName === 'synthesize-node') {
          return createMockLLMResponse({
            content: 'Test coverage is 85% for lines and 87% for statements.',
          });
        }

        throw new Error(`Unexpected agent: ${agentName}`);
      });

      // Setup tool execution
      mockToolRegistry.executeTool.mockImplementation(async (tool, args) => {
        if (tool === 'list_directory') {
          return {
            path: args.path,
            items: [
              { name: 'coverage-summary.json', type: 'file' },
              { name: 'lcov.info', type: 'file' },
            ],
          };
        }
        if (tool === 'read_file') {
          return {
            content: JSON.stringify({
              total: { lines: { pct: 85 }, statements: { pct: 87 } },
            }),
          };
        }
        return {};
      });

      const graph = createChatExplorationGraph(nodeConfig);
      const initialState = createInitialState();

      const result = await graph.invoke(initialState);

      // Verify trajectory completed
      expect(result.isComplete).toBe(true);
      expect(result.output).toContain('85%');
      expect(result.analysisDecision).toBe('ready_to_answer');

      // Verify plan was generated
      expect(result.plan).toBeDefined();
      expect(result.plan?.strategy).toBe('Find test coverage files');

      // Verify findings were accumulated
      expect(result.findings.length).toBeGreaterThan(0);

      // Should not exceed 2 iterations (1 search cycle)
      expect(result.iteration).toBeLessThanOrEqual(2);
    });
  });

  describe('iteration loop trajectory', () => {
    // @atom IA-008
    it('should loop search -> analyze when more information needed', async () => {
      let analyzeCallCount = 0;

      mockLLMService.invoke.mockImplementation(async (params) => {
        const agentName = params.agentName;

        if (agentName === 'plan-node') {
          return createMockLLMResponse({
            content: JSON.stringify(validPlan),
          });
        }

        if (agentName === 'search-node') {
          return createMockLLMResponse({
            content: 'Searching...',
            toolCalls: [
              {
                id: 'tool-search',
                name: 'list_directory',
                arguments: { path: 'test-results' },
              },
            ],
          });
        }

        if (agentName === 'analyze-node') {
          analyzeCallCount++;
          // First call: need more search. Second call: ready
          if (analyzeCallCount === 1) {
            return createMockLLMResponse({
              content: JSON.stringify(analyzeNeedMoreResult),
            });
          }
          return createMockLLMResponse({
            content: JSON.stringify(analyzeReadyResult),
          });
        }

        if (agentName === 'synthesize-node') {
          return createMockLLMResponse({
            content: 'Coverage analysis complete.',
          });
        }

        throw new Error(`Unexpected agent: ${agentName}`);
      });

      mockToolRegistry.executeTool.mockResolvedValue({
        path: 'test-results',
        items: [{ name: 'coverage.json', type: 'file' }],
      });

      const graph = createChatExplorationGraph(nodeConfig);
      // Start with sufficient evidence level to pass the evidence ladder check
      const initialState = createInitialState({ maxIterations: 5, evidenceLevel: 2 as const });

      const result = await graph.invoke(initialState);

      // Verify analyze was called twice (loop happened)
      expect(analyzeCallCount).toBe(2);

      // Verify completion
      expect(result.isComplete).toBe(true);
      expect(result.output).toBeDefined();

      // Should have iterated at least twice
      expect(result.iteration).toBeGreaterThanOrEqual(2);
    });
  });

  describe('max iterations trajectory', () => {
    // @atom IA-008
    it('should terminate at max iterations even if analyze keeps saying need_more', async () => {
      mockLLMService.invoke.mockImplementation(async (params) => {
        const agentName = params.agentName;

        if (agentName === 'plan-node') {
          return createMockLLMResponse({
            content: JSON.stringify(validPlan),
          });
        }

        if (agentName === 'search-node') {
          return createMockLLMResponse({
            content: 'Searching...',
            toolCalls: [],
          });
        }

        if (agentName === 'analyze-node') {
          // Always says need more (should hit max iterations)
          return createMockLLMResponse({
            content: JSON.stringify(analyzeNeedMoreResult),
          });
        }

        if (agentName === 'synthesize-node') {
          return createMockLLMResponse({
            content: 'Partial results based on available information.',
          });
        }

        throw new Error(`Unexpected agent: ${agentName}`);
      });

      mockToolRegistry.executeTool.mockResolvedValue({
        path: 'test-results',
        items: [],
      });

      const graph = createChatExplorationGraph(nodeConfig);
      const maxIterations = 3;
      const initialState = createInitialState({ maxIterations });

      const result = await graph.invoke(initialState);

      // Should have hit max iterations
      expect(result.iteration).toBe(maxIterations);

      // Should still complete with output (synthesize should run)
      expect(result.isComplete).toBe(true);
      expect(result.output).toBeDefined();

      // Decision should reflect max iterations
      expect(result.analysisDecision).toBe('max_iterations_reached');
    });
  });

  describe('discovery-first pattern', () => {
    // @atom IA-008
    it('should execute discovery phase before LLM search on first iteration', async () => {
      const toolCallOrder: string[] = [];

      mockLLMService.invoke.mockImplementation(async (params) => {
        const agentName = params.agentName;

        if (agentName === 'plan-node') {
          return createMockLLMResponse({
            content: JSON.stringify(validPlan),
          });
        }

        if (agentName === 'search-node') {
          return createMockLLMResponse({
            content: 'LLM search phase',
            toolCalls: [],
          });
        }

        if (agentName === 'analyze-node') {
          return createMockLLMResponse({
            content: JSON.stringify(analyzeReadyResult),
          });
        }

        if (agentName === 'synthesize-node') {
          return createMockLLMResponse({
            content: 'Final output',
          });
        }

        throw new Error(`Unexpected agent: ${agentName}`);
      });

      mockToolRegistry.executeTool.mockImplementation(async (tool, args) => {
        toolCallOrder.push(`${tool}:${args.path || 'unknown'}`);
        return {
          path: args.path,
          items: [{ name: 'file.json', type: 'file' }],
        };
      });

      const graph = createChatExplorationGraph(nodeConfig);
      const initialState = createInitialState();

      await graph.invoke(initialState);

      // Discovery should list both target directories from plan
      expect(toolCallOrder).toContain('list_directory:test-results');
      expect(toolCallOrder).toContain('list_directory:coverage');

      // Discovery calls should happen first
      const testResultsIndex = toolCallOrder.indexOf('list_directory:test-results');
      const coverageIndex = toolCallOrder.indexOf('list_directory:coverage');
      expect(testResultsIndex).toBeLessThan(2); // Among first calls
      expect(coverageIndex).toBeLessThan(2);
    });
  });

  describe('state accumulation', () => {
    // @atom IA-008
    it('should accumulate findings across iterations', async () => {
      let searchCallCount = 0;
      let analyzeCallCount = 0;

      mockLLMService.invoke.mockImplementation(async (params) => {
        const agentName = params.agentName;

        if (agentName === 'plan-node') {
          return createMockLLMResponse({
            content: JSON.stringify(validPlan),
          });
        }

        if (agentName === 'search-node') {
          searchCallCount++;
          // Different tool calls each iteration
          const filePath = searchCallCount === 1 ? 'coverage-summary.json' : 'lcov.info';
          return createMockLLMResponse({
            content: `Reading ${filePath}`,
            toolCalls: [
              {
                id: `tool-${searchCallCount}`,
                name: 'read_file',
                arguments: { file_path: filePath },
              },
            ],
          });
        }

        if (agentName === 'analyze-node') {
          analyzeCallCount++;
          if (analyzeCallCount === 1) {
            return createMockLLMResponse({
              content: JSON.stringify(analyzeNeedMoreResult),
            });
          }
          return createMockLLMResponse({
            content: JSON.stringify(analyzeReadyResult),
          });
        }

        if (agentName === 'synthesize-node') {
          return createMockLLMResponse({
            content: 'Complete analysis',
          });
        }

        throw new Error(`Unexpected agent: ${agentName}`);
      });

      mockToolRegistry.executeTool.mockImplementation(async (tool, args) => {
        if (tool === 'list_directory') {
          return {
            path: args.path,
            items: [
              { name: 'coverage-summary.json', type: 'file' },
              { name: 'lcov.info', type: 'file' },
            ],
          };
        }
        if (tool === 'read_file') {
          return {
            content: `Content of ${args.file_path}`,
          };
        }
        return {};
      });

      const graph = createChatExplorationGraph(nodeConfig);
      const initialState = createInitialState();

      const result = await graph.invoke(initialState);

      // Should have findings from multiple iterations
      // Discovery phase + 2 search iterations = at least 4 findings
      expect(result.findings.length).toBeGreaterThanOrEqual(3);

      // Tool history should accumulate
      expect(result.toolHistory.length).toBeGreaterThanOrEqual(3);
    });

    // @atom IA-008
    it('should preserve plan across iterations', async () => {
      let analyzeCallCount = 0;

      mockLLMService.invoke.mockImplementation(async (params) => {
        const agentName = params.agentName;

        if (agentName === 'plan-node') {
          return createMockLLMResponse({
            content: JSON.stringify(validPlan),
          });
        }

        if (agentName === 'search-node') {
          return createMockLLMResponse({
            content: 'Searching...',
            toolCalls: [],
          });
        }

        if (agentName === 'analyze-node') {
          analyzeCallCount++;
          if (analyzeCallCount < 3) {
            return createMockLLMResponse({
              content: JSON.stringify(analyzeNeedMoreResult),
            });
          }
          return createMockLLMResponse({
            content: JSON.stringify(analyzeReadyResult),
          });
        }

        if (agentName === 'synthesize-node') {
          return createMockLLMResponse({
            content: 'Done',
          });
        }

        throw new Error(`Unexpected agent: ${agentName}`);
      });

      mockToolRegistry.executeTool.mockResolvedValue({
        path: 'test-results',
        items: [],
      });

      const graph = createChatExplorationGraph(nodeConfig);
      const initialState = createInitialState({ maxIterations: 5 });

      const result = await graph.invoke(initialState);

      // Plan should persist through all iterations
      expect(result.plan).toEqual(validPlan);
      expect(result.iteration).toBeGreaterThan(1);
    });
  });

  describe('error handling', () => {
    // @atom IA-008
    it('should handle LLM errors gracefully', async () => {
      mockLLMService.invoke.mockImplementation(async (params) => {
        if (params.agentName === 'plan-node') {
          // Plan fails
          throw new Error('LLM timeout');
        }
        return createMockLLMResponse({ content: '{}' });
      });

      const graph = createChatExplorationGraph(nodeConfig);
      const initialState = createInitialState();

      await expect(graph.invoke(initialState)).rejects.toThrow('LLM timeout');
    });

    // @atom IA-008
    it('should handle tool execution errors and continue', async () => {
      mockLLMService.invoke.mockImplementation(async (params) => {
        const agentName = params.agentName;

        if (agentName === 'plan-node') {
          return createMockLLMResponse({
            content: JSON.stringify(validPlan),
          });
        }

        if (agentName === 'search-node') {
          return createMockLLMResponse({
            content: 'Reading file',
            toolCalls: [
              {
                id: 'tool-1',
                name: 'read_file',
                arguments: { file_path: 'nonexistent.json' },
              },
            ],
          });
        }

        if (agentName === 'analyze-node') {
          return createMockLLMResponse({
            content: JSON.stringify(analyzeReadyResult),
          });
        }

        if (agentName === 'synthesize-node') {
          return createMockLLMResponse({
            content: 'Could not find the requested file',
          });
        }

        throw new Error(`Unexpected agent: ${agentName}`);
      });

      mockToolRegistry.executeTool.mockImplementation(async (tool, args) => {
        if (tool === 'list_directory') {
          return { path: args.path, items: [] };
        }
        if (tool === 'read_file') {
          throw new Error('File not found');
        }
        return {};
      });

      const graph = createChatExplorationGraph(nodeConfig);
      const initialState = createInitialState();

      // Should complete despite tool error
      const result = await graph.invoke(initialState);
      expect(result.isComplete).toBe(true);
      expect(result.output).toBeDefined();

      // Error should be recorded in tool history
      const errorEntry = result.toolHistory.find((h: { result: string }) =>
        h.result.includes('Error'),
      );
      expect(errorEntry).toBeDefined();
    });
  });
});
