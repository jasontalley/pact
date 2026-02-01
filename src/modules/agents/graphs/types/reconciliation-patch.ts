/**
 * Reconciliation Patch Operations
 *
 * Defines the patch format for reconciliation results.
 * Patches are deterministic, reviewable operations that can be
 * applied to create/update Pact entities.
 *
 * @see docs/implementation-checklist-phase5.md
 * @see docs/architecture/reconcilation-agent-architecture-proposal.md
 */

import { ReconciliationMode } from './reconciliation-state';

// ============================================================================
// Patch Operation Types
// ============================================================================

/**
 * Types of operations that can be in a reconciliation patch.
 */
export type PatchOpType =
  | 'createAtom'
  | 'createMolecule'
  | 'attachTestToAtom'
  | 'markAtomSuperseded'
  | 'invariantViolationFinding';

// ============================================================================
// Create Atom Operation
// ============================================================================

/**
 * Source test reference for patch operations.
 */
export interface PatchSourceTestReference {
  /** Path to the test file */
  filePath: string;
  /** Name of the test */
  testName: string;
  /** Line number where the test starts */
  lineNumber: number;
}

/**
 * Operation to create a new atom.
 */
export interface CreateAtomOp {
  type: 'createAtom';
  /** Temporary ID for cross-references within the patch */
  tempId: string;
  /** Description of the behavioral intent */
  description: string;
  /** Category (e.g., functional, security, performance) */
  category: string;
  /** Test that this atom was inferred from */
  sourceTest: PatchSourceTestReference;
  /** Observable outcomes that can be verified */
  observableOutcomes: string[];
  /** Confidence score (0-100) */
  confidence: number;
  /** Reasons for any ambiguity in the inference */
  ambiguityReasons?: string[];
  /** Quality score after validation */
  qualityScore?: number;
}

// ============================================================================
// Create Molecule Operation
// ============================================================================

/**
 * Operation to create a new molecule.
 */
export interface CreateMoleculeOp {
  type: 'createMolecule';
  /** Temporary ID for cross-references within the patch */
  tempId: string;
  /** Name of the molecule (feature/capability) */
  name: string;
  /** Description of what the molecule represents */
  description: string;
  /** Temporary IDs of atoms to include in this molecule */
  atomTempIds: string[];
  /** Confidence score (0-100) */
  confidence: number;
}

// ============================================================================
// Attach Test to Atom Operation
// ============================================================================

/**
 * Operation to link a test to an atom (optionally writing @atom annotation).
 */
export interface AttachTestToAtomOp {
  type: 'attachTestToAtom';
  /** Path to the test file */
  testFilePath: string;
  /** Name of the test */
  testName: string;
  /** Line number where the test starts */
  testLineNumber: number;
  /**
   * Atom to link to.
   * Can be a tempId (for new atoms in this patch) or an existing atomId.
   */
  atomTempId: string;
  /** Whether to write @atom annotation to the test file */
  injectAnnotation?: boolean;
}

// ============================================================================
// Mark Atom Superseded Operation
// ============================================================================

/**
 * Operation to mark an existing atom as superseded by a new one.
 * This is a RECOMMENDATION for human review per INV-R001.
 */
export interface MarkAtomSupersededOp {
  type: 'markAtomSuperseded';
  /** ID of the existing atom to supersede */
  oldAtomId: string;
  /** Temporary ID of the new atom that supersedes it */
  newAtomTempId: string;
  /** Reason for the supersession recommendation */
  reason: string;
}

// ============================================================================
// Invariant Violation Finding Operation
// ============================================================================

/**
 * Severity of an invariant violation finding.
 */
export type InvariantViolationSeverity = 'error' | 'warning';

/**
 * Location of an invariant violation.
 */
export interface InvariantViolationLocation {
  /** File path where the violation was detected */
  filePath: string;
  /** Line number (optional) */
  lineNumber?: number;
}

/**
 * Operation to report an invariant violation finding.
 * These are informational and don't create/modify entities.
 */
export interface InvariantViolationFindingOp {
  type: 'invariantViolationFinding';
  /** ID of the invariant that was violated (e.g., "INV-R001") */
  invariantId: string;
  /** Human-readable message describing the violation */
  message: string;
  /** Severity of the violation */
  severity: InvariantViolationSeverity;
  /** Location of the violation (optional) */
  location?: InvariantViolationLocation;
  /** Additional context for the violation */
  context?: Record<string, unknown>;
}

// ============================================================================
// Union Type and Patch Structure
// ============================================================================

/**
 * Union of all patch operation types.
 */
export type PatchOp =
  | CreateAtomOp
  | CreateMoleculeOp
  | AttachTestToAtomOp
  | MarkAtomSupersededOp
  | InvariantViolationFindingOp;

/**
 * Metadata about a reconciliation patch.
 */
export interface ReconciliationPatchMetadata {
  /** Unique ID for this reconciliation run */
  runId: string;
  /** When the patch was created */
  createdAt: Date;
  /** Mode used for reconciliation */
  mode: ReconciliationMode;
  /** Git commit hash at the time of reconciliation */
  commitHash?: string;
  /** Baseline commit hash for delta mode */
  baselineCommitHash?: string;
}

