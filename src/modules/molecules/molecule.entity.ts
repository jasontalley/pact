import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';

/**
 * Lens types represent familiar product development concepts.
 * These are displayed in the UI using human-friendly labels:
 * - user_story -> "User Story"
 * - feature -> "Feature"
 * - journey -> "User Journey"
 * - epic -> "Epic"
 * - release -> "Release"
 * - capability -> "Capability"
 * - custom -> uses lensLabel field
 */
export type LensType =
  | 'user_story'
  | 'feature'
  | 'journey'
  | 'epic'
  | 'release'
  | 'capability'
  | 'custom';

/**
 * Human-friendly display labels for lens types.
 * Used in UI to show familiar product terminology.
 */
export const LENS_TYPE_LABELS: Record<LensType, string> = {
  user_story: 'User Story',
  feature: 'Feature',
  journey: 'User Journey',
  epic: 'Epic',
  release: 'Release',
  capability: 'Capability',
  custom: 'Custom',
};

/**
 * Descriptions for each lens type to help users choose.
 */
export const LENS_TYPE_DESCRIPTIONS: Record<LensType, string> = {
  user_story:
    'A specific user need or requirement, typically written as "As a [user], I want [goal] so that [benefit]"',
  feature: 'A distinct piece of functionality that delivers value to users',
  journey: 'A sequence of interactions a user takes to accomplish a goal',
  epic: 'A large body of work that can be broken down into smaller pieces',
  release: 'A collection of features or changes planned for a specific version',
  capability: 'A high-level ability or competency the system provides',
  custom: 'A custom grouping type with your own label',
};

/**
 * Molecule entity represents a human-friendly grouping of Intent Atoms.
 *
 * Core Principles (from ux.md and design decisions):
 * 1. Molecules are lenses, not truth - atoms are the source of truth
 * 2. Molecules never change atom meaning - they just group atoms
 * 3. Molecules never define commitment - that belongs to atoms
 * 4. Computed metrics only - coverage, quality derived from atoms
 * 5. Orphan atoms are allowed - atoms can exist without molecules
 * 6. Multiple membership - atoms can belong to multiple molecules
 */
@Entity('molecules')
@Index(['moleculeId'], { unique: true })
@Index(['lensType'])
@Index(['ownerId'])
@Index(['parentMoleculeId'])
export class Molecule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Unique molecule identifier following M-XXX pattern
   * e.g., "M-001", "M-042"
   */
  @Column({ unique: true, length: 20 })
  moleculeId: string;

  /**
   * Human-readable name for the molecule
   */
  @Column({ length: 255 })
  name: string;

  /**
   * Detailed description (markdown-enabled)
   */
  @Column('text', { nullable: true })
  description: string | null;

  /**
   * Type of lens this molecule represents.
   * Determines UI display and filtering behavior.
   */
  @Column({ length: 50 })
  lensType: LensType;

  /**
   * Custom label when lensType is 'custom'.
   * Allows users to define their own grouping concepts.
   */
  @Column('varchar', { length: 100, nullable: true })
  lensLabel: string | null;

  /**
   * Parent molecule ID for hierarchical organization.
   * Max depth of 10 levels enforced by database trigger.
   */
  @Column({ type: 'uuid', nullable: true })
  parentMoleculeId: string | null;

  /**
   * Parent molecule relation for hierarchy navigation
   */
  @ManyToOne(() => Molecule, (molecule) => molecule.childMolecules, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parentMoleculeId' })
  parentMolecule: Molecule | null;

  /**
   * Child molecules for hierarchy navigation
   */
  @OneToMany(() => Molecule, (molecule) => molecule.parentMolecule)
  childMolecules: Molecule[];

  /**
   * Junction records linking to atoms
   */
  @OneToMany('MoleculeAtom', 'molecule')
  moleculeAtoms: import('./molecule-atom.entity').MoleculeAtom[];

  /**
   * Creator/owner identifier.
   * Simple string for now (future: link to user entity)
   */
  @Column({ length: 255 })
  ownerId: string;

  /**
   * User-defined tags for filtering and organization
   */
  @Column('jsonb', { default: [] })
  tags: string[];

  /**
   * Additional metadata for extensibility
   */
  @Column('jsonb', { default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ========================================
  // Computed Properties (not persisted)
  // ========================================

  /**
   * Get the display label for this molecule's lens type.
   * For custom types, returns the lensLabel; otherwise the standard label.
   */
  getDisplayLabel(): string {
    if (this.lensType === 'custom' && this.lensLabel) {
      return this.lensLabel;
    }
    return LENS_TYPE_LABELS[this.lensType];
  }
}
