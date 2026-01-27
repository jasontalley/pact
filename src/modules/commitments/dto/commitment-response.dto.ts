import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CommitmentStatus,
  CanonicalAtomSnapshot,
  StoredInvariantCheckResult,
} from '../commitment.entity';

/**
 * Summary of an atom in a commitment
 */
export class AtomSummaryDto {
  @ApiProperty({ description: 'Atom UUID' })
  id: string;

  @ApiProperty({ description: 'Atom ID (e.g., IA-001)' })
  atomId: string;

  @ApiProperty({ description: 'Atom description' })
  description: string;

  @ApiProperty({ description: 'Category' })
  category: string;

  @ApiPropertyOptional({ description: 'Quality score' })
  qualityScore: number | null;
}

/**
 * DTO for Commitment API responses
 */
export class CommitmentResponseDto {
  @ApiProperty({
    description: 'Unique database identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Human-readable commitment ID',
    example: 'COM-001',
  })
  commitmentId: string;

  @ApiPropertyOptional({
    description: 'Project ID this commitment belongs to',
  })
  projectId: string | null;

  @ApiPropertyOptional({
    description: 'Molecule ID this commitment belongs to',
  })
  moleculeId: string | null;

  @ApiProperty({
    description: 'Immutable snapshot of committed atoms',
    type: 'array',
  })
  canonicalJson: CanonicalAtomSnapshot[];

  @ApiProperty({
    description: 'Human who made the commitment',
    example: 'jane.doe@company.com',
  })
  committedBy: string;

  @ApiProperty({
    description: 'When the commitment was made',
    example: '2026-01-21T10:00:00Z',
  })
  committedAt: Date;

  @ApiProperty({
    description: 'Results of invariant checks at commitment time',
    type: 'array',
  })
  invariantChecks: StoredInvariantCheckResult[];

  @ApiPropertyOptional({
    description: 'Justification for any overrides',
  })
  overrideJustification: string | null;

  @ApiPropertyOptional({
    description: 'ID of commitment this supersedes',
  })
  supersedes: string | null;

  @ApiPropertyOptional({
    description: 'ID of commitment that superseded this',
  })
  supersededBy: string | null;

  @ApiProperty({
    description: 'Commitment status',
    enum: ['active', 'superseded'],
    example: 'active',
  })
  status: CommitmentStatus;

  @ApiProperty({
    description: 'Additional metadata',
  })
  metadata: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Summary of atoms in this commitment',
    type: [AtomSummaryDto],
  })
  atoms?: AtomSummaryDto[];
}
