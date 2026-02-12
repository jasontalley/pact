import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { Project } from '../../projects/project.entity';
import type {
  ManifestIdentity,
  ManifestStructure,
  ManifestEvidenceInventory,
  ManifestDomainModel,
  ManifestHealthSignals,
  ManifestDomainConcepts,
  ContextSnapshotData,
} from '../graphs/types/manifest.types';
import type { RepoStructure, OrphanTestInfo, EvidenceItem, TestQualityScore } from '../graphs/types/reconciliation-state';
import type { CoverageData } from '../coverage/coverage-parser';

/**
 * Status of a manifest generation
 */
export type ManifestStatus = 'generating' | 'complete' | 'failed';

/**
 * Content source used to generate the manifest
 */
export type ManifestContentSource = 'filesystem' | 'github' | 'pre_read';

/**
 * RepoManifest entity stores a durable, deterministic snapshot of a
 * repository's structure, evidence inventory, domain model, and health signals.
 *
 * Manifests are generated without LLM calls (30-90 seconds) and serve as:
 * - A preview of what the LLM inference phase will analyze
 * - The baseline for dashboard display
 * - Input to the reconciliation graph (via load_manifest node)
 * - A foundation for manifest-based delta diffing
 *
 * Manifests are versioned by projectId + commitHash — the same project at the
 * same commit reuses an existing manifest rather than regenerating.
 */
@Entity('repo_manifests')
export class RepoManifest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Optional project association
   */
  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @ManyToOne('Project', { nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  /**
   * Git commit hash at time of manifest generation
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  commitHash: string | null;

  /**
   * Manifest generation status
   */
  @Column({ length: 20, default: 'generating' })
  status: ManifestStatus;

  // -------------------------------------------------------------------------
  // Manifest Sections (human-readable summaries)
  // -------------------------------------------------------------------------

  /**
   * Project identity (name, languages, frameworks, commit)
   */
  @Column('jsonb', { default: {} })
  identity: ManifestIdentity;

  /**
   * Structural summary (file counts, directory tree, entry points)
   */
  @Column('jsonb', { default: {} })
  structure: ManifestStructure;

  /**
   * Evidence inventory (counts by type, breakdowns)
   */
  @Column('jsonb', { default: {} })
  evidenceInventory: ManifestEvidenceInventory;

  /**
   * Domain model (entities, API surface, UI surface)
   */
  @Column('jsonb', { default: {} })
  domainModel: ManifestDomainModel;

  /**
   * Health signals (test quality, coverage, coupling)
   */
  @Column('jsonb', { default: {} })
  healthSignals: ManifestHealthSignals;

  /**
   * Domain concepts (concept list, clusters)
   */
  @Column('jsonb', { default: {} })
  domainConcepts: ManifestDomainConcepts;

  // -------------------------------------------------------------------------
  // Raw State Snapshots (for graph state hydration via load_manifest node)
  // -------------------------------------------------------------------------

  /**
   * Full RepoStructure from the structure phase
   */
  @Column('jsonb', { nullable: true })
  repoStructureSnapshot: RepoStructure | null;

  /**
   * Orphan tests discovered during the discover phase
   */
  @Column('jsonb', { nullable: true })
  orphanTestsSnapshot: OrphanTestInfo[] | null;

  /**
   * All evidence items from the discover phase
   */
  @Column('jsonb', { nullable: true })
  evidenceItemsSnapshot: EvidenceItem[] | null;

  /**
   * Test quality scores from the test_quality phase.
   * Stored as Record<string, TestQualityScore> (Maps don't serialize to JSONB).
   */
  @Column('jsonb', { nullable: true })
  testQualitySnapshot: Record<string, TestQualityScore> | null;

  /**
   * Coverage data from the structure phase
   */
  @Column('jsonb', { nullable: true })
  coverageDataSnapshot: CoverageData | null;

  /**
   * Context extraction results (contextPerTest, evidenceAnalysis, documentationIndex).
   * Maps are serialized as Record<string, T>.
   */
  @Column('jsonb', { nullable: true })
  contextSnapshot: ContextSnapshotData | null;

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  /**
   * Root directory that was analyzed
   */
  @Column('text')
  rootDirectory: string;

  /**
   * How the content was accessed
   */
  @Column({ length: 20, default: 'filesystem' })
  contentSource: ManifestContentSource;

  /**
   * Duration of manifest generation in milliseconds
   */
  @Column({ type: 'integer', nullable: true })
  generationDurationMs: number | null;

  /**
   * Error message if generation failed
   */
  @Column('text', { nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
