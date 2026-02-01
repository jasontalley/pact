/**
 * Chat Agent Service
 *
 * Conversational interface for Pact agents with tool/function calling.
 * Routes user requests to appropriate agents based on intent classification.
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { LLMService, LLMRequest } from '../../common/llm/llm.service';
import { AgentTaskType } from '../../common/llm/providers/types';
import { AgentSafetyService, SafetyContext } from '../../common/safety';
import { ChatRequestDto, ChatResponseDto, ToolCallDto, ToolResultDto } from './dto/chat-agent.dto';
import { ToolRegistryService } from './tools/tool-registry.service';
import { GraphRegistryService } from './graphs/graph-registry.service';
import { ReconciliationService } from './reconciliation.service';
import { ChatExplorationStateType } from './graphs/types/exploration-state';
import { CoverageFastStateType } from './graphs/graphs/coverage-fast.graph';

/**
 * Query route types for fast-path routing
 */
type QueryRoute = 'fast-coverage' | 'reconciliation' | 'standard';

/**
 * Coverage question patterns for fast-path routing
 */
const COVERAGE_PATTERNS = [
  /what.*coverage/i,
  /test.*coverage/i,
  /code.*coverage/i,
  /coverage.*percent/i,
  /how much.*tested/i,
  /percent.*covered/i,
  /line.*coverage/i,
  /branch.*coverage/i,
  /statement.*coverage/i,
];

/**
 * Reconciliation command patterns
 */
const RECONCILIATION_PATTERNS = [
  /reconcile.*repo/i,
  /reconcile.*repository/i,
  /reconcile.*codebase/i,
  /run.*reconciliation/i,
  /start.*reconciliation/i,
  /analyze.*tests.*atoms/i,
  /infer.*atoms.*tests/i,
  /discover.*atoms/i,
  /find.*orphan.*tests/i,
];

/**
 * Chat session for maintaining conversation context
 */
interface ChatSession {
  id: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  createdAt: Date;
  lastActivityAt: Date;
  context: Record<string, unknown>;
}

/**
 * System prompt for the chat agent (dynamically includes available tools)
 *
 * This is intentionally minimal. The graph-based agent constructs
 * task-specific prompts dynamically. This fallback prompt provides
 * only domain knowledge and tool awareness.
 */
const getSystemPrompt = (
  availableTools: string[],
): string => `You are Pact Assistant, an AI agent that helps users manage intent atoms and explore the Pact codebase.

## Available Tools
${availableTools.join(', ')}

## Key Pact Concepts
- **Intent Atoms**: Atomic, testable behavioral requirements (immutable after commitment)
- **Quality Score**: 0-100 rating based on testability, clarity, and atomicity (80+ required for commitment)
- **Commitment**: Making an atom permanent and immutable
- **Supersession**: Replacing a committed atom with a new version (old atom preserved)
- **Molecules**: Groupings of atoms that represent features or capabilities

## Behavior Guidelines
- Use tools to gather information before answering questions
- Be concise - prefer summary information over raw data dumps
- When reading files, extract only the relevant portions
- If a file is large, read specific sections rather than the entire file
- Synthesize findings into clear, actionable responses

## Exploration Guidelines
- Directory listings show structure, but files contain data - read relevant files
- When asked about metrics (coverage, quality, etc.), find and read the actual report files
- Common data locations: \`test-results/\`, \`coverage/\`, \`*-report.*\` files
- If you list a directory and see data files, read them to extract actual numbers`;

@Injectable()
export class ChatAgentService {
  private readonly logger = new Logger(ChatAgentService.name);
  private sessions: Map<string, ChatSession> = new Map();

  // Session timeout (30 minutes)
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  // Feature flag for graph-based chat (gradual rollout)
  private readonly useGraphAgent: boolean;

  constructor(
    private readonly llmService: LLMService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly graphRegistry: GraphRegistryService,
    private readonly safetyService: AgentSafetyService,
    private readonly reconciliationService: ReconciliationService,
  ) {
    // Enable graph agent via environment variable
    this.useGraphAgent = process.env.USE_GRAPH_AGENT === 'true';

    // Cleanup old sessions periodically
    setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
  }

