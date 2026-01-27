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
  ObservabilityConfig,
} from '../../config/llm/llm.config';
import { LLMProviderType, AgentTaskType } from '../../common/llm/providers/types';
import { BudgetMode } from '../../common/llm/routing/types';

/**
 * Extended BudgetConfig for Phase 3.5 with additional fields
 */
export interface ExtendedBudgetConfig {
  enabled: boolean;
  dailyLimit: number;
  monthlyLimit: number;
  alertThreshold: number;
  hardStop: boolean;
  warningThreshold?: number;
  alertEmail?: string;
}

/**
 * Per-provider configuration
 */
export interface ProviderConfigRecord {
  enabled?: boolean;
  apiKey?: string; // Stored securely - in production use proper secret management
  apiKeySet?: boolean;
  endpoint?: string;
  defaultModel?: string;
  priority?: number;
}

/**
 * Model preference for a task type
 */
export interface ModelPreference {
  taskType: AgentTaskType;
  preferredProvider: LLMProviderType;
  preferredModel: string;
  fallbackProvider?: LLMProviderType;
  fallbackModel?: string;
}

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

  @Column({ type: 'jsonb', name: 'primary_model', nullable: true })
  primaryModel: LLMModelConfig;

  @Column({ type: 'jsonb', default: '[]', name: 'fallback_models' })
  fallbackModels: LLMModelConfig[];

  @Column({ type: 'integer', default: 30000, name: 'default_timeout' })
  defaultTimeout: number;

  @Column({ type: 'boolean', default: false, name: 'streaming_enabled' })
  streamingEnabled: boolean;

  @Column({ type: 'jsonb', name: 'circuit_breaker_config', nullable: true })
  circuitBreakerConfig: CircuitBreakerConfig;

  @Column({ type: 'jsonb', name: 'retry_config', nullable: true })
  retryConfig: RetryConfig;

  @Column({ type: 'jsonb', name: 'rate_limit_config', nullable: true })
  rateLimitConfig: RateLimitConfig;

  @Column({ type: 'jsonb', name: 'cache_config', nullable: true })
  cacheConfig: CacheConfig;

  @Column({ type: 'jsonb', name: 'budget_config', nullable: true })
  budgetConfig: ExtendedBudgetConfig;

  @Column({ type: 'jsonb', name: 'observability_config', nullable: true })
  observabilityConfig: ObservabilityConfig;

  // Phase 3.5: Multi-provider configuration
  @Column({ type: 'jsonb', name: 'provider_configs', nullable: true, default: '{}' })
  providerConfigs: Record<string, ProviderConfigRecord>;

  @Column({ type: 'jsonb', name: 'model_preferences', nullable: true, default: '[]' })
  modelPreferences: ModelPreference[];

  @Column({ type: 'varchar', length: 20, name: 'default_budget_mode', nullable: true, default: 'normal' })
  defaultBudgetMode: BudgetMode;

  @Column({ type: 'boolean', name: 'prefer_local_models', nullable: true, default: false })
  preferLocalModels: boolean;

  @Column({ type: 'boolean', name: 'cache_enabled', nullable: true, default: true })
  cacheEnabled: boolean;

  @Column({ type: 'integer', name: 'cache_ttl_seconds', nullable: true, default: 3600 })
  cacheTtlSeconds: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'created_by' })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'updated_by' })
  updatedBy: string | null;
}
