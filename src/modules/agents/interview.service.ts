/**
 * Interview Service
 *
 * Orchestrates multi-turn interview sessions for intent extraction.
 * Manages the interview graph lifecycle, including:
 * - Starting new interviews
 * - Submitting answers and resuming
 * - Retrieving interview state and results
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GraphRegistryService } from './graphs/graph-registry.service';
import { ConversationsService } from '../conversations/conversations.service';
import {
  InterviewGraphStateType,
  InterviewQuestion,
  AnswerStatus,
  AtomCandidate,
  MoleculeCandidate,
} from './graphs/types/interview-state';
import { INTERVIEW_GRAPH_NAME } from './graphs/graphs/interview.graph';

/**
 * Tracked interview session
 */
export interface InterviewSession {
  id: string;
  threadId: string;
  conversationId: string;
  status: 'active' | 'waiting_for_answers' | 'completed' | 'failed';
  currentRound: number;
  pendingQuestions: InterviewQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Result of starting an interview
 */
export interface InterviewStartResult {
  sessionId: string;
  conversationId: string;
  questions: Array<{
    id: string;
    question: string;
    category: string;
    rationale?: string;
  }>;
  analysis: {
    summary: string;
    ambiguities: string[];
    impliedBehaviors: string[];
  } | null;
}

/**
 * Result of answering interview questions
 */
export interface InterviewAnswerResult {
  sessionId: string;
  status: 'waiting_for_answers' | 'completed';
  questions?: Array<{
    id: string;
    question: string;
    category: string;
  }>;
  result?: {
    atoms: AtomCandidate[];
    molecules: MoleculeCandidate[];
    output: string;
  };
}

/**
 * Classify a user's answer to determine its status.
 * Detects deferrals, out-of-scope declarations, and conflicts.
 */
function classifyAnswer(response: string): AnswerStatus {
  const text = response.toLowerCase();

  // Deferral patterns: user explicitly postpones
  if (/\b(later|not now|not yet|next phase|phase \d|defer|postpone|future|backlog)\b/i.test(text)) {
    return 'deferred';
  }

  // Out-of-scope patterns: user declares topic irrelevant
  if (
    /\b(out of scope|not in scope|not relevant|doesn't apply|not applicable|n\/a)\b/i.test(text)
  ) {
    return 'out_of_scope';
  }

  // Conflict patterns: user contradicts prior information
  if (/\b(actually|wait|no[,.]? I said|that contradicts|I meant|correction)\b/i.test(text)) {
    return 'conflict';
  }

  // If the response is very short or non-substantive, it may be unanswered
  if (text.trim().length < 3 || /^(n\/a|idk|dunno|\?+|\.+)$/i.test(text.trim())) {
    return 'unanswered';
  }

  return 'answered';
}

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);
  private readonly sessions = new Map<string, InterviewSession>();

  constructor(
    private readonly graphRegistry: GraphRegistryService,
    private readonly conversationsService: ConversationsService,
  ) {}

