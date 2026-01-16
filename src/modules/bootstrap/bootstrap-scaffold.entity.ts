import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('bootstrap_scaffolds')
export class BootstrapScaffold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  scaffoldId: string; // e.g., "BS-001"

  @Column({ length: 20 })
  scaffoldType: string; // seed, migration, tooling, runtime

  @Column('text')
  purpose: string;

  @Column('text')
  exitCriterion: string;

  @Column({ length: 20 })
  targetRemoval: string; // Phase 0, Phase 1, Phase 2

  @Column({ type: 'varchar', length: 255, nullable: true })
  owner: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  removalTicket: string | null;

  @Column({ length: 20, default: 'active' })
  status: string; // active, demolished

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  demolishedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  demolishedBy: string | null;

  @Column('text', { nullable: true })
  notes: string | null;
}
