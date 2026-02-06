import { CoverageSummary, CoverageFileDetail, CoverageFormat } from '../coverage-report.entity';

/**
 * DTO for uploading raw coverage report content
 */
export interface UploadCoverageDto {
  /** Raw coverage report content (auto-detected format) */
  content: string;
  /** Optional: specify format instead of auto-detecting */
  format?: CoverageFormat;
  /** Optional project association */
  projectId?: string;
  /** Optional reconciliation run association */
  reconciliationRunId?: string;
  /** Git commit hash */
  commitHash?: string;
  /** Git branch name */
  branchName?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * DTO for submitting pre-parsed istanbul JSON programmatically
 */
export interface SubmitCoverageJsonDto {
  /** Pre-parsed coverage summary */
  summary: CoverageSummary;
  /** Per-file coverage details */
  fileDetails?: CoverageFileDetail[];
  /** Optional project association */
  projectId?: string;
  /** Optional reconciliation run association */
  reconciliationRunId?: string;
  /** Git commit hash */
  commitHash?: string;
  /** Git branch name */
  branchName?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Response DTO for coverage report
 */
export interface CoverageReportResponse {
  id: string;
  projectId: string | null;
  reconciliationRunId: string | null;
  format: CoverageFormat;
  commitHash: string | null;
  branchName: string | null;
  summary: CoverageSummary;
  fileDetails: CoverageFileDetail[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Response DTO for coverage history
 */
export interface CoverageHistoryResponse {
  reports: CoverageReportResponse[];
  total: number;
  limit: number;
  offset: number;
}
