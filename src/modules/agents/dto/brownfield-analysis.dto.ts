import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BrownfieldAnalysisDto {
  @ApiProperty({
    description: 'Root directory to analyze (defaults to current working directory)',
    example: '/path/to/repo',
  })
  @IsString()
  @IsOptional()
  rootDirectory?: string;

  @ApiPropertyOptional({
    description: 'Patterns to include when searching for test files',
    example: ['**/*.spec.ts', '**/*.test.ts'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  includePatterns?: string[];

  @ApiPropertyOptional({
    description: 'Patterns to exclude from analysis',
    example: ['**/node_modules/**', '**/dist/**'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  excludePatterns?: string[];

  @ApiPropertyOptional({
    description: 'Whether to analyze documentation files (README, docs/, etc.)',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  analyzeDocumentation?: boolean;

  @ApiPropertyOptional({
    description:
      'Whether to automatically approve and commit inferred atoms (false = store as draft with pendingReview flag)',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  autoCreateAtoms?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum number of tests to analyze (safety limit to prevent runaway processing)',
    example: 100,
    default: 100,
  })
  @IsOptional()
  maxTests?: number;

  @ApiPropertyOptional({
    description: 'Whether to use cache for LLM calls (disable for development to see new calls)',
    example: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  useCache?: boolean;

  @ApiPropertyOptional({
    description: 'Whether to validate atom quality before storing (adds 5 LLM calls per atom)',
    example: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  validateQuality?: boolean;

  @ApiPropertyOptional({
    description: 'User ID performing the analysis',
    example: 'user-123',
  })
  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class OrphanTestInfo {
  @ApiProperty({ description: 'File path of the test' })
  filePath: string;

  @ApiProperty({ description: 'Test name' })
  testName: string;

  @ApiProperty({ description: 'Line number where test is defined' })
  lineNumber: number;

  @ApiProperty({ description: 'Test code snippet' })
  testCode: string;

  @ApiPropertyOptional({ description: 'Related source code file (if found)' })
  relatedSourceFile?: string;
}

export class InferredAtom {
  @ApiProperty({ description: 'Inferred atom description' })
  description: string;

  @ApiProperty({ description: 'Detected category', example: 'functional' })
  category: string;

  @ApiProperty({ description: 'Confidence score 0-1', example: 0.85 })
  confidence: number;

  @ApiProperty({ description: 'Reasoning for the inference' })
  reasoning: string;

  @ApiProperty({ description: 'Source test information' })
  sourceTest: OrphanTestInfo;

  @ApiPropertyOptional({ description: 'Related documentation snippets', type: [String] })
  relatedDocs?: string[];

  @ApiPropertyOptional({ description: 'Suggested observable outcomes', type: [String] })
  observableOutcomes?: string[];
}

export class BrownfieldAnalysisResult {
  @ApiProperty({ description: 'Whether analysis completed successfully', example: true })
  success: boolean;

  @ApiProperty({ description: 'Total orphan tests found', example: 15 })
  totalOrphanTests: number;

  @ApiProperty({ description: 'Number of atoms inferred', example: 12 })
  inferredAtomsCount: number;

  @ApiProperty({
    description:
      'Number of atoms stored (always stored as drafts; if autoCreateAtoms=true they are auto-approved, otherwise marked pendingReview)',
    example: 12,
  })
  createdAtomsCount: number;

  @ApiProperty({ description: 'Inferred atoms from analysis', type: [InferredAtom] })
  inferredAtoms: InferredAtom[];

  @ApiProperty({ description: 'Orphan tests that could not be analyzed', type: [OrphanTestInfo] })
  unanalyzedTests: OrphanTestInfo[];

  @ApiProperty({ description: 'Summary of the analysis' })
  summary: string;

  @ApiProperty({ description: 'Analysis metadata' })
  metadata: {
    rootDirectory: string;
    testFilesAnalyzed: number;
    documentationFilesAnalyzed: number;
    analysisDurationMs: number;
  };
}
