/**
 * Commitment status enum matching backend
 */
export type CommitmentStatus = 'active' | 'superseded';

/**
 * Severity level for invariant checks
 */
export type InvariantSeverity = 'error' | 'warning';

/**
 * Result of an invariant check stored with commitment
 */
export interface StoredInvariantCheckResult {
  invariantId: string;
  name: string;
  passed: boolean;
  severity: InvariantSeverity;
  message: string;
  checkedAt: string;
}

/**
 * Canonical atom snapshot stored immutably in commitment
 */
export interface CanonicalAtomSnapshot {
  atomId: string;
  description: string;
  category: string;
  qualityScore: number | null;
  observableOutcomes: unknown[];
  falsifiabilityCriteria: unknown[];
  tags: string[];
}

/**
 * Summary of an atom in a commitment
 */
export interface AtomSummary {
  id: string;
  atomId: string;
  description: string;
  category: string;
  qualityScore: number | null;
}

/**
 * Core Commitment entity
 */
export interface Commitment {
  id: string;
  commitmentId: string;
  projectId: string | null;
  moleculeId: string | null;
  canonicalJson: CanonicalAtomSnapshot[];
  committedBy: string;
  committedAt: string;
  invariantChecks: StoredInvariantCheckResult[];
  overrideJustification: string | null;
  supersedes: string | null;
  supersededBy: string | null;
  status: CommitmentStatus;
  metadata: Record<string, unknown>;
  atoms?: AtomSummary[];
}

/**
 * DTO for creating a new commitment
 */
export interface CreateCommitmentDto {
  atomIds: string[];
  moleculeId?: string;
  projectId?: string;
  committedBy: string;
  overrideJustification?: string;
}

/**
 * DTO for superseding an existing commitment
 */
export interface SupersedeCommitmentDto {
  atomIds: string[];
  committedBy: string;
  reason?: string;
  overrideJustification?: string;
}

/**
 * Invariant check result for preview
 */
export interface InvariantCheckResult {
  invariantId: string;
  invariantName: string;
  passed: boolean;
  severity: InvariantSeverity;
  message: string;
}

/**
 * Commitment preview (dry-run) response
 */
export interface CommitmentPreview {
  canCommit: boolean;
  hasBlockingIssues: boolean;
  hasWarnings: boolean;
  atoms: AtomSummary[];
  invariantChecks: InvariantCheckResult[];
  atomCount: number;
  blockingIssues?: string[];
  warnings?: string[];
}

/**
 * Search/filter parameters for commitments
 */
export interface CommitmentFilters {
  projectId?: string;
  moleculeId?: string;
  status?: CommitmentStatus;
  committedBy?: string;
  page?: number;
  limit?: number;
}

/**
 * Paginated commitment response
 */
export interface PaginatedCommitmentsResponse {
  items: Commitment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Commitment history entry (for supersession chain)
 */
export interface CommitmentHistoryEntry {
  id: string;
  commitmentId: string;
  committedBy: string;
  committedAt: string;
  status: CommitmentStatus;
  atomCount: number;
}
