/**
 * Cost Estimate DTOs
 *
 * DTOs for estimating operation costs.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { AgentTaskType, LLMProviderType } from '../../../common/llm/providers/types';
import { BudgetMode } from '../../../common/llm/routing/types';

export class CostEstimateRequestDto {
  @ApiProperty({
    description: 'Task type for the operation',
    enum: AgentTaskType,
    example: 'atomization',
  })
  @IsEnum(AgentTaskType)
  taskType: AgentTaskType;

  @ApiProperty({ description: 'Estimated input tokens', example: 1000 })
  @IsNumber()
  @Min(0)
  inputTokens: number;

  @ApiProperty({ description: 'Estimated output tokens', example: 500 })
  @IsNumber()
  @Min(0)
  outputTokens: number;

  @ApiPropertyOptional({
    description: 'Budget mode for cost calculation',
    enum: ['normal', 'economy', 'strict'],
    default: 'normal',
  })
  @IsOptional()
  @IsEnum(['normal', 'economy', 'strict'])
  budgetMode?: BudgetMode;

  @ApiPropertyOptional({
    description: 'Force specific provider',
    enum: ['openai', 'anthropic', 'ollama'],
  })
  @IsOptional()
  @IsEnum(['openai', 'anthropic', 'ollama'])
  forceProvider?: LLMProviderType;

  @ApiPropertyOptional({ description: 'Force specific model' })
  @IsOptional()
  forceModel?: string;
}

export class ModelRecommendationDto {
  @ApiProperty({
    description: 'Provider identifier',
    enum: ['openai', 'anthropic', 'ollama'],
  })
  provider: LLMProviderType;

  @ApiProperty({ description: 'Model identifier' })
  model: string;

  @ApiProperty({ description: 'Estimated cost for this operation' })
  estimatedCost: number;

  @ApiProperty({ description: 'Formatted cost string' })
  formattedCost: string;

  @ApiProperty({ description: 'Why this model is recommended' })
  reason: string;

  @ApiProperty({ description: 'Whether this is the primary recommendation' })
  isPrimary: boolean;
}

export class CostEstimateResponseDto {
  @ApiProperty({ description: 'Task type' })
  taskType: AgentTaskType;

  @ApiProperty({ description: 'Budget mode used' })
  budgetMode: BudgetMode;

  @ApiProperty({ description: 'Estimated input tokens' })
  inputTokens: number;

  @ApiProperty({ description: 'Estimated output tokens' })
  outputTokens: number;

  @ApiProperty({ description: 'Minimum estimated cost' })
  minCost: number;

  @ApiProperty({ description: 'Maximum estimated cost' })
  maxCost: number;

  @ApiProperty({ description: 'Formatted min cost' })
  formattedMinCost: string;

  @ApiProperty({ description: 'Formatted max cost' })
  formattedMaxCost: string;

  @ApiProperty({ description: 'Primary recommended model' })
  recommendedModel: string;

  @ApiProperty({
    description: 'All model recommendations',
    type: [ModelRecommendationDto],
  })
  recommendations: ModelRecommendationDto[];

  @ApiProperty({ description: 'Whether local (free) models are available' })
  localModelsAvailable: boolean;
}
