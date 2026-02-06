import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvariantCheckType, InvariantCheckConfig } from '../invariant-config.entity';

/**
 * DTO for InvariantConfig API responses
 */
export class InvariantResponseDto {
  @ApiProperty({
    description: 'Unique database identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiPropertyOptional({
    description: 'Project ID this invariant belongs to (null for global)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  projectId: string | null;

  @ApiProperty({
    description: 'Invariant identifier (e.g., INV-001)',
    example: 'INV-001',
  })
  invariantId: string;

  @ApiProperty({
    description: 'Human-readable name',
    example: 'Explicit Commitment Required',
  })
  name: string;

  @ApiProperty({
    description: 'Description of what this invariant enforces',
    example: 'No intent may become enforceable without an explicit human commitment action.',
  })
  description: string;

  @ApiProperty({
    description: 'Whether this invariant is enabled',
    example: true,
  })
  isEnabled: boolean;

  @ApiProperty({
    description: 'Whether violations block commitment',
    example: true,
  })
  isBlocking: boolean;

  @ApiProperty({
    description: 'Type of checker',
    enum: ['builtin', 'custom', 'llm'],
    example: 'builtin',
  })
  checkType: InvariantCheckType;

  @ApiProperty({
    description: 'Configuration for the checker',
  })
  checkConfig: InvariantCheckConfig;

  @ApiProperty({
    description: 'Error message shown on violation',
    example: 'Intent must be explicitly committed by a human action.',
  })
  errorMessage: string;

  @ApiPropertyOptional({
    description: 'LLM prompt for fix suggestions',
  })
  suggestionPrompt: string | null;

  @ApiProperty({
    description: 'Whether this is a built-in invariant',
    example: true,
  })
  isBuiltin: boolean;

  @ApiProperty({
    description: 'When this config was created',
    example: '2026-01-21T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When this config was last updated',
    example: '2026-01-21T10:00:00Z',
  })
  updatedAt: Date;
}
