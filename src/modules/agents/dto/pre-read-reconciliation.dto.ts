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
 */
export class ReconciliationOptionsDto {
  @ApiPropertyOptional({
    description: 'Run mode (fullscan or delta)',
    enum: ['fullscan', 'delta'],
    default: 'fullscan',
  })
  @IsOptional()
  @IsIn(['fullscan', 'delta'])
  mode?: 'fullscan' | 'delta';

  @ApiPropertyOptional({
    description: 'Include source file analysis',
    default: true,
  })
  @IsOptional()
  includeSourceFiles?: boolean;

  @ApiPropertyOptional({
    description: 'Include documentation files',
    default: true,
  })
  @IsOptional()
  includeDocs?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum files to process',
    minimum: 1,
    maximum: 10000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  maxFiles?: number;

  @ApiPropertyOptional({
    description: 'Git ref for delta mode (e.g., main, HEAD~1)',
    example: 'main',
  })
  @IsOptional()
  @IsString()
  deltaBase?: string;
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
    type: ReconciliationOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReconciliationOptionsDto)
  options?: ReconciliationOptionsDto;
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
