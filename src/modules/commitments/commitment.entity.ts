import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
  Index,
} from 'typeorm';
import type { Project } from '../projects/project.entity';
import type { Molecule } from '../molecules/molecule.entity';
import type { Atom } from '../atoms/atom.entity';

/**
 * Commitment status represents the lifecycle state
 */
export type CommitmentStatus = 'active' | 'superseded';

/**
 * Invariant check result stored in commitment
 */
export interface StoredInvariantCheckResult {
  invariantId: string;
  name: string;
  passed: boolean;
  severity: 'error' | 'warning';
  message: string;
  checkedAt: Date;
}

/**
 * Canonical atom snapshot for immutable storage
 */
export interface CanonicalAtomSnapshot {
  atomId: string;
  description: string;
  category: string;
  qualityScore: number | null;
  observableOutcomes: unknown[];
  falsifiabilityCriteria: unknown[];
  tags: string[];
}

/**
 * CommitmentArtifact entity represents an immutable commitment of intent atoms
 *
 * This is the central artifact of the Commitment Boundary - once created,
 * the canonical JSON snapshot cannot be modified. The commitment can only
 * be superseded by a new commitment.
 *
 * Enforces:
 * - INV-001: Explicit Commitment Required (committed_by must be human)
 * - INV-004: Commitment Is Immutable (canonical_json unchangeable)
 * - INV-005: Traceability Is Mandatory (links to atoms and molecule)
 */
@Entity('commitments')
@Index(['projectId'])
@Index(['moleculeId'])
@Index(['status'])
@Index(['committedAt'])
export class CommitmentArtifact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  commitmentId: string; // e.g., "COM-001"

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'uuid', nullable: true })
  moleculeId: string | null;

  /**
   * Immutable snapshot of all committed atoms
   * This field MUST NOT be modified after creation (enforced by trigger)
   */
  @Column('jsonb')
  canonicalJson: CanonicalAtomSnapshot[];

  @Column({ length: 255 })
  committedBy: string;

  @CreateDateColumn()
  committedAt: Date;

  /**
   * Record of all invariant checks performed at commitment time
   */
  @Column('jsonb', { default: [] })
  invariantChecks: StoredInvariantCheckResult[];

  /**
   * Justification provided when overriding non-blocking invariant warnings
   */
  @Column('text', { nullable: true })
  overrideJustification: string | null;

  /**
   * Reference to the commitment this one supersedes (if any)
   */
  @Column({ type: 'uuid', nullable: true })
  supersedes: string | null;

  /**
   * Reference to the commitment that superseded this one (if any)
   */
  @Column({ type: 'uuid', nullable: true })
  supersededBy: string | null;

  @Column({ length: 20, default: 'active' })
  status: CommitmentStatus;

  @Column('jsonb', { default: {} })
  metadata: Record<string, unknown>;

  // Relations

  @ManyToOne('Project', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  @ManyToOne('Molecule', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'moleculeId' })
  molecule: Molecule | null;

  /**
   * Atoms included in this commitment
   * Uses a join table with position for ordering
   */
  @ManyToMany('Atom')
  @JoinTable({
    name: 'commitment_atoms',
    joinColumn: { name: 'commitmentId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'atomId', referencedColumnName: 'id' },
  })
  atoms: Atom[];
}
