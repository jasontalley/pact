import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LensType, LENS_TYPE_LABELS } from '../molecule.entity';

/**
 * Realization status breakdown
 */
export class RealizationStatusDto {
  @ApiProperty({ description: 'Number of atoms in draft status', example: 2 })
  draft: number;

  @ApiProperty({ description: 'Number of atoms in committed status', example: 5 })
  committed: number;

  @ApiProperty({ description: 'Number of atoms in superseded status', example: 1 })
  superseded: number;

  @ApiProperty({
    description: 'Overall status: unrealized (0% committed), partial (1-99%), realized (100%)',
    enum: ['unrealized', 'partial', 'realized'],
    example: 'partial',
  })
  overall: 'unrealized' | 'partial' | 'realized';
}

/**
 * Quality score breakdown
 */
export class QualityScoreDto {
  @ApiProperty({ description: 'Average quality score across all atoms', example: 85.5 })
  average: number;

  @ApiPropertyOptional({ description: 'Minimum quality score', example: 70.0 })
  min: number | null;

  @ApiPropertyOptional({ description: 'Maximum quality score', example: 95.0 })
  max: number | null;
}

/**
 * Computed metrics for a molecule
 */
export class MoleculeMetricsDto {
  @ApiProperty({ description: 'Total number of atoms in the molecule', example: 8 })
  atomCount: number;

  @ApiProperty({
    description: 'Percentage of atoms that have at least one active validator',
    example: 75.0,
  })
  validatorCoverage: number;

  @ApiProperty({
    description: 'Percentage of atoms whose validators are passing',
    example: 90.0,
  })
  verificationHealth: number;

  @ApiProperty({ description: 'Realization status breakdown', type: RealizationStatusDto })
  realizationStatus: RealizationStatusDto;

  @ApiProperty({ description: 'Aggregate quality score', type: QualityScoreDto })
  aggregateQuality: QualityScoreDto;

  @ApiProperty({ description: 'Number of direct child molecules', example: 3 })
  childMoleculeCount: number;
}

/**
 * Response DTO for a molecule with computed metrics
 */
export class MoleculeResponseDto {
  @ApiProperty({
    description: 'UUID of the molecule',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Unique molecule identifier',
    example: 'M-001',
  })
  moleculeId: string;

  @ApiProperty({
    description: 'Human-readable name',
    example: 'User Authentication Flow',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Detailed description',
    example: 'Covers the complete authentication flow.',
  })
  description: string | null;

  @ApiProperty({
    description: 'Type of lens',
    enum: ['user_story', 'feature', 'journey', 'epic', 'release', 'capability', 'custom'],
    example: 'user_story',
  })
  lensType: LensType;

  @ApiPropertyOptional({
    description: 'Custom label (when lensType is "custom")',
    example: 'Sprint Goal',
  })
  lensLabel: string | null;

  @ApiProperty({
    description: 'Display label for the lens type (human-friendly)',
    example: 'User Story',
  })
  displayLabel: string;

  @ApiPropertyOptional({
    description: 'UUID of the parent molecule',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  parentMoleculeId: string | null;

  @ApiProperty({
    description: 'Owner identifier',
    example: 'user-123',
  })
  ownerId: string;

  @ApiProperty({
    description: 'User-defined tags',
    type: [String],
    example: ['authentication', 'security'],
  })
  tags: string[];

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-01-29T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-01-29T12:00:00Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Computed metrics for the molecule',
    type: MoleculeMetricsDto,
  })
  metrics: MoleculeMetricsDto;

  /**
   * Transform entity to response DTO
   */
  static fromEntity(
    entity: {
      id: string;
      moleculeId: string;
      name: string;
      description: string | null;
      lensType: LensType;
      lensLabel: string | null;
      parentMoleculeId: string | null;
      ownerId: string;
      tags: string[];
      createdAt: Date;
      updatedAt: Date;
    },
    metrics: MoleculeMetricsDto,
  ): MoleculeResponseDto {
    const dto = new MoleculeResponseDto();
    dto.id = entity.id;
    dto.moleculeId = entity.moleculeId;
    dto.name = entity.name;
    dto.description = entity.description;
    dto.lensType = entity.lensType;
    dto.lensLabel = entity.lensLabel;
    dto.displayLabel =
      entity.lensType === 'custom' && entity.lensLabel
        ? entity.lensLabel
        : LENS_TYPE_LABELS[entity.lensType];
    dto.parentMoleculeId = entity.parentMoleculeId;
    dto.ownerId = entity.ownerId;
    dto.tags = entity.tags;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.metrics = metrics;
    return dto;
  }
}

/**
 * Paginated response for molecule list
 */
export class MoleculeListResponseDto {
  @ApiProperty({
    description: 'List of molecules',
    type: [MoleculeResponseDto],
  })
  items: MoleculeResponseDto[];

  @ApiProperty({
    description: 'Total count of molecules matching the filter',
    example: 42,
  })
  total: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
  })
  limit: number;

  @ApiProperty({
    description: 'Current offset',
    example: 0,
  })
  offset: number;

  @ApiPropertyOptional({
    description: 'Cursor for next page (if using cursor pagination)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  nextCursor?: string;
}

/**
 * Statistics response for aggregate molecule data
 */
export class MoleculeStatisticsDto {
  @ApiProperty({
    description: 'Total number of molecules',
    example: 42,
  })
  totalMolecules: number;

  @ApiProperty({
    description: 'Count by lens type',
    example: { user_story: 15, feature: 10, journey: 5, epic: 8, release: 2, capability: 2, custom: 0 },
  })
  byLensType: Record<LensType, number>;

  @ApiProperty({
    description: 'Average atoms per molecule',
    example: 4.5,
  })
  averageAtomsPerMolecule: number;

  @ApiProperty({
    description: 'Number of root-level molecules (no parent)',
    example: 20,
  })
  rootMoleculeCount: number;

  @ApiProperty({
    description: 'Number of orphan atoms (not in any molecule)',
    example: 12,
  })
  orphanAtomCount: number;
}

/**
 * Lens type metadata for UI display
 */
export class LensTypeInfoDto {
  @ApiProperty({
    description: 'Lens type value',
    example: 'user_story',
  })
  type: LensType;

  @ApiProperty({
    description: 'Display label',
    example: 'User Story',
  })
  label: string;

  @ApiProperty({
    description: 'Description of this lens type',
    example: 'A specific user need or requirement...',
  })
  description: string;
}
