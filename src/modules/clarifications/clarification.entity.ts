import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Atom } from '../atoms/atom.entity';

@Entity('clarifications')
export class Clarification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  atomId: string;

  @ManyToOne(() => Atom)
  @JoinColumn({ name: 'atomId' })
  atom: Atom;

  @Column('text')
  question: string;

  @Column('text')
  answer: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdBy: string | null;

  @Column('jsonb', { default: {} })
  metadata: Record<string, any>;
}
