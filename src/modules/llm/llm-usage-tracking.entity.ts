import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LLMConfiguration } from './llm-configuration.entity';

@Entity('llm_usage_tracking')
@Index('idx_llm_usage_tracking_created_at', ['createdAt'])
@Index('idx_llm_usage_tracking_config_id', ['configId'])
@Index('idx_llm_usage_tracking_agent_name', ['agentName'])
@Index('idx_llm_usage_tracking_success', ['success'])
export class LLMUsageTracking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true, name: 'request_id' })
  requestId: string;

  @Column({ type: 'uuid', nullable: true, name: 'config_id' })
  configId: string | null;

  @ManyToOne(() => LLMConfiguration, { nullable: true })
  @JoinColumn({ name: 'config_id' })
  config: LLMConfiguration | null;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ type: 'varchar', length: 255, name: 'model_name' })
  modelName: string;

  @Column({ type: 'integer', name: 'input_tokens' })
  inputTokens: number;

  @Column({ type: 'integer', name: 'output_tokens' })
  outputTokens: number;

  @Column({ type: 'integer', name: 'total_tokens' })
  totalTokens: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, name: 'input_cost' })
  inputCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, name: 'output_cost' })
  outputCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, name: 'total_cost' })
  totalCost: number;

  @Column({ type: 'integer', nullable: true, name: 'latency_ms' })
  latencyMs: number | null;

  @Column({ type: 'boolean', default: false, name: 'cache_hit' })
  cacheHit: boolean;

  @Column({ type: 'integer', default: 0, name: 'retry_count' })
  retryCount: number;

  @Column({
    type: 'boolean',
    default: false,
    name: 'circuit_breaker_open',
  })
  circuitBreakerOpen: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'agent_name' })
  agentName: string | null;

  @Column({ type: 'text', nullable: true })
  purpose: string | null;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
