import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  AtomStatus,
  AtomCategory,
  CanvasPosition,
  ObservableOutcome,
  FalsifiabilityCriterion,
  RefinementRecord,
} from '../atom.entity';

/**
 * DTO for atom responses with transformed fields
 */
@Exclude()
export class AtomResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Internal UUID of the atom',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @Expose()
  @ApiProperty({
    description: 'Human-readable atom identifier',
    example: 'IA-001',
  })
  atomId: string;

  @Expose()
  @ApiProperty({
    description: 'Behavioral description of the Intent Atom',
    example: 'When a user submits the login form with valid credentials, the system authenticates and redirects to the dashboard',
  })
  description: string;

  @Expose()
  @ApiProperty({
    description: 'Category classification',
    enum: ['functional', 'performance', 'security', 'reliability', 'usability', 'maintainability'],
  })
  category: AtomCategory;

  @Expose()
  @ApiPropertyOptional({
    description: 'Quality score (0-100)',
    example: 85,
  })
  qualityScore: number | null;

  @Expose()
  @ApiProperty({
    description: 'Lifecycle status of the atom',
    enum: ['draft', 'committed', 'superseded'],
  })
  status: AtomStatus;

  @Expose()
  @ApiPropertyOptional({
    description: 'ID of the atom that superseded this one',
  })
  supersededBy: string | null;

  @Expose()
  @ApiProperty({
    description: 'When the atom was created',
  })
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @ApiPropertyOptional({
    description: 'When the atom was committed (null if still draft)',
  })
  @Type(() => Date)
  committedAt: Date | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'User who created the atom',
  })
  createdBy: string | null;

  @Expose()
  @ApiProperty({
    description: 'User-defined tags',
    type: [String],
  })
  tags: string[];

  @Expose()
  @ApiPropertyOptional({
    description: 'Position on the Canvas UI',
  })
  canvasPosition: CanvasPosition | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Original user input that spawned this atom',
  })
  parentIntent: string | null;

  @Expose()
  @ApiProperty({
    description: 'Observable outcomes that can be verified externally',
  })
  observableOutcomes: ObservableOutcome[];

  @Expose()
  @ApiProperty({
    description: 'Conditions that would disprove the atom intent',
  })
  falsifiabilityCriteria: FalsifiabilityCriterion[];

  @Expose()
  @ApiProperty({
    description: 'History of refinement iterations',
  })
  refinementHistory: RefinementRecord[];

  // Computed/derived fields

  @Expose()
  @ApiProperty({
    description: 'Whether the atom can be edited (only drafts)',
  })
  get isEditable(): boolean {
    return this.status === 'draft';
  }

  @Expose()
  @ApiProperty({
    description: 'Whether the atom can be committed (draft with quality >= 80)',
  })
  get canBeCommitted(): boolean {
    return this.status === 'draft' && (this.qualityScore ?? 0) >= 80;
  }

  @Expose()
  @ApiProperty({
    description: 'Number of refinement iterations',
  })
  get refinementCount(): number {
    return this.refinementHistory?.length ?? 0;
  }
}
