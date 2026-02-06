/**
 * Provider Status DTOs
 *
 * DTOs for provider health and status information.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LLMProviderType } from '../../../common/llm/providers/types';

export class ProviderHealthDto {
  @ApiProperty({ description: 'Provider is currently available' })
  available: boolean;

  @ApiPropertyOptional({ description: 'Last successful request timestamp' })
  lastSuccessAt?: Date;

  @ApiPropertyOptional({ description: 'Last error message if any' })
  lastError?: string;

  @ApiPropertyOptional({ description: 'Last error timestamp' })
  lastErrorAt?: Date;

  @ApiPropertyOptional({ description: 'Average response latency in milliseconds' })
  averageLatencyMs?: number;
}

export class ProviderStatusDto {
  @ApiProperty({
    description: 'Provider identifier',
    enum: ['openai', 'anthropic', 'ollama'],
  })
  name: LLMProviderType;

  @ApiProperty({ description: 'Human-readable provider name' })
  displayName: string;

  @ApiProperty({ description: 'Provider is currently available' })
  available: boolean;

  @ApiProperty({ description: 'Provider health details', type: ProviderHealthDto })
  health: ProviderHealthDto;

  @ApiProperty({ description: 'Models supported by this provider', type: [String] })
  supportedModels: string[];

  @ApiProperty({ description: 'Default model for this provider' })
  defaultModel: string;
}

export class ProviderListResponseDto {
  @ApiProperty({ description: 'List of provider statuses', type: [ProviderStatusDto] })
  providers: ProviderStatusDto[];

  @ApiProperty({ description: 'Total number of available providers' })
  availableCount: number;

  @ApiProperty({ description: 'Total number of registered providers' })
  totalCount: number;
}