  /**
   * Process a chat message
   */
  async chat(request: ChatRequestDto): Promise<ChatResponseDto> {
    const startTime = Date.now();

    // Get or create session
    const session = this.getOrCreateSession(request.sessionId, request.context);

    // Create safety context for this request
    const safetyContext: SafetyContext = this.safetyService.createContext({
      agentId: 'chat-agent',
      sessionId: session.id,
      workspaceRoot: process.cwd(),
    });

    // Validate input for safety violations
    const inputValidation = this.safetyService.validateRequest(
      request.message,
      [], // Tools will be validated at execution time
      safetyContext,
    );

    if (!inputValidation.allowed) {
      this.logger.warn(
        `Chat request blocked due to safety violations: ${inputValidation.allViolations.map((v) => v.type).join(', ')}`,
      );
      return {
        sessionId: session.id,
        message:
          'I cannot process this request due to safety constraints. Please rephrase your question.',
        suggestedActions: ['Try a different question', 'Ask for help'],
      };
    }

    // Use sanitized input
    const sanitizedMessage = inputValidation.sanitizedInput || request.message;

    // Add user message to history (sanitized)
    session.messages.push({ role: 'user', content: sanitizedMessage });
    session.lastActivityAt = new Date();

    this.logger.log(`Chat request in session ${session.id}: ${sanitizedMessage.slice(0, 50)}...`);

    // Process the request
    let response: ChatResponseDto;

    // Use graph-based agent if enabled
    if (this.useGraphAgent && this.graphRegistry.hasGraph('chat-exploration')) {
      // Route to fast-path or standard graph
      const route = this.routeQuery(sanitizedMessage);

      if (route === 'reconciliation') {
        this.logger.log('Routing to reconciliation command handler');
        response = await this.handleReconciliationCommand(
          { ...request, message: sanitizedMessage },
          session,
          startTime,
        );
      } else if (route === 'fast-coverage' && this.graphRegistry.hasGraph('coverage-fast')) {
        this.logger.log('Routing to coverage fast-path');
        response = await this.chatWithCoverageFastPath(
          { ...request, message: sanitizedMessage },
          session,
          startTime,
        );
      } else {
        response = await this.chatWithGraph(
          { ...request, message: sanitizedMessage },
          session,
          startTime,
        );
      }
    } else {
      // Use legacy direct tool-calling implementation
      // Note: Graph agent has smarter exploration (analyze node checks if findings have actual data)
      if (!this.useGraphAgent) {
        this.logger.debug(
          'Using legacy chat path. Set USE_GRAPH_AGENT=true for smarter exploration.',
        );
      }
      response = await this.chatWithDirectTools(
        { ...request, message: sanitizedMessage },
        session,
        startTime,
      );
    }

    // Validate output before returning
    const outputValidation = this.safetyService.validateResponse(response.message, safetyContext);

    // Return sanitized output
    return {
      ...response,
      message: outputValidation.sanitizedOutput,
    };
  }

  /**
   * Process a chat message using the LangGraph-based agent
   */
  private async chatWithGraph(
    request: ChatRequestDto,
    session: ChatSession,
    startTime: number,
  ): Promise<ChatResponseDto> {
    this.logger.log(`Using graph-based agent for session ${session.id}`);

    try {
      // Invoke the chat exploration graph
      const result = await this.graphRegistry.invoke<
        { input: string; maxIterations: number },
        ChatExplorationStateType
      >('chat-exploration', {
        input: request.message,
        maxIterations: 5,
      });

      // Map graph result to response DTO
      const toolCalls: ToolCallDto[] = result.toolHistory.map((t, i) => ({
        id: `tool-${i}`,
        name: t.tool,
        arguments: t.args,
      }));

      const toolResults: ToolResultDto[] = result.toolHistory.map((t, i) => ({
        toolCallId: `tool-${i}`,
        name: t.tool,
        result: t.result,
        success: !t.result.startsWith('Error:'),
      }));

      const finalMessage = result.output || 'I was unable to find an answer.';

      // Add assistant message to session history
      session.messages.push({ role: 'assistant', content: finalMessage });

      // Generate suggested actions
      const suggestedActions = this.generateSuggestedActions(
        request.message,
        finalMessage,
        toolResults,
      );

      const latencyMs = Date.now() - startTime;
      this.logger.log(
        `Graph-based chat response generated in ${latencyMs}ms (${result.iteration} iterations)`,
      );

      return {
        sessionId: session.id,
        message: finalMessage,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
        suggestedActions,
      };
    } catch (error) {
      this.logger.error(`Graph-based chat error: ${error.message}`, error.stack);

      // Fall back to direct tool implementation on error
      this.logger.warn('Falling back to direct tool chat implementation');
      return this.chatWithDirectTools(request, session, startTime);
    }
  }

