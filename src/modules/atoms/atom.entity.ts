import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/**
 * Atom status represents the lifecycle state of an Intent Atom
 */
export type AtomStatus = 'draft' | 'committed' | 'superseded';

/**
 * Category classification for Intent Atoms
 */
export type AtomCategory =
  | 'functional'
  | 'performance'
  | 'security'
  | 'reliability'
  | 'usability'
  | 'maintainability';

/**
 * Canvas position for visual organization in the UI
 */
export interface CanvasPosition {
  x: number;
  y: number;
}

/**
 * Observable outcome that can be verified externally
 */
export interface ObservableOutcome {
  description: string;
  measurementCriteria?: string;
}

/**
 * Criteria that would disprove the atom's intent
 */
export interface FalsifiabilityCriterion {
  condition: string;
  expectedBehavior: string;
}

/**
 * Record of a refinement iteration
 */
export interface RefinementRecord {
  timestamp: Date;
  feedback: string;
  previousDescription: string;
  newDescription: string;
  source: 'user' | 'ai' | 'system';
}

@Entity('atoms')
export class Atom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  atomId: string; // e.g., "IA-001"

  @Column('text')
  description: string;

  @Column({ length: 50 })
  category: string; // functional, performance, security, reliability, usability, maintainability

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
  metadata: Record<string, unknown>;

  // Phase 1 Extensions

  /**
   * Observable outcomes that can be verified externally
   * Each outcome describes a measurable effect of the atom's behavior
   */
  @Column('jsonb', { default: [] })
  observableOutcomes: ObservableOutcome[];

  /**
   * Conditions that would disprove the atom's intent
   * Used to validate test coverage and ensure falsifiability
   */
  @Column('jsonb', { default: [] })
  falsifiabilityCriteria: FalsifiabilityCriterion[];

  /**
   * User-defined tags for filtering and organization
   */
  @Column('jsonb', { default: [] })
  tags: string[];

  /**
   * Position on the Canvas UI for visual organization
   */
  @Column('jsonb', { nullable: true })
  canvasPosition: CanvasPosition | null;

  /**
   * Original user input that spawned this atom
   * Preserved for traceability and refinement context
   */
  @Column('text', { nullable: true })
  parentIntent: string | null;

  /**
   * History of refinement iterations
   * Tracks the evolution from raw intent to atomic specification
   */
  @Column('jsonb', { default: [] })
  refinementHistory: RefinementRecord[];
}
