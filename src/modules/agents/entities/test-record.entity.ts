import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { ReconciliationRun } from './reconciliation-run.entity';
import type { AtomRecommendation } from './atom-recommendation.entity';

/**
 * Per-dimension quality score for a test
 */
export interface QualityDimensionScore {
  /** Score for this dimension (0-1) */
  score: number;
  /** Whether this dimension passed its threshold */
  passed: boolean;
  /** Issues found in this dimension */
  issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    message: string;
    lineNumber?: number;
    suggestion?: string;
  }>;
}

/**
 * Quality grade mapping: A (90-100), B (80-89), C (70-79), D (60-69), F (<60)
 */
export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Compute quality grade from a 0-100 score
 */
export function computeQualityGrade(score: number): QualityGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Status of a test in the reconciliation process.
 *
 * Per INV-R002 (Delta Closure Stopping Rule):
 * - Tests with 'accepted' or 'rejected' status are "closed"
 * - Closed tests are excluded from future delta reconciliation
 */
export type TestRecordStatus = 'pending' | 'accepted' | 'rejected' | 'skipped';

/**
 * TestRecord entity tracks each test analyzed during reconciliation.
 *
 * This entity is critical for implementing INV-R002 (Delta Closure Stopping Rule):
 * - Tests with terminal status (accepted/rejected) are excluded from delta reconciliation
 * - Prevents oscillation and duplicate suggestions in noisy repos
 *
 * @see docs/implementation-checklist-phase5.md Section 3.5
 */
@Entity('test_records')
@Index(['filePath', 'testName'], { unique: false })
export class TestRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Reference to the reconciliation run that analyzed this test
   */
  @Column('uuid')
  runId: string;

  @ManyToOne('ReconciliationRun', 'testRecords')
  @JoinColumn({ name: 'runId' })
  run: ReconciliationRun;

  /**
   * Path to the test file (relative to repository root)
   */
  @Column('text')
  filePath: string;

  /**
   * Name of the test (from describe/it blocks)
   */
  @Column('text')
  testName: string;

  /**
   * Line number where the test starts
   */
  @Column('int')
  lineNumber: number;

  /**
   * Hash of the test code for change detection
   * Used to determine if a test has been modified since last run
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  testCodeHash: string | null;

  /**
   * Status of this test record
   * - pending: Awaiting review
   * - accepted: Recommendation was accepted and atom created
   * - rejected: Recommendation was explicitly rejected
   * - skipped: Test was skipped (e.g., already has @atom annotation)
   */
  @Column({ length: 20, default: 'pending' })
  status: TestRecordStatus;

  /**
   * Reference to the atom recommendation for this test (if any)
   */
  @Column({ type: 'uuid', nullable: true })
  atomRecommendationId: string | null;

  @ManyToOne('AtomRecommendation', { nullable: true })
  @JoinColumn({ name: 'atomRecommendationId' })
  atomRecommendation: AtomRecommendation | null;

  /**
   * If rejected, the reason for rejection
   */
  @Column('text', { nullable: true })
  rejectionReason: string | null;

  /**
   * Whether this test had an @atom annotation when analyzed
   */
  @Column({ default: false })
  hadAtomAnnotation: boolean;

  /**
   * If the test had an @atom annotation, the atom ID it referenced
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  linkedAtomId: string | null;

  /**
   * Whether this test was part of a delta change
   */
  @Column({ default: false })
  isDeltaChange: boolean;

  // ========================================================================
  // Phase 14 Extensions: Ingestion Boundary + Quality Analysis
  // ========================================================================

  /**
   * Test source code stored during reconciliation discovery.
   *
   * This is the Ingestion Boundary: Project Plane data → Intent Plane.
   * Once stored, quality analysis can run from the database without
   * re-reading the filesystem.
   */
  @Column('text', { nullable: true })
  testSourceCode: string | null;

  /**
   * Overall quality score (0-100) from per-test analysis
   */
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  qualityScore: number | null;

  /**
   * Per-dimension quality scores
   */
  @Column('jsonb', { nullable: true })
  qualityDimensions: Record<string, QualityDimensionScore> | null;

  /**
   * Letter grade: A (90-100), B (80-89), C (70-79), D (60-69), F (<60)
   */
  @Column({ type: 'varchar', length: 2, nullable: true })
  qualityGrade: QualityGrade | null;

  /**
   * When quality analysis was last performed
   */
  @Column({ type: 'timestamp', nullable: true })
  qualityAnalyzedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;
}
