import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  LLMModelConfig,
  CircuitBreakerConfig,
  RetryConfig,
  RateLimitConfig,
  CacheConfig,
  BudgetConfig,
  ObservabilityConfig,
} from '../../config/llm/llm.config';

@Entity('llm_configurations')
@Index('idx_llm_configurations_active', ['isActive'], {
  where: 'is_active = true',
})
@Index('idx_llm_configurations_name', ['configName'])
export class LLMConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true, name: 'config_name' })
  configName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'jsonb', name: 'primary_model' })
  primaryModel: LLMModelConfig;

  @Column({ type: 'jsonb', default: '[]', name: 'fallback_models' })
  fallbackModels: LLMModelConfig[];

  @Column({ type: 'integer', default: 30000, name: 'default_timeout' })
  defaultTimeout: number;

  @Column({ type: 'boolean', default: false, name: 'streaming_enabled' })
  streamingEnabled: boolean;

  @Column({ type: 'jsonb', name: 'circuit_breaker_config' })
  circuitBreakerConfig: CircuitBreakerConfig;

  @Column({ type: 'jsonb', name: 'retry_config' })
  retryConfig: RetryConfig;

  @Column({ type: 'jsonb', name: 'rate_limit_config' })
  rateLimitConfig: RateLimitConfig;

  @Column({ type: 'jsonb', name: 'cache_config' })
  cacheConfig: CacheConfig;

  @Column({ type: 'jsonb', name: 'budget_config' })
  budgetConfig: BudgetConfig;

  @Column({ type: 'jsonb', name: 'observability_config' })
  observabilityConfig: ObservabilityConfig;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'created_by' })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'updated_by' })
  updatedBy: string | null;
}
