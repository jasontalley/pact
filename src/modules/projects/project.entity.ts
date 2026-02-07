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
 * Drift convergence policies for a project
 */
export interface DriftPolicies {
  /** Days until normal drift becomes overdue (default: 14) */
  normalConvergenceDays?: number;
  /** Days until hotfix drift becomes overdue (default: 3) */
  hotfixConvergenceDays?: number;
  /** Days until spike drift becomes overdue (default: 7) */
  spikeConvergenceDays?: number;
  /** Days at which drift escalates to high severity (default: 7) */
  highSeverityDays?: number;
  /** Days at which drift escalates to critical severity (default: 14) */
  criticalSeverityDays?: number;
  /** Whether to block CI on overdue drift (default: false) */
  blockOnOverdueDrift?: boolean;
}

/**
 * Project settings interface for extensible configuration
 */
export interface ProjectSettings {
  /** Whether to enforce invariants on commit */
  enforceInvariants?: boolean;
  /** Default quality threshold for atoms */
  qualityThreshold?: number;
  /**
   * The branch where canonical reality is asserted (e.g. "main", "develop").
   * Used by CI-attested reconciliation to label which branch the run was performed against.
   * Pact does not need to understand the org's Git workflow — it only needs a consistent
   * place where reality is asserted.
   */
  integrationTarget?: string;
  /** Drift convergence policies (Phase 16) */
  driftPolicies?: DriftPolicies;
  /** Path to the repository to analyze (inside the container) */
  repositoryPath?: string;
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
