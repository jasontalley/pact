import {
  IsOptional,
  IsString,
  IsArray,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AtomStatus, AtomCategory } from '../atom.entity';

/**
 * Sort options for atom queries
 */
export type AtomSortField = 'createdAt' | 'qualityScore' | 'atomId' | 'committedAt';
export type SortOrder = 'ASC' | 'DESC';

/**
 * DTO for searching and filtering Intent Atoms
 */
export class AtomSearchDto {
  // Text search
  @ApiPropertyOptional({
    description: 'Full-text search on description',
    example: 'user login',
  })
  @IsString()
  @IsOptional()
  search?: string;

  // Status filter
  @ApiPropertyOptional({
    description: 'Filter by atom status',
    enum: ['proposed', 'draft', 'committed', 'superseded'],
    example: 'draft',
  })
  @IsEnum(['proposed', 'draft', 'committed', 'superseded'])
  @IsOptional()
  status?: AtomStatus;

  // Scope filter (Pact Main governance)
  @ApiPropertyOptional({
    description:
      'Filter by governance scope: all (default), main (promoted atoms only), proposed (pending governance)',
    enum: ['all', 'main', 'proposed'],
    default: 'all',
  })
  @IsEnum(['all', 'main', 'proposed'])
  @IsOptional()
  scope?: 'all' | 'main' | 'proposed';

  // Category filter
  @ApiPropertyOptional({
    description: 'Filter by category',
    enum: ['functional', 'performance', 'security', 'reliability', 'usability', 'maintainability'],
    example: 'functional',
  })
  @IsEnum(['functional', 'performance', 'security', 'reliability', 'usability', 'maintainability'])
  @IsOptional()
  category?: AtomCategory;

  // Tags filter (any match)
  @ApiPropertyOptional({
    description: 'Filter by tags (atoms matching ANY of these tags)',
    type: [String],
    example: ['authentication', 'security'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  tags?: string[];

  // Tags filter (all match)
  @ApiPropertyOptional({
    description: 'Filter by tags (atoms matching ALL of these tags)',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  tagsAll?: string[];

  // Quality score range
  @ApiPropertyOptional({
    description: 'Minimum quality score',
    minimum: 0,
    maximum: 100,
    example: 60,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  qualityScoreMin?: number;

  @ApiPropertyOptional({
    description: 'Maximum quality score',
    minimum: 0,
    maximum: 100,
    example: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  qualityScoreMax?: number;

  // Date range filters
  @ApiPropertyOptional({
    description: 'Filter atoms created on or after this date',
    example: '2026-01-01',
  })
  @IsDateString()
  @IsOptional()
  createdAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter atoms created on or before this date',
    example: '2026-12-31',
  })
  @IsDateString()
  @IsOptional()
  createdBefore?: string;

  @ApiPropertyOptional({
    description: 'Filter atoms committed on or after this date',
    example: '2026-01-01',
  })
  @IsDateString()
  @IsOptional()
  committedAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter atoms committed on or before this date',
    example: '2026-12-31',
  })
  @IsDateString()
  @IsOptional()
  committedBefore?: string;

  // Created by filter
  @ApiPropertyOptional({
    description: 'Filter by creator',
    example: 'user-123',
  })
  @IsString()
  @IsOptional()
  createdBy?: string;

  // Sorting
  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: ['createdAt', 'qualityScore', 'atomId', 'committedAt'],
    default: 'createdAt',
  })
  @IsEnum(['createdAt', 'qualityScore', 'atomId', 'committedAt'])
  @IsOptional()
  sortBy?: AtomSortField;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
  })
  @IsEnum(['ASC', 'DESC'])
  @IsOptional()
  sortOrder?: SortOrder;

  // Pagination
  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    minimum: 1,
    default: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  // Cursor-based pagination (alternative)
  @ApiPropertyOptional({
    description: 'Cursor for cursor-based pagination (atom ID to start after)',
  })
  @IsString()
  @IsOptional()
  cursor?: string;
}

/**
 * Paginated response wrapper for atom lists
 */
export interface PaginatedAtomsResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor?: string;
}
