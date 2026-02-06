/**
 * Interview Nodes Tests
 *
 * Tests for the four interview graph nodes:
 * - AnalyzeIntent: analyzes raw intent, returns intentAnalysis
 * - GenerateQuestions: generates clarifying questions, throws NodeInterrupt
 * - ExtractAtoms: extracts atom candidates from conversation
 * - ComposeMolecule: composes molecules from extracted atoms
 */

import { NodeInterrupt } from '@langchain/langgraph';
import { createAnalyzeIntentNode } from './analyze-intent.node';
import { createGenerateQuestionsNode } from './generate-questions.node';
import { createExtractAtomsNode } from './extract-atoms.node';
import { createComposeMoleculeNode } from './compose-molecule.node';
import { InterviewGraphStateType } from '../../types/interview-state';
import { NodeConfig } from '../types';

describe('Interview Nodes', () => {
  const mockLlmService = {
    invoke: jest.fn(),
  };
  const mockToolRegistry = {} as any;
  const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
  const nodeConfig: NodeConfig = {
    llmService: mockLlmService as any,
    toolRegistry: mockToolRegistry,
    logger: mockLogger,
  };

  const createBaseState = (
    overrides: Partial<InterviewGraphStateType> = {},
  ): InterviewGraphStateType => ({
    rawIntent: 'Users should be able to reset their password via email',
    currentPhase: 'analyze',
    conversationHistory: [],
    intentAnalysis: null,
    pendingQuestions: [],
    allQuestions: [],
    atomCandidates: [],
    moleculeCandidates: [],
    round: 1,
    maxRounds: 5,
    userDone: false,
    errors: [],
    output: '',
    llmCallCount: 0,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================
  // AnalyzeIntent Node
  // ========================================

  describe('createAnalyzeIntentNode', () => {
    it('should parse LLM response and set intentAnalysis', async () => {
      const analysisResponse = {
        summary: 'Password reset via email',
        ambiguities: ['What email provider?', 'Token expiry time?'],
        impliedBehaviors: ['Email validation', 'Rate limiting'],
        suggestedCategory: 'functional',
      };

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify(analysisResponse),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState();
      const node = createAnalyzeIntentNode()(nodeConfig);
      const result = await node(state);

      expect(result.intentAnalysis).toEqual(analysisResponse);
      expect(result.currentPhase).toBe('generate_questions');
      expect(result.conversationHistory).toHaveLength(1);
      expect(result.conversationHistory![0].role).toBe('assistant');
      expect(result.llmCallCount).toBe(1);
    });

    it('should handle parse failures gracefully', async () => {
      mockLlmService.invoke.mockResolvedValue({
        content: 'This is not valid JSON at all',
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState();
      const node = createAnalyzeIntentNode()(nodeConfig);
      const result = await node(state);

      expect(result.intentAnalysis).toEqual({
        summary: state.rawIntent,
        ambiguities: ['Unable to automatically identify ambiguities'],
        impliedBehaviors: [],
        suggestedCategory: 'functional',
      });
      expect(result.currentPhase).toBe('generate_questions');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse LLM response'),
      );
    });

    it('should handle LLM invocation errors', async () => {
      mockLlmService.invoke.mockRejectedValue(new Error('LLM service unavailable'));

      const state = createBaseState();
      const node = createAnalyzeIntentNode()(nodeConfig);
      const result = await node(state);

      expect(result.errors).toContain('LLM service unavailable');
      expect(result.currentPhase).toBe('generate_questions');
      expect(result.intentAnalysis).toEqual({
        summary: state.rawIntent,
        ambiguities: [],
        impliedBehaviors: [],
        suggestedCategory: 'functional',
      });
    });

    it('should use custom system prompt when provided', async () => {
      const customPrompt = 'You are a custom analyzer.';

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify({
          summary: 'test',
          ambiguities: [],
          impliedBehaviors: [],
          suggestedCategory: 'security',
        }),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState();
      const node = createAnalyzeIntentNode({ systemPrompt: customPrompt })(nodeConfig);
      await node(state);

      const invokeCall = mockLlmService.invoke.mock.calls[0][0];
      expect(invokeCall.messages[0].content).toBe(customPrompt);
    });
  });

  // ========================================
  // GenerateQuestions Node
  // ========================================

  describe('createGenerateQuestionsNode', () => {
    it('should throw NodeInterrupt when questions are generated', async () => {
      const questionsResponse = {
        questions: [
          {
            question: 'What is the token expiry time?',
            rationale: 'Need to define reset link validity',
            category: 'behavior',
          },
          {
            question: 'Should rate limiting be applied?',
            rationale: 'Security consideration',
            category: 'constraint',
          },
        ],
      };

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify(questionsResponse),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({
        currentPhase: 'generate_questions',
        intentAnalysis: {
          summary: 'Password reset via email',
          ambiguities: ['Token expiry?'],
          impliedBehaviors: ['Rate limiting'],
          suggestedCategory: 'functional',
        },
      });

      const node = createGenerateQuestionsNode()(nodeConfig);

      await expect(node(state)).rejects.toThrow(NodeInterrupt);
    });

    it('should proceed to extract_atoms when userDone is true', async () => {
      const state = createBaseState({
        currentPhase: 'generate_questions',
        userDone: true,
      });

      const node = createGenerateQuestionsNode()(nodeConfig);
      const result = await node(state);

      expect(result.currentPhase).toBe('extract_atoms');
      expect(mockLlmService.invoke).not.toHaveBeenCalled();
    });

    it('should proceed to extract_atoms when max rounds exceeded', async () => {
      const state = createBaseState({
        currentPhase: 'generate_questions',
        round: 6,
        maxRounds: 5,
      });

      const node = createGenerateQuestionsNode()(nodeConfig);
      const result = await node(state);

      expect(result.currentPhase).toBe('extract_atoms');
      expect(mockLlmService.invoke).not.toHaveBeenCalled();
    });

    it('should proceed to extract_atoms when LLM returns no questions', async () => {
      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify({ questions: [] }),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({
        currentPhase: 'generate_questions',
      });

      const node = createGenerateQuestionsNode()(nodeConfig);
      const result = await node(state);

      expect(result.currentPhase).toBe('extract_atoms');
      expect(result.llmCallCount).toBe(1);
    });

    it('should handle LLM errors gracefully', async () => {
      mockLlmService.invoke.mockRejectedValue(new Error('Timeout'));

      const state = createBaseState({
        currentPhase: 'generate_questions',
      });

      const node = createGenerateQuestionsNode()(nodeConfig);
      const result = await node(state);

      expect(result.errors).toContain('Timeout');
      expect(result.currentPhase).toBe('extract_atoms');
    });

    it('should respect maxQuestionsPerRound option', async () => {
      const questionsResponse = {
        questions: [
          { question: 'Q1?', rationale: 'R1', category: 'scope' },
          { question: 'Q2?', rationale: 'R2', category: 'behavior' },
          { question: 'Q3?', rationale: 'R3', category: 'constraint' },
          { question: 'Q4?', rationale: 'R4', category: 'edge_case' },
          { question: 'Q5?', rationale: 'R5', category: 'acceptance' },
        ],
      };

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify(questionsResponse),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({
        currentPhase: 'generate_questions',
      });

      const node = createGenerateQuestionsNode({ maxQuestionsPerRound: 2 })(nodeConfig);

      try {
        await node(state);
        fail('Expected NodeInterrupt to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NodeInterrupt);
        const interrupt = error as NodeInterrupt;
        const interruptValue = (interrupt as any).interrupts?.[0]?.value ?? interrupt.message;
        const interruptData = JSON.parse(
          typeof interruptValue === 'string' ? interruptValue : JSON.stringify(interruptValue),
        );
        expect(interruptData.questions).toHaveLength(2);
      }
    });
  });

  // ========================================
  // ExtractAtoms Node
  // ========================================

  describe('createExtractAtomsNode', () => {
    it('should extract atom candidates from conversation context', async () => {
      const extractionResponse = {
        atoms: [
          {
            description: 'User receives password reset email within 1 minute',
            category: 'functional',
            observableOutcomes: ['Email arrives', 'Contains reset link'],
            confidence: 90,
            sourceEvidence: ['Users should be able to reset their password via email'],
          },
          {
            description: 'Reset token expires after 30 minutes',
            category: 'security',
            observableOutcomes: ['Token invalid after 30 min'],
            confidence: 85,
            sourceEvidence: ['Token expiry discussion'],
          },
        ],
      };

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify(extractionResponse),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({
        currentPhase: 'extract_atoms',
        intentAnalysis: {
          summary: 'Password reset via email',
          ambiguities: [],
          impliedBehaviors: [],
          suggestedCategory: 'functional',
        },
        allQuestions: [
          {
            id: 'q-1',
            question: 'What is the token expiry?',
            rationale: 'Security',
            category: 'behavior' as const,
            answered: true,
            response: '30 minutes',
          },
        ],
      });

      const node = createExtractAtomsNode()(nodeConfig);
      const result = await node(state);

      expect(result.atomCandidates).toHaveLength(2);
      expect(result.atomCandidates![0].description).toBe(
        'User receives password reset email within 1 minute',
      );
      expect(result.atomCandidates![1].category).toBe('security');
      expect(result.currentPhase).toBe('compose_molecule');
      expect(result.llmCallCount).toBe(1);
    });

    it('should filter by minimum confidence', async () => {
      const extractionResponse = {
        atoms: [
          {
            description: 'High confidence atom',
            category: 'functional',
            observableOutcomes: ['Observable'],
            confidence: 90,
            sourceEvidence: ['evidence'],
          },
          {
            description: 'Low confidence atom',
            category: 'functional',
            observableOutcomes: ['Observable'],
            confidence: 40,
            sourceEvidence: ['weak evidence'],
          },
        ],
      };

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify(extractionResponse),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({ currentPhase: 'extract_atoms' });

      const node = createExtractAtomsNode({ minConfidence: 60 })(nodeConfig);
      const result = await node(state);

      expect(result.atomCandidates).toHaveLength(1);
      expect(result.atomCandidates![0].description).toBe('High confidence atom');
    });

    it('should handle LLM parse failures gracefully', async () => {
      mockLlmService.invoke.mockResolvedValue({
        content: 'Not valid JSON',
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({ currentPhase: 'extract_atoms' });

      const node = createExtractAtomsNode()(nodeConfig);
      const result = await node(state);

      expect(result.atomCandidates).toHaveLength(0);
      expect(result.currentPhase).toBe('compose_molecule');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle LLM invocation errors', async () => {
      mockLlmService.invoke.mockRejectedValue(new Error('Rate limited'));

      const state = createBaseState({ currentPhase: 'extract_atoms' });

      const node = createExtractAtomsNode()(nodeConfig);
      const result = await node(state);

      expect(result.errors).toContain('Rate limited');
      expect(result.atomCandidates).toEqual([]);
      expect(result.currentPhase).toBe('compose_molecule');
    });

    it('should use custom minConfidence option', async () => {
      const extractionResponse = {
        atoms: [
          {
            description: 'Medium confidence atom',
            category: 'functional',
            observableOutcomes: ['Observable'],
            confidence: 70,
            sourceEvidence: ['evidence'],
          },
        ],
      };

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify(extractionResponse),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({ currentPhase: 'extract_atoms' });

      // With high min confidence, should filter out
      const node = createExtractAtomsNode({ minConfidence: 80 })(nodeConfig);
      const result = await node(state);

      expect(result.atomCandidates).toHaveLength(0);
    });
  });

  // ========================================
  // ComposeMolecule Node
  // ========================================

  describe('createComposeMoleculeNode', () => {
    it('should compose molecules and produce output summary', async () => {
      const compositionResponse = {
        molecules: [
          {
            name: 'Password Reset Flow',
            description: 'Complete password reset via email',
            lensType: 'user_story',
            atomIndices: [0, 1],
          },
        ],
      };

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify(compositionResponse),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({
        currentPhase: 'compose_molecule',
        atomCandidates: [
          {
            description: 'User receives reset email',
            category: 'functional' as const,
            observableOutcomes: ['Email arrives'],
            confidence: 90,
            sourceEvidence: [],
          },
          {
            description: 'Token expires after 30 min',
            category: 'security' as const,
            observableOutcomes: ['Token invalid'],
            confidence: 85,
            sourceEvidence: [],
          },
        ],
      });

      const node = createComposeMoleculeNode()(nodeConfig);
      const result = await node(state);

      expect(result.moleculeCandidates).toHaveLength(1);
      expect(result.moleculeCandidates![0].name).toBe('Password Reset Flow');
      expect(result.moleculeCandidates![0].lensType).toBe('user_story');
      expect(result.moleculeCandidates![0].atomIndices).toEqual([0, 1]);
      expect(result.currentPhase).toBe('complete');
      expect(result.output).toContain('Interview Results');
      expect(result.output).toContain('User receives reset email');
      expect(result.llmCallCount).toBe(1);
    });

    it('should handle empty atoms array', async () => {
      const state = createBaseState({
        currentPhase: 'compose_molecule',
        atomCandidates: [],
      });

      const node = createComposeMoleculeNode()(nodeConfig);
      const result = await node(state);

      expect(result.currentPhase).toBe('complete');
      expect(result.moleculeCandidates).toEqual([]);
      expect(result.output).toBe('No testable atoms could be extracted from the conversation.');
      expect(mockLlmService.invoke).not.toHaveBeenCalled();
    });

    it('should use default lens type when LLM omits it', async () => {
      const compositionResponse = {
        molecules: [
          {
            name: 'Test Molecule',
            description: 'Test description',
            atomIndices: [0],
          },
        ],
      };

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify(compositionResponse),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({
        currentPhase: 'compose_molecule',
        atomCandidates: [
          {
            description: 'Test atom',
            category: 'functional' as const,
            observableOutcomes: [],
            confidence: 90,
            sourceEvidence: [],
          },
        ],
      });

      const node = createComposeMoleculeNode({ defaultLensType: 'capability' })(nodeConfig);
      const result = await node(state);

      expect(result.moleculeCandidates![0].lensType).toBe('capability');
    });

    it('should handle LLM parse failures with default grouping', async () => {
      mockLlmService.invoke.mockResolvedValue({
        content: 'Not valid JSON',
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({
        currentPhase: 'compose_molecule',
        rawIntent: 'Password reset feature',
        atomCandidates: [
          {
            description: 'Test atom',
            category: 'functional' as const,
            observableOutcomes: [],
            confidence: 90,
            sourceEvidence: [],
          },
        ],
      });

      const node = createComposeMoleculeNode()(nodeConfig);
      const result = await node(state);

      expect(result.moleculeCandidates).toHaveLength(1);
      expect(result.moleculeCandidates![0].atomIndices).toEqual([0]);
      expect(result.moleculeCandidates![0].lensType).toBe('feature');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle LLM invocation errors with fallback molecule', async () => {
      mockLlmService.invoke.mockRejectedValue(new Error('Service down'));

      const state = createBaseState({
        currentPhase: 'compose_molecule',
        rawIntent: 'Password reset feature',
        atomCandidates: [
          {
            description: 'Test atom 1',
            category: 'functional' as const,
            observableOutcomes: [],
            confidence: 90,
            sourceEvidence: [],
          },
          {
            description: 'Test atom 2',
            category: 'security' as const,
            observableOutcomes: [],
            confidence: 80,
            sourceEvidence: [],
          },
        ],
      });

      const node = createComposeMoleculeNode()(nodeConfig);
      const result = await node(state);

      expect(result.errors).toContain('Service down');
      expect(result.moleculeCandidates).toHaveLength(1);
      expect(result.moleculeCandidates![0].atomIndices).toEqual([0, 1]);
      expect(result.currentPhase).toBe('complete');
      expect(result.output).toContain('Interview Results');
    });

    it('should include conversation history turn', async () => {
      const compositionResponse = {
        molecules: [
          {
            name: 'Test',
            description: 'Test',
            lensType: 'feature',
            atomIndices: [0],
          },
        ],
      };

      mockLlmService.invoke.mockResolvedValue({
        content: JSON.stringify(compositionResponse),
        inputTokens: 100,
        outputTokens: 50,
      });

      const state = createBaseState({
        currentPhase: 'compose_molecule',
        atomCandidates: [
          {
            description: 'Test atom',
            category: 'functional' as const,
            observableOutcomes: [],
            confidence: 90,
            sourceEvidence: [],
          },
        ],
      });

      const node = createComposeMoleculeNode()(nodeConfig);
      const result = await node(state);

      expect(result.conversationHistory).toHaveLength(1);
      expect(result.conversationHistory![0].role).toBe('assistant');
      expect(result.conversationHistory![0].timestamp).toBeDefined();
    });
  });
});
