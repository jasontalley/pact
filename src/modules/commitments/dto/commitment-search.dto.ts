import { IsOptional, IsUUID, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CommitmentStatus } from '../commitment.entity';

/**
 * DTO for searching and filtering commitments
 */
export class CommitmentSearchDto {
  @ApiPropertyOptional({
    description: 'Filter by project ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Filter by molecule ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  moleculeId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['active', 'superseded'],
  })
  @IsEnum(['active', 'superseded'])
  @IsOptional()
  status?: CommitmentStatus;

  @ApiPropertyOptional({
    description: 'Filter by committer',
    example: 'jane.doe@company.com',
  })
  @IsOptional()
  committedBy?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    minimum: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

/**
 * DTO for paginated commitment response
 */
export class PaginatedCommitmentsResponse {
  items: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
