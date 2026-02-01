import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MinLength,
  MaxLength,
  IsEnum,
  IsArray,
  ArrayMaxSize,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LensType, LENS_TYPE_DESCRIPTIONS } from '../molecule.entity';

/**
 * DTO for creating a new molecule
 */
export class CreateMoleculeDto {
  @ApiProperty({
    description: 'Human-readable name for the molecule',
    minLength: 3,
    maxLength: 255,
    example: 'User Authentication Flow',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  @MaxLength(255, { message: 'Name must be at most 255 characters long' })
  name: string;

  @ApiPropertyOptional({
    description: 'Detailed description (markdown-enabled)',
    maxLength: 5000,
    example:
      'This user story covers the complete authentication flow including login, logout, and session management.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(5000, { message: 'Description must be at most 5000 characters long' })
  description?: string;

  @ApiProperty({
    description: 'Type of lens this molecule represents',
    enum: ['user_story', 'feature', 'journey', 'epic', 'release', 'capability', 'custom'],
    enumName: 'LensType',
    example: 'user_story',
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(['user_story', 'feature', 'journey', 'epic', 'release', 'capability', 'custom'], {
    message:
      'Lens type must be one of: user_story, feature, journey, epic, release, capability, custom',
  })
  lensType: LensType;

  @ApiPropertyOptional({
    description: 'Custom label when lensType is "custom". Required if lensType is "custom".',
    maxLength: 100,
    example: 'Sprint Goal',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Custom label must be at most 100 characters long' })
  @ValidateIf((o) => o.lensType === 'custom')
  @IsNotEmpty({ message: 'Custom label is required when lens type is "custom"' })
  lensLabel?: string;

  @ApiPropertyOptional({
    description: 'UUID of the parent molecule for hierarchical organization',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  parentMoleculeId?: string;

  @ApiPropertyOptional({
    description: 'User-defined tags for filtering and organization',
    type: [String],
    example: ['authentication', 'security', 'phase-1'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20, { message: 'Maximum of 20 tags allowed' })
  @IsOptional()
  tags?: string[];
}

/**
 * Lens type metadata for UI display
 */
export const LENS_TYPE_METADATA = Object.entries(LENS_TYPE_DESCRIPTIONS).map(
  ([type, description]) => ({
    type: type as LensType,
    label:
      type === 'user_story'
        ? 'User Story'
        : type === 'journey'
          ? 'User Journey'
          : type.charAt(0).toUpperCase() + type.slice(1),
    description,
  }),
);
