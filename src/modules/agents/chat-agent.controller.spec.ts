/**
 * Chat Agent Controller Tests
 *
 * @atom IA-008 - Chat agent provides conversational interface for Pact interactions
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ChatAgentController } from './chat-agent.controller';
import { ChatAgentService } from './chat-agent.service';

describe('ChatAgentController', () => {
  let controller: ChatAgentController;
  let chatAgentService: jest.Mocked<ChatAgentService>;

  // Use fixed dates for deterministic testing
  const fixedDate = new Date('2026-01-30T10:00:00Z');
  const mockSession = {
    id: 'session-123',
    createdAt: fixedDate,
    lastActivityAt: fixedDate,
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ],
    context: { atoms: [], focusedAtomId: null },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatAgentController],
      providers: [
        {
          provide: ChatAgentService,
          useValue: {
            chat: jest.fn(),
            getSession: jest.fn(),
            exportSessionAsMarkdown: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ChatAgentController>(ChatAgentController);
    chatAgentService = module.get(ChatAgentService);
  });

  describe('chat', () => {
    /**
     * @atom IA-008
     * Chat endpoint must forward messages to service and return response
     */
    it('should send message and return response', async () => {
      const request = {
        message: 'Analyze this intent',
        sessionId: 'session-123',
      };
      const response = {
        sessionId: 'session-123',
        message: 'Here is my analysis...',
        suggestions: [],
      };

      chatAgentService.chat.mockResolvedValue(response);

      const result = await controller.chat(request);

      // Response should match the service's response
      expect(result).toEqual(response);
      // Service should be called with the original request
      expect(chatAgentService.chat).toHaveBeenCalledWith(request);
    });
  });

  describe('getSession', () => {
    /**
     * @atom IA-008
     * Session endpoint must return session details including message count
     */
    it('should return session details when found', () => {
      chatAgentService.getSession.mockReturnValue(mockSession as any);

      const result = controller.getSession('session-123');

      // Session ID should be included in response
      expect(result.id).toBe('session-123');
      // Message count should reflect actual messages in session
      expect(result.messageCount).toBe(2);
      // Messages array should be passed through from session
      expect(result.messages).toEqual(mockSession.messages);
      // Service should be called with the session ID
      expect(chatAgentService.getSession).toHaveBeenCalledWith('session-123');
    });

    /**
     * @atom IA-008
     * Session endpoint must throw NotFoundException for missing sessions
     */
    it('should throw NotFoundException when session not found', () => {
      chatAgentService.getSession.mockReturnValue(undefined);

      // Attempting to get non-existent session should throw NotFoundException
      expect(() => controller.getSession('non-existent')).toThrow(NotFoundException);
    });
  });

  describe('exportSession', () => {
    /**
     * @atom IA-008
     * Export endpoint must support markdown format
     */
    it('should export session as markdown by default', () => {
      chatAgentService.getSession.mockReturnValue(mockSession as any);
      chatAgentService.exportSessionAsMarkdown.mockReturnValue('# Chat Session\n...');

      const result = controller.exportSession('session-123', 'markdown');

      // Content should be the markdown string from service
      expect(result.content).toBe('# Chat Session\n...');
      // Content type should indicate markdown
      expect(result.contentType).toBe('text/markdown');
      // Service should be called to generate markdown
      expect(chatAgentService.exportSessionAsMarkdown).toHaveBeenCalledWith('session-123');
    });

    /**
     * @atom IA-008
     * Export endpoint must support JSON format with session data
     */
    it('should export session as JSON when format is json', () => {
      chatAgentService.getSession.mockReturnValue(mockSession as any);

      const result = controller.exportSession('session-123', 'json');

      // JSON export should include session ID
      expect(result.id).toBe('session-123');
      // JSON export should include all messages
      expect(result.messages).toEqual(mockSession.messages);
      // JSON export should include session context
      expect(result.context).toEqual(mockSession.context);
    });

    /**
     * @atom IA-008
     * Export endpoint must throw NotFoundException for missing sessions
     */
    it('should throw NotFoundException when session not found', () => {
      chatAgentService.getSession.mockReturnValue(undefined);

      // Attempting to export non-existent session should throw NotFoundException
      expect(() => controller.exportSession('non-existent', 'markdown')).toThrow(
        NotFoundException,
      );
    });
  });
});
