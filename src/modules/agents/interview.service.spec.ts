/**
 * Interview Service Tests
 *
 * Comprehensive unit tests for the InterviewService covering:
 * - startInterview: graph availability, conversation creation, interrupt handling, error handling
 * - submitAnswers: session validation, answer processing, graph resumption, userDone detection
 * - getSession / listSessions: session retrieval, filtering, sorting
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InterviewService } from './interview.service';
import { GraphRegistryService } from './graphs/graph-registry.service';
import { ConversationsService } from '../conversations/conversations.service';
import { INTERVIEW_GRAPH_NAME } from './graphs/graphs/interview.graph';

// Mock uuid to return predictable values
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

// Mock isGraphInterrupt from @langchain/langgraph while preserving other exports
jest.mock('@langchain/langgraph', () => {
  const actual = jest.requireActual('@langchain/langgraph');
  return {
    ...actual,
    isGraphInterrupt: jest.fn(() => false),
  };
});

import { isGraphInterrupt } from '@langchain/langgraph';

const mockIsGraphInterrupt = isGraphInterrupt as jest.MockedFunction<typeof isGraphInterrupt>;

describe('InterviewService', () => {
  let service: InterviewService;
  let mockGraphRegistry: {
    hasGraph: jest.Mock;
    invoke: jest.Mock;
  };
  let mockConversationsService: {
    create: jest.Mock;
    addMessage: jest.Mock;
  };

  const mockConversation = {
    id: 'conv-123',
    title: 'Interview: Test intent',
    context: null,
    compactedSummary: null,
    messageCount: 0,
    isArchived: false,
    lastMessageAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    messages: [],
  };

  const mockMessage = {
    id: 'msg-123',
    conversationId: 'conv-123',
    role: 'user' as const,
    content: 'test',
    metadata: null,
    isCompacted: false,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    // Reset mocks
    mockIsGraphInterrupt.mockReturnValue(false);

    mockGraphRegistry = {
      hasGraph: jest.fn(),
      invoke: jest.fn(),
    };

    mockConversationsService = {
      create: jest.fn().mockResolvedValue(mockConversation),
      addMessage: jest.fn().mockResolvedValue(mockMessage),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewService,
        {
          provide: GraphRegistryService,
          useValue: mockGraphRegistry,
        },
        {
          provide: ConversationsService,
          useValue: mockConversationsService,
        },
      ],
    }).compile();

    service = module.get<InterviewService>(InterviewService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // startInterview
  // ============================================================================

  describe('startInterview', () => {
    it('should throw BadRequestException if interview graph not available', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(false);

      await expect(service.startInterview('Build a login page')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.startInterview('Build a login page')).rejects.toThrow(
        'Interview graph not available',
      );

      expect(mockGraphRegistry.hasGraph).toHaveBeenCalledWith(INTERVIEW_GRAPH_NAME);
      expect(mockConversationsService.create).not.toHaveBeenCalled();
    });

    it('should create a conversation and invoke the graph', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);
      // Graph completes without interrupt
      mockGraphRegistry.invoke.mockResolvedValue({});

      const result = await service.startInterview('Build a login page');

      // Should create a conversation with truncated title
      expect(mockConversationsService.create).toHaveBeenCalledWith('Interview: Build a login page');

      // Should persist the user's initial intent
      expect(mockConversationsService.addMessage).toHaveBeenCalledWith(
        'conv-123',
        'user',
        'Build a login page',
        { type: 'interview_start' },
      );

      // Should invoke the graph with rawIntent
      expect(mockGraphRegistry.invoke).toHaveBeenCalledWith(
        INTERVIEW_GRAPH_NAME,
        { rawIntent: 'Build a login page' },
        expect.objectContaining({
          threadId: 'interview-mock-uuid-1234',
          configurable: { thread_id: 'interview-mock-uuid-1234' },
          tags: ['interview'],
        }),
      );

      expect(result.sessionId).toBe('mock-uuid-1234');
      expect(result.conversationId).toBe('conv-123');
    });

    it('should handle completed graph (no interrupt) with empty questions', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);
      mockGraphRegistry.invoke.mockResolvedValue({});

      const result = await service.startInterview('Simple intent');

      expect(result).toEqual({
        sessionId: 'mock-uuid-1234',
        conversationId: 'conv-123',
        questions: [],
        analysis: null,
      });

      // Session should be stored as completed
      const session = service.getSession('mock-uuid-1234');
      expect(session).toBeDefined();
      expect(session!.status).toBe('completed');
      expect(session!.currentRound).toBe(1);
      expect(session!.pendingQuestions).toEqual([]);
    });

    it('should handle NodeInterrupt with questions ready for user', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);

      const interruptPayload = {
        questions: [
          {
            id: 'q1',
            question: 'What authentication method?',
            category: 'behavior',
            rationale: 'Need to know auth method',
          },
          {
            id: 'q2',
            question: 'Which user roles?',
            category: 'scope',
          },
        ],
        pendingQuestions: [
          {
            id: 'q1',
            question: 'What authentication method?',
            category: 'behavior',
            rationale: 'Need to know auth method',
            answered: false,
          },
          {
            id: 'q2',
            question: 'Which user roles?',
            category: 'scope',
            rationale: 'Define roles',
            answered: false,
          },
        ],
      };

      // Create an error that simulates a graph interrupt
      const interruptError = new Error('Graph interrupted');
      Object.defineProperty(interruptError, 'value', {
        value: JSON.stringify(interruptPayload),
        writable: true,
      });

      mockGraphRegistry.invoke.mockRejectedValue(interruptError);
      mockIsGraphInterrupt.mockReturnValue(true);

      const result = await service.startInterview('Build a login page with roles');

      expect(result.sessionId).toBe('mock-uuid-1234');
      expect(result.conversationId).toBe('conv-123');
      expect(result.questions).toHaveLength(2);
      expect(result.questions[0]).toEqual({
        id: 'q1',
        question: 'What authentication method?',
        category: 'behavior',
        rationale: 'Need to know auth method',
      });
      expect(result.analysis).toBeNull();

      // Session should be stored as waiting_for_answers
      const session = service.getSession('mock-uuid-1234');
      expect(session).toBeDefined();
      expect(session!.status).toBe('waiting_for_answers');
      expect(session!.currentRound).toBe(1);
      expect(session!.pendingQuestions).toHaveLength(2);

      // Should persist assistant questions
      expect(mockConversationsService.addMessage).toHaveBeenCalledWith(
        'conv-123',
        'assistant',
        expect.stringContaining('Clarifying questions:'),
        { type: 'interview_questions', round: 1 },
      );
    });

    it('should handle NodeInterrupt with empty payload gracefully', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);

      // Interrupt with no parseable value
      const interruptError = new Error('Interrupt with no data');
      mockGraphRegistry.invoke.mockRejectedValue(interruptError);
      mockIsGraphInterrupt.mockReturnValue(true);

      const result = await service.startInterview('Test intent');

      expect(result.questions).toEqual([]);
      expect(result.analysis).toBeNull();

      const session = service.getSession('mock-uuid-1234');
      expect(session!.status).toBe('waiting_for_answers');
      expect(session!.pendingQuestions).toEqual([]);
    });

    it('should handle actual errors and mark session as failed', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);

      const realError = new Error('LLM service unavailable');
      mockGraphRegistry.invoke.mockRejectedValue(realError);
      mockIsGraphInterrupt.mockReturnValue(false);

      await expect(service.startInterview('Build something')).rejects.toThrow(
        'LLM service unavailable',
      );

      // Session should be stored as failed
      const session = service.getSession('mock-uuid-1234');
      expect(session).toBeDefined();
      expect(session!.status).toBe('failed');
      expect(session!.currentRound).toBe(0);
    });

    it('should truncate long intent for conversation title', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);
      mockGraphRegistry.invoke.mockResolvedValue({});

      const longIntent = 'A'.repeat(200);
      await service.startInterview(longIntent);

      expect(mockConversationsService.create).toHaveBeenCalledWith(`Interview: ${'A'.repeat(80)}`);
    });

    it('should handle interrupt with value in interrupts array', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);

      const interruptPayload = {
        questions: [{ id: 'q1', question: 'How many users?', category: 'scope' }],
        pendingQuestions: [
          {
            id: 'q1',
            question: 'How many users?',
            category: 'scope',
            rationale: 'Scale',
            answered: false,
          },
        ],
      };

      // Simulate interrupt with interrupts array (alternative format)
      const interruptError = new Error('Graph interrupted');
      Object.defineProperty(interruptError, 'interrupts', {
        value: [{ value: JSON.stringify(interruptPayload) }],
        writable: true,
      });

      mockGraphRegistry.invoke.mockRejectedValue(interruptError);
      mockIsGraphInterrupt.mockReturnValue(true);

      const result = await service.startInterview('Scale test');

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].question).toBe('How many users?');
    });
  });

  // ============================================================================
  // submitAnswers
  // ============================================================================

  describe('submitAnswers', () => {
    // Helper to set up a session in waiting_for_answers state
    async function setupWaitingSession(): Promise<string> {
      mockGraphRegistry.hasGraph.mockReturnValue(true);

      const interruptPayload = {
        questions: [
          { id: 'q1', question: 'What auth method?', category: 'behavior' },
          { id: 'q2', question: 'Which roles?', category: 'scope' },
        ],
        pendingQuestions: [
          {
            id: 'q1',
            question: 'What auth method?',
            category: 'behavior',
            rationale: 'Need method',
            answered: false,
          },
          {
            id: 'q2',
            question: 'Which roles?',
            category: 'scope',
            rationale: 'Need roles',
            answered: false,
          },
        ],
      };

      const interruptError = new Error('Interrupt');
      Object.defineProperty(interruptError, 'value', {
        value: JSON.stringify(interruptPayload),
        writable: true,
      });

      mockGraphRegistry.invoke.mockRejectedValue(interruptError);
      mockIsGraphInterrupt.mockReturnValue(true);

      const result = await service.startInterview('Build login');
      // Reset mocks for submitAnswers calls
      jest.clearAllMocks();
      mockIsGraphInterrupt.mockReturnValue(false);
      mockConversationsService.addMessage.mockResolvedValue(mockMessage);

      return result.sessionId;
    }

    it('should throw NotFoundException for unknown session', async () => {
      await expect(
        service.submitAnswers('nonexistent-id', [{ questionId: 'q1', response: 'JWT' }]),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.submitAnswers('nonexistent-id', [{ questionId: 'q1', response: 'JWT' }]),
      ).rejects.toThrow('Interview session "nonexistent-id" not found');
    });

    it('should throw BadRequestException if session not waiting for answers', async () => {
      // Create a completed session
      mockGraphRegistry.hasGraph.mockReturnValue(true);
      mockGraphRegistry.invoke.mockResolvedValue({});

      await service.startInterview('Simple intent');
      const session = service.getSession('mock-uuid-1234');
      expect(session!.status).toBe('completed');

      await expect(
        service.submitAnswers('mock-uuid-1234', [{ questionId: 'q1', response: 'test' }]),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.submitAnswers('mock-uuid-1234', [{ questionId: 'q1', response: 'test' }]),
      ).rejects.toThrow('is not waiting for answers');
    });

    it('should submit answers and handle graph completion', async () => {
      const sessionId = await setupWaitingSession();

      // Graph completes with final results
      const graphResult = {
        atomCandidates: [
          {
            description: 'User can log in with JWT',
            category: 'functional',
            observableOutcomes: ['Token issued on successful login'],
            confidence: 90,
            sourceEvidence: ['user said JWT auth'],
          },
        ],
        moleculeCandidates: [
          {
            name: 'Authentication',
            description: 'User authentication flow',
            lensType: 'feature',
            atomIndices: [0],
          },
        ],
        output: 'Interview complete. Extracted 1 atom and 1 molecule.',
      };

      mockGraphRegistry.invoke.mockResolvedValue(graphResult);

      const result = await service.submitAnswers(sessionId, [
        { questionId: 'q1', response: 'JWT tokens' },
        { questionId: 'q2', response: 'Admin and User roles' },
      ]);

      expect(result.status).toBe('completed');
      expect(result.sessionId).toBe(sessionId);
      expect(result.result).toBeDefined();
      expect(result.result!.atoms).toHaveLength(1);
      expect(result.result!.atoms[0].description).toBe('User can log in with JWT');
      expect(result.result!.molecules).toHaveLength(1);
      expect(result.result!.output).toContain('Interview complete');

      // Session status should be updated
      const session = service.getSession(sessionId);
      expect(session!.status).toBe('completed');

      // Should persist user answers
      expect(mockConversationsService.addMessage).toHaveBeenCalledWith(
        expect.any(String),
        'user',
        expect.stringContaining('Q: What auth method?'),
        expect.objectContaining({ type: 'interview_answers' }),
      );

      // Should persist final output
      expect(mockConversationsService.addMessage).toHaveBeenCalledWith(
        expect.any(String),
        'assistant',
        'Interview complete. Extracted 1 atom and 1 molecule.',
        { type: 'interview_complete' },
      );
    });

    it('should submit answers and handle more questions (another interrupt)', async () => {
      const sessionId = await setupWaitingSession();

      const followUpPayload = {
        questions: [{ id: 'q3', question: 'Password requirements?', category: 'constraint' }],
        pendingQuestions: [
          {
            id: 'q3',
            question: 'Password requirements?',
            category: 'constraint',
            rationale: 'Security',
            answered: false,
          },
        ],
      };

      const interruptError = new Error('More questions');
      Object.defineProperty(interruptError, 'value', {
        value: JSON.stringify(followUpPayload),
        writable: true,
      });

      mockGraphRegistry.invoke.mockRejectedValue(interruptError);
      mockIsGraphInterrupt.mockReturnValue(true);

      const result = await service.submitAnswers(sessionId, [
        { questionId: 'q1', response: 'JWT tokens' },
      ]);

      expect(result.status).toBe('waiting_for_answers');
      expect(result.questions).toHaveLength(1);
      expect(result.questions![0].question).toBe('Password requirements?');

      // Session should remain in waiting_for_answers with incremented round
      const session = service.getSession(sessionId);
      expect(session!.status).toBe('waiting_for_answers');
      expect(session!.currentRound).toBe(2);
      expect(session!.pendingQuestions).toHaveLength(1);

      // Should persist follow-up questions
      expect(mockConversationsService.addMessage).toHaveBeenCalledWith(
        expect.any(String),
        'assistant',
        expect.stringContaining('Follow-up questions (round 2)'),
        { type: 'interview_questions', round: 2 },
      );
    });

    it('should detect userDone pattern in answers', async () => {
      const sessionId = await setupWaitingSession();

      mockGraphRegistry.invoke.mockResolvedValue({
        atomCandidates: [],
        moleculeCandidates: [],
        output: 'Done',
      });

      await service.submitAnswers(sessionId, [{ questionId: 'q1', response: "that's all I need" }]);

      // The invoke should have been called with userDone: true
      expect(mockGraphRegistry.invoke).toHaveBeenCalledWith(
        INTERVIEW_GRAPH_NAME,
        expect.objectContaining({
          userDone: true,
          currentPhase: 'extract_atoms',
        }),
        expect.any(Object),
      );
    });

    it('should detect various userDone patterns', async () => {
      const donePatterns = [
        'done',
        'no more questions',
        "that's all",
        'nothing else',
        'skip',
        'finish',
      ];

      for (const pattern of donePatterns) {
        // Re-setup for each pattern
        const sessionId = await setupWaitingSession();

        mockGraphRegistry.invoke.mockResolvedValue({
          atomCandidates: [],
          moleculeCandidates: [],
          output: 'Done',
        });

        await service.submitAnswers(sessionId, [{ questionId: 'q1', response: pattern }]);

        expect(mockGraphRegistry.invoke).toHaveBeenCalledWith(
          INTERVIEW_GRAPH_NAME,
          expect.objectContaining({
            userDone: true,
            currentPhase: 'extract_atoms',
          }),
          expect.any(Object),
        );

        jest.clearAllMocks();
        mockConversationsService.addMessage.mockResolvedValue(mockMessage);
      }
    });

    it('should not set userDone for regular answers', async () => {
      const sessionId = await setupWaitingSession();

      mockGraphRegistry.invoke.mockResolvedValue({
        atomCandidates: [],
        moleculeCandidates: [],
        output: 'Completed',
      });

      await service.submitAnswers(sessionId, [
        { questionId: 'q1', response: 'JWT authentication with refresh tokens' },
      ]);

      expect(mockGraphRegistry.invoke).toHaveBeenCalledWith(
        INTERVIEW_GRAPH_NAME,
        expect.objectContaining({
          userDone: false,
          currentPhase: 'generate_questions',
        }),
        expect.any(Object),
      );
    });

    it('should handle errors during submission and mark session as failed', async () => {
      const sessionId = await setupWaitingSession();

      const error = new Error('LLM timeout');
      mockGraphRegistry.invoke.mockRejectedValue(error);
      mockIsGraphInterrupt.mockReturnValue(false);

      await expect(
        service.submitAnswers(sessionId, [{ questionId: 'q1', response: 'test' }]),
      ).rejects.toThrow('LLM timeout');

      const session = service.getSession(sessionId);
      expect(session!.status).toBe('failed');
    });

    it('should pass updated questions to the graph with answered flag', async () => {
      const sessionId = await setupWaitingSession();

      mockGraphRegistry.invoke.mockResolvedValue({
        atomCandidates: [],
        moleculeCandidates: [],
        output: 'Done',
      });

      await service.submitAnswers(sessionId, [{ questionId: 'q1', response: 'JWT' }]);

      const invokeCall = mockGraphRegistry.invoke.mock.calls[0];
      const resumeState = invokeCall[1] as Record<string, unknown>;

      // allQuestions should have the answered question marked as answered
      const allQuestions = resumeState.allQuestions as Array<{
        id: string;
        answered: boolean;
        response?: string;
      }>;
      expect(allQuestions).toBeDefined();

      const q1 = allQuestions.find((q) => q.id === 'q1');
      expect(q1).toBeDefined();
      expect(q1!.answered).toBe(true);
      expect(q1!.response).toBe('JWT');

      // q2 was not answered
      const q2 = allQuestions.find((q) => q.id === 'q2');
      expect(q2).toBeDefined();
      expect(q2!.answered).toBe(false);
    });

    it('should invoke graph with correct resume options including round and threadId', async () => {
      const sessionId = await setupWaitingSession();

      mockGraphRegistry.invoke.mockResolvedValue({
        atomCandidates: [],
        moleculeCandidates: [],
        output: 'Done',
      });

      await service.submitAnswers(sessionId, [{ questionId: 'q1', response: 'test' }]);

      expect(mockGraphRegistry.invoke).toHaveBeenCalledWith(
        INTERVIEW_GRAPH_NAME,
        expect.objectContaining({
          round: 2,
          pendingQuestions: [],
        }),
        expect.objectContaining({
          threadId: `interview-${sessionId}`,
          configurable: { thread_id: `interview-${sessionId}` },
          runName: `interview-${sessionId}-round-2`,
          tags: ['interview', 'resume'],
        }),
      );
    });

    it('should handle graph completion with no output', async () => {
      const sessionId = await setupWaitingSession();

      mockGraphRegistry.invoke.mockResolvedValue({
        atomCandidates: [],
        moleculeCandidates: [],
        // no output field
      });

      const result = await service.submitAnswers(sessionId, [
        { questionId: 'q1', response: 'test' },
      ]);

      expect(result.status).toBe('completed');
      expect(result.result!.output).toBe('');
      expect(result.result!.atoms).toEqual([]);
      expect(result.result!.molecules).toEqual([]);

      // Should NOT persist empty output
      const assistantCalls = mockConversationsService.addMessage.mock.calls.filter(
        (call) => call[1] === 'assistant',
      );
      expect(assistantCalls).toHaveLength(0);
    });

    it('should format answer text with question context', async () => {
      const sessionId = await setupWaitingSession();

      mockGraphRegistry.invoke.mockResolvedValue({
        output: 'Done',
      });

      await service.submitAnswers(sessionId, [
        { questionId: 'q1', response: 'JWT tokens' },
        { questionId: 'q2', response: 'Admin and User' },
      ]);

      const userMessageCall = mockConversationsService.addMessage.mock.calls.find(
        (call) => call[1] === 'user',
      );
      expect(userMessageCall).toBeDefined();
      const answerText = userMessageCall![2] as string;
      expect(answerText).toContain('Q: What auth method?');
      expect(answerText).toContain('A: JWT tokens');
      expect(answerText).toContain('Q: Which roles?');
      expect(answerText).toContain('A: Admin and User');
    });

    it('should use questionId as fallback when question not found in pending', async () => {
      const sessionId = await setupWaitingSession();

      mockGraphRegistry.invoke.mockResolvedValue({
        output: 'Done',
      });

      // Submit with unknown questionId
      await service.submitAnswers(sessionId, [
        { questionId: 'unknown-q', response: 'some answer' },
      ]);

      const userMessageCall = mockConversationsService.addMessage.mock.calls.find(
        (call) => call[1] === 'user',
      );
      expect(userMessageCall).toBeDefined();
      const answerText = userMessageCall![2] as string;
      expect(answerText).toContain('Q: unknown-q');
      expect(answerText).toContain('A: some answer');
    });
  });

  // ============================================================================
  // getSession
  // ============================================================================

  describe('getSession', () => {
    it('should return session by ID', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);
      mockGraphRegistry.invoke.mockResolvedValue({});

      await service.startInterview('Test intent');

      const session = service.getSession('mock-uuid-1234');
      expect(session).toBeDefined();
      expect(session!.id).toBe('mock-uuid-1234');
      expect(session!.threadId).toBe('interview-mock-uuid-1234');
      expect(session!.conversationId).toBe('conv-123');
      expect(session!.status).toBe('completed');
      expect(session!.createdAt).toBeInstanceOf(Date);
      expect(session!.updatedAt).toBeInstanceOf(Date);
    });

    it('should return undefined for unknown ID', () => {
      const session = service.getSession('nonexistent');
      expect(session).toBeUndefined();
    });
  });

  // ============================================================================
  // listSessions
  // ============================================================================

  describe('listSessions', () => {
    it('should return empty array when no sessions exist', () => {
      const sessions = service.listSessions();
      expect(sessions).toEqual([]);
    });

    it('should return non-failed sessions sorted by updatedAt (most recent first)', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { v4: uuidV4 } = require('uuid');

      // Create session 1 - completed
      (uuidV4 as jest.Mock).mockReturnValueOnce('session-1');
      mockGraphRegistry.invoke.mockResolvedValue({});
      await service.startInterview('Intent 1');

      // Create session 2 - waiting_for_answers
      (uuidV4 as jest.Mock).mockReturnValueOnce('session-2');
      const interruptError = new Error('Interrupt');
      Object.defineProperty(interruptError, 'value', {
        value: JSON.stringify({ questions: [], pendingQuestions: [] }),
        writable: true,
      });
      mockGraphRegistry.invoke.mockRejectedValue(interruptError);
      mockIsGraphInterrupt.mockReturnValue(true);
      await service.startInterview('Intent 2');

      // Manually set distinct updatedAt to ensure deterministic ordering
      const session1 = service.getSession('session-1');
      const session2 = service.getSession('session-2');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session1 as any).updatedAt = new Date('2026-01-01T00:00:00Z');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session2 as any).updatedAt = new Date('2026-01-02T00:00:00Z');

      const sessions = service.listSessions();
      expect(sessions).toHaveLength(2);
      // session-2 has a newer updatedAt, so it should appear first
      expect(sessions[0].id).toBe('session-2');
      expect(sessions[1].id).toBe('session-1');
    });

    it('should filter out failed sessions', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { v4: uuidV4 } = require('uuid');

      // Create a completed session
      (uuidV4 as jest.Mock).mockReturnValueOnce('good-session');
      mockGraphRegistry.invoke.mockResolvedValue({});
      mockIsGraphInterrupt.mockReturnValue(false);
      await service.startInterview('Good intent');

      // Create a failed session
      (uuidV4 as jest.Mock).mockReturnValueOnce('failed-session');
      mockGraphRegistry.invoke.mockRejectedValue(new Error('LLM down'));
      mockIsGraphInterrupt.mockReturnValue(false);
      try {
        await service.startInterview('Bad intent');
      } catch {
        // Expected
      }

      const sessions = service.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('good-session');
      expect(sessions.find((s) => s.id === 'failed-session')).toBeUndefined();
    });

    it('should include sessions in all non-failed statuses', async () => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { v4: uuidV4 } = require('uuid');

      // Completed session
      (uuidV4 as jest.Mock).mockReturnValueOnce('completed-session');
      mockGraphRegistry.invoke.mockResolvedValue({});
      mockIsGraphInterrupt.mockReturnValue(false);
      await service.startInterview('Intent A');

      // Waiting session
      (uuidV4 as jest.Mock).mockReturnValueOnce('waiting-session');
      const interruptError = new Error('Interrupt');
      Object.defineProperty(interruptError, 'value', {
        value: JSON.stringify({
          questions: [{ id: 'q1', question: 'Test?', category: 'scope' }],
          pendingQuestions: [],
        }),
        writable: true,
      });
      mockGraphRegistry.invoke.mockRejectedValue(interruptError);
      mockIsGraphInterrupt.mockReturnValue(true);
      await service.startInterview('Intent B');

      const sessions = service.listSessions();
      expect(sessions).toHaveLength(2);

      const statuses = sessions.map((s) => s.status);
      expect(statuses).toContain('completed');
      expect(statuses).toContain('waiting_for_answers');
      expect(statuses).not.toContain('failed');
    });
  });

  // ============================================================================
  // parseInterruptPayload (tested indirectly through startInterview/submitAnswers)
  // ============================================================================

  describe('parseInterruptPayload (indirect)', () => {
    beforeEach(() => {
      mockGraphRegistry.hasGraph.mockReturnValue(true);
    });

    it('should parse interrupt from direct value property', async () => {
      const payload = {
        questions: [{ id: 'q1', question: 'Test?', category: 'behavior' }],
        pendingQuestions: [
          { id: 'q1', question: 'Test?', category: 'behavior', rationale: 'r', answered: false },
        ],
      };

      const error = new Error('Interrupt');
      Object.defineProperty(error, 'value', {
        value: JSON.stringify(payload),
        writable: true,
      });

      mockGraphRegistry.invoke.mockRejectedValue(error);
      mockIsGraphInterrupt.mockReturnValue(true);

      const result = await service.startInterview('Test');
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].id).toBe('q1');
    });

    it('should parse interrupt from interrupts array', async () => {
      const payload = {
        questions: [{ id: 'q2', question: 'Another?', category: 'scope' }],
        pendingQuestions: [],
      };

      const error = new Error('Interrupt');
      Object.defineProperty(error, 'interrupts', {
        value: [{ value: JSON.stringify(payload) }],
        writable: true,
      });

      mockGraphRegistry.invoke.mockRejectedValue(error);
      mockIsGraphInterrupt.mockReturnValue(true);

      const result = await service.startInterview('Test');
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].id).toBe('q2');
    });

    it('should parse interrupt from string representation as fallback', async () => {
      const payload = {
        questions: [{ id: 'q3', question: 'Fallback?', category: 'constraint' }],
        pendingQuestions: [],
      };

      // Create an error whose toString() includes JSON
      const error = {
        message: `Some error with payload ${JSON.stringify(payload)}`,
        toString: () => `Error: payload ${JSON.stringify(payload)}`,
      };

      mockGraphRegistry.invoke.mockRejectedValue(error);
      mockIsGraphInterrupt.mockReturnValue(true);

      const result = await service.startInterview('Test');
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].id).toBe('q3');
    });

    it('should return empty object when payload cannot be parsed', async () => {
      const error = new Error('Non-parseable interrupt');
      mockGraphRegistry.invoke.mockRejectedValue(error);
      mockIsGraphInterrupt.mockReturnValue(true);

      const result = await service.startInterview('Test');
      expect(result.questions).toEqual([]);
    });
  });
});
