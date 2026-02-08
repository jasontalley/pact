/**
 * Batch Job Entity
 *
 * Persists batch job metadata so we can recover from app restarts
 * during long-running batch operations.
 *
 * @see docs/implementation-checklist-phase20.md Step D
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('batch_jobs')
export class BatchJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Provider-assigned batch ID (e.g., msgbatch_123 for Anthropic) */
  @Column()
  @Index()
  providerBatchId: string;

  /** Which LLM provider is handling this batch */
  @Column()
  provider: string;

  /** Current status: submitted, in_progress, completed, failed, expired, cancelled */
  @Column({ default: 'submitted' })
  status: string;

  /** Total number of requests in the batch */
  @Column()
  totalRequests: number;

  /** Number of completed requests */
  @Column({ default: 0 })
  completedRequests: number;

  /** Number of failed requests */
  @Column({ default: 0 })
  failedRequests: number;

  /** Associated reconciliation run ID (if applicable) */
  @Column({ nullable: true })
  @Index()
  reconciliationRunId: string;

  /** Agent name that created this batch */
  @Column({ nullable: true })
  agentName: string;

  /** Purpose of the batch (e.g., 'verify_quality', 'infer_atoms') */
  @Column({ nullable: true })
  purpose: string;

  /** Additional metadata as JSONB */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  submittedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;
}
