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
 * Configuration for a single quality dimension within a profile
 */
export interface QualityDimensionConfig {
  /** Unique key for this dimension (e.g., 'intentFidelity') */
  key: string;
  /** Human-readable name */
  name: string;
  /** Weight in overall score calculation (0-1, all weights should sum to 1) */
  weight: number;
  /** Minimum score to pass (0-1) */
  threshold: number;
  /** Whether this dimension is evaluated */
  enabled: boolean;
  /** Optional regex patterns specific to this dimension */
  patterns?: string[];
}

/**
 * Default quality dimensions matching the existing 7-dimension model
 */
export const DEFAULT_QUALITY_DIMENSIONS: QualityDimensionConfig[] = [
  { key: 'intentFidelity', name: 'Intent Fidelity', weight: 0.2, threshold: 0.7, enabled: true },
  { key: 'noVacuousTests', name: 'No Vacuous Tests', weight: 0.15, threshold: 0.9, enabled: true },
  { key: 'noBrittleTests', name: 'No Brittle Tests', weight: 0.15, threshold: 0.8, enabled: true },
  { key: 'determinism', name: 'Determinism', weight: 0.1, threshold: 0.95, enabled: true },
  {
    key: 'failureSignalQuality',
    name: 'Failure Signal Quality',
    weight: 0.15,
    threshold: 0.7,
    enabled: true,
  },
  {
    key: 'integrationTestAuthenticity',
    name: 'Integration Test Authenticity',
    weight: 0.15,
    threshold: 0.8,
    enabled: true,
  },
  {
    key: 'boundaryAndNegativeCoverage',
    name: 'Boundary & Negative Coverage',
    weight: 0.1,
    threshold: 0.6,
    enabled: true,
  },
];

/**
 * QualityProfile entity defines configurable quality dimension weights and thresholds.
 *
 * Profiles allow different quality standards for different contexts:
 * - A "Strict" profile for critical paths (higher thresholds)
 * - A "Python-Pytest" profile with framework-specific patterns
 * - Project-specific profiles with custom weights
 *
 * The default profile ships with the existing 7-dimension configuration.
 */
@Entity('quality_profiles')
@Index(['projectId'])
@Index(['isDefault'])
export class QualityProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Human-readable profile name
   */
  @Column({ length: 100 })
  name: string;

  /**
   * Optional description of when to use this profile
   */
  @Column('text', { nullable: true })
  description: string | null;

  /**
   * Optional project association (null = system-wide)
   */
  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @ManyToOne('Project', { nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  /**
   * Quality dimension configurations
   */
  @Column('jsonb')
  dimensions: QualityDimensionConfig[];

  /**
   * Whether this is the default profile
   */
  @Column({ default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
