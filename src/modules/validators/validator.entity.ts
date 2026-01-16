import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Atom } from '../atoms/atom.entity';

@Entity('validators')
export class Validator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  atomId: string;

  @ManyToOne(() => Atom)
  @JoinColumn({ name: 'atomId' })
  atom: Atom;

  @Column({ length: 50 })
  validatorType: string; // gherkin, executable, declarative

  @Column('text')
  content: string;

  @Column({ length: 20 })
  format: string; // gherkin, typescript, json

  @CreateDateColumn()
  createdAt: Date;

  @Column('jsonb', { default: {} })
  metadata: Record<string, any>;
}
