import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { Conversation } from './conversation.entity';

export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * ConversationMessage entity stores individual messages in a conversation.
 */
@Entity('conversation_messages')
@Index(['conversationId', 'createdAt'])
export class ConversationMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  conversationId: string;

  @ManyToOne('Conversation', 'messages', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({ length: 20 })
  role: MessageRole;

  @Column('text')
  content: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ default: false })
  isCompacted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
