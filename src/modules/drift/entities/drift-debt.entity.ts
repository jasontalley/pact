import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { Project } from '../../projects/project.entity';
import type { ReconciliationRun } from '../../agents/entities/reconciliation-run.entity';

/**
 * Types of drift that can occur between Pact Main and implementation
 */
export type DriftType =
  | 'orphan_test' // Test without @atom link
  | 'commitment_backlog' // Committed atom without passing test evidence
  | 'stale_coupling' // Test changed but atom link may be stale
  | 'uncovered_code'; // Source file without any atom coverage

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
 * Result of drift detection from a reconciliation run
 */
export interface DriftDetectionResult {
  /** Number of new drift items created */
  newDriftCount: number;
  /** Number of existing drift items confirmed */
  confirmedDriftCount: number;
  /** Number of drift items resolved */
  resolvedDriftCount: number;
  /** Total open drift items after this detection */
  totalOpenDrift: number;
  /** Breakdown by drift type */
  byType: Record<DriftType, number>;
  /** Number of overdue drift items */
  overdueDrift: number;
  /** Type of attestation for this run */
  attestationType: 'local' | 'ci-attested';
}

/**
 * DriftDebt entity tracks gaps between committed intent and implementation.
 *
 * Drift is not a failure state - it's an expected consequence of development velocity.
 * The goal is to ensure drift is always visible and converging.
 *
 * Only CI-attested reconciliation runs create or update drift records.
 * Local runs produce advisory reports but do not affect drift tracking.
 */
@Entity('drift_debt')
@Index(['projectId', 'status'])
@Index(['driftType', 'status'])
@Index(['dueAt'])
@Index(['filePath', 'testName', 'driftType']) // Deduplication index
export class DriftDebt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Type of drift: orphan_test, commitment_backlog, stale_coupling, uncovered_code
   */
  @Column({ type: 'varchar', length: 30 })
  driftType: DriftType;

  /**
   * Human-readable description of the drift
   */
  @Column('text')
  description: string;

  /**
   * Current status of the drift item
   */
  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: DriftDebtStatus;

  /**
   * Severity level (auto-escalates based on age)
   */
  @Column({ type: 'varchar', length: 10, default: 'medium' })
  severity: DriftDebtSeverity;

  // Source references (nullable depending on drift type)

  /**
   * File path for orphan_test, stale_coupling, uncovered_code
   */
  @Column({ type: 'text', nullable: true })
  filePath: string | null;

  /**
   * Test name for orphan_test, stale_coupling
   */
  @Column({ type: 'text', nullable: true })
  testName: string | null;

  /**
   * Atom ID (UUID) for commitment_backlog, stale_coupling
   */
  @Column({ type: 'uuid', nullable: true })
  atomId: string | null;

  /**
   * Human-readable atom display ID (e.g., "IA-001")
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  atomDisplayId: string | null;

  // Run references

  /**
   * UUID of the reconciliation run that first detected this drift
   */
  @Column({ type: 'uuid' })
  detectedByRunId: string;

  @ManyToOne('ReconciliationRun', { nullable: false })
  @JoinColumn({ name: 'detectedByRunId' })
  detectedByRun: ReconciliationRun;

  /**
   * UUID of the most recent run that confirmed this drift still exists
   */
  @Column({ type: 'uuid' })
  lastConfirmedByRunId: string;

  @ManyToOne('ReconciliationRun', { nullable: false })
  @JoinColumn({ name: 'lastConfirmedByRunId' })
  lastConfirmedByRun: ReconciliationRun;

  /**
   * UUID of the run that resolved this drift (if resolved)
   */
  @Column({ type: 'uuid', nullable: true })
  resolvedByRunId: string | null;

  @ManyToOne('ReconciliationRun', { nullable: true })
  @JoinColumn({ name: 'resolvedByRunId' })
  resolvedByRun: ReconciliationRun | null;

  /**
   * Optional project association
   */
  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @ManyToOne('Project', { nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  // Timing

  @CreateDateColumn()
  detectedAt: Date;

  /**
   * When drift was last confirmed by a CI-attested run
   */
  @Column({ type: 'timestamp' })
  lastConfirmedAt: Date;

  /**
   * When drift was resolved (null if open)
   */
  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  /**
   * Convergence deadline based on exception lane and policy
   */
  @Column({ type: 'timestamp', nullable: true })
  dueAt: Date | null;

  // Exception handling

  /**
   * Exception lane: normal, hotfix-exception, spike-exception
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  exceptionLane: ExceptionLane | null;

  /**
   * Justification for exception lane or waiver
   */
  @Column({ type: 'text', nullable: true })
  exceptionJustification: string | null;

  // Aging metrics

  /**
   * Number of days since first detection
   */
  @Column({ type: 'int', default: 0 })
  ageDays: number;

  /**
   * Number of CI-attested runs that have confirmed this drift
   */
  @Column({ type: 'int', default: 1 })
  confirmationCount: number;

  /**
   * Additional metadata (JSON)
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
