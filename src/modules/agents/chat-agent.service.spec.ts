/**
 * Chat Agent Service Tests
 *
 * Tests for the conversational agent interface with comprehensive coverage of:
 * - Message processing
 * - Session management
 * - Tool execution
 * - Suggested actions generation
 * - Export functionality
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ChatAgentService } from './chat-agent.service';
import { LLMService } from '../../common/llm/llm.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { ChatRequestDto } from './dto/chat-agent.dto';
import { ToolDefinition } from '../../common/llm/providers/types';

describe('ChatAgentService', () => {
  let service: ChatAgentService;
  let mockLLMService: jest.Mocked<LLMService>;
  let mockToolRegistry: jest.Mocked<ToolRegistryService>;

  // Helper to create complete mock LLM response
  const createMockLLMResponse = (
    content: string,
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  ) => ({
    requestId: 'test-request-123',
    content,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    cost: 0.001,
    latencyMs: 500,
    cacheHit: false,
    retryCount: 0,
    modelUsed: 'claude-sonnet-4-5',
    providerUsed: 'anthropic',
    toolCalls,
  });

  const mockTools: ToolDefinition[] = [
    {
      name: 'search_atoms',
      description: 'Search for atoms',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
    {
      name: 'count_atoms',
      description: 'Count atoms',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_atom',
      description: 'Get a specific atom',
      parameters: {
        type: 'object',
        properties: {
          atomId: { type: 'string', description: 'Atom ID' },
        },
        required: ['atomId'],
      },
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });

    mockLLMService = {
      invoke: jest.fn().mockResolvedValue(createMockLLMResponse('Hello! How can I help you?')),
    } as unknown as jest.Mocked<LLMService>;

    mockToolRegistry = {
      getAllTools: jest.fn().mockReturnValue(mockTools),
      executeTool: jest.fn().mockResolvedValue({ success: true, data: 'tool result' }),
      getTool: jest
        .fn()
        .mockImplementation((name: string) => mockTools.find((t) => t.name === name)),
      registerTool: jest.fn(),
      getToolsByCategory: jest.fn().mockReturnValue(mockTools),
    } as unknown as jest.Mocked<ToolRegistryService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatAgentService,
        { provide: LLMService, useValue: mockLLMService },
        { provide: ToolRegistryService, useValue: mockToolRegistry },
      ],
    }).compile();

    service = module.get<ChatAgentService>(ChatAgentService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // @atom IA-008
  describe('chat - basic messaging', () => {
    it('should process a basic chat message', async () => {
      const request: ChatRequestDto = {
        message: 'Hello, what can you help me with?',
      };

      const response = await service.chat(request);

      expect(response).toBeDefined();
      expect(response.sessionId).toBeDefined();
      expect(response.message).toBeDefined();
      expect(mockLLMService.invoke).toHaveBeenCalled();
    });

    it('should create a new session for first message', async () => {
      const request: ChatRequestDto = {
        message: 'Hello',
      };

      const response = await service.chat(request);

      expect(response.sessionId).toBeDefined();
      expect(typeof response.sessionId).toBe('string');
      expect(response.sessionId.length).toBeGreaterThan(0);
    });

    it('should maintain existing session when sessionId provided', async () => {
      // First message
      const firstResponse = await service.chat({ message: 'Hello' });
      const sessionId = firstResponse.sessionId;

      // Second message with same session
      const secondResponse = await service.chat({
        message: 'Tell me more',
        sessionId,
      });

      expect(secondResponse.sessionId).toBe(sessionId);
    });

    it('should include suggested actions in response', async () => {
      const request: ChatRequestDto = {
        message: 'Hello',
      };

      const response = await service.chat(request);

      expect(response.suggestedActions).toBeDefined();
      expect(Array.isArray(response.suggestedActions)).toBe(true);
    });

    it('should include context in session', async () => {
      const request: ChatRequestDto = {
        message: 'Hello',
        context: { atomId: 'IA-001' },
      };

      const response = await service.chat(request);
      const session = service.getSession(response.sessionId);

      expect(session?.context).toEqual({ atomId: 'IA-001' });
    });
  });

  // @atom IA-008
  describe('chat - tool execution', () => {
    it('should handle tool calls from LLM response', async () => {
      // Mock LLM to return a response with tool calls
      mockLLMService.invoke
        .mockResolvedValueOnce(
          createMockLLMResponse('Let me search for that.', [
            { id: 'call-1', name: 'search_atoms', arguments: { query: 'authentication' } },
          ]),
        )
        .mockResolvedValueOnce(
          createMockLLMResponse('I found some atoms related to authentication.'),
        );

      mockToolRegistry.executeTool.mockResolvedValueOnce({
        items: [{ atomId: 'IA-001', description: 'User authentication' }],
        total: 1,
      });

      const response = await service.chat({ message: 'Search for authentication atoms' });

      expect(mockToolRegistry.executeTool).toHaveBeenCalledWith('search_atoms', {
        query: 'authentication',
      });
      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.[0].name).toBe('search_atoms');
    });

    it('should include tool results in response', async () => {
      mockLLMService.invoke
        .mockResolvedValueOnce(
          createMockLLMResponse('Counting atoms...', [
            { id: 'call-1', name: 'count_atoms', arguments: {} },
          ]),
        )
        .mockResolvedValueOnce(createMockLLMResponse('There are 10 atoms in the system.'));

      mockToolRegistry.executeTool.mockResolvedValueOnce({ count: 10 });

      const response = await service.chat({ message: 'How many atoms do we have?' });

      expect(response.toolResults).toBeDefined();
      expect(response.toolResults?.length).toBeGreaterThan(0);
    });

    it('should handle tool execution errors gracefully', async () => {
      mockLLMService.invoke
        .mockResolvedValueOnce(
          createMockLLMResponse('Searching...', [
            { id: 'call-1', name: 'search_atoms', arguments: { query: 'test' } },
          ]),
        )
        .mockResolvedValueOnce(createMockLLMResponse('I encountered an error while searching.'));

      mockToolRegistry.executeTool.mockRejectedValueOnce(new Error('Database error'));

      const response = await service.chat({ message: 'Search for test' });

      // Should not throw, should handle gracefully
      expect(response).toBeDefined();
      expect(response.toolResults).toBeDefined();
      if (response.toolResults) {
        expect(response.toolResults[0].success).toBe(false);
      }
    });

    it('should handle multiple tool calls in sequence', async () => {
      mockLLMService.invoke
        .mockResolvedValueOnce(
          createMockLLMResponse('Let me get that information.', [
            { id: 'call-1', name: 'count_atoms', arguments: {} },
            { id: 'call-2', name: 'search_atoms', arguments: { query: 'auth' } },
          ]),
        )
        .mockResolvedValueOnce(createMockLLMResponse('Here is the summary.'));

      mockToolRegistry.executeTool
        .mockResolvedValueOnce({ count: 5 })
        .mockResolvedValueOnce({ items: [], total: 0 });

      const response = await service.chat({ message: 'Show me stats and search for auth' });

      expect(mockToolRegistry.executeTool).toHaveBeenCalledTimes(2);
      expect(response.toolCalls?.length).toBe(2);
    });
  });

  // @atom IA-008
  describe('chat - suggested actions', () => {
    it('should provide suggested actions', async () => {
      const response = await service.chat({ message: 'Hello' });

      expect(response.suggestedActions).toBeDefined();
      expect(Array.isArray(response.suggestedActions)).toBe(true);
    });

    it('should limit suggestions to 4 items', async () => {
      const response = await service.chat({ message: 'Hello' });

      expect(response.suggestedActions?.length).toBeLessThanOrEqual(4);
    });
  });

  // @atom IA-008
  describe('chat - error handling', () => {
    it('should handle LLM errors gracefully', async () => {
      mockLLMService.invoke.mockRejectedValueOnce(new Error('LLM unavailable'));

      const response = await service.chat({ message: 'Hello' });

      expect(response.message).toContain('error');
      expect(response.suggestedActions).toContain('Try a simpler question');
    });

    it('should preserve session on error', async () => {
      // First successful message
      const first = await service.chat({ message: 'Hello' });
      const sessionId = first.sessionId;

      // Second message fails
      mockLLMService.invoke.mockRejectedValueOnce(new Error('Error'));
      await service.chat({ message: 'test', sessionId });

      // Session should still exist
      const session = service.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.messages.length).toBeGreaterThan(0);
    });
  });

  // @atom IA-008
  describe('getSession', () => {
    it('should return existing session', async () => {
      const response = await service.chat({ message: 'Hello' });

      const session = service.getSession(response.sessionId);

      expect(session).toBeDefined();
      expect(session?.id).toBe(response.sessionId);
    });

    it('should return undefined for non-existent session', () => {
      const session = service.getSession('non-existent-id');

      expect(session).toBeUndefined();
    });

    it('should include message history', async () => {
      const response = await service.chat({ message: 'Hello' });
      await service.chat({ message: 'Follow up', sessionId: response.sessionId });

      const session = service.getSession(response.sessionId);

      expect(session?.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  // @atom IA-008
  describe('exportSessionAsMarkdown', () => {
    it('should export session as markdown', async () => {
      const response = await service.chat({ message: 'Hello' });

      const markdown = service.exportSessionAsMarkdown(response.sessionId);

      expect(markdown).toContain('# Pact Chat Export');
      expect(markdown).toContain('**Session ID**');
      expect(markdown).toContain('**You**');
      expect(markdown).toContain('Hello');
    });

    it('should include all messages in export', async () => {
      const first = await service.chat({ message: 'First message' });
      await service.chat({ message: 'Second message', sessionId: first.sessionId });

      const markdown = service.exportSessionAsMarkdown(first.sessionId);

      expect(markdown).toContain('First message');
      expect(markdown).toContain('Second message');
    });

    it('should throw for non-existent session', () => {
      expect(() => {
        service.exportSessionAsMarkdown('non-existent');
      }).toThrow('Session non-existent not found');
    });

    it('should include timestamps', async () => {
      const response = await service.chat({ message: 'Hello' });

      const markdown = service.exportSessionAsMarkdown(response.sessionId);

      expect(markdown).toContain('**Created**');
      expect(markdown).toContain('**Last Activity**');
    });
  });

  // @atom IA-008
  describe('session timeout', () => {
    it('should clean up expired sessions', async () => {
      const response = await service.chat({ message: 'Hello' });
      const sessionId = response.sessionId;

      // Verify session exists
      expect(service.getSession(sessionId)).toBeDefined();

      // Advance time past session timeout (30 minutes)
      jest.advanceTimersByTime(31 * 60 * 1000);

      // Trigger cleanup (runs every 5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Session should be cleaned up
      expect(service.getSession(sessionId)).toBeUndefined();
    });
  });

  // @atom IA-008
  describe('multi-turn conversations', () => {
    it('should maintain context across turns', async () => {
      const first = await service.chat({ message: 'Hello' });
      await service.chat({
        message: 'Tell me more',
        sessionId: first.sessionId,
      });

      // LLM should be called with conversation history
      const lastCall =
        mockLLMService.invoke.mock.calls[mockLLMService.invoke.mock.calls.length - 1];
      expect(lastCall[0].messages.length).toBeGreaterThan(2); // System + previous messages + current
    });

    it('should update lastActivityAt on each message', async () => {
      const first = await service.chat({ message: 'Hello' });
      const sessionId = first.sessionId;

      const sessionBefore = service.getSession(sessionId);
      const timeBefore = sessionBefore?.lastActivityAt;

      // Advance time
      jest.advanceTimersByTime(1000);

      await service.chat({ message: 'Follow up', sessionId });

      const sessionAfter = service.getSession(sessionId);
      expect(sessionAfter?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(timeBefore!.getTime());
    });
  });

  // @atom IA-008
  describe('LLM request configuration', () => {
    it('should use CHAT task type', async () => {
      await service.chat({ message: 'Hello' });

      expect(mockLLMService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'chat',
          agentName: 'chat-agent',
        }),
      );
    });

    it('should use appropriate temperature for chat', async () => {
      await service.chat({ message: 'Hello' });

      expect(mockLLMService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        }),
      );
    });

    it('should pass tools to LLM', async () => {
      await service.chat({ message: 'Hello' });

      expect(mockLLMService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: mockTools,
        }),
      );
    });
  });
});
