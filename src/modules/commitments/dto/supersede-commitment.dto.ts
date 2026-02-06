import { IsString, IsNotEmpty, IsOptional, IsUUID, IsArray, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for superseding an existing commitment
 */
export class SupersedeCommitmentDto {
  @ApiProperty({
    description: 'Array of atom UUIDs for the new commitment (can include new and existing atoms)',
    type: [String],
    minItems: 1,
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one atom must be included' })
  @IsUUID('4', { each: true })
  atomIds: string[];

  @ApiProperty({
    description: 'Human identifier who is making the supersession',
    example: 'jane.doe@company.com',
  })
  @IsString()
  @IsNotEmpty()
  committedBy: string;

  @ApiPropertyOptional({
    description: 'Reason for superseding the original commitment',
    example: 'Clarified ambiguous requirements based on stakeholder feedback',
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Justification for overriding any invariant warnings',
  })
  @IsString()
  @IsOptional()
  overrideJustification?: string;
}
