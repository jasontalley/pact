/**
 * Reconciliation Result
 *
 * Defines the result structure returned by the Reconciliation Agent.
 *
 * @see docs/implementation-checklist-phase5.md
 * @see docs/architecture/reconcilation-agent-architecture-proposal.md
 */

import { ReconciliationMode } from './reconciliation-state';
import { ReconciliationPatch, InvariantViolationFindingOp } from './reconciliation-patch';

// ============================================================================
// Result Status
// ============================================================================

/**
 * Status of a reconciliation run.
 */
export type ReconciliationStatus =
  | 'completed' // Successfully finished
  | 'failed' // Failed with errors
  | 'pending_review'; // Waiting for human review

// ============================================================================
// Summary Statistics
// ============================================================================

/**
 * Summary statistics for a reconciliation run.
 */
export interface ReconciliationSummary {
  /** Total number of orphan tests discovered */
  totalOrphanTests: number;
  /** Number of atoms inferred */
  inferredAtomsCount: number;
  /** Number of molecules synthesized */
  inferredMoleculesCount: number;
  /** Number of atoms that passed quality threshold */
  qualityPassCount: number;
  /** Number of atoms that failed quality threshold */
  qualityFailCount: number;
  /** Number of tests with @atom that changed (delta mode) */
  changedLinkedTestsCount?: number;
  /** Number of tests excluded by stopping rule (delta mode, INV-R002) */
  excludedByStoppingRuleCount?: number;
  /** Number of proposed atoms created from orphan tests (Phase 18) */
  proposedAtomsCount?: number;
}

// ============================================================================
// Metadata
// ============================================================================

/**
 * Metadata about a reconciliation run.
 */
export interface ReconciliationMetadata {
  /** Duration of the run in milliseconds */
  duration: number;
  /** Number of LLM calls made */
  llmCalls: number;
  /** Mode used for reconciliation */
  mode: ReconciliationMode;
  /** Git commit hash at the time of reconciliation */
  commitHash?: string;
  /** Baseline commit hash for delta mode */
  baselineCommitHash?: string;
  /** Whether human review was required */
  reviewRequired: boolean;
  /** Phases completed during the run */
  phasesCompleted: string[];
}

// ============================================================================
// Reconciliation Result
// ============================================================================

/**
 * Full result of a reconciliation run.
 */
export interface ReconciliationResult {
  /** Human-readable run ID (e.g., "REC-abc12345") */
  runId: string;
  /** Database UUID for this run (if persisted) */
  runUuid?: string;
  /** Status of the run */
  status: ReconciliationStatus;
  /** The reconciliation patch with all operations */
  patch: ReconciliationPatch;
  /** Summary statistics */
  summary: ReconciliationSummary;
  /** Invariant violation findings (extracted from patch for convenience) */
  invariantFindings: InvariantViolationFindingOp[];
  /** Run metadata */
  metadata: ReconciliationMetadata;
  /** Errors encountered during the run */
  errors: string[];
}

// ============================================================================
// Builder Utilities
// ============================================================================

/**
 * Creates an empty ReconciliationResult with default values.
 */
export function createEmptyResult(runId: string, mode: ReconciliationMode): ReconciliationResult {
  return {
    runId,
    status: 'completed',
    patch: {
      ops: [],
      metadata: {
        runId,
        createdAt: new Date(),
        mode,
      },
    },
    summary: {
      totalOrphanTests: 0,
      inferredAtomsCount: 0,
      inferredMoleculesCount: 0,
      qualityPassCount: 0,
      qualityFailCount: 0,
    },
    invariantFindings: [],
    metadata: {
      duration: 0,
      llmCalls: 0,
      mode,
      reviewRequired: false,
      phasesCompleted: [],
    },
    errors: [],
  };
}

/**
 * Creates a failed ReconciliationResult.
 */
export function createFailedResult(
  runId: string,
  mode: ReconciliationMode,
  errors: string[],
  duration: number,
): ReconciliationResult {
  return {
    runId,
    status: 'failed',
    patch: {
      ops: [],
      metadata: {
        runId,
        createdAt: new Date(),
        mode,
      },
    },
    summary: {
      totalOrphanTests: 0,
      inferredAtomsCount: 0,
      inferredMoleculesCount: 0,
      qualityPassCount: 0,
      qualityFailCount: 0,
    },
    invariantFindings: [],
    metadata: {
      duration,
      llmCalls: 0,
      mode,
      reviewRequired: false,
      phasesCompleted: [],
    },
    errors,
  };
}

// ============================================================================
// Serialization Utilities
// ============================================================================

/**
 * Converts a ReconciliationResult to a JSON-serializable object.
 * Handles Date serialization.
 */
export function serializeResult(result: ReconciliationResult): Record<string, unknown> {
  return {
    ...result,
    patch: {
      ...result.patch,
      metadata: {
        ...result.patch.metadata,
        createdAt: result.patch.metadata.createdAt.toISOString(),
      },
    },
  };
}

/**
 * Parses a serialized ReconciliationResult back to typed object.
 */
export function deserializeResult(data: Record<string, unknown>): ReconciliationResult {
  const result = data as unknown as ReconciliationResult;
  return {
    ...result,
    patch: {
      ...result.patch,
      metadata: {
        ...result.patch.metadata,
        createdAt: new Date(result.patch.metadata.createdAt as unknown as string),
      },
    },
  };
}
