import { IsString, IsOptional, IsBoolean, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ValidatorFormat } from '../validator.entity';
import { TemplateCategory } from '../validator-template.entity';

/**
 * DTO for searching/filtering templates
 */
export class TemplateSearchDto {
  @ApiPropertyOptional({
    description: 'Filter by category',
    enum: [
      'authentication',
      'authorization',
      'data-integrity',
      'performance',
      'state-transition',
      'error-handling',
      'custom',
    ],
    example: 'authorization',
  })
  @IsString()
  @IsEnum([
    'authentication',
    'authorization',
    'data-integrity',
    'performance',
    'state-transition',
    'error-handling',
    'custom',
  ])
  @IsOptional()
  category?: TemplateCategory;

  @ApiPropertyOptional({
    description: 'Filter by format',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
    example: 'gherkin',
  })
  @IsString()
  @IsEnum(['gherkin', 'natural_language', 'typescript', 'json'])
  @IsOptional()
  format?: ValidatorFormat;

  @ApiPropertyOptional({
    description: 'Filter by built-in status',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isBuiltin?: boolean;

  @ApiPropertyOptional({
    description: 'Search text (searches name, description, and tags)',
    example: 'authentication',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by tag',
    example: 'security',
  })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['name', 'createdAt', 'usageCount', 'category'],
    default: 'usageCount',
  })
  @IsString()
  @IsEnum(['name', 'createdAt', 'usageCount', 'category'])
  @IsOptional()
  sortBy?: 'name' | 'createdAt' | 'usageCount' | 'category' = 'usageCount';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsString()
  @IsEnum(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
