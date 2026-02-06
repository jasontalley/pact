import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { Atom } from '../atoms/atom.entity';
import type { TestRecord } from '../agents/entities/test-record.entity';
import type { ConflictType, ConflictStatus, ConflictResolution } from './conflict.types';

/**
 * ConflictRecord entity tracks conflicts between intent atoms.
 *
 * Conflict types (from analysis-git-for-intent.md Section 4):
 * - same_test: Two atoms claim the same test
 * - semantic_overlap: Two atoms describe overlapping behavior
 * - contradiction: Two atoms contradict each other
 * - cross_boundary: Teams define conflicting intent for shared functionality
 */
@Entity('conflict_records')
@Index(['status'])
@Index(['atomIdA', 'atomIdB'])
export class ConflictRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 30 })
  conflictType: ConflictType;

  @Column('uuid')
  atomIdA: string;

  @ManyToOne('Atom', { nullable: false })
  @JoinColumn({ name: 'atomIdA' })
  atomA: Atom;

  @Column('uuid')
  atomIdB: string;

  @ManyToOne('Atom', { nullable: false })
  @JoinColumn({ name: 'atomIdB' })
  atomB: Atom;

  @Column({ type: 'uuid', nullable: true })
  testRecordId: string | null;

  @ManyToOne('TestRecord', { nullable: true })
  @JoinColumn({ name: 'testRecordId' })
  testRecord: TestRecord | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  similarityScore: number | null;

  @Column('text')
  description: string;

  @Column({ length: 20, default: 'open' })
  status: ConflictStatus;

  @Column('jsonb', { nullable: true })
  resolution: ConflictResolution | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;
}
