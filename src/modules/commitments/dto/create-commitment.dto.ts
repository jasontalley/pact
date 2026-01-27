import { IsString, IsNotEmpty, IsOptional, IsUUID, IsArray, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating a new Commitment
 */
export class CreateCommitmentDto {
  @ApiProperty({
    description: 'Array of atom UUIDs to include in this commitment',
    type: [String],
    minItems: 1,
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one atom must be included in commitment' })
  @IsUUID('4', { each: true })
  atomIds: string[];

  @ApiPropertyOptional({
    description: 'Molecule ID this commitment belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  moleculeId?: string;

  @ApiPropertyOptional({
    description: 'Project ID this commitment belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @ApiProperty({
    description: 'Human identifier who is committing (required for INV-006)',
    example: 'jane.doe@company.com',
  })
  @IsString()
  @IsNotEmpty()
  committedBy: string;

  @ApiPropertyOptional({
    description: 'Justification for overriding non-blocking invariant warnings',
    example: 'Approved by product owner for MVP release',
  })
  @IsString()
  @IsOptional()
  overrideJustification?: string;
}
