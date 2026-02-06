import { IsString, IsOptional, IsUUID, IsEnum, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ValidatorType, ValidatorFormat } from '../validator.entity';

/**
 * DTO for searching/filtering validators
 */
export class ValidatorSearchDto {
  @ApiPropertyOptional({
    description: 'Filter by atom UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  atomId?: string;

  @ApiPropertyOptional({
    description: 'Filter by validator type',
    enum: ['gherkin', 'executable', 'declarative'],
    example: 'gherkin',
  })
  @IsString()
  @IsEnum(['gherkin', 'executable', 'declarative'])
  @IsOptional()
  validatorType?: ValidatorType;

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
    description: 'Filter by active status',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by template UUID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  @IsOptional()
  templateId?: string;

  @ApiPropertyOptional({
    description: 'Search text (searches name, description, and content)',
    example: 'authentication',
  })
  @IsString()
  @IsOptional()
  search?: string;

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
    enum: ['name', 'createdAt', 'updatedAt', 'executionCount'],
    default: 'createdAt',
  })
  @IsString()
  @IsEnum(['name', 'createdAt', 'updatedAt', 'executionCount'])
  @IsOptional()
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'executionCount' = 'createdAt';

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
