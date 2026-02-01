import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { LensType } from '../molecule.entity';

/**
 * DTO for searching/filtering molecules
 */
export class MoleculeSearchDto {
  @ApiPropertyOptional({
    description: 'Filter by lens type(s)',
    enum: ['user_story', 'feature', 'journey', 'epic', 'release', 'capability', 'custom'],
    isArray: true,
    example: ['user_story', 'feature'],
  })
  @IsArray()
  @IsEnum(['user_story', 'feature', 'journey', 'epic', 'release', 'capability', 'custom'], {
    each: true,
    message: 'Each lens type must be one of: user_story, feature, journey, epic, release, capability, custom',
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  lensType?: LensType[];

  @ApiPropertyOptional({
    description: 'Filter by owner ID',
    example: 'user-123',
  })
  @IsString()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by parent molecule ID. Use "null" for root-level molecules.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'null' ? null : value))
  parentMoleculeId?: string | null;

  @ApiPropertyOptional({
    description: 'Filter to only molecules with at least one atom',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasAtoms?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by tags (molecules must have all specified tags)',
    type: [String],
    example: ['security', 'phase-1'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Search text in name and description',
    example: 'authentication',
  })
  @IsString()
  @IsOptional()
  search?: string;

  // Pagination
  @ApiPropertyOptional({
    description: 'Maximum number of results to return',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Number of results to skip',
    minimum: 0,
    default: 0,
    example: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: 'Cursor for cursor-based pagination (alternative to offset)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  cursor?: string;

  // Sorting
  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: ['name', 'createdAt', 'updatedAt', 'moleculeId'],
    default: 'createdAt',
    example: 'name',
  })
  @IsEnum(['name', 'createdAt', 'updatedAt', 'moleculeId'], {
    message: 'Sort field must be one of: name, createdAt, updatedAt, moleculeId',
  })
  @IsOptional()
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'moleculeId' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
    example: 'desc',
  })
  @IsEnum(['asc', 'desc'], { message: 'Sort order must be asc or desc' })
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
