import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvariantCheckResultDto } from '../../invariants/dto/invariant-check-result.dto';
import { AtomSummaryDto } from './commitment-response.dto';

/**
 * DTO for commitment preview (dry-run) response
 */
export class CommitmentPreviewDto {
  @ApiProperty({
    description: 'Whether the commitment can proceed',
    example: true,
  })
  canCommit: boolean;

  @ApiProperty({
    description: 'Whether there are any blocking issues',
    example: false,
  })
  hasBlockingIssues: boolean;

  @ApiProperty({
    description: 'Whether there are warning-level issues',
    example: true,
  })
  hasWarnings: boolean;

  @ApiProperty({
    description: 'Atoms that would be committed',
    type: [AtomSummaryDto],
  })
  atoms: AtomSummaryDto[];

  @ApiProperty({
    description: 'Results of all invariant checks',
    type: [InvariantCheckResultDto],
  })
  invariantChecks: InvariantCheckResultDto[];

  @ApiProperty({
    description: 'Count of atoms that would be committed',
    example: 3,
  })
  atomCount: number;

  @ApiPropertyOptional({
    description: 'Issues that must be resolved before committing',
    type: [String],
    example: ['Atom IA-003 has quality score below 60'],
  })
  blockingIssues?: string[];

  @ApiPropertyOptional({
    description: 'Warnings that can be overridden',
    type: [String],
    example: ['Atom IA-005 may contain ambiguous language'],
  })
  warnings?: string[];
}
