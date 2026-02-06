/**
 * Conflict type definitions for the Git-for-Intent conflict detection system.
 *
 * Four conflict types (from analysis-git-for-intent.md Section 4):
 * - same_test: Two atoms claim the same test
 * - semantic_overlap: Two atoms describe overlapping behavior
 * - contradiction: Two atoms contradict each other
 * - cross_boundary: Teams define conflicting intent for shared functionality
 */

export type ConflictType = 'same_test' | 'semantic_overlap' | 'contradiction' | 'cross_boundary';

export type ConflictStatus = 'open' | 'resolved' | 'escalated';

export type ConflictResolutionAction =
  | 'supersede_a'
  | 'supersede_b'
  | 'split_test'
  | 'reject_a'
  | 'reject_b'
  | 'clarify';

export interface ConflictResolution {
  action: ConflictResolutionAction;
  resolvedBy: string;
  resolvedAt: Date;
  reason?: string;
  clarificationArtifactId?: string;
}

export interface ConflictFilters {
  status?: ConflictStatus;
  type?: ConflictType;
  atomId?: string;
}

export interface ConflictMetrics {
  total: number;
  open: number;
  resolved: number;
  escalated: number;
  byType: Record<ConflictType, number>;
}