/**
 * A reconciliation patch containing operations to apply.
 */
export interface ReconciliationPatch {
  /** Operations to apply */
  ops: PatchOp[];
  /** Metadata about the patch */
  metadata: ReconciliationPatchMetadata;
}

// ============================================================================
// Patch Builder Utilities
// ============================================================================

/**
 * Creates a new CreateAtomOp.
 */
export function createAtomOp(params: Omit<CreateAtomOp, 'type'>): CreateAtomOp {
  return { type: 'createAtom', ...params };
}

/**
 * Creates a new CreateMoleculeOp.
 */
export function createMoleculeOp(params: Omit<CreateMoleculeOp, 'type'>): CreateMoleculeOp {
  return { type: 'createMolecule', ...params };
}

/**
 * Creates a new AttachTestToAtomOp.
 */
export function attachTestToAtomOp(
  params: Omit<AttachTestToAtomOp, 'type'>,
): AttachTestToAtomOp {
  return { type: 'attachTestToAtom', ...params };
}

/**
 * Creates a new MarkAtomSupersededOp.
 */
export function markAtomSupersededOp(
  params: Omit<MarkAtomSupersededOp, 'type'>,
): MarkAtomSupersededOp {
  return { type: 'markAtomSuperseded', ...params };
}

/**
 * Creates a new InvariantViolationFindingOp.
 */
export function invariantViolationFindingOp(
  params: Omit<InvariantViolationFindingOp, 'type'>,
): InvariantViolationFindingOp {
  return { type: 'invariantViolationFinding', ...params };
}

// ============================================================================
// Patch Validation Utilities
// ============================================================================

/**
 * Type guard to check if an op is a CreateAtomOp.
 */
export function isCreateAtomOp(op: PatchOp): op is CreateAtomOp {
  return op.type === 'createAtom';
}

/**
 * Type guard to check if an op is a CreateMoleculeOp.
 */
export function isCreateMoleculeOp(op: PatchOp): op is CreateMoleculeOp {
  return op.type === 'createMolecule';
}

/**
 * Type guard to check if an op is an AttachTestToAtomOp.
 */
export function isAttachTestToAtomOp(op: PatchOp): op is AttachTestToAtomOp {
  return op.type === 'attachTestToAtom';
}

/**
 * Type guard to check if an op is a MarkAtomSupersededOp.
 */
export function isMarkAtomSupersededOp(op: PatchOp): op is MarkAtomSupersededOp {
  return op.type === 'markAtomSuperseded';
}

/**
 * Type guard to check if an op is an InvariantViolationFindingOp.
 */
export function isInvariantViolationFindingOp(
  op: PatchOp,
): op is InvariantViolationFindingOp {
  return op.type === 'invariantViolationFinding';
}

/**
 * Validates that a patch is internally consistent.
 * Checks that:
 * - All atomTempIds in molecules reference existing createAtom ops
 * - All atomTempIds in attachTest ops reference existing createAtom ops
 * - All newAtomTempIds in supersede ops reference existing createAtom ops
 *
 * @param patch - The patch to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validatePatch(patch: ReconciliationPatch): string[] {
  const errors: string[] = [];
  const atomTempIds = new Set<string>();

  // Collect all atom tempIds
  for (const op of patch.ops) {
    if (isCreateAtomOp(op)) {
      atomTempIds.add(op.tempId);
    }
  }

  // Validate references
  for (const op of patch.ops) {
    if (isCreateMoleculeOp(op)) {
      for (const atomTempId of op.atomTempIds) {
        if (!atomTempIds.has(atomTempId)) {
          errors.push(
            `Molecule "${op.tempId}" references unknown atom tempId "${atomTempId}"`,
          );
        }
      }
    } else if (isAttachTestToAtomOp(op)) {
      // atomTempId could be an existing atom ID or a tempId
      // Only validate if it looks like a tempId (starts with "temp-")
      if (op.atomTempId.startsWith('temp-') && !atomTempIds.has(op.atomTempId)) {
        errors.push(
          `AttachTestToAtom for "${op.testFilePath}:${op.testName}" references unknown atom tempId "${op.atomTempId}"`,
        );
      }
    } else if (isMarkAtomSupersededOp(op)) {
      if (!atomTempIds.has(op.newAtomTempId)) {
        errors.push(
          `MarkAtomSuperseded for "${op.oldAtomId}" references unknown atom tempId "${op.newAtomTempId}"`,
        );
      }
    }
  }

  return errors;
}

/**
 * Extracts all invariant findings from a patch.
 */
export function extractInvariantFindings(
  patch: ReconciliationPatch,
): InvariantViolationFindingOp[] {
  return patch.ops.filter(isInvariantViolationFindingOp);
}

/**
 * Counts operations by type in a patch.
 */
export function countPatchOps(patch: ReconciliationPatch): Record<PatchOpType, number> {
  const counts: Record<PatchOpType, number> = {
    createAtom: 0,
    createMolecule: 0,
    attachTestToAtom: 0,
    markAtomSuperseded: 0,
    invariantViolationFinding: 0,
  };

  for (const op of patch.ops) {
    counts[op.type]++;
  }

  return counts;
}
