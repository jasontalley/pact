import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('atoms')
export class Atom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  atomId: string; // e.g., "IA-001"

  @Column('text')
  description: string;

  @Column({ length: 50 })
  category: string; // functional, performance, security, reliability, etc.

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  qualityScore: number | null;

  @Column({ length: 20, default: 'draft' })
  status: string; // draft, committed, superseded

  @Column({ type: 'uuid', nullable: true })
  supersededBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  committedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdBy: string | null;

  @Column('jsonb', { default: {} })
  metadata: Record<string, any>;
}
