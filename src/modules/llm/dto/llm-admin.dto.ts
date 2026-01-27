/**
 * LLM Admin DTOs
 *
 * Data transfer objects for LLM configuration management.
 */

import {
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LLMProviderType, AgentTaskType } from '../../../common/llm/providers/types';
import { BudgetMode } from '../../../common/llm/routing/types';

/**
 * Provider configuration
 */
export class ProviderConfigDto {
  @ApiProperty({ description: 'Provider identifier', enum: ['openai', 'anthropic', 'ollama'] })
  @IsEnum(['openai', 'anthropic', 'ollama'])
  provider: LLMProviderType;

  @ApiProperty({ description: 'Whether provider is enabled' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ description: 'API key (masked in responses)' })
  @IsString()
  @IsOptional()
  apiKey?: string;

  @ApiProperty({ description: 'Whether API key is configured' })
  @IsBoolean()
  apiKeySet: boolean;

  @ApiPropertyOptional({ description: 'Custom endpoint URL' })
  @IsString()
  @IsOptional()
  endpoint?: string;

  @ApiProperty({ description: 'Default model for this provider' })
  @IsString()
  defaultModel: string;

  @ApiProperty({ description: 'Provider priority (lower = higher priority)' })
  @IsNumber()
  @Min(0)
  priority: number;
}

/**
 * Model preference for a task type
 */
export class ModelPreferenceDto {
  @ApiProperty({
    description: 'Task type',
    enum: [
      'atomization',
      'refinement',
      'translation',
      'analysis',
      'chat',
      'code_generation',
      'summarization',
      'classification',
    ],
  })
  @IsEnum([
    'atomization',
    'refinement',
    'translation',
    'analysis',
    'chat',
    'code_generation',
    'summarization',
    'classification',
  ])
  taskType: AgentTaskType;

  @ApiProperty({ description: 'Preferred provider', enum: ['openai', 'anthropic', 'ollama'] })
  @IsEnum(['openai', 'anthropic', 'ollama'])
  preferredProvider: LLMProviderType;

  @ApiProperty({ description: 'Preferred model' })
  @IsString()
  preferredModel: string;

  @ApiPropertyOptional({
    description: 'Fallback provider',
    enum: ['openai', 'anthropic', 'ollama'],
  })
  @IsEnum(['openai', 'anthropic', 'ollama'])
  @IsOptional()
  fallbackProvider?: LLMProviderType;

  @ApiPropertyOptional({ description: 'Fallback model' })
  @IsString()
  @IsOptional()
  fallbackModel?: string;
}

/**
 * Budget configuration
 */
export class BudgetConfigDto {
  @ApiProperty({ description: 'Daily spending limit in USD' })
  @IsNumber()
  @Min(0)
  dailyLimitUsd: number;

  @ApiProperty({ description: 'Monthly spending limit in USD' })
  @IsNumber()
  @Min(0)
  monthlyLimitUsd: number;

  @ApiProperty({ description: 'Whether to block requests when budget exceeded' })
  @IsBoolean()
  hardStopEnabled: boolean;

  @ApiProperty({ description: 'Warning threshold percentage (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  warningThresholdPercent: number;

  @ApiPropertyOptional({ description: 'Email for budget alerts' })
  @IsEmail()
  @IsOptional()
  alertEmail?: string;
}

/**
 * Full LLM configuration
 */
export class LLMConfigDto {
  @ApiProperty({ description: 'Provider configurations', type: [ProviderConfigDto] })
  @ValidateNested({ each: true })
  @Type(() => ProviderConfigDto)
  @IsArray()
  providers: ProviderConfigDto[];

  @ApiProperty({ description: 'Model preferences by task type', type: [ModelPreferenceDto] })
  @ValidateNested({ each: true })
  @Type(() => ModelPreferenceDto)
  @IsArray()
  modelPreferences: ModelPreferenceDto[];

  @ApiProperty({ description: 'Budget configuration', type: BudgetConfigDto })
  @ValidateNested()
  @Type(() => BudgetConfigDto)
  budget: BudgetConfigDto;

  @ApiProperty({ description: 'Default budget mode', enum: ['normal', 'economy', 'strict'] })
  @IsEnum(['normal', 'economy', 'strict'])
  defaultBudgetMode: BudgetMode;

  @ApiProperty({ description: 'Prefer local models when available' })
  @IsBoolean()
  preferLocalModels: boolean;

  @ApiProperty({ description: 'Enable response caching' })
  @IsBoolean()
  cacheEnabled: boolean;

  @ApiProperty({ description: 'Cache TTL in seconds' })
  @IsNumber()
  @Min(0)
  cacheTtlSeconds: number;
}

/**
 * Update provider config request
 */
export class UpdateProviderConfigDto {
  @ApiPropertyOptional({ description: 'Enable/disable provider' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'New API key' })
  @IsString()
  @IsOptional()
  apiKey?: string;

  @ApiPropertyOptional({ description: 'Custom endpoint URL' })
  @IsString()
  @IsOptional()
  endpoint?: string;

  @ApiPropertyOptional({ description: 'Default model' })
  @IsString()
  @IsOptional()
  defaultModel?: string;

  @ApiPropertyOptional({ description: 'Provider priority' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  priority?: number;
}

/**
 * Update budget config request
 */
export class UpdateBudgetConfigDto {
  @ApiPropertyOptional({ description: 'Daily spending limit in USD' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  dailyLimitUsd?: number;

  @ApiPropertyOptional({ description: 'Monthly spending limit in USD' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlyLimitUsd?: number;

  @ApiPropertyOptional({ description: 'Block requests when budget exceeded' })
  @IsBoolean()
  @IsOptional()
  hardStopEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Warning threshold percentage' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  warningThresholdPercent?: number;

  @ApiPropertyOptional({ description: 'Email for budget alerts' })
  @IsEmail()
  @IsOptional()
  alertEmail?: string;
}

/**
 * Test provider request
 */
export class TestProviderDto {
  @ApiProperty({ description: 'Provider to test', enum: ['openai', 'anthropic', 'ollama'] })
  @IsEnum(['openai', 'anthropic', 'ollama'])
  provider: LLMProviderType;
}

/**
 * Provider test result
 */
export class ProviderTestResultDto {
  @ApiProperty({ description: 'Provider that was tested' })
  provider: LLMProviderType;

  @ApiProperty({ description: 'Whether test was successful' })
  success: boolean;

  @ApiPropertyOptional({ description: 'Response latency in milliseconds' })
  latencyMs?: number;

  @ApiPropertyOptional({ description: 'Error message if test failed' })
  error?: string;

  @ApiPropertyOptional({ description: 'Model used for testing' })
  modelTested?: string;
}

/**
 * Usage data point for trends
 */
export class UsageDataPointDto {
  @ApiProperty({ description: 'Date' })
  date: string;

  @ApiProperty({ description: 'Total cost for period' })
  cost: number;

  @ApiProperty({ description: 'Total tokens for period' })
  tokens: number;

  @ApiProperty({ description: 'Total requests for period' })
  requests: number;
}

/**
 * Usage trend data
 */
export class UsageTrendDataDto {
  @ApiProperty({ description: 'Daily data points', type: [UsageDataPointDto] })
  daily: UsageDataPointDto[];

  @ApiProperty({ description: 'Weekly data points', type: [UsageDataPointDto] })
  weekly: UsageDataPointDto[];

  @ApiProperty({ description: 'Monthly data points', type: [UsageDataPointDto] })
  monthly: UsageDataPointDto[];
}
