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
 * Status of a test in the reconciliation process.
 *
 * Per INV-R002 (Delta Closure Stopping Rule):
 * - Tests with 'accepted' or 'rejected' status are "closed"
 * - Closed tests are excluded from future delta reconciliation
 */
export type TestRecordStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'skipped';

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

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;
}
