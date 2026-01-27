/**
 * Model Info DTOs
 *
 * DTOs for model capabilities and information.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LLMProviderType } from '../../../common/llm/providers/types';

export class ModelCapabilitiesDto {
  @ApiProperty({ description: 'Maximum context window in tokens' })
  contextWindow: number;

  @ApiProperty({ description: 'Supports image/vision input' })
  supportsVision: boolean;

  @ApiProperty({ description: 'Supports function/tool calling' })
  supportsFunctionCalling: boolean;

  @ApiProperty({ description: 'Supports streaming responses' })
  supportsStreaming: boolean;

  @ApiPropertyOptional({ description: 'Supports reasoning effort parameter (GPT-5.2)' })
  supportsReasoningEffort?: boolean;

  @ApiProperty({ description: 'Cost per input token in dollars' })
  costPerInputToken: number;

  @ApiProperty({ description: 'Cost per output token in dollars' })
  costPerOutputToken: number;

  @ApiPropertyOptional({ description: 'Maximum output tokens' })
  maxOutputTokens?: number;

  @ApiPropertyOptional({ description: 'Model description' })
  description?: string;
}

export class ModelInfoDto {
  @ApiProperty({ description: 'Model identifier' })
  model: string;

  @ApiProperty({
    description: 'Provider that offers this model',
    enum: ['openai', 'anthropic', 'ollama'],
  })
  provider: LLMProviderType;

  @ApiProperty({ description: 'Model capabilities', type: ModelCapabilitiesDto })
  capabilities: ModelCapabilitiesDto;

  @ApiProperty({ description: 'Formatted cost per 1K tokens (input+output)' })
  costPer1K: string;

  @ApiProperty({ description: 'Whether this is a local model (free)' })
  isLocal: boolean;
}

export class ModelListResponseDto {
  @ApiProperty({ description: 'List of available models', type: [ModelInfoDto] })
  models: ModelInfoDto[];

  @ApiProperty({ description: 'Total number of available models' })
  totalCount: number;

  @ApiPropertyOptional({ description: 'Filter applied' })
  filter?: {
    provider?: LLMProviderType;
    supportsVision?: boolean;
    supportsFunctionCalling?: boolean;
  };
}

export class ModelQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by provider',
    enum: ['openai', 'anthropic', 'ollama'],
  })
  provider?: LLMProviderType;

  @ApiPropertyOptional({ description: 'Filter models that support vision' })
  supportsVision?: boolean;

  @ApiPropertyOptional({ description: 'Filter models that support function calling' })
  supportsFunctionCalling?: boolean;
}
