import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { Molecule } from './molecule.entity';
import { Atom } from '../atoms/atom.entity';

/**
 * MoleculeAtom junction entity represents the many-to-many relationship
 * between Molecules and Atoms with additional composition metadata.
 *
 * Design Decisions:
 * 1. Uses soft-delete (removedAt/removedBy) instead of hard delete to preserve
 *    composition history without requiring database audit logs.
 * 2. Uses RESTRICT on atomId FK deletion - atoms should be soft-deleted or
 *    superseded, not hard-deleted. This prevents silent composition history loss.
 * 3. Uses CASCADE on moleculeId FK deletion - when a molecule is deleted,
 *    the junction records are deleted (molecule deletion never deletes atoms).
 */
@Entity('molecule_atoms')
@Index(['moleculeId'])
@Index(['atomId'])
@Index(['order'])
export class MoleculeAtom {
  /**
   * Foreign key to the molecule
   */
  @PrimaryColumn('uuid')
  moleculeId: string;

  /**
   * Foreign key to the atom
   */
  @PrimaryColumn('uuid')
  atomId: string;

  /**
   * Molecule relation for navigation
   * CASCADE on delete: removing molecule removes junction rows
   */
  @ManyToOne(() => Molecule, (molecule) => molecule.moleculeAtoms, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'moleculeId' })
  molecule: Molecule;

  /**
   * Atom relation for navigation
   * RESTRICT on delete: atoms should be superseded, not deleted
   * Deletion of atoms with molecule associations must be explicit
   */
  @ManyToOne(() => Atom, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'atomId' })
  atom: Atom;

  /**
   * Display order within the molecule.
   * Allows users to organize atoms in a meaningful sequence.
   */
  @Column({ type: 'integer', default: 0 })
  order: number;

  /**
   * Optional note explaining why this atom is in this molecule.
   * Provides context for the grouping decision.
   */
  @Column('text', { nullable: true })
  note: string | null;

  /**
   * Timestamp when the atom was added to the molecule
   */
  @CreateDateColumn()
  addedAt: Date;

  /**
   * Identifier of who added the atom to the molecule
   */
  @Column({ length: 255 })
  addedBy: string;

  /**
   * Timestamp when the atom was removed from the molecule.
   * NULL means the atom is currently in the molecule.
   * Non-NULL means this is a historical record of past membership.
   *
   * This enables composition history tracking without hard deletes.
   */
  @Column({ type: 'timestamp', nullable: true })
  removedAt: Date | null;

  /**
   * Identifier of who removed the atom from the molecule.
   * NULL when removedAt is NULL.
   */
  @Column('varchar', { length: 255, nullable: true })
  removedBy: string | null;

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Check if this junction represents an active membership
   * (atom is currently in the molecule)
   */
  isActive(): boolean {
    return this.removedAt === null;
  }

  /**
   * Check if this junction represents a historical record
   * (atom was removed from the molecule)
   */
  isHistorical(): boolean {
    return this.removedAt !== null;
  }
}
