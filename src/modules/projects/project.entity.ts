import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import type { InvariantConfig } from '../invariants/invariant-config.entity';

/**
 * Project settings interface for extensible configuration
 */
export interface ProjectSettings {
  /** Whether to enforce invariants on commit */
  enforceInvariants?: boolean;
  /** Default quality threshold for atoms */
  qualityThreshold?: number;
  /** Custom metadata for project-specific needs */
  [key: string]: unknown;
}

/**
 * Project entity represents a Pact project
 *
 * Projects are the top-level organizational unit in Pact.
 * Each project can have its own invariant configuration,
 * allowing different enforcement rules per project.
 */
@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column('text', { nullable: true })
  description: string | null;

  @Column('jsonb', { default: {} })
  settings: ProjectSettings;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column('jsonb', { default: {} })
  metadata: Record<string, unknown>;

  /**
   * Invariant configurations specific to this project
   */
  @OneToMany('InvariantConfig', 'project')
  invariantConfigs: InvariantConfig[];
}
