/**
 * Change Set Types
 *
 * Type definitions for Change Set molecules — a lens type that groups
 * proposed atom changes for batch review and commitment, analogous
 * to a pull request for intent atoms.
 */

/**
 * Status lifecycle for a change set.
 *
 * draft     → Initial state, atoms can be added/removed
 * review    → Submitted for review, no structural changes allowed
 * approved  → All approvals received, ready to commit
 * committed → Atoms have been batch-committed, change set is sealed
 * rejected  → Change set was rejected during review
 */
export type ChangeSetStatus = 'draft' | 'review' | 'approved' | 'committed' | 'rejected';

/**
 * Record of an approval or rejection decision.
 */
export interface ChangeSetApproval {
  /** Who approved/rejected */
  userId: string;
  /** Decision */
  decision: 'approved' | 'rejected';
  /** Optional comment */
  comment?: string;
  /** When the decision was made */
  timestamp: string;
}

/**
 * Metadata stored on a Molecule when its lensType is 'change_set'.
 * Persisted as JSONB in the changeSetMetadata column.
 */
export interface ChangeSetMetadata {
  /** Current status of the change set */
  status: ChangeSetStatus;
  /** Who created the change set */
  createdBy: string;
  /** Optional description of what this change set proposes */
  summary?: string;
  /** Source context (e.g., conversation ID, reconciliation run ID) */
  sourceRef?: string;
  /** Approval/rejection history */
  approvals: ChangeSetApproval[];
  /** Number of approvals required (default: 1) */
  requiredApprovals: number;
  /** When the change set was submitted for review */
  submittedAt?: string;
  /** When the change set was committed */
  committedAt?: string;
  /** IDs of atoms that were batch-committed */
  committedAtomIds?: string[];
}
