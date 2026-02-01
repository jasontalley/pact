/**
 * Analyze Node Tests
 *
 * Tests for the analyze node that evaluates completion criteria.
 * Key behaviors tested:
 * - Evidence ladder enforcement
 * - Minimum evidence level requirements
 * - Completion decision logic
 * - Limitation tracking
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { createAnalyzeNode, AnalyzeNodeOptions, AnalyzableState } from './analyze.node';
import { NodeConfig } from './types';
import { EvidenceLevel, Finding } from '../types/base-state';
import { LLMService, LLMResponse } from '../../../../common/llm/llm.service';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { Logger } from '@nestjs/common';

/**
 * Create a complete mock LLM response with all required fields
 */
function createMockLLMResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    requestId: 'test-request-id',
    content: JSON.stringify({
      decision: 'ready_to_answer',
      reasoning: 'Sufficient data gathered',
      missingInfo: [],
      confidence: 0.85,
    }),
    inputTokens: 500,
    outputTokens: 100,
    totalTokens: 600,
    cost: 0.005,
    latencyMs: 1000,
    cacheHit: false,
    retryCount: 0,
    modelUsed: 'gpt-5-nano',
    providerUsed: 'openai',
    toolCalls: [],
    ...overrides,
  };
}

describe('createAnalyzeNode', () => {
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

  const createMockState = (overrides: Partial<AnalyzableState> = {}): AnalyzableState => ({
    input: 'What is the test coverage?',
    findings: [createMockFinding()],
    toolHistory: [],
    messages: [],
    iteration: 2,
    maxIterations: 5,
    isComplete: false,
    output: null,
    errors: [],
    evidenceLevel: 2 as EvidenceLevel,
    limitations: [],
    analysisDecision: null,
    clarificationNeeded: null,
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

  describe('basic completion logic', () => {
    // @atom IA-008
    it('should return ready_to_answer when LLM decides completion', async () => {
      const state = createMockState();

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(true);
      expect(result.analysisDecision).toBe('ready_to_answer');
    });

    // @atom IA-008
    it('should return need_more_search when LLM needs more data', async () => {
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: JSON.stringify({
            decision: 'need_more_search',
            reasoning: 'Need to read more files',
            missingInfo: ['coverage-final.json'],
            confidence: 0.4,
          }),
        }),
      );

      const state = createMockState();

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(false);
      expect(result.analysisDecision).toBe('need_more_search');
    });

    // @atom IA-008
    it('should return max_iterations_reached at iteration limit', async () => {
      const state = createMockState({
        iteration: 5,
        maxIterations: 5,
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(true);
      expect(result.analysisDecision).toBe('max_iterations_reached');

      // Should NOT call LLM
      expect(mockLLMService.invoke).not.toHaveBeenCalled();
    });

    // @atom IA-008
    it('should return need_more_search when minFindings not met', async () => {
      const state = createMockState({
        findings: [createMockFinding()],
      });

      const options: AnalyzeNodeOptions = { minFindings: 3 };
      const analyzeNode = createAnalyzeNode(options)(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(false);
      expect(result.analysisDecision).toBe('need_more_search');

      // Should NOT call LLM
      expect(mockLLMService.invoke).not.toHaveBeenCalled();
    });

    // @atom IA-008
    it('should handle clarification requests', async () => {
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: JSON.stringify({
            decision: 'request_clarification',
            reasoning: 'Question is ambiguous',
            clarificationNeeded: 'Do you mean line coverage or branch coverage?',
            confidence: 0.3,
          }),
        }),
      );

      const state = createMockState();

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(false);
      expect(result.analysisDecision).toBe('request_clarification');
      expect(result.clarificationNeeded).toBe('Do you mean line coverage or branch coverage?');
    });
  });

  describe('evidence ladder enforcement', () => {
    // @atom IA-008
    it('should block completion when evidence level is below minimum', async () => {
      const state = createMockState({
        evidenceLevel: 1 as EvidenceLevel, // Directory listings only
      });

      // Default minEvidenceLevel is 2
      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(false);
      expect(result.analysisDecision).toBe('need_more_search');

      // Should NOT call LLM when evidence is insufficient
      expect(mockLLMService.invoke).not.toHaveBeenCalled();
    });

    // @atom IA-008
    it('should allow completion when evidence level meets minimum', async () => {
      const state = createMockState({
        evidenceLevel: 2 as EvidenceLevel, // Raw file reads
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(true);
      expect(mockLLMService.invoke).toHaveBeenCalled();
    });

    // @atom IA-008
    it('should allow completion when evidence level exceeds minimum', async () => {
      const state = createMockState({
        evidenceLevel: 4 as EvidenceLevel, // Computed facts
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(true);
      expect(mockLLMService.invoke).toHaveBeenCalled();
    });

    // @atom IA-008
    it('should respect custom minEvidenceLevel', async () => {
      const state = createMockState({
        evidenceLevel: 2 as EvidenceLevel, // Raw file reads
      });

      const options: AnalyzeNodeOptions = { minEvidenceLevel: 3 as EvidenceLevel };
      const analyzeNode = createAnalyzeNode(options)(nodeConfig);
      const result = await analyzeNode(state);

      // Should block because level 2 < required level 3
      expect(result.isComplete).toBe(false);
      expect(result.analysisDecision).toBe('need_more_search');
    });

    // @atom IA-008
    it('should add limitation when evidence is insufficient', async () => {
      const state = createMockState({
        evidenceLevel: 1 as EvidenceLevel,
        limitations: [],
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.limitations).toBeDefined();
      expect(result.limitations!.length).toBeGreaterThan(0);
      expect(result.limitations![0]).toContain('Evidence level insufficient');
      expect(result.limitations![0]).toContain('level 1');
      expect(result.limitations![0]).toContain('level 2');
    });

    // @atom IA-008
    it('should not duplicate limitation messages', async () => {
      const existingLimitation =
        'Evidence level insufficient: currently at level 1 (Directory listings only), need level 2 (Raw file reads (text content))';
      const state = createMockState({
        evidenceLevel: 1 as EvidenceLevel,
        limitations: [existingLimitation],
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      // Should not add duplicate
      expect(
        result.limitations!.filter((l) => l.includes('Evidence level insufficient')),
      ).toHaveLength(1);
    });

    // @atom IA-008
    it('should bypass evidence ladder when enforceEvidenceLadder is false', async () => {
      const state = createMockState({
        evidenceLevel: 0 as EvidenceLevel, // Nothing gathered
      });

      const options: AnalyzeNodeOptions = { enforceEvidenceLadder: false };
      const analyzeNode = createAnalyzeNode(options)(nodeConfig);
      const result = await analyzeNode(state);

      // Should still call LLM even with low evidence
      expect(mockLLMService.invoke).toHaveBeenCalled();
    });

    // @atom IA-008
    it('should always allow completion at max iterations regardless of evidence', async () => {
      const state = createMockState({
        evidenceLevel: 0 as EvidenceLevel,
        iteration: 5,
        maxIterations: 5,
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      // Max iterations override evidence requirements
      expect(result.isComplete).toBe(true);
      expect(result.analysisDecision).toBe('max_iterations_reached');
    });
  });

  describe('prompt generation', () => {
    // @atom IA-008
    it('should include evidence level in prompt', async () => {
      const state = createMockState({
        evidenceLevel: 3 as EvidenceLevel,
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      await analyzeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('Current evidence level: 3');
      expect(prompt).toContain('Parsed structured data');
    });

    // @atom IA-008
    it('should include minimum required evidence level in prompt', async () => {
      const state = createMockState();

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      await analyzeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('Minimum required: 2');
    });

    // @atom IA-008
    it('should include finding quality summary in prompt', async () => {
      const state = createMockState({
        findings: [
          createMockFinding({
            computedFacts: { coverage: 85 },
          }),
          createMockFinding({
            parseMetadata: { parseSuccess: true },
          }),
          createMockFinding({}), // Raw finding
        ],
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      await analyzeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('Finding quality:');
      expect(prompt).toContain('1 computed');
      expect(prompt).toContain('1 parsed');
      expect(prompt).toContain('1 raw');
    });

    // @atom IA-008
    it('should include evidence ladder explanation in prompt', async () => {
      const state = createMockState();

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      await analyzeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('EVIDENCE LADDER');
      expect(prompt).toContain('0 = Nothing gathered');
      expect(prompt).toContain('4 = Computed/aggregated facts');
    });

    // @atom IA-008
    it('should mark findings with quality indicators', async () => {
      const state = createMockState({
        findings: [
          createMockFinding({
            source: 'computed.json',
            computedFacts: { value: 100 },
          }),
          createMockFinding({
            source: 'parsed.json',
            parseMetadata: { parseSuccess: true },
          }),
          createMockFinding({
            source: 'truncated.json',
            truncated: true,
          }),
          createMockFinding({
            source: 'raw.txt',
          }),
        ],
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      await analyzeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('[COMPUTED]');
      expect(prompt).toContain('[PARSED]');
      expect(prompt).toContain('[TRUNCATED]');
      expect(prompt).toContain('[RAW]');
    });

    // @atom IA-008
    it('should suggest structured readers when evidence is low', async () => {
      const state = createMockState();

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      await analyzeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      const prompt = invokeCall.messages[0].content;

      expect(prompt).toContain('read_json');
      expect(prompt).toContain('read_coverage_report');
    });
  });

  describe('error handling', () => {
    // @atom IA-008
    it('should handle malformed LLM response gracefully', async () => {
      mockLLMService.invoke.mockResolvedValue(
        createMockLLMResponse({
          content: 'Not valid JSON',
        }),
      );

      const state = createMockState();

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      // Should use default result
      expect(result.analysisDecision).toBeDefined();

      // Should log warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Analyze parsing failed'),
      );
    });

    // @atom IA-008
    it('should use custom prompt when provided', async () => {
      const state = createMockState();
      const customPrompt = 'Custom analysis prompt';

      const options: AnalyzeNodeOptions = { customPrompt };
      const analyzeNode = createAnalyzeNode(options)(nodeConfig);
      await analyzeNode(state);

      const invokeCall = mockLLMService.invoke.mock.calls[0][0];
      expect(invokeCall.messages[0].content).toBe(customPrompt);
    });
  });

  describe('early termination heuristics', () => {
    // @atom IA-008
    it('should terminate early for coverage questions with computed facts', async () => {
      const state = createMockState({
        input: 'What is the test coverage?',
        evidenceLevel: 4 as EvidenceLevel,
        findings: [
          createMockFinding({
            source: 'coverage-summary.json',
            content: '{"total": {"lines": {"pct": 85}}}',
            computedFacts: { lines: 85, statements: 80 },
          }),
        ],
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(true);
      expect(result.analysisDecision).toBe('ready_to_answer');
      // Should NOT call LLM - early termination
      expect(mockLLMService.invoke).not.toHaveBeenCalled();
    });

    // @atom IA-008
    it('should terminate early for coverage questions with parsed metrics', async () => {
      const state = createMockState({
        input: 'How much of the code is tested?',
        evidenceLevel: 3 as EvidenceLevel,
        findings: [
          createMockFinding({
            source: 'coverage.json',
            content: '{"total": {"lines": {"pct": 85}}}',
            parseMetadata: { parseSuccess: true, format: 'json' },
          }),
        ],
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(true);
      expect(result.analysisDecision).toBe('ready_to_answer');
      // Should NOT call LLM - early termination
      expect(mockLLMService.invoke).not.toHaveBeenCalled();
    });

    // @atom IA-008
    it('should NOT terminate early for non-coverage questions', async () => {
      const state = createMockState({
        input: 'How is authentication implemented?',
        evidenceLevel: 3 as EvidenceLevel,
        findings: [
          createMockFinding({
            source: 'auth.ts',
            content: 'export class AuthService { ... }',
            parseMetadata: { parseSuccess: true },
          }),
        ],
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      await analyzeNode(state);

      // Should call LLM for non-pattern-matched questions
      expect(mockLLMService.invoke).toHaveBeenCalled();
    });

    // @atom IA-008
    it('should terminate early when computed facts exist at level 4', async () => {
      const state = createMockState({
        input: 'What are the dependency counts?',
        evidenceLevel: 4 as EvidenceLevel,
        findings: [
          createMockFinding({
            source: 'package.json',
            content: '{}',
            computedFacts: { dependencies: 50, devDependencies: 30 },
          }),
        ],
      });

      const analyzeNode = createAnalyzeNode()(nodeConfig);
      const result = await analyzeNode(state);

      expect(result.isComplete).toBe(true);
      expect(result.analysisDecision).toBe('ready_to_answer');
      expect(mockLLMService.invoke).not.toHaveBeenCalled();
    });
  });
});
