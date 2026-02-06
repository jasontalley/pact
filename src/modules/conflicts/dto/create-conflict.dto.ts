import { IsEnum, IsOptional, IsString, IsUUID, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConflictType } from '../conflict.types';

export class CreateConflictDto {
  @ApiProperty({ enum: ['same_test', 'semantic_overlap', 'contradiction', 'cross_boundary'] })
  @IsEnum(['same_test', 'semantic_overlap', 'contradiction', 'cross_boundary'] as const)
  conflictType: ConflictType;

  @ApiProperty({ description: 'UUID of the first atom involved' })
  @IsUUID()
  atomIdA: string;

  @ApiProperty({ description: 'UUID of the second atom involved' })
  @IsUUID()
  atomIdB: string;

  @ApiPropertyOptional({ description: 'UUID of the test record (for same_test conflicts)' })
  @IsOptional()
  @IsUUID()
  testRecordId?: string;

  @ApiPropertyOptional({ description: 'Similarity score (for semantic_overlap conflicts)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  similarityScore?: number;

  @ApiProperty({ description: 'Human-readable description of the conflict' })
  @IsString()
  description: string;
}
