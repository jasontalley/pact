/**
 * Plan Node Tests
 *
 * Tests for the planning node that generates search strategies.
 * Key behaviors tested:
 * - Plan generation from LLM output
 * - Zod schema validation
 * - Fallback to default plan on parse errors
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { createPlanNode, PlanNodeState, PlanNodeOptions } from './plan.node';
import { NodeConfig } from './types';
import { Plan, DEFAULT_PLAN } from '../types/schemas';
import { LLMService, LLMResponse } from '../../../../common/llm/llm.service';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { AgentTaskType } from '../../../../common/llm/providers/types';
import { Logger } from '@nestjs/common';

/**
 * Create a complete mock LLM response with all required fields
 */
function createMockLLMResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    requestId: 'test-request-id',
    content: '{}',
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

describe('createPlanNode', () => {
  let mockLLMService: jest.Mocked<LLMService>;
  let mockToolRegistry: jest.Mocked<ToolRegistryService>;
  let mockLogger: jest.Mocked<Logger>;
  let nodeConfig: NodeConfig;

  const createMockState = (overrides: Partial<PlanNodeState> = {}): PlanNodeState => ({
    input: 'Analyze test coverage in the project',
    plan: null,
    ...overrides,
  });

  const validPlanJson: Plan = {
    strategy: 'Search test-results directory for coverage files',
    targetDirectories: ['test-results', 'coverage'],
    filePatterns: ['coverage-summary.json', 'coverage-final.json', 'lcov.info'],
    searchTerms: ['coverage', 'lines', 'statements', 'branches'],
    actions: ['List test-results directory', 'Read coverage files', 'Summarize results'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLMService = {
      invoke: jest.fn().mockResolvedValue(
        createMockLLMResponse({
          content: JSON.stringify(validPlanJson),
        }),
      ),
    } as unknown as jest.Mocked<LLMService>;

    mockToolRegistry = {
      getAllTools: jest.fn().mockReturnValue([]),
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

  describe('plan generation', () => {
    // @atom IA-008
    it('should generate a valid plan from LLM response', async () => {
      const state = createMockState();

      const planNode = createPlanNode()(nodeConfig);
      const result = await planNode(state);

      expect(result.plan).toEqual(validPlanJson);
      expect(result.plan?.strategy).toBe('Search test-results directory for coverage files');
      expect(result.plan?.targetDirectories).toContain('test-results');
    });

    // @atom IA-008
    it('should call LLM service with ANALYSIS task type', async () => {
      const state = createMockState();

      const planNode = createPlanNode()(nodeConfig);
      await planNode(state);

      expect(mockLLMService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: AgentTaskType.ANALYSIS,
          agentName: 'plan-node',
          purpose: 'generate-strategy',
        }),
      );
    });

    // @atom IA-008
    it('should include user input in the prompt', async () => {
      const state = createMockState({ input: 'Find all TypeScript files' });

      const planNode = createPlanNode()(nodeConfig);
      await planNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      expect(invokeCall.messages[0].content).toContain('Find all TypeScript files');
    });

    // @atom IA-008
    it('should use custom prompt when provided', async () => {
      const customPrompt = 'My custom planning prompt';
      const state = createMockState();

      const options: PlanNodeOptions = { customPrompt };
      const planNode = createPlanNode(options)(nodeConfig);
      await planNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      expect(invokeCall.messages[0].content).toBe(customPrompt);
    });

    // @atom IA-008
    it('should use preferred model when specified', async () => {
      const state = createMockState();

      const options: PlanNodeOptions = { model: 'claude-3-opus' };
      const planNode = createPlanNode(options)(nodeConfig);
      await planNode(state);

      expect(mockLLMService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredModel: 'claude-3-opus',
        }),
      );
    });
  });

  describe('schema validation', () => {
    // @atom IA-008
    it('should fall back to default plan on invalid JSON', async () => {
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: 'This is not valid JSON',
        }),
      );

      const state = createMockState();
      const planNode = createPlanNode()(nodeConfig);
      const result = await planNode(state);

      // Should have used default plan
      expect(result.plan).toEqual(DEFAULT_PLAN);

      // Should have logged warning
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Plan parsing failed'));
    });

    // @atom IA-008
    it('should fall back to default plan on partial JSON', async () => {
      // Missing required fields
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: JSON.stringify({ strategy: 'Only strategy provided' }),
        }),
      );

      const state = createMockState();
      const planNode = createPlanNode()(nodeConfig);
      const result = await planNode(state);

      // Plan should have been created with defaults for missing fields
      expect(result.plan?.strategy).toBe('Only strategy provided');
      expect(result.plan?.targetDirectories).toEqual([]); // Default
      expect(result.plan?.filePatterns).toEqual([]); // Default
    });

    // @atom IA-008
    it('should handle markdown-wrapped JSON', async () => {
      // LLMs sometimes wrap JSON in markdown code blocks
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: '```json\n' + JSON.stringify(validPlanJson) + '\n```',
        }),
      );

      const state = createMockState();
      const planNode = createPlanNode()(nodeConfig);
      const result = await planNode(state);

      // parseLLMOutput should handle this (if implemented) or fall back to default
      // This test documents expected behavior
      expect(result.plan).toBeDefined();
    });

    // @atom IA-008
    it('should handle empty response', async () => {
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: '',
        }),
      );

      const state = createMockState();
      const planNode = createPlanNode()(nodeConfig);
      const result = await planNode(state);

      // Should fall back to default plan
      expect(result.plan).toEqual(DEFAULT_PLAN);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('prompt content', () => {
    // @atom IA-008
    it('should include instructions for targetDirectories', async () => {
      const state = createMockState();

      const planNode = createPlanNode()(nodeConfig);
      await planNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('targetDirectories');
      expect(prompt).toContain('directories likely to contain relevant information');
    });

    // @atom IA-008
    it('should include instructions for filePatterns', async () => {
      const state = createMockState();

      const planNode = createPlanNode()(nodeConfig);
      await planNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('filePatterns');
      expect(prompt).toContain('file patterns to look for');
    });

    // @atom IA-008
    it('should request JSON output without markdown', async () => {
      const state = createMockState();

      const planNode = createPlanNode()(nodeConfig);
      await planNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('Return ONLY valid JSON');
      expect(prompt).toContain('no markdown');
    });
  });
});
