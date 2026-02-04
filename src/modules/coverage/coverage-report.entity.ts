import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { Project } from '../projects/project.entity';
import type { ReconciliationRun } from '../agents/entities/reconciliation-run.entity';

/**
 * Summary of coverage metrics for a single dimension (statements, branches, functions, lines)
 */
export interface CoverageDimensionSummary {
  /** Total number of items (e.g., total statements) */
  total: number;
  /** Number of covered items */
  covered: number;
  /** Coverage percentage (0-100) */
  pct: number;
}

/**
 * Aggregate coverage summary across all dimensions
 */
export interface CoverageSummary {
  statements: CoverageDimensionSummary;
  branches: CoverageDimensionSummary;
  functions: CoverageDimensionSummary;
  lines: CoverageDimensionSummary;
}

/**
 * Per-file coverage breakdown
 */
export interface CoverageFileDetail {
  /** File path relative to project root */
  filePath: string;
  /** Statement coverage for this file */
  statements: CoverageDimensionSummary;
  /** Branch coverage for this file */
  branches: CoverageDimensionSummary;
  /** Function coverage for this file */
  functions: CoverageDimensionSummary;
  /** Line coverage for this file */
  lines: CoverageDimensionSummary;
  /** Specific uncovered line numbers */
  uncoveredLines: number[];
}

/**
 * Supported coverage report formats
 */
export type CoverageFormat = 'lcov' | 'istanbul' | 'cobertura' | 'clover';

/**
 * CoverageReport entity stores parsed coverage data uploaded via the Ingestion Boundary.
 *
 * This is Phase 14A's primary entity. Coverage data enters Pact through explicit
 * API endpoints (POST /coverage/upload or POST /coverage/json), not filesystem reads.
 * Once stored, all analysis works from this database record.
 *
 * @see docs/analysis-locality-architecture.md - Ingestion Boundary pattern
 */
@Entity('coverage_reports')
@Index(['projectId'])
@Index(['createdAt'])
export class CoverageReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Optional project association
   */
  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @ManyToOne('Project', { nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  /**
   * Optional reconciliation run association
   */
  @Column({ type: 'uuid', nullable: true })
  reconciliationRunId: string | null;

  @ManyToOne('ReconciliationRun', { nullable: true })
  @JoinColumn({ name: 'reconciliationRunId' })
  reconciliationRun: ReconciliationRun | null;

  /**
   * Format of the original coverage report
   */
  @Column({ length: 20 })
  format: CoverageFormat;

  /**
   * Git commit hash when coverage was collected
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  commitHash: string | null;

  /**
   * Git branch name when coverage was collected
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  branchName: string | null;

  /**
   * Aggregate coverage summary across all dimensions
   */
  @Column('jsonb')
  summary: CoverageSummary;

  /**
   * Per-file coverage breakdown
   */
  @Column('jsonb', { default: [] })
  fileDetails: CoverageFileDetail[];

  /**
   * Additional metadata for extensibility
   */
  @Column('jsonb', { nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
