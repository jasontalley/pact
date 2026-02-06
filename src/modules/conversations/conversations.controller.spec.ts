import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { Conversation } from './conversation.entity';
import { ConversationMessage } from './conversation-message.entity';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let service: jest.Mocked<ConversationsService>;

  const mockConversation: Conversation = {
    id: 'conv-uuid-1',
    title: 'Test Conversation',
    context: null,
    compactedSummary: null,
    messageCount: 3,
    isArchived: false,
    createdAt: new Date('2026-01-01'),
    lastMessageAt: new Date('2026-01-02'),
    messages: [],
  };

  const mockMessage: ConversationMessage = {
    id: 'msg-uuid-1',
    conversationId: 'conv-uuid-1',
    conversation: mockConversation,
    role: 'user',
    content: 'Hello there',
    metadata: null,
    isCompacted: false,
    createdAt: new Date('2026-01-02'),
  };

  beforeEach(async () => {
    const mockService: Partial<Record<keyof ConversationsService, jest.Mock>> = {
      create: jest.fn(),
      getRecent: jest.fn(),
      search: jest.fn(),
      findById: jest.fn(),
      getMessages: jest.fn(),
      updateTitle: jest.fn(),
      archive: jest.fn(),
      compactConversation: jest.fn(),
      getMessagesWithCompaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        {
          provide: ConversationsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ConversationsController>(ConversationsController);
    service = module.get(ConversationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a conversation with a title', async () => {
      service.create.mockResolvedValue(mockConversation);

      const result = await controller.create('Test Conversation');

      expect(service.create).toHaveBeenCalledWith('Test Conversation');
      expect(result).toEqual(mockConversation);
    });

    it('should create a conversation without a title', async () => {
      const noTitleConv = { ...mockConversation, title: null };
      service.create.mockResolvedValue(noTitleConv);

      const result = await controller.create(undefined);

      expect(service.create).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(noTitleConv);
    });
  });

  describe('getRecent', () => {
    it('should return recent conversations with default limit', async () => {
      const conversations = [mockConversation];
      service.getRecent.mockResolvedValue(conversations);

      const result = await controller.getRecent(undefined);

      expect(service.getRecent).toHaveBeenCalledWith(20);
      expect(result).toEqual(conversations);
    });

    it('should return recent conversations with a custom limit', async () => {
      const conversations = [mockConversation];
      service.getRecent.mockResolvedValue(conversations);

      const result = await controller.getRecent('5');

      expect(service.getRecent).toHaveBeenCalledWith(5);
      expect(result).toEqual(conversations);
    });
  });

  describe('search', () => {
    it('should search conversations with query only', async () => {
      const conversations = [mockConversation];
      service.search.mockResolvedValue(conversations);

      const result = await controller.search('test', undefined, undefined);

      expect(service.search).toHaveBeenCalledWith('test', {
        limit: undefined,
        includeArchived: false,
      });
      expect(result).toEqual(conversations);
    });

    it('should search conversations with limit', async () => {
      service.search.mockResolvedValue([]);

      await controller.search('query', '10', undefined);

      expect(service.search).toHaveBeenCalledWith('query', {
        limit: 10,
        includeArchived: false,
      });
    });

    it('should search conversations including archived', async () => {
      service.search.mockResolvedValue([]);

      await controller.search('query', undefined, 'true');

      expect(service.search).toHaveBeenCalledWith('query', {
        limit: undefined,
        includeArchived: true,
      });
    });

    it('should treat non-true includeArchived as false', async () => {
      service.search.mockResolvedValue([]);

      await controller.search('query', undefined, 'false');

      expect(service.search).toHaveBeenCalledWith('query', {
        limit: undefined,
        includeArchived: false,
      });
    });

    it('should pass both limit and includeArchived', async () => {
      service.search.mockResolvedValue([mockConversation]);

      const result = await controller.search('test', '15', 'true');

      expect(service.search).toHaveBeenCalledWith('test', {
        limit: 15,
        includeArchived: true,
      });
      expect(result).toEqual([mockConversation]);
    });
  });

  describe('findOne', () => {
    it('should return a conversation by ID', async () => {
      service.findById.mockResolvedValue(mockConversation);

      const result = await controller.findOne('conv-uuid-1');

      expect(service.findById).toHaveBeenCalledWith('conv-uuid-1');
      expect(result).toEqual(mockConversation);
    });
  });

  describe('getMessages', () => {
    it('should return messages with default options', async () => {
      const messages = [mockMessage];
      service.getMessages.mockResolvedValue(messages);

      const result = await controller.getMessages('conv-uuid-1', undefined, undefined);

      expect(service.getMessages).toHaveBeenCalledWith('conv-uuid-1', {
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual(messages);
    });

    it('should return messages with limit and offset', async () => {
      service.getMessages.mockResolvedValue([mockMessage]);

      await controller.getMessages('conv-uuid-1', '10', '5');

      expect(service.getMessages).toHaveBeenCalledWith('conv-uuid-1', {
        limit: 10,
        offset: 5,
      });
    });

    it('should return messages with only limit', async () => {
      service.getMessages.mockResolvedValue([]);

      await controller.getMessages('conv-uuid-1', '25', undefined);

      expect(service.getMessages).toHaveBeenCalledWith('conv-uuid-1', {
        limit: 25,
        offset: undefined,
      });
    });

    it('should return messages with only offset', async () => {
      service.getMessages.mockResolvedValue([]);

      await controller.getMessages('conv-uuid-1', undefined, '10');

      expect(service.getMessages).toHaveBeenCalledWith('conv-uuid-1', {
        limit: undefined,
        offset: 10,
      });
    });
  });

  describe('updateTitle', () => {
    it('should update the conversation title', async () => {
      service.updateTitle.mockResolvedValue(undefined);

      await controller.updateTitle('conv-uuid-1', 'New Title');

      expect(service.updateTitle).toHaveBeenCalledWith('conv-uuid-1', 'New Title');
    });
  });

  describe('archive', () => {
    it('should archive a conversation', async () => {
      service.archive.mockResolvedValue(undefined);

      await controller.archive('conv-uuid-1');

      expect(service.archive).toHaveBeenCalledWith('conv-uuid-1');
    });
  });

  describe('compact', () => {
    it('should compact a conversation with default threshold', async () => {
      service.compactConversation.mockResolvedValue('Summary of older messages');

      const result = await controller.compact('conv-uuid-1', undefined);

      expect(service.compactConversation).toHaveBeenCalledWith('conv-uuid-1', undefined);
      expect(result).toEqual({ summary: 'Summary of older messages' });
    });

    it('should compact a conversation with custom threshold', async () => {
      service.compactConversation.mockResolvedValue('Compact summary');

      const result = await controller.compact('conv-uuid-1', '30');

      expect(service.compactConversation).toHaveBeenCalledWith('conv-uuid-1', 30);
      expect(result).toEqual({ summary: 'Compact summary' });
    });
  });

  describe('getCompactedMessages', () => {
    it('should return compacted messages with default options', async () => {
      const compactedResult = {
        summary: 'Previous summary',
        messages: [mockMessage],
      };
      service.getMessagesWithCompaction.mockResolvedValue(compactedResult);

      const result = await controller.getCompactedMessages('conv-uuid-1', undefined);

      expect(service.getMessagesWithCompaction).toHaveBeenCalledWith('conv-uuid-1', {
        limit: undefined,
      });
      expect(result).toEqual(compactedResult);
    });

    it('should return compacted messages with limit', async () => {
      const compactedResult = {
        summary: null,
        messages: [],
      };
      service.getMessagesWithCompaction.mockResolvedValue(compactedResult);

      const result = await controller.getCompactedMessages('conv-uuid-1', '20');

      expect(service.getMessagesWithCompaction).toHaveBeenCalledWith('conv-uuid-1', {
        limit: 20,
      });
      expect(result).toEqual(compactedResult);
    });
  });
});
