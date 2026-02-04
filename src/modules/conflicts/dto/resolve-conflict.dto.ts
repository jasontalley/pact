import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConflictResolutionAction } from '../conflict.types';

export class ResolveConflictDto {
  @ApiProperty({
    enum: ['supersede_a', 'supersede_b', 'split_test', 'reject_a', 'reject_b', 'clarify'],
  })
  @IsEnum(['supersede_a', 'supersede_b', 'split_test', 'reject_a', 'reject_b', 'clarify'] as const)
  action: ConflictResolutionAction;

  @ApiProperty({ description: 'Who is resolving the conflict' })
  @IsString()
  resolvedBy: string;

  @ApiPropertyOptional({ description: 'Reason for the resolution' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'UUID of clarification artifact (for clarify action)' })
  @IsOptional()
  @IsString()
  clarificationArtifactId?: string;
}
