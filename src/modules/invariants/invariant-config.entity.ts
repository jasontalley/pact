import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { Project } from '../projects/project.entity';

/**
 * Type of invariant checker
 */
export type InvariantCheckType = 'builtin' | 'custom' | 'llm';

/**
 * Configuration for custom invariant checks
 */
export interface InvariantCheckConfig {
  /** For builtin: checker class name */
  checkerName?: string;
  /** For custom: JSON-based rules */
  rules?: Record<string, unknown>[];
  /** For LLM: prompt template */
  prompt?: string;
  /** LLM model to use (if applicable) */
  model?: string;
  /** Additional options */
  [key: string]: unknown;
}

/**
 * InvariantConfig entity represents a configurable invariant rule
 *
 * Invariants are rules that are checked at the Commitment Boundary.
 * They can be enabled/disabled per project and configured to either
 * block commits or just warn.
 *
 * Built-in invariants (INV-001 through INV-009) are seeded on startup
 * and cannot be deleted, but can be enabled/disabled per project.
 */
@Entity('invariant_configs')
@Index(['projectId', 'invariantId'], { unique: true })
export class InvariantConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ length: 20 })
  invariantId: string; // e.g., "INV-001"

  @Column({ length: 255 })
  name: string;

  @Column('text')
  description: string;

  @Column({ default: true })
  isEnabled: boolean;

  @Column({ default: true })
  isBlocking: boolean;

  @Column({ length: 50, default: 'builtin' })
  checkType: InvariantCheckType;

  @Column('jsonb', { default: {} })
  checkConfig: InvariantCheckConfig;

  @Column('text')
  errorMessage: string;

  @Column('text', { nullable: true })
  suggestionPrompt: string | null;

  @Column({ default: false })
  isBuiltin: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Project this invariant config belongs to
   * null means this is a global default
   */
  @ManyToOne('Project', 'invariantConfigs', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;
}
