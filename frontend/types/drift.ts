/**
 * Types of drift that can occur between Pact Main and implementation
 */
export type DriftType =
  | 'orphan_test'
  | 'commitment_backlog'
  | 'stale_coupling'
  | 'uncovered_code';

/**
 * Status of a drift debt item
 */
export type DriftDebtStatus = 'open' | 'acknowledged' | 'resolved' | 'waived';

/**
 * Severity levels for drift items
 */
export type DriftDebtSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Exception lanes for reconciliation runs
 */
export type ExceptionLane = 'normal' | 'hotfix-exception' | 'spike-exception';

/**
 * Attestation type for reconciliation runs
 */
export type AttestationType = 'local' | 'ci-attested';

/**
 * Drift item response from API
 */
export interface DriftItem {
  id: string;
  driftType: DriftType;
  description: string;
  status: DriftDebtStatus;
  severity: DriftDebtSeverity;
  filePath: string | null;
  testName: string | null;
  atomId: string | null;
  atomDisplayId: string | null;
  detectedByRunId: string;
  lastConfirmedByRunId: string;
  resolvedByRunId: string | null;
  projectId: string | null;
  detectedAt: string;
  lastConfirmedAt: string;
  resolvedAt: string | null;
  dueAt: string | null;
  exceptionLane: ExceptionLane | null;
  exceptionJustification: string | null;
  ageDays: number;
  confirmationCount: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Paginated drift list response
 */
export interface DriftListResponse {
  items: DriftItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Drift summary response
 */
export interface DriftSummaryResponse {
  totalOpen: number;
  byType: Record<DriftType, number>;
  bySeverity: Record<DriftDebtSeverity, number>;
  overdueCount: number;
  convergenceScore: number;
}

/**
 * Drift aging distribution
 */
export interface DriftAgingResponse {
  bucket0to3Days: number;
  bucket3to7Days: number;
  bucket7to14Days: number;
  bucket14PlusDays: number;
  total: number;
}

/**
 * Convergence report
 */
export interface ConvergenceReportResponse {
  onTrackCount: number;
  atRiskCount: number;
  overdueCount: number;
  totalOpen: number;
  convergenceScore: number;
  blocking: boolean;
}

/**
 * Drift trend data point
 */
export interface DriftTrendPoint {
  date: string;
  newCount: number;
  resolvedCount: number;
  netCount: number;
  totalOpen: number;
}

/**
 * Drift trend response
 */
export interface DriftTrendResponse {
  period: 'week' | 'month' | 'quarter';
  data: DriftTrendPoint[];
}

/**
 * Drift detection result
 */
export interface DriftDetectionResult {
  newDriftCount: number;
  confirmedDriftCount: number;
  resolvedDriftCount: number;
  totalOpenDrift: number;
  byType: Record<DriftType, number>;
  overdueDrift: number;
  attestationType: AttestationType;
}

/**
 * Query params for listing drift items
 */
export interface DriftListParams {
  projectId?: string;
  driftType?: DriftType;
  status?: DriftDebtStatus;
  severity?: DriftDebtSeverity;
  limit?: number;
  offset?: number;
}

/**
 * Human-readable labels for drift types
 */
export const DRIFT_TYPE_LABELS: Record<DriftType, string> = {
  orphan_test: 'Orphan Test',
  commitment_backlog: 'Commitment Backlog',
  stale_coupling: 'Stale Coupling',
  uncovered_code: 'Uncovered Code',
};

/**
 * Human-readable labels for severity levels
 */
export const SEVERITY_LABELS: Record<DriftDebtSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/**
 * Severity badge colors
 */
export const SEVERITY_COLORS: Record<DriftDebtSeverity, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

/**
 * Status badge colors
 */
export const DRIFT_STATUS_COLORS: Record<DriftDebtStatus, string> = {
  open: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  acknowledged: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  waived: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};
