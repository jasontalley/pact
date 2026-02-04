import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConversationsService } from './conversations.service';
import { Conversation } from './conversation.entity';
import { ConversationMessage } from './conversation-message.entity';
import { LLMService } from '../../common/llm/llm.service';
import { NotFoundException } from '@nestjs/common';

describe('ConversationsService', () => {
  let service: ConversationsService;

  const mockConversation: Conversation = {
    id: 'conv-1',
    title: null,
    context: null,
    compactedSummary: null,
    messageCount: 0,
    isArchived: false,
    createdAt: new Date(),
    lastMessageAt: null,
    messages: [],
  };

  const mockConversationRepository = {
    create: jest.fn().mockImplementation((data) => ({ ...mockConversation, ...data })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMessageRepository = {
    create: jest.fn().mockImplementation((data) => ({
      id: 'msg-1',
      createdAt: new Date(),
      ...data,
    })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
  };

  const mockLlmService = {
    invoke: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: getRepositoryToken(Conversation), useValue: mockConversationRepository },
        { provide: getRepositoryToken(ConversationMessage), useValue: mockMessageRepository },
        { provide: LLMService, useValue: mockLlmService },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a conversation without title', async () => {
      const result = await service.create();

      expect(mockConversationRepository.create).toHaveBeenCalledWith({
        title: null,
        context: null,
        compactedSummary: null,
        messageCount: 0,
        isArchived: false,
        lastMessageAt: null,
      });
      expect(mockConversationRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create a conversation with title', async () => {
      const result = await service.create('My Conversation');

      expect(mockConversationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My Conversation' }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('addMessage', () => {
    it('should add a message and increment messageCount', async () => {
      const conv = { ...mockConversation, messageCount: 0 };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      const result = await service.addMessage('conv-1', 'user', 'Hello');

      expect(mockMessageRepository.create).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        metadata: null,
        isCompacted: false,
      });
      expect(mockMessageRepository.save).toHaveBeenCalled();
      expect(conv.messageCount).toBe(1);
      expect(conv.lastMessageAt).toBeDefined();
    });

    it('should auto-generate title from first user message', async () => {
      const conv = { ...mockConversation, messageCount: 0, title: null };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      await service.addMessage('conv-1', 'user', 'What is the best approach?');

      expect(conv.title).toBe('What is the best approach?');
    });

    it('should truncate long titles to 100 characters', async () => {
      const conv = { ...mockConversation, messageCount: 0, title: null };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      const longMessage = 'A'.repeat(200);
      await service.addMessage('conv-1', 'user', longMessage);

      expect(String(conv.title).length).toBe(100);
      expect(String(conv.title).endsWith('...')).toBe(true);
    });

    it('should not change title on subsequent messages', async () => {
      const conv = { ...mockConversation, messageCount: 1, title: 'Original title' };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      await service.addMessage('conv-1', 'user', 'Follow up');

      expect(conv.title).toBe('Original title');
    });

    it('should not set title from assistant messages', async () => {
      const conv = { ...mockConversation, messageCount: 0, title: null };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      await service.addMessage('conv-1', 'assistant', 'Hello, how can I help?');

      expect(conv.title).toBeNull();
    });

    it('should persist metadata when provided', async () => {
      const conv = { ...mockConversation, messageCount: 0 };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      const metadata = { toolCalls: ['list_atoms'], atomsReferenced: ['IA-001'] };
      await service.addMessage('conv-1', 'assistant', 'Here are the atoms', metadata);

      expect(mockMessageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata }),
      );
    });
  });

  describe('getMessages', () => {
    it('should return messages ordered by createdAt ASC', async () => {
      mockConversationRepository.findOne.mockResolvedValue(mockConversation);

      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockMessageRepository.createQueryBuilder.mockReturnValue(qb);

      await service.getMessages('conv-1');

      expect(qb.orderBy).toHaveBeenCalledWith('msg.createdAt', 'ASC');
    });

    it('should support pagination with limit and offset', async () => {
      mockConversationRepository.findOne.mockResolvedValue(mockConversation);

      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockMessageRepository.createQueryBuilder.mockReturnValue(qb);

      await service.getMessages('conv-1', { limit: 10, offset: 5 });

      expect(qb.skip).toHaveBeenCalledWith(5);
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('should throw NotFoundException for non-existent conversation', async () => {
      mockConversationRepository.findOne.mockResolvedValue(null);

      await expect(service.getMessages('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRecent', () => {
    it('should return recent non-archived conversations', async () => {
      mockConversationRepository.find.mockResolvedValue([mockConversation]);

      const result = await service.getRecent();

      expect(mockConversationRepository.find).toHaveBeenCalledWith({
        where: { isArchived: false },
        order: { lastMessageAt: { direction: 'DESC', nulls: 'LAST' } },
        take: 20,
      });
      expect(result).toHaveLength(1);
    });

    it('should respect custom limit', async () => {
      mockConversationRepository.find.mockResolvedValue([]);

      await service.getRecent(5);

      expect(mockConversationRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  describe('findById', () => {
    it('should return conversation by ID', async () => {
      mockConversationRepository.findOne.mockResolvedValue(mockConversation);

      const result = await service.findById('conv-1');

      expect(result).toEqual(mockConversation);
    });

    it('should throw NotFoundException when not found', async () => {
      mockConversationRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    it('should set isArchived to true', async () => {
      const conv = { ...mockConversation, isArchived: false };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      await service.archive('conv-1');

      expect(conv.isArchived).toBe(true);
      expect(mockConversationRepository.save).toHaveBeenCalled();
    });
  });

  describe('updateTitle', () => {
    it('should update the title', async () => {
      const conv = { ...mockConversation };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      await service.updateTitle('conv-1', 'New Title');

      expect(conv.title).toBe('New Title');
      expect(mockConversationRepository.save).toHaveBeenCalled();
    });
  });

  describe('updateContext', () => {
    it('should update the context', async () => {
      const conv = { ...mockConversation };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      await service.updateContext('conv-1', { mode: 'interview' });

      expect(conv.context).toEqual({ mode: 'interview' });
      expect(mockConversationRepository.save).toHaveBeenCalled();
    });
  });

  describe('summarizeConversation', () => {
    it('should call LLM with conversation messages', async () => {
      mockConversationRepository.findOne.mockResolvedValue(mockConversation);

      const messages = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'What atoms exist?',
          isCompacted: false,
          createdAt: new Date(),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'There are 3 atoms.',
          isCompacted: false,
          createdAt: new Date(),
        },
      ];

      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(messages),
      };
      mockMessageRepository.createQueryBuilder.mockReturnValue(qb);

      mockLlmService.invoke.mockResolvedValue({
        content: 'Summary of the conversation...',
        inputTokens: 100,
        outputTokens: 50,
      });

      const result = await service.summarizeConversation('conv-1');

      expect(result).toBe('Summary of the conversation...');
      expect(mockLlmService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'conversation-compaction',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' }),
          ]),
        }),
      );
    });

    it('should handle empty conversations', async () => {
      mockConversationRepository.findOne.mockResolvedValue(mockConversation);

      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockMessageRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.summarizeConversation('conv-1');

      expect(result).toBe('');
      expect(mockLlmService.invoke).not.toHaveBeenCalled();
    });
  });

  describe('compactConversation', () => {
    it('should mark old messages as compacted and save summary', async () => {
      const conv = { ...mockConversation, compactedSummary: null, messageCount: 60 };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      // Generate 60 messages
      const messages = Array.from({ length: 60 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        isCompacted: false,
        createdAt: new Date(Date.now() + i * 1000),
      }));

      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(messages),
      };
      mockMessageRepository.createQueryBuilder.mockReturnValue(qb);

      // Mock the update query builder for marking messages as compacted
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 10 }),
      };
      // Second call to createQueryBuilder is for the update
      mockMessageRepository.createQueryBuilder
        .mockReturnValueOnce(qb)
        .mockReturnValueOnce(updateQb);

      mockLlmService.invoke.mockResolvedValue({
        content: 'Compacted summary of old messages.',
        inputTokens: 100,
        outputTokens: 50,
      });

      const result = await service.compactConversation('conv-1', 50);

      expect(result).toBe('Compacted summary of old messages.');
      expect(conv.compactedSummary).toBe('Compacted summary of old messages.');
      expect(mockConversationRepository.save).toHaveBeenCalled();
    });

    it('should skip compaction if below threshold', async () => {
      const conv = { ...mockConversation, compactedSummary: null, messageCount: 10 };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      const messages = Array.from({ length: 10 }, (_, i) => ({
        id: `msg-${i}`,
        role: 'user',
        content: `Message ${i}`,
        isCompacted: false,
        createdAt: new Date(),
      }));

      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(messages),
      };
      mockMessageRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.compactConversation('conv-1', 50);

      expect(result).toBe('');
      expect(mockLlmService.invoke).not.toHaveBeenCalled();
    });
  });

  describe('needsCompaction', () => {
    it('should return true when uncompacted messages exceed threshold', async () => {
      mockMessageRepository.count.mockResolvedValue(60);

      const result = await service.needsCompaction('conv-1', 50);

      expect(result).toBe(true);
      expect(mockMessageRepository.count).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1', isCompacted: false },
      });
    });

    it('should return false when uncompacted messages are at or below threshold', async () => {
      mockMessageRepository.count.mockResolvedValue(30);

      const result = await service.needsCompaction('conv-1', 50);

      expect(result).toBe(false);
    });
  });

  describe('search', () => {
    it('should search by title', async () => {
      const titleQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ ...mockConversation, title: 'Auth flow' }]),
      };

      const messageQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockConversationRepository.createQueryBuilder = jest.fn().mockReturnValue(titleQb);
      mockMessageRepository.createQueryBuilder.mockReturnValue(messageQb);

      const result = await service.search('Auth');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Auth flow');
      expect(titleQb.where).toHaveBeenCalledWith('conv.title ILIKE :query', {
        query: '%Auth%',
      });
    });

    it('should search by message content and combine results', async () => {
      const titleQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const messageQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ conversationId: 'conv-2' }]),
      };

      const additionalQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValue([{ ...mockConversation, id: 'conv-2', title: 'Found in messages' }]),
      };

      mockConversationRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValueOnce(titleQb)
        .mockReturnValueOnce(additionalQb);
      mockMessageRepository.createQueryBuilder.mockReturnValue(messageQb);

      const result = await service.search('password reset');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('conv-2');
    });
  });

  describe('getMessagesWithCompaction', () => {
    it('should return summary and non-compacted messages', async () => {
      const conv = { ...mockConversation, compactedSummary: 'Previous context summary' };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      const nonCompactedMessages = [
        {
          id: 'msg-50',
          role: 'user',
          content: 'Recent question',
          isCompacted: false,
          createdAt: new Date(),
        },
        {
          id: 'msg-51',
          role: 'assistant',
          content: 'Recent answer',
          isCompacted: false,
          createdAt: new Date(),
        },
      ];

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(nonCompactedMessages),
      };
      mockMessageRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMessagesWithCompaction('conv-1');

      expect(result.summary).toBe('Previous context summary');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe('Recent question');
      expect(qb.andWhere).toHaveBeenCalledWith('msg.isCompacted = false');
    });

    it('should return null summary when no compaction has occurred', async () => {
      const conv = { ...mockConversation, compactedSummary: null };
      mockConversationRepository.findOne.mockResolvedValue(conv);

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockMessageRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMessagesWithCompaction('conv-1');

      expect(result.summary).toBeNull();
      expect(result.messages).toHaveLength(0);
    });
  });
});
