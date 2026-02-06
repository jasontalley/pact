import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * Value types for configuration values
 */
export type ConfigValueType = 'number' | 'boolean' | 'string' | 'json';

/**
 * Configuration domains for logical grouping
 */
export type ConfigDomain = 'agent' | 'resilience' | 'safety' | 'observability' | 'features';

/**
 * Validation rules for configuration values
 */
export interface ConfigValidation {
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
}

/**
 * SystemConfiguration entity for storing runtime configuration overrides.
 *
 * This follows the layered configuration pattern:
 * UI/Database (highest) → Environment → Code Default (lowest)
 */
@Entity('system_configurations')
@Unique(['domain', 'key'])
@Index(['domain'])
@Index(['category'])
export class SystemConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  domain: ConfigDomain;

  @Column({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @Column({ type: 'varchar', length: 20, name: 'value_type' })
  valueType: ConfigValueType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'env_var_name' })
  envVarName: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'code_default' })
  codeDefault: unknown;

  @Column({ type: 'jsonb', nullable: true })
  validation: ConfigValidation | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_sensitive' })
  isSensitive: boolean;

  @Column({ type: 'boolean', default: false, name: 'requires_restart' })
  requiresRestart: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'updated_by' })
  updatedBy: string | null;
}
