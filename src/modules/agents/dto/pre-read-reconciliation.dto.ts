/**
 * Pre-Read Reconciliation DTOs
 *
 * DTOs for accepting pre-read file content for remote reconciliation.
 * This enables clients to submit file contents via API rather than
 * requiring the server to have filesystem access.
 */

import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * File manifest describing the project structure.
 */
export class FileManifestDto {
  @ApiProperty({
    description: 'All files in the project',
    example: ['src/app.ts', 'src/app.spec.ts'],
  })
  @IsArray()
  @IsString({ each: true })
  files: string[];

  @ApiProperty({
    description: 'Test files (*.spec.ts, *.test.ts, etc.)',
    example: ['src/app.spec.ts', 'src/utils.test.ts'],
  })
  @IsArray()
  @IsString({ each: true })
  testFiles: string[];

  @ApiProperty({
    description: 'Source files (non-test TypeScript/JavaScript)',
    example: ['src/app.ts', 'src/utils.ts'],
  })
  @IsArray()
  @IsString({ each: true })
  sourceFiles: string[];
}

/**
 * Reconciliation options for the pre-read endpoint.
 * Mirrors the standard ReconciliationOptions the frontend sends.
 */
export class PreReadReconciliationOptionsDto {
  @ApiPropertyOptional({ description: 'Analyze documentation for context enrichment' })
  @IsOptional()
  @IsBoolean()
  analyzeDocs?: boolean;

  @ApiPropertyOptional({ description: 'Maximum number of tests to process', minimum: 1, maximum: 10000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  maxTests?: number;

  @ApiPropertyOptional({ description: 'Auto-create atoms vs storing as recommendations' })
  @IsOptional()
  @IsBoolean()
  autoCreateAtoms?: boolean;

  @ApiPropertyOptional({ description: 'Minimum quality threshold (0-100)', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityThreshold?: number;

  @ApiPropertyOptional({ description: 'Require human review before persisting' })
  @IsOptional()
  @IsBoolean()
  requireReview?: boolean;

  @ApiPropertyOptional({ description: 'Force interrupt on quality failures' })
  @IsOptional()
  @IsBoolean()
  forceInterruptOnQualityFail?: boolean;

  @ApiPropertyOptional({ description: 'Folder paths to include' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includePaths?: string[];

  @ApiPropertyOptional({ description: 'Folder paths to exclude' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludePaths?: string[];

  @ApiPropertyOptional({ description: 'File name patterns to include (minimatch globs)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includeFilePatterns?: string[];

  @ApiPropertyOptional({ description: 'File name patterns to exclude (minimatch globs)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeFilePatterns?: string[];

  @ApiPropertyOptional({ description: 'Exception lane for drift convergence', enum: ['normal', 'hotfix-exception', 'spike-exception'] })
  @IsOptional()
  @IsIn(['normal', 'hotfix-exception', 'spike-exception'])
  exceptionLane?: 'normal' | 'hotfix-exception' | 'spike-exception';

  @ApiPropertyOptional({ description: 'Attestation type', enum: ['local', 'ci-attested'] })
  @IsOptional()
  @IsIn(['local', 'ci-attested'])
  attestationType?: 'local' | 'ci-attested';

  @ApiPropertyOptional({ description: 'Justification for exception lane' })
  @IsOptional()
  @IsString()
  exceptionJustification?: string;
}

/**
 * Pre-read content payload for reconciliation.
 * Contains all file contents needed for reconciliation without filesystem access.
 */
export class PreReadContentDto {
  @ApiProperty({
    description: 'Root directory path (for relative path context)',
    example: '/Users/dev/project',
  })
  @IsString()
  rootDirectory: string;

  @ApiProperty({
    description: 'File manifest describing project structure',
    type: FileManifestDto,
  })
  @ValidateNested()
  @Type(() => FileManifestDto)
  manifest: FileManifestDto;

  @ApiProperty({
    description: 'File contents map (path → content)',
    example: {
      'src/app.ts': 'export const app = {}',
      'src/app.spec.ts': 'describe("app", () => {})',
    },
  })
  @IsObject()
  fileContents: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Git commit hash at time of reading',
    example: 'abc123def456',
  })
  @IsOptional()
  @IsString()
  commitHash?: string;

  @ApiPropertyOptional({
    description: 'Reconciliation options',
    type: PreReadReconciliationOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreReadReconciliationOptionsDto)
  options?: PreReadReconciliationOptionsDto;
}

/**
 * Response for starting a pre-read reconciliation.
 */
export class PreReadAnalysisStartResult {
  @ApiProperty({
    description: 'Unique run ID',
    example: 'run-123',
  })
  runId: string;

  @ApiProperty({
    description: 'Run status',
    enum: ['started', 'processing', 'review', 'complete', 'failed'],
  })
  status: 'started' | 'processing' | 'review' | 'complete' | 'failed';

  @ApiProperty({
    description: 'Start timestamp',
  })
  startedAt: Date;

  @ApiPropertyOptional({
    description: 'Number of files received',
  })
  filesReceived?: number;

  @ApiPropertyOptional({
    description: 'Total content size in bytes',
  })
  contentSizeBytes?: number;
}
