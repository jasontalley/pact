import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './conversation.entity';
import { ConversationMessage, MessageRole } from './conversation-message.entity';
import { LLMService } from '../../common/llm/llm.service';
import { AgentTaskType } from '../../common/llm/providers/types';

/** Default threshold for auto-compaction (message count) */
const COMPACTION_THRESHOLD = 50;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly messageRepository: Repository<ConversationMessage>,
    @Optional() private readonly llmService?: LLMService,
  ) {}

  async create(title?: string): Promise<Conversation> {
    const conversation = this.conversationRepository.create({
      title: title ?? null,
      context: null,
      compactedSummary: null,
      messageCount: 0,
      isArchived: false,
      lastMessageAt: null,
    });

    return this.conversationRepository.save(conversation);
  }

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<ConversationMessage> {
    const conversation = await this.findById(conversationId);

    const message = this.messageRepository.create({
      conversationId,
      role,
      content,
      metadata: metadata ?? null,
      isCompacted: false,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Auto-generate title from first user message
    if (conversation.messageCount === 0 && role === 'user') {
      conversation.title = content.length > 100 ? content.substring(0, 97) + '...' : content;
    }

    // Update conversation counters
    conversation.messageCount++;
    conversation.lastMessageAt = new Date();
    await this.conversationRepository.save(conversation);

    return savedMessage;
  }

  async getMessages(
    conversationId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ConversationMessage[]> {
    // Verify conversation exists
    await this.findById(conversationId);

    const qb = this.messageRepository
      .createQueryBuilder('msg')
      .where('msg.conversationId = :conversationId', { conversationId })
      .orderBy('msg.createdAt', 'ASC');

    if (options?.offset) {
      qb.skip(options.offset);
    }

    if (options?.limit) {
      qb.take(options.limit);
    }

    return qb.getMany();
  }

  async getRecent(limit = 20): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { isArchived: false },
      order: { lastMessageAt: { direction: 'DESC', nulls: 'LAST' } },
      take: limit,
    });
  }

  async findById(id: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }

    return conversation;
  }

  async archive(id: string): Promise<void> {
    const conversation = await this.findById(id);
    conversation.isArchived = true;
    await this.conversationRepository.save(conversation);
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const conversation = await this.findById(id);
    conversation.title = title;
    await this.conversationRepository.save(conversation);
  }

  async updateContext(id: string, context: Record<string, unknown>): Promise<void> {
    const conversation = await this.findById(id);
    conversation.context = context;
    await this.conversationRepository.save(conversation);
  }

  // ========================================
  // Conversation Compaction
  // ========================================

  /**
   * Summarize a conversation using LLM.
   * Returns a concise summary of all messages in the conversation.
   */
  async summarizeConversation(conversationId: string): Promise<string> {
    if (!this.llmService) {
      throw new Error('LLM service not available for conversation summarization');
    }

    const messages = await this.getMessages(conversationId);
    if (messages.length === 0) {
      return '';
    }

    const conversationText = messages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');

    const response = await this.llmService.invoke({
      messages: [
        {
          role: 'system',
          content:
            'Summarize the following conversation concisely. Preserve key decisions, action items, ' +
            'and important context. Include any atoms, molecules, or intent artifacts discussed. ' +
            'Keep the summary under 500 words.',
        },
        {
          role: 'user',
          content: `Summarize this conversation:\n\n${conversationText}`,
        },
      ],
      agentName: 'conversation-compaction',
      purpose: 'Summarize conversation for compaction',
      taskType: AgentTaskType.SUMMARIZATION,
      temperature: 0.3,
    });

    return response.content || '';
  }

  /**
   * Compact a conversation: summarize old messages and mark them as compacted.
   * Messages older than the threshold are summarized and marked, while recent
   * messages remain available.
   *
   * @param conversationId - Conversation to compact
   * @param threshold - Number of recent messages to keep uncompacted (default: 50)
   * @returns The generated summary
   */
  async compactConversation(
    conversationId: string,
    threshold: number = COMPACTION_THRESHOLD,
  ): Promise<string> {
    const conversation = await this.findById(conversationId);
    const messages = await this.getMessages(conversationId);

    if (messages.length <= threshold) {
      this.logger.log(
        `Conversation ${conversationId} has ${messages.length} messages, below threshold ${threshold}. Skipping compaction.`,
      );
      return conversation.compactedSummary || '';
    }

    // Messages to compact (oldest ones beyond threshold)
    const messagesToCompact = messages.slice(0, messages.length - threshold);
    const messagesToKeep = messages.slice(messages.length - threshold);

    this.logger.log(
      `Compacting conversation ${conversationId}: ${messagesToCompact.length} messages → summary, keeping ${messagesToKeep.length} recent`,
    );

    // Build text from messages to compact
    const textToSummarize = messagesToCompact
      .filter((m) => !m.isCompacted)
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    if (!textToSummarize) {
      return conversation.compactedSummary || '';
    }

    // Generate summary
    let summary: string;
    if (this.llmService) {
      const existingSummary = conversation.compactedSummary || '';
      const promptContent = existingSummary
        ? `Previous summary:\n${existingSummary}\n\nNew messages to incorporate:\n${textToSummarize}`
        : textToSummarize;

      const response = await this.llmService.invoke({
        messages: [
          {
            role: 'system',
            content:
              'Create a concise summary of this conversation segment. If a previous summary is provided, ' +
              'incorporate the new messages into an updated summary. Preserve key decisions, action items, ' +
              'artifacts discussed (atoms, molecules), and important context. Keep under 500 words.',
          },
          {
            role: 'user',
            content: `Summarize:\n\n${promptContent}`,
          },
        ],
        agentName: 'conversation-compaction',
        purpose: 'Compact conversation by summarizing old messages',
        taskType: AgentTaskType.SUMMARIZATION,
        temperature: 0.3,
      });
      summary = response.content || textToSummarize.slice(0, 500);
    } else {
      // Fallback: simple truncation if no LLM available
      summary =
        textToSummarize.slice(0, 1000) + '\n\n[Truncated — LLM not available for summarization]';
    }

    // Mark old messages as compacted
    const compactIds = messagesToCompact.map((m) => m.id);
    if (compactIds.length > 0) {
      await this.messageRepository
        .createQueryBuilder()
        .update(ConversationMessage)
        .set({ isCompacted: true })
        .where('id IN (:...ids)', { ids: compactIds })
        .execute();
    }

    // Save compacted summary on the conversation
    conversation.compactedSummary = summary;
    await this.conversationRepository.save(conversation);

    return summary;
  }

  /**
   * Get messages for a conversation with compaction-aware loading.
   * Returns the compacted summary (if any) followed by non-compacted messages.
   */
  async getMessagesWithCompaction(
    conversationId: string,
    options?: { limit?: number },
  ): Promise<{ summary: string | null; messages: ConversationMessage[] }> {
    const conversation = await this.findById(conversationId);

    // Get only non-compacted messages
    const qb = this.messageRepository
      .createQueryBuilder('msg')
      .where('msg.conversationId = :conversationId', { conversationId })
      .andWhere('msg.isCompacted = false')
      .orderBy('msg.createdAt', 'ASC');

    if (options?.limit) {
      qb.take(options.limit);
    }

    const messages = await qb.getMany();

    return {
      summary: conversation.compactedSummary,
      messages,
    };
  }

  /**
   * Check if a conversation needs compaction based on message count.
   */
  async needsCompaction(
    conversationId: string,
    threshold: number = COMPACTION_THRESHOLD,
  ): Promise<boolean> {
    const uncompactedCount = await this.messageRepository.count({
      where: { conversationId, isCompacted: false },
    });
    return uncompactedCount > threshold;
  }

  // ========================================
  // Conversation Search
  // ========================================

  /**
   * Search conversations by title or message content.
   */
  async search(
    query: string,
    options?: { limit?: number; includeArchived?: boolean },
  ): Promise<Conversation[]> {
    const limit = options?.limit ?? 20;

    const qb = this.conversationRepository
      .createQueryBuilder('conv')
      .where('conv.title ILIKE :query', { query: `%${query}%` })
      .orderBy('conv.lastMessageAt', 'DESC', 'NULLS LAST')
      .take(limit);

    if (!options?.includeArchived) {
      qb.andWhere('conv.isArchived = false');
    }

    // Also search in messages
    const titleResults = await qb.getMany();

    // Search message content for matching conversations
    const messageConvIds = await this.messageRepository
      .createQueryBuilder('msg')
      .select('DISTINCT msg.conversationId', 'conversationId')
      .where('msg.content ILIKE :query', { query: `%${query}%` })
      .limit(limit)
      .getRawMany();

    const messageConvIdSet = new Set(messageConvIds.map((r) => r.conversationId));
    const titleConvIdSet = new Set(titleResults.map((c) => c.id));

    // Fetch any conversations found in messages but not in title search
    const additionalIds = [...messageConvIdSet].filter((id) => !titleConvIdSet.has(id));
    let additionalConvs: Conversation[] = [];
    if (additionalIds.length > 0) {
      const addQb = this.conversationRepository
        .createQueryBuilder('conv')
        .where('conv.id IN (:...ids)', { ids: additionalIds })
        .orderBy('conv.lastMessageAt', 'DESC', 'NULLS LAST');

      if (!options?.includeArchived) {
        addQb.andWhere('conv.isArchived = false');
      }

      additionalConvs = await addQb.getMany();
    }

    // Combine and deduplicate
    const allResults = [...titleResults, ...additionalConvs];
    return allResults.slice(0, limit);
  }
}
