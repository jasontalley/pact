import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvariantCheckType, InvariantCheckConfig } from '../invariant-config.entity';

/**
 * DTO for updating an existing InvariantConfig
 * Note: invariantId and isBuiltin cannot be changed
 */
export class UpdateInvariantDto {
  @ApiPropertyOptional({
    description: 'Human-readable name for the invariant',
    minLength: 1,
    maxLength: 255,
    example: 'Custom Domain Validation',
  })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Description of what this invariant enforces',
    example: 'Ensures all domain objects follow naming conventions',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether this invariant is enabled',
  })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Whether violations block commitment (vs. just warning)',
  })
  @IsBoolean()
  @IsOptional()
  isBlocking?: boolean;

  @ApiPropertyOptional({
    description: 'Type of checker to use (cannot change for builtin)',
    enum: ['builtin', 'custom', 'llm'],
  })
  @IsString()
  @IsEnum(['builtin', 'custom', 'llm'], {
    message: 'checkType must be one of: builtin, custom, llm',
  })
  @IsOptional()
  checkType?: InvariantCheckType;

  @ApiPropertyOptional({
    description: 'Configuration for the checker',
    example: { rules: [{ pattern: '^[A-Z]', field: 'name' }] },
  })
  @IsObject()
  @IsOptional()
  checkConfig?: InvariantCheckConfig;

  @ApiPropertyOptional({
    description: 'Error message shown when invariant is violated',
    example: 'Domain objects must start with an uppercase letter',
  })
  @IsString()
  @IsOptional()
  errorMessage?: string;

  @ApiPropertyOptional({
    description: 'LLM prompt for generating fix suggestions',
  })
  @IsString()
  @IsOptional()
  suggestionPrompt?: string;
}
