import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('agent_actions')
export class AgentAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  agentName: string;

  @Column({ length: 50 })
  actionType: string;

  @Column('jsonb', { nullable: true })
  input: Record<string, any> | null;

  @Column('jsonb', { nullable: true })
  output: Record<string, any> | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  confidenceScore: number | null;

  @Column({ type: 'boolean', nullable: true })
  humanApproved: boolean | null;

  @CreateDateColumn()
  timestamp: Date;

  @Column('jsonb', { default: {} })
  metadata: Record<string, any>;
}
