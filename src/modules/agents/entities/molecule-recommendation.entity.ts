import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { ReconciliationRun } from './reconciliation-run.entity';
import type { Molecule } from '../../molecules/molecule.entity';

/**
 * Status of a molecule recommendation
 */
export type MoleculeRecommendationStatus = 'pending' | 'accepted' | 'rejected';

/**
 * MoleculeRecommendation entity stores inferred molecules from reconciliation runs.
 *
 * Per INV-R004 (Molecule Lens Axiom):
 * - Molecules are views, not truth
 * - Molecule failures degrade to "unnamed cluster", NOT rejection
 * - Molecule confidence does NOT affect atom confidence
 *
 * @see docs/implementation-checklist-phase5.md Section 3.5
 */
@Entity('molecule_recommendations')
export class MoleculeRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Reference to the reconciliation run that created this recommendation
   */
  @Column('uuid')
  runId: string;

  @ManyToOne('ReconciliationRun', 'moleculeRecommendations')
  @JoinColumn({ name: 'runId' })
  run: ReconciliationRun;

  /**
   * Temporary ID used during the run for cross-references
   */
  @Column({ length: 100 })
  tempId: string;

  /**
   * Name of the molecule (feature/capability)
   */
  @Column({ length: 255 })
  name: string;

  /**
   * Description of what the molecule represents
   */
  @Column('text', { nullable: true })
  description: string | null;

  /**
   * Temporary IDs of atom recommendations in this molecule
   * (References to AtomRecommendation.tempId values)
   */
  @Column('jsonb', { default: [] })
  atomRecommendationTempIds: string[];

  /**
   * UUIDs of AtomRecommendation entities (populated after lookup)
   */
  @Column('jsonb', { default: [] })
  atomRecommendationIds: string[];

  /**
   * UUIDs of actual Atom entities (populated after apply)
   */
  @Column('jsonb', { nullable: true })
  atomIds: string[] | null;

  /**
   * Confidence score (0-100) from LLM synthesis
   */
  @Column('decimal', { precision: 5, scale: 2 })
  confidence: number;

  /**
   * LLM reasoning for the grouping
   */
  @Column('text')
  reasoning: string;

  /**
   * Current status of the recommendation
   */
  @Column({ length: 20, default: 'pending' })
  status: MoleculeRecommendationStatus;

  /**
   * Reason for rejection (if rejected)
   */
  @Column('text', { nullable: true })
  rejectionReason: string | null;

  /**
   * Reference to the created Molecule (if accepted and applied)
   */
  @Column({ type: 'uuid', nullable: true })
  moleculeId: string | null;

  @ManyToOne('Molecule', { nullable: true })
  @JoinColumn({ name: 'moleculeId' })
  molecule: Molecule | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt: Date | null;
}
