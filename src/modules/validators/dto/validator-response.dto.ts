import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidatorType, ValidatorFormat, TranslatedContent } from '../validator.entity';

/**
 * Atom summary for validator response
 */
export class AtomSummaryDto {
  @ApiProperty({ description: 'Atom UUID' })
  id: string;

  @ApiProperty({ description: 'Human-readable atom ID (e.g., IA-001)' })
  atomId: string;

  @ApiProperty({ description: 'Atom description' })
  description: string;

  @ApiProperty({ description: 'Atom status' })
  status: string;
}

/**
 * DTO for validator API responses
 */
export class ValidatorResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the validator',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'UUID of the associated atom',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  atomId: string;

  @ApiPropertyOptional({
    description: 'Associated atom summary (when loaded)',
    type: AtomSummaryDto,
  })
  atom?: AtomSummaryDto;

  @ApiProperty({
    description: 'Human-readable name for the validator',
    example: 'Login Authentication Check',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Detailed explanation of what this validator checks',
    example: 'Verifies that users can authenticate with valid credentials',
  })
  description: string | null;

  @ApiProperty({
    description: 'Type of validator execution',
    enum: ['gherkin', 'executable', 'declarative'],
    example: 'gherkin',
  })
  validatorType: ValidatorType;

  @ApiProperty({
    description: 'The actual validator content/rules',
    example:
      'Given a user with valid credentials\nWhen they submit the login form\nThen they are authenticated successfully',
  })
  content: string;

  @ApiProperty({
    description: 'Current format of the content',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
    example: 'gherkin',
  })
  format: ValidatorFormat;

  @ApiProperty({
    description: 'Original format the user wrote in',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
    example: 'natural_language',
  })
  originalFormat: ValidatorFormat;

  @ApiPropertyOptional({
    description: 'Cached translations to other formats',
    example: {
      natural_language: 'Users with valid credentials can log in successfully',
      gherkin: 'Given a user...',
    },
  })
  translatedContent: TranslatedContent;

  @ApiPropertyOptional({
    description: 'UUID of the template this validator was created from',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  templateId: string | null;

  @ApiPropertyOptional({
    description: 'Parameters used when instantiating from a template',
    example: { roleName: 'admin' },
  })
  parameters: Record<string, unknown>;

  @ApiProperty({
    description: 'Whether this validator is currently active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Number of times this validator has been executed',
    example: 5,
  })
  executionCount: number;

  @ApiPropertyOptional({
    description: 'Timestamp of last execution',
    example: '2026-01-21T10:30:00Z',
  })
  lastExecutedAt: Date | null;

  @ApiProperty({
    description: 'When the validator was created',
    example: '2026-01-21T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the validator was last updated',
    example: '2026-01-21T10:30:00Z',
  })
  updatedAt: Date;
}
