import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import type { ConversationMessage } from './conversation-message.entity';

/**
 * Conversation entity stores durable chat sessions.
 *
 * Replaces the in-memory ChatSession pattern in chat-agent.service.ts
 * with persistent storage for conversation history.
 */
@Entity('conversations')
@Index(['isArchived', 'lastMessageAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column('jsonb', { nullable: true })
  context: Record<string, unknown> | null;

  @Column('text', { nullable: true })
  compactedSummary: string | null;

  @Column('int', { default: 0 })
  messageCount: number;

  @Column({ default: false })
  isArchived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date | null;

  @OneToMany('ConversationMessage', 'conversation')
  messages: ConversationMessage[];
}
