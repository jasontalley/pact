import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  IsArray,
  ValidateNested,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

/**
 * DTO for adding a single atom to a molecule
 */
export class AddAtomToMoleculeDto {
  @ApiProperty({
    description: 'UUID of the atom to add',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  atomId: string;

  @ApiPropertyOptional({
    description: 'Display order within the molecule (lower numbers appear first)',
    minimum: 0,
    example: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  order?: number;

  @ApiPropertyOptional({
    description: 'Optional note explaining why this atom is in this molecule',
    maxLength: 1000,
    example: 'Core authentication requirement',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Note must be at most 1000 characters long' })
  note?: string;
}

/**
 * Single item for batch add operations
 */
export class BatchAtomItem {
  @ApiProperty({
    description: 'UUID of the atom to add',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  atomId: string;

  @ApiPropertyOptional({
    description: 'Display order within the molecule',
    minimum: 0,
    example: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  order?: number;

  @ApiPropertyOptional({
    description: 'Optional note for this atom',
    maxLength: 1000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}

/**
 * DTO for batch adding atoms to a molecule
 */
export class BatchAddAtomsDto {
  @ApiProperty({
    description: 'Array of atoms to add to the molecule',
    type: [BatchAtomItem],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchAtomItem)
  atoms: BatchAtomItem[];
}

/**
 * Single order update item
 */
export class AtomOrderItem {
  @ApiProperty({
    description: 'UUID of the atom',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  atomId: string;

  @ApiProperty({
    description: 'New order value for this atom',
    minimum: 0,
    example: 0,
  })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  order: number;
}

/**
 * DTO for reordering atoms within a molecule
 */
export class ReorderAtomsDto {
  @ApiProperty({
    description: 'Array of atom IDs with their new order values',
    type: [AtomOrderItem],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AtomOrderItem)
  atomOrders: AtomOrderItem[];
}

/**
 * Single item for batch update operations
 */
export class BatchUpdateAtomItem {
  @ApiProperty({
    description: 'UUID of the atom',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  atomId: string;

  @ApiPropertyOptional({
    description: 'New order value',
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  order?: number;

  @ApiPropertyOptional({
    description: 'New note value (null to clear)',
    maxLength: 1000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string | null;
}

/**
 * DTO for batch updating atom properties in a molecule
 */
export class BatchUpdateAtomsDto {
  @ApiProperty({
    description: 'Array of atoms to update',
    type: [BatchUpdateAtomItem],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchUpdateAtomItem)
  atoms: BatchUpdateAtomItem[];
}

/**
 * DTO for getting atoms with transitive closure options
 */
export class GetAtomsQueryDto {
  @ApiPropertyOptional({
    description: 'Include atoms from child molecules (composition closure)',
    default: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeChildMolecules?: boolean = false;

  @ApiPropertyOptional({
    description: 'Include dependent atoms (dependency closure) - future feature',
    default: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeAtomDependencies?: boolean = false;

  @ApiPropertyOptional({
    description: 'When includeChildMolecules is true, whether to recurse into all descendants',
    default: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  recursive?: boolean = true;

  @ApiPropertyOptional({
    description: 'Only include active (non-removed) atoms',
    default: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  activeOnly?: boolean = true;
}
