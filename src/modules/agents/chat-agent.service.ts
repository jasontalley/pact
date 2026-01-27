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
import { ChatRequestDto, ChatResponseDto, ToolCallDto, ToolResultDto } from './dto/chat-agent.dto';
import { ToolRegistryService } from './tools/tool-registry.service';

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
 */
const getSystemPrompt = (
  availableTools: string[],
): string => `You are Pact Assistant, a helpful AI that helps users manage intent atoms and validators for the Pact requirement management system.

Your capabilities:
- Analyze raw intent descriptions for atomicity (testable, indivisible behaviors)
- Search, list, and retrieve existing atoms
- Get statistics and counts about atoms
- Suggest improvements to atom quality
- Create, update, commit, and delete atoms
- Read and explore files in the codebase
- Search for code patterns and text
- Help users understand the Pact workflow

Key concepts:
- Intent Atoms: Atomic, testable behavioral requirements (e.g., "Users can log in with email and password")
- Quality Score: 0-100 rating based on specificity, testability, atomicity, independence, and value
- Commitment: Making an atom immutable (requires quality score >= 80)
- Supersession: Replacing a committed atom with an updated version

Available tools: ${availableTools.join(', ')}

When users ask you to do something:
1. Use the appropriate tool(s) to get the information you need
2. Provide clear, helpful explanations based on tool results
3. Suggest follow-up actions when relevant

Always use tools when you need data. For example:
- "How many atoms?" → use count_atoms
- "Show me atoms about authentication" → use search_atoms with query "authentication"
- "What's the status of IA-001?" → use get_atom with atomId "IA-001"
- "Show me the chat-agent.service.ts file" → use read_file with file_path "src/modules/agents/chat-agent.service.ts"
- "Search for AtomsService" → use grep with pattern "AtomsService"

Be concise but thorough. If you're unsure about something, ask for clarification.`;

@Injectable()
export class ChatAgentService {
  private readonly logger = new Logger(ChatAgentService.name);
  private sessions: Map<string, ChatSession> = new Map();

  // Session timeout (30 minutes)
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  constructor(
    private readonly llmService: LLMService,
    private readonly toolRegistry: ToolRegistryService,
  ) {
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

    // Add user message to history
    session.messages.push({ role: 'user', content: request.message });
    session.lastActivityAt = new Date();

    this.logger.log(`Chat request in session ${session.id}: ${request.message.slice(0, 50)}...`);

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
      let needsFollowUp = false;

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
        needsFollowUp = true;

        // Handle additional tool calls in follow-up if needed
        if (followUpResponse.toolCalls && followUpResponse.toolCalls.length > 0) {
          // Recursively handle tool calls (limit recursion depth)
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

          const finalResponse = await this.llmService.invoke({
            messages: nestedMessages,
            tools: availableTools,
            taskType: AgentTaskType.CHAT,
            agentName: 'chat-agent',
            purpose: 'final-summary',
            temperature: 0.7,
          });

          finalText = finalResponse.content;
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
