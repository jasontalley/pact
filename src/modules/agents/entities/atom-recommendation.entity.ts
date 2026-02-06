import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { ReconciliationRun } from './reconciliation-run.entity';
import type { Atom } from '../../atoms/atom.entity';

/**
 * Status of an atom recommendation
 */
export type AtomRecommendationStatus = 'pending' | 'accepted' | 'rejected';

/**
 * Observable outcome for an inferred atom
 */
export interface ObservableOutcomeData {
  description: string;
  measurementCriteria?: string;
}

/**
 * AtomRecommendation entity stores inferred atoms from reconciliation runs.
 *
 * These are recommendations that can be:
 * - Reviewed and approved (creating actual Atom entities)
 * - Rejected (with reason, preventing re-inference per INV-R002)
 * - Left pending for later review
 *
 * @see docs/implementation-checklist-phase5.md Section 3.5
 */
@Entity('atom_recommendations')
export class AtomRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Reference to the reconciliation run that created this recommendation
   */
  @Column('uuid')
  runId: string;

  @ManyToOne('ReconciliationRun', 'atomRecommendations')
  @JoinColumn({ name: 'runId' })
  run: ReconciliationRun;

  /**
   * Temporary ID used during the run for cross-references
   */
  @Column({ length: 100 })
  tempId: string;

  /**
   * Description of the behavioral intent
   */
  @Column('text')
  description: string;

  /**
   * Category (functional, security, performance, etc.)
   */
  @Column({ length: 50 })
  category: string;

  /**
   * Confidence score (0-100) from LLM inference
   */
  @Column('decimal', { precision: 5, scale: 2 })
  confidence: number;

  /**
   * LLM reasoning for the inference
   */
  @Column('text')
  reasoning: string;

  /**
   * Source test file path
   */
  @Column('text')
  sourceTestFilePath: string;

  /**
   * Source test name
   */
  @Column('text')
  sourceTestName: string;

  /**
   * Source test line number
   */
  @Column('int')
  sourceTestLineNumber: number;

  /**
   * Observable outcomes that can be verified
   */
  @Column('jsonb', { default: [] })
  observableOutcomes: ObservableOutcomeData[];

  /**
   * Related documentation references
   */
  @Column('jsonb', { default: [] })
  relatedDocs: string[];

  /**
   * Reasons for any ambiguity in the inference
   */
  @Column('jsonb', { nullable: true })
  ambiguityReasons: string[] | null;

  /**
   * Quality score from validation (if performed)
   */
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  qualityScore: number | null;

  /**
   * Current status of the recommendation
   */
  @Column({ length: 20, default: 'pending' })
  status: AtomRecommendationStatus;

  /**
   * Reason for rejection (if rejected)
   */
  @Column('text', { nullable: true })
  rejectionReason: string | null;

  /**
   * Reference to the created Atom (if accepted and applied)
   */
  @Column({ type: 'uuid', nullable: true })
  atomId: string | null;

  @ManyToOne('Atom', { nullable: true })
  @JoinColumn({ name: 'atomId' })
  atom: Atom | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt: Date | null;
}
