import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsObject,
  IsEnum,
  IsUUID,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvariantCheckType, InvariantCheckConfig } from '../invariant-config.entity';

/**
 * DTO for creating a new custom InvariantConfig
 */
export class CreateInvariantDto {
  @ApiPropertyOptional({
    description: 'Project ID this invariant belongs to (null for global default)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @ApiProperty({
    description: 'Unique identifier for the invariant (e.g., INV-010)',
    pattern: '^INV-\\d{3}$',
    example: 'INV-010',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^INV-\d{3}$/, {
    message: 'invariantId must be in format INV-XXX (e.g., INV-010)',
  })
  invariantId: string;

  @ApiProperty({
    description: 'Human-readable name for the invariant',
    minLength: 1,
    maxLength: 255,
    example: 'Custom Domain Validation',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Description of what this invariant enforces',
    example: 'Ensures all domain objects follow naming conventions',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'Whether this invariant is enabled',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Whether violations block commitment (vs. just warning)',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isBlocking?: boolean;

  @ApiProperty({
    description: 'Type of checker to use',
    enum: ['builtin', 'custom', 'llm'],
    example: 'custom',
  })
  @IsString()
  @IsEnum(['builtin', 'custom', 'llm'], {
    message: 'checkType must be one of: builtin, custom, llm',
  })
  checkType: InvariantCheckType;

  @ApiPropertyOptional({
    description: 'Configuration for the checker',
    example: { rules: [{ pattern: '^[A-Z]', field: 'name' }] },
  })
  @IsObject()
  @IsOptional()
  checkConfig?: InvariantCheckConfig;

  @ApiProperty({
    description: 'Error message shown when invariant is violated',
    example: 'Domain objects must start with an uppercase letter',
  })
  @IsString()
  @IsNotEmpty()
  errorMessage: string;

  @ApiPropertyOptional({
    description: 'LLM prompt for generating fix suggestions',
    example: 'Suggest how to fix the following naming convention violation:',
  })
  @IsString()
  @IsOptional()
  suggestionPrompt?: string;
}