  /**
   * Route a query to the appropriate graph based on patterns.
   * Returns 'fast-coverage' for coverage questions, 'reconciliation' for repo reconciliation, 'standard' otherwise.
   */
  private routeQuery(message: string): QueryRoute {
    // Check for reconciliation command patterns
    if (RECONCILIATION_PATTERNS.some((p) => p.test(message))) {
      return 'reconciliation';
    }
    // Check for coverage question patterns
    if (COVERAGE_PATTERNS.some((p) => p.test(message))) {
      return 'fast-coverage';
    }
    return 'standard';
  }

  /**
   * Process a coverage question using the fast-path graph.
   * This bypasses the full ReAct loop for significant token savings.
   */
  private async chatWithCoverageFastPath(
    request: ChatRequestDto,
    session: ChatSession,
    startTime: number,
  ): Promise<ChatResponseDto> {
    this.logger.log(`Using coverage fast-path for session ${session.id}`);

    try {
      const result = await this.graphRegistry.invoke<
        { input: string },
        CoverageFastStateType
      >('coverage-fast', {
        input: request.message,
      });

      // Check if fast-path found actual coverage data
      // If not, fall back to standard graph for more thorough exploration
      const hasData = result.metrics && !result.error;

      if (!hasData) {
        this.logger.warn(
          `Coverage fast-path found no data: ${result.error || 'no metrics'}. Falling back to standard graph.`,
        );
        return this.chatWithGraph(request, session, startTime);
      }

      const finalMessage = result.output || 'I was unable to find coverage data.';

      // Add assistant message to session history
      session.messages.push({ role: 'assistant', content: finalMessage });

      const latencyMs = Date.now() - startTime;
      this.logger.log(`Coverage fast-path response generated in ${latencyMs}ms`);

      return {
        sessionId: session.id,
        message: finalMessage,
        suggestedActions: ['Ask about specific file coverage', 'Request coverage trends'],
      };
    } catch (error) {
      this.logger.error(`Coverage fast-path error: ${error.message}`, error.stack);

      // Fall back to standard graph on error
      this.logger.warn('Falling back to standard graph implementation');
      return this.chatWithGraph(request, session, startTime);
    }
  }

