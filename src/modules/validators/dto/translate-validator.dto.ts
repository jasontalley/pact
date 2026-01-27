import { IsString, IsNotEmpty, IsEnum, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidatorFormat } from '../validator.entity';

/**
 * DTO for translating validator content between formats
 */
export class TranslateValidatorDto {
  @ApiProperty({
    description: 'The content to translate',
    minLength: 10,
    example: 'Users must be able to log in with valid credentials',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Content must be at least 10 characters long' })
  content: string;

  @ApiProperty({
    description: 'Format of the source content',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
    example: 'natural_language',
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(['gherkin', 'natural_language', 'typescript', 'json'], {
    message: 'Source format must be one of: gherkin, natural_language, typescript, json',
  })
  sourceFormat: ValidatorFormat;

  @ApiProperty({
    description: 'Target format to translate to',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
    example: 'gherkin',
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(['gherkin', 'natural_language', 'typescript', 'json'], {
    message: 'Target format must be one of: gherkin, natural_language, typescript, json',
  })
  targetFormat: ValidatorFormat;

  @ApiPropertyOptional({
    description: 'Programming language for executable format (default: typescript)',
    enum: ['typescript', 'javascript', 'python'],
    default: 'typescript',
  })
  @IsString()
  @IsEnum(['typescript', 'javascript', 'python'])
  @IsOptional()
  targetLanguage?: 'typescript' | 'javascript' | 'python' = 'typescript';
}

/**
 * DTO for translation response
 */
export class TranslationResultDto {
  @ApiProperty({
    description: 'The translated content',
    example:
      'Given a user with valid credentials\nWhen they submit the login form\nThen they are authenticated',
  })
  translatedContent: string;

  @ApiProperty({
    description: 'Source format',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
  })
  sourceFormat: ValidatorFormat;

  @ApiProperty({
    description: 'Target format',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
  })
  targetFormat: ValidatorFormat;

  @ApiProperty({
    description: 'Confidence score of the translation (0-1)',
    example: 0.92,
    minimum: 0,
    maximum: 1,
  })
  confidenceScore: number;

  @ApiPropertyOptional({
    description: 'Warnings about potential issues with the translation',
    type: [String],
    example: ['Some context may have been lost during translation'],
  })
  warnings?: string[];

  @ApiPropertyOptional({
    description: 'Suggestions for improving the source content',
    type: [String],
  })
  suggestions?: string[];
}
