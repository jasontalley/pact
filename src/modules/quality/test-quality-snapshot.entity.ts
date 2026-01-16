import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Entity for tracking test quality over time
 * Stores snapshots of quality metrics for trend analysis
 */
@Entity('test_quality_snapshots')
export class TestQualitySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'commit_hash', nullable: true })
  commitHash: string;

  @Column({ name: 'branch_name', nullable: true })
  branchName: string;

  @Column({ name: 'total_files', type: 'int' })
  totalFiles: number;

  @Column({ name: 'passed_files', type: 'int' })
  passedFiles: number;

  @Column({ name: 'failed_files', type: 'int' })
  failedFiles: number;

  @Column({ name: 'overall_score', type: 'decimal', precision: 5, scale: 2 })
  overallScore: number;

  @Column({ name: 'intent_fidelity_score', type: 'decimal', precision: 5, scale: 2 })
  intentFidelityScore: number;

  @Column({ name: 'no_vacuous_tests_score', type: 'decimal', precision: 5, scale: 2 })
  noVacuousTestsScore: number;

  @Column({ name: 'no_brittle_tests_score', type: 'decimal', precision: 5, scale: 2 })
  noBrittleTestsScore: number;

  @Column({ name: 'determinism_score', type: 'decimal', precision: 5, scale: 2 })
  determinismScore: number;

  @Column({ name: 'failure_signal_quality_score', type: 'decimal', precision: 5, scale: 2 })
  failureSignalQualityScore: number;

  @Column({ name: 'integration_authenticity_score', type: 'decimal', precision: 5, scale: 2 })
  integrationAuthenticityScore: number;

  @Column({ name: 'boundary_coverage_score', type: 'decimal', precision: 5, scale: 2 })
  boundaryCoverageScore: number;

  @Column({ name: 'total_tests', type: 'int' })
  totalTests: number;

  @Column({ name: 'annotated_tests', type: 'int' })
  annotatedTests: number;

  @Column({ name: 'orphan_tests', type: 'int' })
  orphanTests: number;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown>;
}