  /**
   * Handle reconciliation commands (reconcile_repo, run reconciliation, etc.)
   *
   * This method starts a reconciliation analysis on the repository to:
   * - Discover orphan tests (tests without @atom annotations)
   * - Infer potential atoms from test behavior
   * - Suggest molecule groupings
   *
   * @param request - Chat request containing the reconciliation command
   * @param session - Chat session for context
   * @param startTime - Request start time for latency tracking
   */
  private async handleReconciliationCommand(
    request: ChatRequestDto,
    session: ChatSession,
    startTime: number,
  ): Promise<ChatResponseDto> {
    this.logger.log(`Handling reconciliation command for session ${session.id}`);

    try {
      // Check if reconciliation service is available
      if (!this.reconciliationService.isAvailable()) {
        const message =
          'The reconciliation service is not available. This may be because the required LLM provider is not configured. ' +
          'Please ensure ANTHROPIC_API_KEY or OPENAI_API_KEY is set.';

        session.messages.push({ role: 'assistant', content: message });

        return {
          sessionId: session.id,
          message,
          suggestedActions: ['Check environment configuration', 'Try a different command'],
        };
      }

      // Parse options from the message (optional)
      const options = this.parseReconciliationOptions(request.message);

      // Start the reconciliation with interrupt support for human review
      const result = await this.reconciliationService.analyzeWithInterrupt({
        rootDirectory: options.rootDirectory || process.cwd(),
        mode: options.mode || 'full-scan',
        options: {
          analyzeDocs: options.analyzeDocs ?? true,
          maxTests: options.maxTests,
          qualityThreshold: options.qualityThreshold ?? 70,
          requireReview: true, // Always require review in chat context
        },
      });

      // Build response message based on result
      let message: string;
      let suggestedActions: string[];

      if (!result.completed && result.pendingReview) {
        // Analysis interrupted, waiting for human review
        const pending = result.pendingReview;
        const atomCount = pending.pendingAtoms?.length || 0;
        const passCount = pending.summary?.passCount || 0;
        const failCount = pending.summary?.failCount || 0;

        message =
          `Reconciliation analysis complete for run **${result.runId}**.\n\n` +
          `**Status**: Waiting for review\n` +
          `**Atoms discovered**: ${atomCount}\n` +
          `**Passing quality threshold**: ${passCount}\n` +
          `**Failing quality threshold**: ${failCount}\n\n` +
          `The analysis found ${atomCount} potential atoms from your tests. ` +
          `Please review and approve/reject the recommendations before they are applied.\n\n` +
          `Use the API endpoint \`GET /agents/reconciliation/runs/${result.runId}/pending\` to see pending recommendations, ` +
          `or \`POST /agents/reconciliation/runs/${result.runId}/review\` to submit your decisions.`;

        suggestedActions = [
          'Show pending recommendations',
          'Approve all recommendations',
          'Check run status',
        ];
      } else if (result.completed && result.result) {
        // Analysis completed (no review required or auto-approved)
        const reconciliationResult = result.result;
        const summary = reconciliationResult.summary;
        message =
          `Reconciliation analysis complete for run **${result.runId}**.\n\n` +
          `**Status**: ${reconciliationResult.status}\n` +
          `**Atoms inferred**: ${summary.inferredAtomsCount || 0}\n` +
          `**Molecules suggested**: ${summary.inferredMoleculesCount || 0}\n` +
          `**Tests analyzed**: ${summary.totalOrphanTests || 0}\n` +
          `**Quality passing**: ${summary.qualityPassCount || 0}\n` +
          `**Quality failing**: ${summary.qualityFailCount || 0}\n\n` +
          (reconciliationResult.status === 'completed'
            ? 'All recommendations have been processed successfully.'
            : 'Some recommendations may require manual review.');

        suggestedActions = [
          'View created atoms',
          'Run another reconciliation',
          'Check quality metrics',
        ];
      } else {
        // Error or unexpected status
        const errorMessages = result.result?.errors?.join(', ') || 'Unknown error';
        message =
          `Reconciliation run **${result.runId}** did not complete as expected.\n\n` +
          `Errors: ${errorMessages}\n\n` +
          'Please check the run details for more information.';

        suggestedActions = ['Check run details', 'Try again', 'Report issue'];
      }

      // Add to session history
      session.messages.push({ role: 'assistant', content: message });

      const latencyMs = Date.now() - startTime;
      this.logger.log(`Reconciliation command handled in ${latencyMs}ms`);

      return {
        sessionId: session.id,
        message,
        suggestedActions,
      };
    } catch (error) {
      this.logger.error(`Reconciliation command error: ${error.message}`, error.stack);

      const errorMessage =
        `I encountered an error while running reconciliation: ${error.message}\n\n` +
        'This might be due to configuration issues or the LLM service being unavailable. ' +
        'Please check your environment and try again.';

      session.messages.push({ role: 'assistant', content: errorMessage });

      return {
        sessionId: session.id,
        message: errorMessage,
        suggestedActions: ['Check configuration', 'Try again later', 'Ask for help'],
      };
    }
  }

  /**
   * Parse reconciliation options from a natural language message.
   */
  private parseReconciliationOptions(message: string): {
    rootDirectory?: string;
    mode?: 'full-scan' | 'delta';
    analyzeDocs?: boolean;
    maxTests?: number;
    qualityThreshold?: number;
  } {
    const options: {
      rootDirectory?: string;
      mode?: 'full-scan' | 'delta';
      analyzeDocs?: boolean;
      maxTests?: number;
      qualityThreshold?: number;
    } = {};

    // Check for delta mode
    if (/delta|incremental|changes only/i.test(message)) {
      options.mode = 'delta';
    }

    // Check for max tests limit
    const maxTestsMatch = message.match(/max(?:imum)?\s*(\d+)\s*tests?/i);
    if (maxTestsMatch) {
      options.maxTests = parseInt(maxTestsMatch[1], 10);
    }

    // Check for quality threshold
    const qualityMatch = message.match(/quality\s*(?:threshold|score)?\s*(?:of|at|above)?\s*(\d+)/i);
    if (qualityMatch) {
      options.qualityThreshold = parseInt(qualityMatch[1], 10);
    }

    // Check for directory path
    const dirMatch = message.match(/(?:in|at|from)\s+(?:directory|path|folder)?\s*['""]?([./\w-]+)['""]?/i);
    if (dirMatch && dirMatch[1] !== 'delta') {
      options.rootDirectory = dirMatch[1];
    }

    return options;
  }

