import { QualityDimensionScore } from '../../agents/entities/test-record.entity';

/**
 * DTO for analyzing test source code via API (Ingestion Boundary pattern).
 * Accepts text content, not file paths.
 */
export interface AnalyzeTestDto {
  /** Test source code as text */
  sourceCode: string;
  /** Optional file path hint (for integration test detection) */
  filePath?: string;
  /** Optional quality profile ID to use */
  profileId?: string;
}

/**
 * DTO for batch analyzing multiple tests
 */
export interface AnalyzeTestBatchDto {
  tests: Array<{
    /** Test source code as text */
    sourceCode: string;
    /** Optional file path hint */
    filePath?: string;
    /** Optional test record ID to update with results */
    testRecordId?: string;
  }>;
  /** Optional quality profile ID to use for all tests */
  profileId?: string;
}

/**
 * Response DTO for a single test quality analysis
 */
export interface TestQualityResultDto {
  /** Overall quality score (0-100) */
  overallScore: number;
  /** Letter grade: A, B, C, D, F */
  grade: string;
  /** Whether all dimensions passed their thresholds */
  passed: boolean;
  /** Per-dimension breakdown */
  dimensions: Record<string, QualityDimensionScore>;
  /** Total tests found in file */
  totalTests: number;
  /** Tests with @atom annotations */
  annotatedTests: number;
  /** Referenced atom IDs */
  referencedAtoms: string[];
}

/**
 * Response DTO for batch quality analysis
 */
export interface TestQualityBatchResultDto {
  results: Array<TestQualityResultDto & { testRecordId?: string }>;
  summary: {
    totalAnalyzed: number;
    averageScore: number;
    gradeDistribution: Record<string, number>;
  };
}