  /**
   * Start a new interview session.
   * Analyzes the raw intent and generates initial clarifying questions.
   */
  async startInterview(rawIntent: string): Promise<InterviewStartResult> {
    if (!this.graphRegistry.hasGraph(INTERVIEW_GRAPH_NAME)) {
      throw new BadRequestException('Interview graph not available');
    }

    const sessionId = uuidv4();
    const threadId = `interview-${sessionId}`;

    // Create a conversation for persistence
    const conversation = await this.conversationsService.create(
      `Interview: ${rawIntent.slice(0, 80)}`,
    );

    // Persist the user's initial intent
    await this.conversationsService.addMessage(conversation.id, 'user', rawIntent, {
      type: 'interview_start',
    });

    this.logger.log(`Starting interview session ${sessionId} for: "${rawIntent.slice(0, 50)}..."`);

    try {
      // Run the graph — it will analyze intent and generate questions.
      // In LangGraph 1.x, the graph returns normally with pendingQuestions
      // populated when questions are ready (no longer throws NodeInterrupt).
      const result = await this.graphRegistry.invoke<InterviewGraphStateType>(
        INTERVIEW_GRAPH_NAME,
        { rawIntent },
        {
          threadId,
          configurable: { thread_id: threadId },
          runName: `interview-${sessionId}`,
          tags: ['interview'],
        },
      );

      // Check if graph returned with pending questions for the user
      if (result.pendingQuestions?.length > 0) {
        const session: InterviewSession = {
          id: sessionId,
          threadId,
          conversationId: conversation.id,
          status: 'waiting_for_answers',
          currentRound: 1,
          pendingQuestions: result.pendingQuestions,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.sessions.set(sessionId, session);

        // Persist the assistant's questions
        const questionText = result.pendingQuestions
          .map((q, i) => `${i + 1}. ${q.question}`)
          .join('\n');
        await this.conversationsService.addMessage(
          conversation.id,
          'assistant',
          `Clarifying questions:\n\n${questionText}`,
          { type: 'interview_questions', round: 1 },
        );

        return {
          sessionId,
          conversationId: conversation.id,
          questions: result.pendingQuestions.map((q) => ({
            id: q.id,
            question: q.question,
            category: q.category,
            rationale: q.rationale,
          })),
          analysis: result.intentAnalysis || null,
        };
      }

      // Graph completed without needing questions
      const session: InterviewSession = {
        id: sessionId,
        threadId,
        conversationId: conversation.id,
        status: 'completed',
        currentRound: 1,
        pendingQuestions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.sessions.set(sessionId, session);

      return {
        sessionId,
        conversationId: conversation.id,
        questions: [],
        analysis: result.intentAnalysis || null,
      };
    } catch (error) {
      // Actual error
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Interview start failed: ${message}`);

      const session: InterviewSession = {
        id: sessionId,
        threadId,
        conversationId: conversation.id,
        status: 'failed',
        currentRound: 0,
        pendingQuestions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.sessions.set(sessionId, session);

      throw error;
    }
  }

  /**
   * Submit answers to interview questions and continue the interview.
   */
  async submitAnswers(
    sessionId: string,
    answers: Array<{ questionId: string; response: string }>,
  ): Promise<InterviewAnswerResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session "${sessionId}" not found`);
    }

    if (session.status !== 'waiting_for_answers') {
      throw new BadRequestException(
        `Interview session "${sessionId}" is not waiting for answers (status: ${session.status})`,
      );
    }

    // Update pending questions with answers and classify each response
    const updatedQuestions = session.pendingQuestions.map((q) => {
      const answer = answers.find((a) => a.questionId === q.id);
      if (answer) {
        const answerStatus = classifyAnswer(answer.response);
        return {
          ...q,
          answered: answerStatus === 'answered',
          answerStatus,
          responseScope: 'individual' as const,
          response: answer.response,
        };
      }
      return { ...q, answerStatus: 'unanswered' as AnswerStatus };
    });

    // Persist user answers
    const answerText = answers
      .map((a) => {
        const question = session.pendingQuestions.find((q) => q.id === a.questionId);
        return `Q: ${question?.question || a.questionId}\nA: ${a.response}`;
      })
      .join('\n\n');

    await this.conversationsService.addMessage(session.conversationId, 'user', answerText, {
      type: 'interview_answers',
      round: session.currentRound,
    });

    // Check if user indicated they're done
    const userDone = answers.some((a) =>
      /\b(done|no more|that's all|nothing else|skip|finish)\b/i.test(a.response),
    );

    // Resume the graph with updated state
    try {
      const resumeState: Partial<InterviewGraphStateType> = {
        allQuestions: updatedQuestions,
        pendingQuestions: [],
        round: session.currentRound + 1,
        userDone,
        currentPhase: userDone ? 'extract_atoms' : 'generate_questions',
      };

      const result = await this.graphRegistry.invoke<InterviewGraphStateType>(
        INTERVIEW_GRAPH_NAME,
        resumeState,
        {
          threadId: session.threadId,
          configurable: { thread_id: session.threadId },
          runName: `interview-${sessionId}-round-${session.currentRound + 1}`,
          tags: ['interview', 'resume'],
        },
      );

      // Check if graph returned with more questions (another round)
      if (result.pendingQuestions?.length > 0) {
        session.currentRound++;
        session.pendingQuestions = result.pendingQuestions;
        session.updatedAt = new Date();

        // Persist new questions
        const questionText = result.pendingQuestions
          .map((q, i) => `${i + 1}. ${q.question}`)
          .join('\n');
        await this.conversationsService.addMessage(
          session.conversationId,
          'assistant',
          `Follow-up questions (round ${session.currentRound}):\n\n${questionText}`,
          { type: 'interview_questions', round: session.currentRound },
        );

        return {
          sessionId,
          status: 'waiting_for_answers',
          questions: result.pendingQuestions.map((q) => ({
            id: q.id,
            question: q.question,
            category: q.category,
          })),
        };
      }

      // Graph completed — return final results
      session.status = 'completed';
      session.updatedAt = new Date();

      // Persist the final output
      if (result.output) {
        await this.conversationsService.addMessage(
          session.conversationId,
          'assistant',
          result.output,
          { type: 'interview_complete' },
        );
      }

      return {
        sessionId,
        status: 'completed',
        result: {
          atoms: result.atomCandidates || [],
          molecules: result.moleculeCandidates || [],
          output: result.output || '',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Interview answer submission failed: ${message}`);
      session.status = 'failed';
      session.updatedAt = new Date();
      throw error;
    }
  }

  /**
   * Get the current state of an interview session.
   */
  getSession(sessionId: string): InterviewSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List active interview sessions.
   */
  listSessions(): InterviewSession[] {
    return Array.from(this.sessions.values())
      .filter((s) => s.status !== 'failed')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}
