/**
 * Usage Summary DTOs
 *
 * DTOs for LLM usage tracking and cost reporting.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn, IsDateString } from 'class-validator';
import { LLMProviderType } from '../../../common/llm/providers/types';

export class ProviderUsageDto {
  @ApiProperty({
    description: 'Provider identifier',
    enum: ['openai', 'anthropic', 'ollama'],
  })
  provider: LLMProviderType;

  @ApiProperty({ description: 'Total requests made' })
  totalRequests: number;

  @ApiProperty({ description: 'Successful requests' })
  successfulRequests: number;

  @ApiProperty({ description: 'Failed requests' })
  failedRequests: number;

  @ApiProperty({ description: 'Total input tokens' })
  inputTokens: number;

  @ApiProperty({ description: 'Total output tokens' })
  outputTokens: number;

  @ApiProperty({ description: 'Total tokens' })
  totalTokens: number;

  @ApiProperty({ description: 'Total cost in dollars' })
  totalCost: number;

  @ApiProperty({ description: 'Average latency in milliseconds' })
  averageLatencyMs: number;

  @ApiProperty({ description: 'Cache hit rate (0-1)' })
  cacheHitRate: number;
}

export class ModelUsageDto {
  @ApiProperty({ description: 'Model identifier' })
  model: string;

  @ApiProperty({
    description: 'Provider identifier',
    enum: ['openai', 'anthropic', 'ollama'],
  })
  provider: LLMProviderType;

  @ApiProperty({ description: 'Total requests made' })
  totalRequests: number;

  @ApiProperty({ description: 'Total tokens' })
  totalTokens: number;

  @ApiProperty({ description: 'Total cost in dollars' })
  totalCost: number;
}

export class AgentUsageDto {
  @ApiProperty({ description: 'Agent name' })
  agentName: string;

  @ApiProperty({ description: 'Total requests made' })
  totalRequests: number;

  @ApiProperty({ description: 'Total tokens' })
  totalTokens: number;

  @ApiProperty({ description: 'Total cost in dollars' })
  totalCost: number;

  @ApiProperty({ description: 'Average latency in milliseconds' })
  averageLatencyMs: number;
}

export class BudgetStatusDto {
  @ApiProperty({ description: 'Daily cost so far' })
  dailyCost: number;

  @ApiProperty({ description: 'Daily budget limit' })
  dailyLimit: number;

  @ApiProperty({ description: 'Daily budget utilization (0-100%)' })
  dailyUtilization: number;

  @ApiProperty({ description: 'Monthly cost so far' })
  monthlyCost: number;

  @ApiProperty({ description: 'Monthly budget limit' })
  monthlyLimit: number;

  @ApiProperty({ description: 'Monthly budget utilization (0-100%)' })
  monthlyUtilization: number;

  @ApiProperty({ description: 'Budget hard stop enabled' })
  hardStopEnabled: boolean;
}

export class UsageSummaryDto {
  @ApiProperty({ description: 'Summary period' })
  period: {
    start: Date;
    end: Date;
    type: 'day' | 'week' | 'month' | 'custom';
  };

  @ApiProperty({ description: 'Total statistics' })
  totals: {
    requests: number;
    successfulRequests: number;
    failedRequests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCost: number;
    averageLatencyMs: number;
    cacheHitRate: number;
  };

  @ApiProperty({ description: 'Usage breakdown by provider', type: [ProviderUsageDto] })
  byProvider: ProviderUsageDto[];

  @ApiProperty({ description: 'Usage breakdown by model', type: [ModelUsageDto] })
  byModel: ModelUsageDto[];

  @ApiProperty({ description: 'Usage breakdown by agent', type: [AgentUsageDto] })
  byAgent: AgentUsageDto[];

  @ApiProperty({ description: 'Budget status', type: BudgetStatusDto })
  budget: BudgetStatusDto;
}

export class UsageQueryDto {
  @ApiPropertyOptional({
    description: 'Period type',
    enum: ['day', 'week', 'month'],
    default: 'day',
  })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  period?: 'day' | 'week' | 'month';

  @ApiPropertyOptional({ description: 'Start date for custom period' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for custom period' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
