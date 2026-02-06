import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MinLength,
  IsEnum,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidatorType, ValidatorFormat } from '../validator.entity';

/**
 * DTO for creating a new validator
 */
export class CreateValidatorDto {
  @ApiProperty({
    description: 'UUID of the atom this validator is associated with',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  atomId: string;

  @ApiProperty({
    description: 'Human-readable name for the validator',
    minLength: 3,
    example: 'Login Authentication Check',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  name: string;

  @ApiPropertyOptional({
    description: 'Detailed explanation of what this validator checks',
    example: 'Verifies that users can authenticate with valid credentials',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Type of validator execution',
    enum: ['gherkin', 'executable', 'declarative'],
    example: 'gherkin',
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(['gherkin', 'executable', 'declarative'], {
    message: 'Validator type must be one of: gherkin, executable, declarative',
  })
  validatorType: ValidatorType;

  @ApiProperty({
    description: 'The actual validator content/rules',
    minLength: 10,
    example:
      'Given a user with valid credentials\nWhen they submit the login form\nThen they are authenticated successfully',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Content must be at least 10 characters long' })
  content: string;

  @ApiProperty({
    description: 'Format of the validator content',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
    example: 'gherkin',
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(['gherkin', 'natural_language', 'typescript', 'json'], {
    message: 'Format must be one of: gherkin, natural_language, typescript, json',
  })
  format: ValidatorFormat;

  @ApiPropertyOptional({
    description: 'UUID of the template this validator was created from',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  @IsOptional()
  templateId?: string;

  @ApiPropertyOptional({
    description: 'Parameters used when instantiating from a template',
    example: { roleName: 'admin', resource: '/api/users' },
  })
  @IsObject()
  @IsOptional()
  parameters?: Record<string, unknown>;
}
