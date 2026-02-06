/**
 * Synthesize Node Tests
 *
 * Tests for the synthesis node that generates final output from findings.
 * Key behaviors tested:
 * - Output generation from accumulated findings
 * - Citation handling
 * - Timeout configuration
 * - Skip retries for fail-fast behavior
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import {
  createSynthesizeNode,
  SynthesizeNodeOptions,
  SYNTHESIZE_TIMEOUT_MS,
} from './synthesize.node';
import { NodeConfig } from './types';
import {
  BaseExplorationStateType,
  Finding,
  ToolHistoryEntry,
  EvidenceLevel,
  ToolResultQuality,
} from '../types/base-state';
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
    content: 'This is the synthesized output based on the findings.',
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    cost: 0.01,
    latencyMs: 5000,
    cacheHit: false,
    retryCount: 0,
    modelUsed: 'claude-3-sonnet',
    providerUsed: 'anthropic',
    toolCalls: [],
    ...overrides,
  };
}

describe('createSynthesizeNode', () => {
  let mockLLMService: jest.Mocked<LLMService>;
  let mockToolRegistry: jest.Mocked<ToolRegistryService>;
  let mockLogger: jest.Mocked<Logger>;
  let nodeConfig: NodeConfig;

  const createMockFinding = (overrides: Partial<Finding> = {}): Finding => ({
    source: 'test-results/coverage.json',
    content: '{"lines": 85, "statements": 87}',
    relevance: 'Coverage data',
    ...overrides,
  });

  const createMockToolHistory = (overrides: Partial<ToolHistoryEntry> = {}): ToolHistoryEntry => ({
    tool: 'read_file',
    args: { file_path: 'test.json' },
    result: '{"data": "value"}',
    timestamp: new Date(),
    quality: 'ok' as ToolResultQuality,
    ...overrides,
  });

  const createMockState = (
    overrides: Partial<BaseExplorationStateType> = {},
  ): BaseExplorationStateType => ({
    input: 'What is the test coverage for this project?',
    findings: [createMockFinding()],
    toolHistory: [createMockToolHistory()],
    messages: [],
    iteration: 3,
    maxIterations: 5,
    isComplete: false,
    output: null,
    errors: [],
    evidenceLevel: 2 as EvidenceLevel,
    limitations: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLMService = {
      invoke: jest.fn().mockResolvedValue(createMockLLMResponse()),
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

  describe('output generation', () => {
    // @atom IA-008
    it('should generate output from LLM response', async () => {
      const state = createMockState();

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      const result = await synthesizeNode(state);

      expect(result.output).toBe('This is the synthesized output based on the findings.');
      expect(result.isComplete).toBe(true);
    });

    // @atom IA-008
    it('should include findings in the prompt', async () => {
      const state = createMockState({
        findings: [
          createMockFinding({
            source: 'coverage.json',
            content: '{"lines": 85}',
          }),
          createMockFinding({
            source: 'lcov.info',
            content: 'LF:100\nLH:85',
          }),
        ],
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('coverage.json');
      expect(prompt).toContain('{"lines": 85}');
      expect(prompt).toContain('lcov.info');
      expect(prompt).toContain('LF:100');
    });

    // @atom IA-008
    it('should include task input in the prompt', async () => {
      const state = createMockState({
        input: 'Analyze the test coverage metrics',
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('Analyze the test coverage metrics');
      expect(prompt).toContain('Task:');
    });

    // @atom IA-008
    it('should include tool history summary in prompt', async () => {
      const state = createMockState({
        toolHistory: [
          createMockToolHistory({ tool: 'list_directory' }),
          createMockToolHistory({ tool: 'read_file' }),
          createMockToolHistory({ tool: 'grep' }),
        ],
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('Tools used (3 calls)');
      expect(prompt).toContain('list_directory');
      expect(prompt).toContain('read_file');
      expect(prompt).toContain('grep');
    });
  });

  describe('LLM configuration', () => {
    // @atom IA-008
    it('should use ANALYSIS task type', async () => {
      const state = createMockState();

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      expect(mockLLMService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: AgentTaskType.ANALYSIS,
          agentName: 'synthesize-node',
          purpose: 'generate-output',
        }),
      );
    });

    // @atom IA-008
    it('should use default 90s timeout', async () => {
      const state = createMockState();

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      expect(mockLLMService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: SYNTHESIZE_TIMEOUT_MS,
        }),
      );
      expect(SYNTHESIZE_TIMEOUT_MS).toBe(90000);
    });

    // @atom IA-008
    it('should use custom timeout when provided', async () => {
      const state = createMockState();

      const options: SynthesizeNodeOptions = { timeout: 60000 };
      const synthesizeNode = createSynthesizeNode(options)(nodeConfig);
      await synthesizeNode(state);

      expect(mockLLMService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000,
        }),
      );
    });

    // @atom IA-008
    it('should set skipRetries to true for fail-fast behavior', async () => {
      const state = createMockState();

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      expect(mockLLMService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          skipRetries: true,
        }),
      );
    });

    // @atom IA-008
    it('should pass empty tools array to prevent tool calls', async () => {
      const state = createMockState();

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      expect(mockLLMService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [],
        }),
      );
    });
  });

  describe('citation handling', () => {
    // @atom IA-008
    it('should include citation instructions by default', async () => {
      const state = createMockState();

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('Cite sources');
      expect(prompt).toContain('file paths');
    });

    // @atom IA-008
    it('should exclude citation instructions when includeCitations is false', async () => {
      const state = createMockState();

      const options: SynthesizeNodeOptions = { includeCitations: false };
      const synthesizeNode = createSynthesizeNode(options)(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).not.toContain('Cite sources');
    });
  });

  describe('custom options', () => {
    // @atom IA-008
    it('should use custom prompt when provided', async () => {
      const state = createMockState();
      const customPrompt = 'Custom synthesis prompt: summarize the findings';

      const options: SynthesizeNodeOptions = { customPrompt };
      const synthesizeNode = createSynthesizeNode(options)(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      expect(invokeCall.messages[0].content).toBe(customPrompt);
    });

    // @atom IA-008
    it('should include format instructions when provided', async () => {
      const state = createMockState();

      const options: SynthesizeNodeOptions = {
        formatInstructions: 'Format as a bulleted list with metrics',
      };
      const synthesizeNode = createSynthesizeNode(options)(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('Format as a bulleted list with metrics');
    });
  });

  describe('edge cases', () => {
    // @atom IA-008
    it('should handle empty findings', async () => {
      const state = createMockState({
        findings: [],
        toolHistory: [],
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      const result = await synthesizeNode(state);

      // Should still produce output
      expect(result.output).toBeDefined();
      expect(result.isComplete).toBe(true);

      // Should indicate no findings in prompt
      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;
      expect(prompt).toContain('No specific findings were gathered');
    });

    // @atom IA-008
    it('should handle large number of findings', async () => {
      const findings = Array.from({ length: 20 }, (_, i) =>
        createMockFinding({
          source: `file-${i}.json`,
          content: `Content for file ${i}`,
        }),
      );

      const state = createMockState({ findings });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      const result = await synthesizeNode(state);

      expect(result.isComplete).toBe(true);

      // All findings should be included
      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;
      expect(prompt).toContain('file-0.json');
      expect(prompt).toContain('file-19.json');
    });
  });

  describe('proof-carrying synthesis', () => {
    // @atom IA-008
    it('should partition findings by parse quality', async () => {
      const state = createMockState({
        findings: [
          createMockFinding({
            source: 'computed.json',
            content: 'Coverage: 85%',
            computedFacts: { lineCoverage: 85, branchCoverage: 72 },
          }),
          createMockFinding({
            source: 'parsed.json',
            content: '{"lines": 90}',
            parseMetadata: { parseSuccess: true, format: 'json' },
          }),
          createMockFinding({
            source: 'raw.txt',
            content: 'Some raw text content',
          }),
        ],
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      // Should have separate sections for each quality level
      expect(prompt).toContain('COMPUTED FACTS (Highest Confidence)');
      expect(prompt).toContain('PARSED DATA (High Confidence)');
      expect(prompt).toContain('RAW DATA (Lower Confidence)');
    });

    // @atom IA-008
    it('should include computed facts in the output', async () => {
      const state = createMockState({
        findings: [
          createMockFinding({
            source: 'coverage-summary.json',
            content: 'Coverage report',
            computedFacts: {
              lineCoverage: 85.5,
              branchCoverage: 72.3,
              functionCoverage: 91.2,
            },
          }),
        ],
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      // Should display computed facts
      expect(prompt).toContain('Computed Facts');
      expect(prompt).toContain('lineCoverage');
      expect(prompt).toContain('85.5');
    });

    // @atom IA-008
    it('should include proof requirements when enabled', async () => {
      const state = createMockState();

      // Default is requireParseProofs: true
      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('PROOF REQUIREMENTS');
      expect(prompt).toContain('Numeric claims');
      expect(prompt).toContain('COMPUTED FACTS or PARSED DATA');
    });

    // @atom IA-008
    it('should exclude proof requirements when disabled', async () => {
      const state = createMockState();

      const options: SynthesizeNodeOptions = { requireParseProofs: false };
      const synthesizeNode = createSynthesizeNode(options)(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).not.toContain('PROOF REQUIREMENTS');
    });

    // @atom IA-008
    it('should include evidence level in prompt', async () => {
      const state = createMockState({
        evidenceLevel: 3 as EvidenceLevel,
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('Evidence Level: 3');
      expect(prompt).toContain('Parsed structured data');
    });

    // @atom IA-008
    it('should include limitations when present', async () => {
      const state = createMockState({
        limitations: [
          'Could not read coverage-final.json: file not found',
          'Evidence level insufficient for some claims',
        ],
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('KNOWN LIMITATIONS');
      expect(prompt).toContain('Could not read coverage-final.json');
      expect(prompt).toContain('Evidence level insufficient');
    });

    // @atom IA-008
    it('should exclude limitations section when disabled', async () => {
      const state = createMockState({
        limitations: ['Some limitation'],
      });

      const options: SynthesizeNodeOptions = { includeLimitations: false };
      const synthesizeNode = createSynthesizeNode(options)(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).not.toContain('KNOWN LIMITATIONS');
    });

    // @atom IA-008
    it('should mark truncated findings', async () => {
      const state = createMockState({
        findings: [
          createMockFinding({
            source: 'large-file.json',
            content: 'Truncated content...',
            truncated: true,
          }),
        ],
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('This content was truncated');
    });

    // @atom IA-008
    it('should include tool quality in history summary', async () => {
      const state = createMockState({
        toolHistory: [
          createMockToolHistory({ tool: 'read_file', quality: 'ok' as ToolResultQuality }),
          createMockToolHistory({ tool: 'read_json', quality: 'truncated' as ToolResultQuality }),
        ],
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('read_file (ok)');
      expect(prompt).toContain('read_json (truncated)');
    });

    // @atom IA-008
    it('should include confidence scores when present', async () => {
      const state = createMockState({
        findings: [
          createMockFinding({
            source: 'high-confidence.json',
            content: 'Data',
            confidence: 0.95,
          }),
        ],
      });

      const synthesizeNode = createSynthesizeNode()(nodeConfig);
      await synthesizeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('Confidence: 95%');
    });
  });
});
