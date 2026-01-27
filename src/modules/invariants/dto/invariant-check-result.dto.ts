import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Severity level of an invariant check result
 */
export type InvariantCheckSeverity = 'error' | 'warning';

/**
 * DTO for a single invariant check result
 */
export class InvariantCheckResultDto {
  @ApiProperty({
    description: 'Invariant identifier that was checked',
    example: 'INV-001',
  })
  invariantId: string;

  @ApiProperty({
    description: 'Name of the invariant',
    example: 'Explicit Commitment Required',
  })
  name: string;

  @ApiProperty({
    description: 'Whether the check passed',
    example: true,
  })
  passed: boolean;

  @ApiProperty({
    description: 'Severity level (error = blocking, warning = non-blocking)',
    enum: ['error', 'warning'],
    example: 'error',
  })
  severity: InvariantCheckSeverity;

  @ApiProperty({
    description: 'Human-readable message describing the result',
    example: 'All atoms have been explicitly committed.',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'IDs of atoms affected by this check',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  affectedAtomIds?: string[];

  @ApiPropertyOptional({
    description: 'Suggestions for fixing the violation',
    type: [String],
    example: ['Ensure all atoms are committed via the UI or API'],
  })
  suggestions?: string[];
}

/**
 * DTO for aggregated invariant check results
 */
export class InvariantCheckSummaryDto {
  @ApiProperty({
    description: 'Whether all checks passed',
    example: true,
  })
  allPassed: boolean;

  @ApiProperty({
    description: 'Whether any blocking violations exist',
    example: false,
  })
  hasBlockingViolations: boolean;

  @ApiProperty({
    description: 'Count of passed checks',
    example: 9,
  })
  passedCount: number;

  @ApiProperty({
    description: 'Count of failed checks',
    example: 0,
  })
  failedCount: number;

  @ApiProperty({
    description: 'Count of warning-level issues',
    example: 1,
  })
  warningCount: number;

  @ApiProperty({
    description: 'Individual check results',
    type: [InvariantCheckResultDto],
  })
  results: InvariantCheckResultDto[];
}
