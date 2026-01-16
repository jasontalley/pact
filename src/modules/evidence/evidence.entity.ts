import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Atom } from '../atoms/atom.entity';
import { Validator } from '../validators/validator.entity';

@Entity('evidence')
export class Evidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  atomId: string;

  @ManyToOne(() => Atom)
  @JoinColumn({ name: 'atomId' })
  atom: Atom;

  @Column({ type: 'uuid', nullable: true })
  validatorId: string | null;

  @ManyToOne(() => Validator, { nullable: true })
  @JoinColumn({ name: 'validatorId' })
  validator: Validator | null;

  @Column({ length: 20 })
  result: string; // pass, fail, error

  @Column('text', { nullable: true })
  output: string | null;

  @CreateDateColumn()
  timestamp: Date;

  @Column('jsonb', { nullable: true })
  executionContext: Record<string, any> | null;

  @Column('jsonb', { default: {} })
  metadata: Record<string, any>;
}
