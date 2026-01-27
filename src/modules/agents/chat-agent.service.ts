/**
 * Chat Agent Service
 *
 * Conversational interface for Pact agents with tool/function calling.
 * Routes user requests to appropriate agents based on intent classification.
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../../common/llm/llm.service';
import { AgentTaskType } from '../../common/llm/providers/types';
import { AtomizationService } from './atomization.service';
import { IntentRefinementService } from './intent-refinement.service';
import { AtomsService } from '../atoms/atoms.service';
import { ChatRequestDto, ChatResponseDto, ToolCallDto, ToolResultDto } from './dto/chat-agent.dto';

/**
 * Tool definition for the chat agent
 */
interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

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
 * Available tools for the chat agent
 */
const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'analyze_intent',
    description: 'Analyze raw intent text for atomicity and suggest improvements',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'The raw intent text to analyze',
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'search_atoms',
    description: 'Search for existing atoms by description, tags, or category',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (description keywords)',
        },
        category: {
          type: 'string',
          description: 'Filter by category (functional, security, performance, etc.)',
        },
        status: {
          type: 'string',
          description: 'Filter by status (draft, committed, superseded)',
        },
      },
    },
  },
  {
    name: 'get_atom',
    description: 'Get details of a specific atom by ID or atom ID',
    parameters: {
      type: 'object',
      properties: {
        atomId: {
          type: 'string',
          description: 'The atom ID (e.g., IA-001) or UUID',
        },
      },
      required: ['atomId'],
    },
  },
  {
    name: 'refine_atom',
    description: 'Get refinement suggestions for an atom to improve its quality',
    parameters: {
      type: 'object',
      properties: {
        atomId: {
          type: 'string',
          description: 'The atom ID to refine',
        },
        feedback: {
          type: 'string',
          description: 'Optional feedback to guide refinement',
        },
      },
      required: ['atomId'],
    },
  },
  {
    name: 'create_atom',
    description: 'Create a new draft atom from a refined description',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'The atom description',
        },
        category: {
          type: 'string',
          description:
            'Atom category (functional, security, performance, reliability, usability, maintainability)',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
        },
      },
      required: ['description', 'category'],
    },
  },
];

/**
 * System prompt for the chat agent
 */
const SYSTEM_PROMPT = `You are Pact Assistant, a helpful AI that helps users manage intent atoms and validators for the Pact requirement management system.

Your capabilities:
- Analyze raw intent descriptions for atomicity (testable, indivisible behaviors)
- Search and retrieve existing atoms
- Suggest improvements to atom quality
- Create new atoms from refined descriptions
- Help users understand the Pact workflow

Key concepts:
- Intent Atoms: Atomic, testable behavioral requirements (e.g., "Users can log in with email and password")
- Quality Score: 0-100 rating based on specificity, testability, atomicity, independence, and value
- Commitment: Making an atom immutable (requires quality score >= 80)
- Supersession: Replacing a committed atom with an updated version

When users ask you to do something:
1. Use the appropriate tool if one matches their request
2. Provide clear, helpful explanations
3. Suggest follow-up actions when relevant

Always be concise but thorough. If you're unsure about something, ask for clarification.`;

@Injectable()
export class ChatAgentService {
  private readonly logger = new Logger(ChatAgentService.name);
  private sessions: Map<string, ChatSession> = new Map();

  // Session timeout (30 minutes)
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  constructor(
    private readonly llmService: LLMService,
    private readonly atomizationService: AtomizationService,
    private readonly refinementService: IntentRefinementService,
    private readonly atomsService: AtomsService,
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
      // Build messages for LLM
      const messages = [{ role: 'system' as const, content: SYSTEM_PROMPT }, ...session.messages];

      // Call LLM with tools
      const response = await this.llmService.invoke({
        messages,
        taskType: AgentTaskType.CHAT,
        agentName: 'chat-agent',
        purpose: 'conversational-interface',
        temperature: 0.7,
      });

      // Parse response for tool calls
      const { text, toolCalls } = this.parseResponse(response.content);

      // Execute tool calls if any
      const toolResults: ToolResultDto[] = [];
      let finalText = text;

      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const result = await this.executeTool(toolCall);
          toolResults.push(result);
        }

        // If we had tool calls, generate a follow-up response
        if (toolResults.length > 0) {
          const followUpMessages = [
            ...messages,
            { role: 'assistant' as const, content: response.content },
            {
              role: 'user' as const,
              content: `Tool results:\n${toolResults.map((r) => `${r.name}: ${r.success ? JSON.stringify(r.result) : 'Failed - ' + r.result}`).join('\n')}\n\nPlease summarize the results for the user.`,
            },
          ];

          const followUpResponse = await this.llmService.invoke({
            messages: followUpMessages,
            taskType: AgentTaskType.CHAT,
            agentName: 'chat-agent',
            purpose: 'tool-result-summary',
            temperature: 0.7,
          });

          finalText = followUpResponse.content;
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
   * Parse LLM response for tool calls
   */
  private parseResponse(content: string): {
    text: string;
    toolCalls: ToolCallDto[];
  } {
    const toolCalls: ToolCallDto[] = [];

    // Look for tool call patterns in the response
    // This is a simple implementation - in production, use proper function calling
    const toolCallPattern = /\[TOOL:(\w+)\]\s*({[^}]+})/g;
    let match;
    let cleanedText = content;

    while ((match = toolCallPattern.exec(content)) !== null) {
      const [fullMatch, toolName, argsJson] = match;
      try {
        const args = JSON.parse(argsJson);
        toolCalls.push({
          id: uuidv4(),
          name: toolName,
          arguments: args,
        });
        cleanedText = cleanedText.replace(fullMatch, '');
      } catch (e) {
        this.logger.warn(`Failed to parse tool call: ${fullMatch}`);
      }
    }

    return {
      text: cleanedText.trim(),
      toolCalls,
    };
  }

  /**
   * Execute a tool call
   */
  private async executeTool(toolCall: ToolCallDto): Promise<ToolResultDto> {
    this.logger.log(`Executing tool: ${toolCall.name}`);

    try {
      let result: unknown;

      switch (toolCall.name) {
        case 'analyze_intent':
          result = await this.atomizationService.atomizeIntent({
            intent: toolCall.arguments.intent as string,
          });
          break;

        case 'search_atoms':
          result = await this.atomsService.findAll({
            search: toolCall.arguments.query as string,
            category: toolCall.arguments.category as any,
            status: toolCall.arguments.status as any,
            limit: 5,
          });
          break;

        case 'get_atom': {
          const atomId = toolCall.arguments.atomId as string;
          // Try by atomId first, then by UUID
          const atoms = await this.atomsService.findAll({
            search: atomId,
            limit: 1,
          });
          result = atoms.items.length > 0 ? atoms.items[0] : null;
          break;
        }

        case 'refine_atom':
          result = await this.refinementService.suggestRefinements(
            toolCall.arguments.atomId as string,
          );
          break;

        case 'create_atom': {
          const tags = toolCall.arguments.tags
            ? (toolCall.arguments.tags as string).split(',').map((t) => t.trim())
            : [];
          result = await this.atomsService.create({
            description: toolCall.arguments.description as string,
            category: toolCall.arguments.category as any,
            tags,
          });
          break;
        }

        default:
          throw new Error(`Unknown tool: ${toolCall.name}`);
      }

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