  /**
   * Direct tool-calling implementation (original approach)
   * Used as fallback when graph-based agent is disabled or fails
   */
  private async chatWithDirectTools(
    request: ChatRequestDto,
    session: ChatSession,
    startTime: number,
  ): Promise<ChatResponseDto> {
    try {
      // Get all available tools from registry
      const availableTools = this.toolRegistry.getAllTools();
      const toolNames = availableTools.map((t) => t.name);

      // Build messages for LLM
      const messages = [
        { role: 'system' as const, content: getSystemPrompt(toolNames) },
        ...session.messages,
      ];

      // Call LLM with tools
      const response = await this.llmService.invoke({
        messages,
        tools: availableTools,
        taskType: AgentTaskType.CHAT,
        agentName: 'chat-agent',
        purpose: 'conversational-interface',
        temperature: 0.7,
      });

      // Get tool calls from response (if any)
      const toolCalls: ToolCallDto[] = (response.toolCalls || []).map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      }));
      const text = response.content;

      // Execute tool calls if any
      const toolResults: ToolResultDto[] = [];
      let finalText = text;

      if (toolCalls.length > 0) {
        // Execute all tool calls
        for (const toolCall of toolCalls) {
          const result = await this.executeTool(toolCall);
          toolResults.push(result);
        }

        // Build follow-up messages with tool results
        const followUpMessages: LLMRequest['messages'] = [
          ...messages,
          {
            role: 'assistant' as const,
            content: text || '',
            toolCalls: toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
            })),
          },
        ];

        // Add tool result messages
        for (const result of toolResults) {
          followUpMessages.push({
            role: 'tool' as const,
            content: result.success
              ? JSON.stringify(result.result)
              : `Error: ${typeof result.result === 'string' ? result.result : JSON.stringify(result.result)}`,
            toolCallId: result.toolCallId,
          });
        }

        // Generate follow-up response with tool results
        const followUpResponse = await this.llmService.invoke({
          messages: followUpMessages,
          tools: availableTools,
          taskType: AgentTaskType.CHAT,
          agentName: 'chat-agent',
          purpose: 'tool-result-summary',
          temperature: 0.7,
        });

        finalText = followUpResponse.content;

        // Handle additional tool calls in follow-up if needed
        if (followUpResponse.toolCalls && followUpResponse.toolCalls.length > 0) {
          const additionalToolCalls = followUpResponse.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          }));

          for (const toolCall of additionalToolCalls) {
            const result = await this.executeTool(toolCall);
            toolResults.push(result);
          }

          // One more follow-up for nested tool calls
          const nestedMessages: LLMRequest['messages'] = [
            ...followUpMessages,
            {
              role: 'assistant' as const,
              content: followUpResponse.content,
              toolCalls: additionalToolCalls.map((tc) => ({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
              })),
            },
          ];

          for (const result of toolResults.slice(toolCalls.length)) {
            nestedMessages.push({
              role: 'tool' as const,
              content: result.success
                ? JSON.stringify(result.result)
                : `Error: ${typeof result.result === 'string' ? result.result : JSON.stringify(result.result)}`,
              toolCallId: result.toolCallId,
            });
          }

          // Continue with tools available - let LLM decide if more exploration needed
          // The LLM should naturally synthesize when it has enough data
          const continueResponse = await this.llmService.invoke({
            messages: nestedMessages,
            tools: availableTools,
            taskType: AgentTaskType.CHAT,
            agentName: 'chat-agent',
            purpose: 'continue-exploration',
            temperature: 0.7,
          });

          // If LLM wants more tools, we've hit our limit - synthesize
          if (continueResponse.toolCalls && continueResponse.toolCalls.length > 0) {
            nestedMessages.push({
              role: 'assistant' as const,
              content: continueResponse.content || '',
            });
            nestedMessages.push({
              role: 'user' as const,
              content: `Based on what you've gathered, please synthesize your findings into a clear answer. If you couldn't find specific data (like exact coverage numbers), acknowledge what's missing and explain how to get it.`,
            });

            const finalResponse = await this.llmService.invoke({
              messages: nestedMessages,
              tools: [],
              taskType: AgentTaskType.CHAT,
              agentName: 'chat-agent',
              purpose: 'final-summary',
              temperature: 0.7,
            });

            finalText = finalResponse.content;
          } else {
            finalText = continueResponse.content;
          }
        }
      }

      // Add assistant message to history
      session.messages.push({ role: 'assistant', content: finalText });

      // Generate suggested actions
      const suggestedActions = this.generateSuggestedActions(
        request.message,
        finalText,
        toolResults,
      );

      const latencyMs = Date.now() - startTime;
      this.logger.log(`Chat response generated in ${latencyMs}ms`);

      return {
        sessionId: session.id,
        message: finalText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
        suggestedActions,
      };
    } catch (error) {
      this.logger.error(`Chat error: ${error.message}`, error.stack);

      // Add error to session
      session.messages.push({
        role: 'assistant',
        content: `I encountered an error: ${error.message}`,
      });

      return {
        sessionId: session.id,
        message: `I'm sorry, I encountered an error processing your request: ${error.message}. Please try again or rephrase your question.`,
        suggestedActions: ['Try a simpler question', 'Search for atoms'],
      };
    }
  }

  /**
   * Get or create a session
   */
  private getOrCreateSession(sessionId?: string, context?: Record<string, unknown>): ChatSession {
    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      // Update context if provided
      if (context) {
        session.context = { ...session.context, ...context };
      }
      return session;
    }

    // Create new session
    const newSession: ChatSession = {
      id: sessionId || uuidv4(),
      messages: [],
      createdAt: new Date(),
      lastActivityAt: new Date(),
      context: context || {},
    };

    this.sessions.set(newSession.id, newSession);
    this.logger.log(`Created new chat session: ${newSession.id}`);

    return newSession;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupSessions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt.getTime() > this.SESSION_TIMEOUT_MS) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired chat sessions`);
    }
  }

  /**
   * Execute a tool call using the tool registry
   */
  private async executeTool(toolCall: ToolCallDto): Promise<ToolResultDto> {
    this.logger.log(`Executing tool: ${toolCall.name}`);

    try {
      const result = await this.toolRegistry.executeTool(toolCall.name, toolCall.arguments);

      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result,
        success: true,
      };
    } catch (error) {
      this.logger.error(`Tool execution failed: ${error.message}`);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: error.message,
        success: false,
      };
    }
  }

  /**
   * Generate suggested follow-up actions
   */
  private generateSuggestedActions(
    userMessage: string,
    assistantMessage: string,
    toolResults: ToolResultDto[],
  ): string[] {
    const actions: string[] = [];

    // Check if we analyzed intent
    const analyzedIntent = toolResults.find((r) => r.name === 'analyze_intent' && r.success);
    if (analyzedIntent) {
      actions.push('Create an atom from this intent');
      actions.push('Refine the analysis further');
    }

    // Check if we searched atoms
    const searchedAtoms = toolResults.find((r) => r.name === 'search_atoms' && r.success);
    if (searchedAtoms) {
      actions.push('Search with different keywords');
      actions.push('Create a new atom');
    }

    // Check if we got atom details
    const gotAtom = toolResults.find((r) => r.name === 'get_atom' && r.success);
    if (gotAtom) {
      actions.push('Refine this atom');
      actions.push('Search for related atoms');
    }

    // Default suggestions if no tool was used
    if (actions.length === 0) {
      if (userMessage.toLowerCase().includes('help')) {
        actions.push('Analyze an intent');
        actions.push('Search existing atoms');
      } else {
        actions.push('Tell me more');
        actions.push('Search atoms');
      }
    }

    return actions.slice(0, 4); // Max 4 suggestions
  }

  /**
   * Get chat session history
   */
  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Export session as markdown
   */
  exportSessionAsMarkdown(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const lines: string[] = [
      '# Pact Chat Export',
      '',
      `**Session ID**: ${session.id}`,
      `**Created**: ${session.createdAt.toISOString()}`,
      `**Last Activity**: ${session.lastActivityAt.toISOString()}`,
      '',
      '---',
      '',
    ];

    for (const message of session.messages) {
      const role = message.role === 'user' ? '**You**' : '**Assistant**';
      lines.push(`${role}:`);
      lines.push('');
      lines.push(message.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }
}
