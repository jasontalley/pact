import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Reconciliation Policy configuration
 *
 * Controls how reconciliation behaves for a project:
 * - Can agents suggest atoms?
 * - Should CI block on proposed atoms?
 * - Should reconciliation infer atoms for orphan tests?
 * - What's the minimum confidence threshold for suggestions?
 */
@Entity('reconciliation_policies')
export class ReconciliationPolicy {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Project ID this policy applies to
   * Each project has exactly one policy
   */
  @Column({ type: 'uuid', unique: true })
  projectId: string;

  /**
   * Allow coding agents to suggest new atoms via MCP
   * Default: true
   */
  @Column({ default: true })
  allowAgentAtomSuggestions: boolean;

  /**
   * Block CI when proposed atoms exist
   * When true: CI fails if any proposed atoms are detected
   * When false: CI continues with warning
   * Default: true (recommended for main branch)
   */
  @Column({ default: true })
  ciBlockOnProposedAtoms: boolean;

  /**
   * Emit warning in CI when proposed atoms exist
   * Only relevant when ciBlockOnProposedAtoms is false
   * Default: false
   */
  @Column({ default: false })
  ciWarnOnProposedAtoms: boolean;

  /**
   * Fail CI when orphan tests are detected
   * Default: true
   */
  @Column({ default: true })
  ciFailOnOrphanTests: boolean;

  /**
   * Should reconciliation agent infer atoms for orphan tests?
   * When true: creates proposed atoms with source='reconciliation_inference'
   * When false: only reports orphans, doesn't suggest atoms
   * Default: true
   */
  @Column({ default: true })
  reconciliationInfersAtoms: boolean;

  /**
   * Require human approval for proposed atoms
   * When true: atoms must be approved via HITL workflow
   * When false: atoms can be auto-committed (risky!)
   * Default: true
   */
  @Column({ default: true })
  requireHumanApproval: boolean;

  /**
   * Allow auto-commit of high-confidence atoms
   * Only relevant when requireHumanApproval is false
   * Default: false (not recommended)
   */
  @Column({ default: false })
  allowAutoCommit: boolean;

  /**
   * Minimum confidence score (0.0-1.0) for atom suggestions
   * Atoms below this threshold won't be suggested
   * Default: 0.75 (75% confidence)
   */
  @Column({ type: 'float', default: 0.75 })
  minConfidenceForSuggestion: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
