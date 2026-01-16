import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Atom } from '../atoms/atom.entity';

@Entity('molecules')
export class Molecule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  moleculeId: string; // e.g., "MOL-001"

  @Column({ length: 255 })
  name: string;

  @Column('text', { nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdBy: string | null;

  @Column('jsonb', { default: {} })
  metadata: Record<string, any>;

  @ManyToMany(() => Atom)
  @JoinTable({
    name: 'molecule_atoms',
    joinColumn: { name: 'molecule_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'atom_id', referencedColumnName: 'id' },
  })
  atoms: Atom[];
}
