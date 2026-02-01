import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { SystemConfiguration, ConfigDomain } from './system-configuration.entity';

/**
 * ConfigurationAuditLog tracks all changes to system configurations.
 *
 * Every set/reset operation creates an audit log entry for compliance and debugging.
 */
@Entity('configuration_audit_log')
@Index(['domain', 'key'])
@Index(['changedAt'])
@Index(['changedBy'])
export class ConfigurationAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SystemConfiguration, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'config_id' })
  config: SystemConfiguration | null;

  @Column({ type: 'uuid', nullable: true, name: 'config_id' })
  configId: string | null;

  @Column({ type: 'varchar', length: 50 })
  domain: ConfigDomain;

  @Column({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'jsonb', nullable: true, name: 'old_value' })
  oldValue: unknown;

  @Column({ type: 'jsonb', nullable: true, name: 'new_value' })
  newValue: unknown;

  @Column({ type: 'varchar', length: 255, name: 'changed_by' })
  changedBy: string;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;

  @Column({ type: 'text', nullable: true, name: 'change_reason' })
  changeReason: string | null;
}
