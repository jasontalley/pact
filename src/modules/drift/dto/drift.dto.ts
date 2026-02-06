import { IsOptional, IsString, IsNumber, IsIn, IsUUID, Min, Max, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { DriftType, DriftDebtStatus, DriftDebtSeverity } from '../entities/drift-debt.entity';

/**
 * Query params for listing drift items
 */
export class ListDriftDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsIn(['orphan_test', 'commitment_backlog', 'stale_coupling', 'uncovered_code'])
  driftType?: DriftType;

  @IsOptional()
  @IsIn(['open', 'acknowledged', 'resolved', 'waived'])
  status?: DriftDebtStatus;

  @IsOptional()
  @IsIn(['critical', 'high', 'medium', 'low'])
  severity?: DriftDebtSeverity;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;
}

/**
 * DTO for acknowledging a drift item
 */
export class AcknowledgeDriftDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

/**
 * DTO for waiving a drift item (justification required)
 */
export class WaiveDriftDto {
  @IsString()
  justification: string;
}

/**
 * Response for drift summary
 */
export interface DriftSummaryResponse {
  totalOpen: number;
  byType: Record<DriftType, number>;
  bySeverity: Record<DriftDebtSeverity, number>;
  overdueCount: number;
  convergenceScore: number;
}

/**
 * Response for drift aging distribution
 */
export interface DriftAgingResponse {
  bucket0to3Days: number;
  bucket3to7Days: number;
  bucket7to14Days: number;
  bucket14PlusDays: number;
  total: number;
}

/**
 * Response for convergence report
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
 * Response for drift item detail
 */
export interface DriftItemResponse {
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
  exceptionLane: string | null;
  exceptionJustification: string | null;
  ageDays: number;
  confirmationCount: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Response for paginated drift list
 */
export interface DriftListResponse {
  items: DriftItemResponse[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Response for drift detection trigger
 */
export interface DriftDetectionResponse {
  newDriftCount: number;
  confirmedDriftCount: number;
  resolvedDriftCount: number;
  totalOpenDrift: number;
  byType: Record<DriftType, number>;
  overdueDrift: number;
  attestationType: 'local' | 'ci-attested';
}

/**
 * Response for drift trend data
 */
export interface DriftTrendPoint {
  date: string;
  newCount: number;
  resolvedCount: number;
  netCount: number;
  totalOpen: number;
}

export interface DriftTrendResponse {
  period: 'week' | 'month' | 'quarter';
  data: DriftTrendPoint[];
}
