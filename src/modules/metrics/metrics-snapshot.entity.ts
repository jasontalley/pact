import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('metrics_snapshots')
export class MetricsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  snapshotDate: string; // YYYY-MM-DD format

  @Column({ type: 'jsonb' })
  epistemicMetrics: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  couplingMetrics: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  additionalMetrics: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
